
## What Is Infrastructure as Code + CI/CD?

When you deploy an app manually — clicking through a cloud console, running `az` commands by hand, SSH-ing into a server to restart a process — you are treating your infrastructure like a pet. You know every quirk. It only works because you remember the steps.

**Infrastructure as Code (IaC)** means your cloud resources are defined in files, versioned in git, and created by running a command. **CI/CD** means every code change automatically gets built, tested, and deployed without you touching a server.

Together they treat infrastructure like cattle, not pets: reproducible, replaceable, and automatic.

In this project I used **Terraform** (IaC) to provision Azure resources and **Jenkins** (CI/CD) to build and deploy a Node.js + PostgreSQL API. The whole pipeline runs end-to-end — a code push triggers a build, which triggers a deploy, which is verified by a health check — with no manual steps in between.

---

## Why Does It Matter?

Without IaC and CI/CD, here is what deploying a Node.js app to Azure actually looks like:

- Click through the Azure Portal to create a Resource Group, App Service Plan, Web App, and PostgreSQL server — in the right order, with the right settings
- Manually set environment variables in the portal one by one
- SSH in, run `npm install`, restart the process
- Hope you remember every step next time

Now imagine doing that for a second environment. Or recovering after someone accidentally deletes a resource. Or onboarding a teammate. Every step exists only in someone's memory.

With Terraform, `terraform apply` recreates every resource identically in under 10 minutes. With Jenkins, every merge to the branch automatically builds, tests, packages, migrates the database, deploys, and confirms the app is alive — while you do something else.

The real cost of not having this is not inconvenience. It is **inconsistency, fragility, and time** — the three things that compound the worst as a project grows.

---

## What I Built

I took an existing Node.js (TypeScript) API with a PostgreSQL (Prisma) backend and wired it into a full Azure deployment pipeline. The app checks product receipts against recall databases.

**Infrastructure (Terraform):**
- Azure Resource Group, App Service Plan (B1 Linux), Linux Web App, PostgreSQL Flexible Server, Storage Account, and firewall rules — all defined in `terraform/main.tf` and created with one command

**CI Pipeline (Jenkins):**
- Checkout → Install → Build (tsc) → Test (Jest) → Package artifact (zip with production deps) → Archive

**CD Pipeline (Jenkins):**
- Retrieve artifact → Set Azure app settings → Run Prisma migrations → Deploy zip to Azure → Health check

Success looked like: `GET /health` returning `{"status":"ok","message":"The server is running"}` from `https://receipt-recall-api.azurewebsites.net/health` at the end of every CD run.

---

## How I Implemented It

### Stage 1 — Azure Service Principal

Jenkins needs to authenticate with Azure without interactive login. The solution is a **Service Principal** — a non-human identity with scoped permissions.

```bash
az ad sp create-for-rbac \
  --name "jenkins-receipt-recall-sp" \
  --role Contributor \
  --scopes /subscriptions/<YOUR_SUBSCRIPTION_ID> \
  --sdk-auth
```

This outputs a JSON blob with `clientId`, `clientSecret`, `tenantId`, and `subscriptionId`. That JSON goes into Jenkins as a stored credential — it never touches the codebase.

---

### Stage 2 — Terraform Infrastructure

All Azure resources live in `terraform/main.tf`. The key design choices:

**Region: Canada Central, not East US.**
East US was the default, but the subscription had `Total Regional vCPUs: 0` — no App Service Plans could be created there. Canada Central had 10 vCPUs available. Always check quota before picking a region.

```bash
az vm list-usage --location "canadacentral" \
  --query "[?name.value=='cores'].{limit:limit, current:currentValue}" -o tsv
# 10    0
```

**`WEBSITE_RUN_FROM_PACKAGE = "1"`** tells Azure to mount the deployed zip as read-only and run the app directly from it. Faster cold starts, no extraction step. The trade-off: `node_modules` must be inside the zip since the filesystem is read-only after mounting.

**Firewall rules — two of them:**

```hcl
# allows Azure-internal services (the Web App) to reach PostgreSQL
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# allows local Jenkins to run Prisma migrations against Azure PostgreSQL
resource "azurerm_postgresql_flexible_server_firewall_rule" "local_jenkins" {
  name             = "AllowLocalJenkins"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = var.local_jenkins_ip
  end_ip_address   = var.local_jenkins_ip
}
```

The `0.0.0.0 → 0.0.0.0` rule is Azure's special syntax for "allow all Azure-internal traffic" — not a public open rule. The second rule was needed because Jenkins runs locally, not inside Azure, so it gets blocked by default.

```bash
terraform init
terraform plan
terraform apply
```

**Gotcha:** After a failed `terraform apply`, some resources exist in Azure but not in Terraform's state. The fix is `terraform import`:

```bash
terraform import azurerm_service_plan.main \
  /subscriptions/<ID>/resourceGroups/receipt-recall-rg/providers/Microsoft.Web/serverFarms/receipt-recall-plan
```

This is better than destroying and recreating — it tells Terraform to adopt the existing resource without touching it.

---

### Stage 3 — Jenkins CI Pipeline

Jenkins runs locally inside Docker:

```bash
docker run -d \
  --name jenkins-blueocean \
  -p 8080:8080 \
  -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  jenkins/jenkins:lts
```

The `-v jenkins_home:/var/jenkins_home` flag is critical — it persists all Jenkins data (jobs, credentials, plugins) in a Docker volume. If the container restarts, nothing is lost.

The CI pipeline (`Jenkinsfile.ci`) builds and packages the app. The most important stage is packaging:

```groovy
stage('Package Artifact') {
    steps {
        // generate Prisma engines for both ARM64 (local) and x86_64 (Azure)
        sh 'npx prisma generate'
        // back up engines before npm ci --omit=dev wipes node_modules
        sh 'cp -r node_modules/.prisma /tmp/prisma-generated'
        // reinstall prod deps only
        sh 'npm ci --omit=dev'
        // restore multi-target Prisma engines
        sh 'cp -r /tmp/prisma-generated node_modules/.prisma'
        sh '''
            zip -r ${ARTIFACT_NAME} \
                dist/ node_modules/ package.json package-lock.json prisma/ \
                --exclude "*.ts"
        '''
    }
}
```

**Why the backup/restore dance?** Jenkins runs inside Docker on a Mac (Apple Silicon, ARM64). Azure App Service runs on Debian x86_64. Prisma generates a native query engine binary — the wrong architecture won't run on Azure.

The fix is adding `binaryTargets` to `prisma/schema.prisma`:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}
```

But `npm ci --omit=dev` wipes `node_modules` completely (it's a clean install), which destroys the just-generated engines. The backup restores them after the clean install. Without this, the app crashes on Azure with:

```
PrismaClientInitializationError: Prisma Client was generated for "linux-arm64-openssl-3.0.x"
but the actual deployment required "debian-openssl-3.0.x"
```

**`npm ci --omit=dev` not `npm install`:** Dev dependencies (TypeScript, Jest, ts-node-dev) are not needed at runtime. Stripping them keeps the artifact at ~44MB instead of ~200MB+. `npm ci` is used instead of `npm install` because it fails if `package-lock.json` is out of sync — catching dependency drift early.

---

### Stage 4 — Jenkins CD Pipeline

The CD pipeline (`Jenkinsfile.cd`) deploys the artifact CI produced. The `withCredentials` block injects secrets as environment variables — they are masked in logs and never appear in plaintext:

```groovy
stage('Set App Settings') {
    steps {
        withCredentials([
            string(credentialsId: 'database-url', variable: 'DATABASE_URL'),
            string(credentialsId: 'openai-api-key', variable: 'OPENAI_API_KEY'),
            azureServicePrincipal('azure-service-principal')
        ]) {
            sh '''
                az login --service-principal \
                    --username $AZURE_CLIENT_ID \
                    --password $AZURE_CLIENT_SECRET \
                    --tenant $AZURE_TENANT_ID

                az webapp config appsettings set \
                    --name $AZURE_WEBAPP_NAME \
                    --resource-group $AZURE_RESOURCE_GROUP \
                    --settings DATABASE_URL="$DATABASE_URL" OPENAI_API_KEY="$OPENAI_API_KEY"
            '''
        }
    }
}
```

**Why set app settings in the CD pipeline instead of Terraform?** Secrets should not be in Terraform state files. `terraform.tfstate` stores the full state of your infrastructure in plaintext. Pushing secrets through Jenkins credentials and `az webapp config appsettings set` keeps them out of state entirely.

**Migrations before deploy, not after:**

```groovy
stage('Run DB Migrations') {
    steps {
        withCredentials([string(credentialsId: 'database-url', variable: 'DATABASE_URL')]) {
            sh 'npx prisma migrate deploy'
        }
    }
}
```

If new code depends on a schema change, the schema must exist before the code goes live. Running migrations after deploy would cause the new code to crash on startup against the old schema.

**Health check with 90-second warm-up:**

```groovy
stage('Health Check') {
    steps {
        sh 'sleep 90'
        script {
            def response = httpRequest(url: env.HEALTH_CHECK_URL, validResponseCodes: '200', timeout: 30)
            echo "Health check: ${response.status} — ${response.content}"
        }
    }
}
```

B1 tier cold starts with a 44MB zip take 60–90 seconds. The initial 30-second sleep caused the health check to fire before the app was ready, failing the pipeline even though the deployment succeeded. 90 seconds is enough for this app on this tier.

---

## Key Takeaways

- **Always check regional quotas before picking an Azure region.** A subscription with 0 VM quota blocks App Service Plan creation everywhere in that region — switching regions is the fastest fix.
- **`terraform import` rescues partially-failed applies.** When `terraform apply` partially succeeds and leaves orphaned resources, import them into state rather than destroying and recreating.
- **Prisma's binary target must match the deployment platform.** If you generate on ARM64 and deploy to x86_64, the app will crash. Declare both in `binaryTargets` and regenerate before packaging.
- **`npm ci` is safer than `npm install` in pipelines.** It fails loudly on lock file drift instead of silently installing unexpected versions.
- **`WEBSITE_RUN_FROM_PACKAGE=1` requires `node_modules` in the zip.** The filesystem is read-only after mount — Azure cannot run `npm install` post-deploy. Include production deps in the artifact.
- **Secrets belong in the CI/CD tool, not in Terraform state.** `tfstate` is plaintext. Push secrets via `az webapp config appsettings set` from inside a `withCredentials` block.
- **Separate CI and CD pipelines.** A failed deployment should not force a rebuild. CI produces an artifact; CD consumes it. They answer different questions and should fail independently.

---

## Final Thoughts

The part that surprised me most was how much of the friction came from **state mismatches** — Terraform not knowing about resources Azure had already created, or Azure's internal deployment mode conflicting with a setting we had removed. Terraform is powerful precisely because it tracks state, but that means when state drifts (through manual changes or partial failures), you have to know how to reconcile it rather than just re-running the command. Learning `terraform import` and understanding when to use it was as important as learning the HCL syntax itself. If I were starting over, I would add a `terraform state list` check to my debugging process much earlier instead of jumping straight to destroy and recreate.
