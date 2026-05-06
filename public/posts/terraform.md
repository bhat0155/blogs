Infrastructure used to be something you clicked through in a portal, prayed you remembered what you did, and hoped nothing changed. Terraform changes that. This post walks through how I used Terraform to provision a full three-tier application on Azure — frontend, backend, and database — with proper network isolation, remote state, and a CI/CD pipeline that deploys on every merge to main.

This is not a "hello world" Terraform tutorial. It is an account of real decisions, real configuration, and the reasoning behind them.

---

## What Is Terraform?

Terraform is an infrastructure-as-code tool that lets you describe cloud resources in declarative configuration files and then create, update, or destroy those resources by running a handful of commands.

The key word is declarative. You do not write steps like "create a VM, then attach a NIC, then configure a subnet." You describe the end state — "I want a VM with this NIC on this subnet" — and Terraform figures out the order of operations, what already exists, and what needs to change.

A useful analogy: Terraform is like a recipe, not a cooking show. The recipe says what the dish should look like. Terraform reads your recipe, checks what is already in the kitchen, and only prepares what is missing.

Terraform tracks what it has built in a state file — a JSON record of every resource it manages. Every plan and apply compares your configuration against this state to compute a diff.

---

## Why Does It Matter?

Without infrastructure-as-code, you face a set of problems that compound over time:

**You cannot reproduce your environment.** If you provisioned a VM by clicking through the Azure portal, recreating it exactly — same NIC config, same NSG rules, same subnet — requires memory, screenshots, or luck. Terraform configuration is the documentation.

**You cannot review infrastructure changes.** A pull request with a `terraform plan` output is reviewable. A person clicking through a portal is not. Without IaC, there is no diff, no approval gate, no audit trail.

**State drift becomes invisible.** If someone manually changes a resource in the portal, your "what I think exists" and "what actually exists" diverge silently. Terraform surfaces that drift on the next plan and gives you the choice of reconciling it.

**Team collaboration breaks down.** If state lives on one person's laptop, only that person can safely run applies. Remote state with locking solves this — one apply at a time, always from a shared source of truth.

These are not hypothetical problems. They are the reason infrastructure teams adopted IaC, and they surface quickly in any project with more than one environment or more than one person.

---

## What I Built

I provisioned a three-tier web application infrastructure on Azure using Terraform. The stack consists of:

- A frontend VM with a public IP, accessible on ports 80 and 22
- A backend VM with no public IP, accessible only from the frontend subnet on port 3001
- A database VM with no public IP, accessible only from the backend subnet on port 5432
- A NAT Gateway to give the backend and database VMs outbound internet access without exposing them inbound
- A remote state backend in Azure Blob Storage for team-safe state management
- A GitHub Actions pipeline that plans on pull requests and applies on merge to main, authenticated via OIDC

Success looked like: running `terraform apply` in CI on a push to main and having all three VMs reachable in their correct network positions, with the frontend publicly accessible and the database reachable only from the backend.

---

## How I Implemented It

### 1. Structuring the Configuration

Rather than putting everything in a single `main.tf`, I split the configuration by concern:

```
infra/
├── main.tf          # provider, backend, resource group
├── variables.tf     # input variable declarations
├── outputs.tf       # output values
├── networking.tf    # VNet, subnets, NSGs
├── nat_gateway.tf   # NAT gateway and associations
└── vms.tf           # NICs, public IPs, virtual machines
```

This is not module-based reuse — each file is still part of the same root module. The split is purely for readability. When you are debugging a networking issue, you do not want to scroll past 138 lines of VM configuration to find the NSG rule.

### 2. Configuring Remote State

The first thing I configured was the backend — but there is a gotcha: the Azure Storage account must already exist before you run `terraform init`. Terraform does not create the backend storage for you. I created the storage account (`ekamterra`) and container (`demo`) manually in the Azure portal before running anything. If the account does not exist, `terraform init` will fail with an authentication or resource-not-found error that does not make the root cause obvious.

Once the storage account exists, `terraform init` does two things: downloads the required providers and connects to the remote backend. Every subsequent command — plan, apply — reads from and writes to that remote state.

```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100"
    }
  }

  backend "azurerm" {
    resource_group_name  = "NetworkWatcherRG"
    storage_account_name = "ekamterra"
    container_name       = "demo"
    key                  = "todo-azure.tfstate"
  }
}
```

The `~> 3.100` version constraint means "any version >= 3.100 and < 4.0." This allows patch and minor updates (bug fixes, new resource support) while blocking major version upgrades that would introduce breaking changes. The `.terraform.lock.hcl` file then locks the exact resolved version — 3.117.1 in this project — so every developer and every CI run uses identical provider code.

Remote state in Azure Blob gives you three things local state cannot: team access, state locking (Azure Blob uses lease-based locking, so two concurrent applies cannot corrupt state), and durability (state survives a dead laptop).

### 3. Network Segmentation with NSGs

The VNet uses a `10.0.0.0/16` address space divided into three subnets:

```hcl
resource "azurerm_subnet" "frontend" {
  name                 = "frontend-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.0.0/24"]
}

# backend (10.0.1.0/24) and database (10.0.2.0/24) follow the same pattern
```

Each subnet has a dedicated Network Security Group with rules that enforce least privilege:

| Subnet   | Allows inbound from           | On port  |
|----------|-------------------------------|----------|
| Frontend | Any                           | 80, 22   |
| Backend  | Frontend subnet (10.0.0.0/24) | 3001, 22 |
| Database | Backend subnet (10.0.1.0/24)  | 5432, 22 |

Defining the NSG is not enough — it must be explicitly associated with its subnet. Without this resource, the rules exist but are not enforced:

```hcl
resource "azurerm_subnet_network_security_group_association" "frontend" {
  subnet_id                 = azurerm_subnet.frontend.id
  network_security_group_id = azurerm_network_security_group.frontend.id
}
```

The same association is repeated for the backend and database subnets. This is a common source of confusion — Terraform applies the NSG rules only after this linkage exists.

The database NSG is the most important. By restricting port 5432 to only the backend subnet, even if the frontend VM were fully compromised, the attacker cannot reach the database directly. They would need to pivot through the backend first — an extra layer that buys detection time and limits blast radius.

This pattern is called network segmentation, and it is the difference between a perimeter defence and a defence-in-depth architecture.

### 4. NAT Gateway for Outbound-Only Connectivity

The backend and database VMs have no public IP. But they need outbound internet access — to pull Docker images, install packages via apt, reach Azure APIs. A NAT Gateway solves this cleanly:

```hcl
resource "azurerm_nat_gateway" "main" {
  name                    = "nat-ekam"
  location                = var.location
  resource_group_name     = var.resource_group_name
  sku_name                = "Standard"
  idle_timeout_in_minutes = 10
}
```

The NAT Gateway is associated with the backend and database subnets. Outbound traffic from those VMs exits through the NAT Gateway's public IP. Crucially, no inbound traffic can reach those VMs through the NAT Gateway — it is strictly one-directional. This is fundamentally different from assigning a public IP to the VM, which would allow anyone on the internet to attempt a connection inbound.

The frontend VM, which needs to accept inbound user traffic, gets its own public IP directly.

### 5. Handling Sensitive Variables

Credentials — database username and password — are declared as sensitive:

```hcl
variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}
```

`sensitive = true` tells Terraform to redact the value from terminal output and plan logs. It does not encrypt the value in the state file — anyone with read access to the Azure Blob state can retrieve it. This is a known limitation of Terraform's secrets model.

In local development, values live in `terraform.tfvars`, which is listed in `.gitignore`. In CI, the password is injected as a GitHub Secret via the `TF_VAR_db_password` environment variable — never written to disk, never visible in logs.

One thing I would change: the `db_password` variable has a default value in `variables.tf`. Sensitive variables should never have defaults — a missing value should fail loudly, not silently fall back to a hardcoded credential.

### 6. OIDC Authentication in CI

The GitHub Actions pipeline authenticates to Azure without storing any long-lived credentials in GitHub Secrets. Instead, it uses OIDC (OpenID Connect), also called Workload Identity Federation.

```yaml
jobs:
  terraform:
    runs-on: ubuntu-latest
    env:
      ARM_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
      ARM_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
      ARM_SUBSCRIPTION_ID: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      ARM_USE_OIDC: "true"

    steps:
      - name: Azure Login
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Terraform Plan
        run: terraform plan -no-color

      - name: Terraform Apply
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        run: terraform apply -auto-approve
```

The `env` block sits at job level so all steps — init, plan, apply — inherit the ARM variables automatically. The `azure/login` step handles the OIDC handshake; `ARM_USE_OIDC: "true"` tells the azurerm provider to use the resulting token rather than looking for a client secret.

The flow works like this: GitHub Actions requests a short-lived JWT from GitHub's OIDC provider at runtime. That token is presented to Azure AD. Azure validates it against a federated identity credential configured on the service principal — essentially a trust rule that says "accept tokens issued by GitHub Actions for this specific repository and branch." If it matches, Azure issues a short-lived access token with the RBAC permissions assigned to that service principal.

The critical difference from a client secret: there is no secret to store, rotate, or leak. The secrets stored in GitHub (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) are not sensitive — they are identifiers, not credentials. The actual authentication happens via the signed JWT that GitHub generates fresh for each workflow run.

### 7. The CI Pipeline: Plan on PR, Apply on Merge

`terraform plan` runs on every pull request. The output — a precise diff of what will be created, changed, or destroyed — is visible to reviewers before any code merges. `terraform apply` runs only on push to main, meaning only after the PR is approved and merged.

Running apply on pull requests would be dangerous: unreviewed code would modify real infrastructure, concurrent PRs could race and corrupt state, and a force-pushed branch could trigger a destructive apply. The plan-on-PR pattern gives you visibility without risk.

---

## Key Takeaways

- **Remote state is not optional for team projects.** Local state means only one person can safely run applies, and it disappears with the machine. Azure Blob backend adds locking, durability, and shared access with minimal configuration.
- **NSGs enforce least privilege at the network layer.** Restricting the database to only accept traffic from the backend subnet limits blast radius — a compromised frontend cannot directly touch the database.
- **NAT Gateway and public IP are not interchangeable.** NAT Gateway provides outbound-only internet access; a public IP allows inbound connections too. Use NAT for VMs that need to reach out but must not be reached from outside.
- **`sensitive = true` is not encryption.** It redacts values from logs. The state file still contains the plaintext value. Treat state file access as you would treat secret access.
- **OIDC eliminates a whole category of credential management.** No client secret to rotate, no expiry to track, no leak surface in GitHub Secrets. If you are authenticating CI to a cloud provider, OIDC should be your default.
- **Version constraints + lock files together give you reproducibility.** The constraint expresses intent (`~> 3.100`); the lock file enforces the exact version across all environments.

---

## Final Thoughts

The part that surprised me most was how much of the security model lives in the network layer rather than in the application. Before this project, I thought of NSG rules as a secondary concern — something you configure and forget. Building the three-tier segmentation made clear that the network topology is the first line of defence, and Terraform makes it versionable and reviewable in the same way as application code.

If I were starting over, I would extract the VM configuration into a reusable module from the beginning rather than writing three near-identical resource blocks. The duplication is manageable at three VMs, but it would compound quickly at ten. The time to abstract is before the repetition becomes painful, not after.
