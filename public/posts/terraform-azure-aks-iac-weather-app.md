# Terraform on Azure: What It Is, Why It Matters, and How I Wired Up a Real Cloud Stack

## What Is Terraform?

Terraform is an **Infrastructure as Code (IaC)** tool made by HashiCorp. You write configuration files that describe the cloud resources you want — a Kubernetes cluster, a database, a virtual network — and Terraform figures out how to create, update, or destroy them to match that description.

The analogy that clicked for me: think of your Azure portal as a whiteboard you can draw on. Terraform is the blueprint. The whiteboard gets erased. The blueprint survives, can be version-controlled, and can be handed to someone else to reproduce the exact same board from scratch.

Terraform is **declarative**, meaning you describe *what* you want, not *how* to build it. You say "I want an AKS cluster with 2 nodes." Terraform handles the API calls, dependency ordering, and error handling to make that happen.

It talks to Azure (and 300+ other providers) through **providers** — plugins that translate your config into the right API calls. For Azure, that provider is `azurerm`.

---

## Why Does It Matter?

Before Terraform, I was spinning up Azure resources through the portal — clicking through menus, filling in forms, copying connection strings into a notes file. It worked once. The second time, something was subtly different. By the third time, I had no idea what the exact settings were for a resource I created two weeks ago.

That is the core problem Terraform solves: **drift and reproducibility**.

Without IaC:
- You click through the portal and forget what you configured
- You cannot recreate the environment from scratch reliably
- Staging and production slowly diverge because someone "just tweaked one thing"
- When something breaks, you have no audit trail of what changed

With Terraform:
- Every resource is defined in a file you can read, review, and `git diff`
- You can destroy and recreate a full environment in one command
- Staging and production use the same module code — only the environment name differs
- `terraform plan` shows you *exactly* what will change before you touch anything real

The second thing that matters: **collaboration**. If state is stored locally, only you can run Terraform. Remote state (more on this below) means your pipeline can also run it, and you will not corrupt each other's state.

---

## What I Built

I implemented Terraform for the WeatherApp project — a .NET 9 API + React/Vite frontend running on Azure Kubernetes Service. The full infrastructure stack includes:

- A virtual network with isolated subnets for AKS and a bastion VM
- An Azure Container Registry for Docker images
- An AKS cluster wired to pull from that registry automatically
- An Azure SQL Server and database
- A Linux bastion VM for emergency cluster access
- A Storage Account for app assets
- Azure Policy assignments that enforce tagging and allowed VM sizes across the subscription

Everything is split into **reusable modules** (one per concern) and two **environment roots** — `staging` and `production` — that both call the same modules with different environment names.

Success looked like: `terraform apply` from a clean state produces a fully working environment with no manual portal steps.

---

## How I Implemented It

### Stage 1: Bootstrap the Remote State Backend

This is the chicken-and-egg problem of Terraform. Terraform needs somewhere to store its state file — but you cannot use Terraform to create that storage, because Terraform needs the storage to exist before it can do anything.

I solved this by creating the backend resources manually through the Azure portal, then documenting them in `terraform/bootstrap/main.tf` as a comment-only file:

```hcl
# Storage account: tfstateweatherapp
# Resource group:  rg-terraform-state
# Containers:
#   - tfstate-staging
#   - tfstate-production
```

The file has no resources in it. It exists purely as documentation — a record of what was created manually and why. The comment `# Do NOT run terraform apply here` is the key instruction.

Each environment then references its own container in the backend config:

```hcl
backend "azurerm" {
  resource_group_name  = "rg-terraform-state"
  storage_account_name = "tfstateweatherapp"
  container_name       = "tfstate-staging"
  key                  = "terraform.tfstate"
}
```

Staging and production each get their own container so their state files never collide.

---

### Stage 2: Build the Module Structure

I organized the code into modules so the same infrastructure logic is not duplicated between environments. The directory structure:

```
terraform/
  bootstrap/
    main.tf                 # documents manually-created state backend
  modules/
    networking/             # VNet, subnets, NSG
    acr/                    # Azure Container Registry
    aks/                    # AKS cluster + ACrPull role assignment
    database/               # SQL Server + database + firewall rule
    vm/                     # Bastion Linux VM
    storage/                # Storage account + private container
    policy/                 # Azure Policy tag enforcement
  environments/
    staging/
      main.tf               # calls all modules with environment = "staging"
      variables.tf
      terraform.tfvars      # non-secret values only
      outputs.tf
    production/
      main.tf               # identical structure, environment = "production"
      ...
```

The environment root files use `locals` to set the environment name once:

```hcl
locals {
  environment = "staging"
  location    = "Canada Central"
}
```

Every module receives `var.environment` and uses it in all resource names:

```hcl
name = "vnet-weatherapp-${var.environment}"
```

This means the exact same module produces `vnet-weatherapp-staging` in one environment and `vnet-weatherapp-production` in the other. No copy-pasting resource blocks.

---

### Stage 3: Networking — Subnets, Not One Flat Network

I created a single VNet with two isolated subnets:

```hcl
resource "azurerm_virtual_network" "main" {
  name          = "vnet-weatherapp-${var.environment}"
  address_space = ["10.0.0.0/16"]
}

resource "azurerm_subnet" "aks" {
  name             = "snet-aks-${var.environment}"
  address_prefixes = ["10.0.1.0/24"]
}

resource "azurerm_subnet" "vm" {
  name             = "snet-vm-${var.environment}"
  address_prefixes = ["10.0.2.0/24"]
}
```

AKS nodes land in `10.0.1.0/24`. The bastion VM lands in `10.0.2.0/24`. They share the VNet (so they can communicate) but are separated by subnet boundaries.

The NSG on the VM subnet allows only SSH (port 22) inbound. No other inbound ports are open.

One non-obvious constraint: the AKS network profile needs a `service_cidr` and `dns_service_ip` that do **not** overlap with the VNet address space or the subnet ranges. I used `10.1.0.0/16` for service CIDR (completely outside the `10.0.0.0/16` VNet range) with DNS at `10.1.0.10`.

```hcl
network_profile {
  network_plugin = "kubenet"
  service_cidr   = "10.1.0.0/16"
  dns_service_ip = "10.1.0.10"
}
```

If these overlap, `terraform apply` fails with an unhelpful Azure API error about IP address conflicts.

---

### Stage 4: ACR + AKS — Role Assignment Instead of Credentials

The ACR module creates a Basic-tier registry:

```hcl
resource "azurerm_container_registry" "main" {
  name          = "acrweatherapp${var.environment}"
  sku           = "Basic"
  admin_enabled = true
}
```

The AKS module then grants the cluster permission to pull from that registry using an Azure RBAC role assignment — not by hardcoding ACR credentials into Kubernetes secrets:

```hcl
resource "azurerm_role_assignment" "main" {
  scope                            = var.acr_id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
  skip_service_principal_aad_check = true
}
```

The `principal_id` is the kubelet's managed identity — the identity that each node uses when pulling images. `skip_service_principal_aad_check = true` is set because the kubelet identity is a service principal; without this flag, Azure performs an extra AAD lookup that adds latency and sometimes fails on fresh identities.

The AKS module receives `acr_id` as an input from the environment root, which gets it from `module.acr.acr_id`. This is how Terraform wires modules together — outputs from one become inputs to another.

---

### Stage 5: AKS — `temporary_name_for_rotation`

The AKS cluster uses a `SystemAssigned` managed identity, which means Azure automatically creates and manages the identity. No service principal credentials to rotate or store.

One field that is easy to miss in the node pool config:

```hcl
default_node_pool {
  name                        = "agentpool"
  node_count                  = 2
  vm_size                     = "Standard_D2as_v6"
  vnet_subnet_id              = var.aks_subnet_id
  temporary_name_for_rotation = "tmpnodepool"
}
```

`temporary_name_for_rotation` is required when you want to change the `vm_size` of the default node pool after the cluster already exists. Without it, Terraform cannot replace the node pool in-place and will fail. With it, Terraform creates a temporary pool, drains the original, then renames. I included it upfront to avoid a forced cluster destroy/recreate later.

---

### Stage 6: Database — Firewall Rule for Azure Services

The database module creates an MSSQL Server (version 12.0, which is the Azure SQL identifier for the current SQL Server engine) and a Basic-tier database:

```hcl
resource "azurerm_mssql_firewall_rule" "main" {
  name             = "AllowAzureServices"
  server_id        = azurerm_mssql_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
```

The `0.0.0.0` → `0.0.0.0` range is Azure's special sentinel value that means "allow connections from other Azure services." It does not open the database to the public internet — it tells Azure SQL to accept connections that originate from within the Azure platform, which includes AKS pods.

The SQL admin password is sensitive and never stored in `terraform.tfvars`. It is passed via an environment variable at apply time:

```bash
export TF_VAR_sql_admin_password="your-password"
terraform apply
```

Terraform picks up any `TF_VAR_*` environment variable automatically and maps it to the matching variable name. In the pipeline, this comes from an Azure DevOps variable group.

---

### Stage 7: Bastion VM

The VM module creates a Linux VM (Ubuntu 22.04 LTS) in the VM subnet as a bastion host — an emergency access point to the cluster if the normal pipeline path breaks:

```hcl
resource "azurerm_linux_virtual_machine" "bastion" {
  size           = "Standard_D2ads_v6"
  admin_username = var.admin_username

  admin_ssh_key {
    username   = var.admin_username
    public_key = var.ssh_public_key
  }
}
```

Password authentication is disabled by default when `admin_ssh_key` is set — Azure enforces this. The public key is passed in via `TF_VAR_ssh_public_key`, same pattern as the SQL password. The private key never touches the repo or Terraform state.

---

### Stage 8: Policy — Deny at the Subscription Level

The policy module is the most operationally significant piece. It assigns four Azure Policies at the subscription scope:

```hcl
locals {
  require_tag_policy_id = "/providers/Microsoft.Authorization/policyDefinitions/871b6d14-10aa-478d-b590-94f262ecfa99"
  subscription_scope    = "/subscriptions/${var.subscription_id}"
}

resource "azurerm_subscription_policy_assignment" "require_environment_tag" {
  policy_definition_id = local.require_tag_policy_id
  parameters = jsonencode({
    tagName = { value = "environment" }
  })
}
```

Three policies enforce that every resource must have `environment`, `project`, and `managed_by` tags. A fourth policy restricts allowed VM sizes to a short approved list.

The **Deny** effect means Azure will block resource creation if the tag is missing — the portal, CLI, and ARM templates are all subject to it. This makes tag compliance automatic rather than aspirational.

The critical exclusion:

```hcl
not_scopes = [local.aks_managed_rg_scope]
```

AKS creates a managed resource group (`MC_rg-weatherapp-staging_aks-weatherapp-staging_canadacentral`) that contains the underlying VMs, VMSS, and load balancers for the node pool. Azure manages these internally and they do not get our tags. Without this exclusion, the Deny policy blocks AKS from provisioning its own nodes — the cluster creates successfully but never becomes healthy because node provisioning fails silently.

---

### Stage 9: Storage

The storage module creates a Standard LRS storage account with two security settings locked in:

```hcl
resource "azurerm_storage_account" "main" {
  https_traffic_only_enabled = true
  min_tls_version            = "TLS1_2"
}
```

`https_traffic_only_enabled = true` rejects HTTP. `min_tls_version = "TLS1_2"` prevents connections from clients using TLS 1.0 or 1.1 (both deprecated). The storage container is set to `private` — no anonymous blob access.

---

## Key Takeaways

- **Remote state is not optional for team or pipeline use.** Local state means only one person or machine can run Terraform. Azure Storage as a backend solves this with zero extra infrastructure beyond a container.
- **Bootstrap is a one-time manual step — document it explicitly.** The state backend cannot be managed by Terraform itself. A comment-only file that explains what was created manually and why saves significant confusion later.
- **Modules eliminate environment drift.** When staging and production run the same module code, divergence requires an intentional change — it cannot happen by accident through different portal clicks.
- **Use role assignments for AKS → ACR access, not stored credentials.** The `AcrPull` role assignment is tied to the kubelet's managed identity. No secret to rotate, no credential to leak.
- **`temporary_name_for_rotation` belongs in the initial AKS config.** Adding it after the cluster is live forces a node pool rotation. Adding it before costs nothing.
- **Azure Policy `not_scopes` is required when AKS is involved.** The `MC_*` managed resource group is outside your control. Tag-deny policies without this exclusion silently break node provisioning.
- **Sensitive variables go through `TF_VAR_*` environment variables.** `terraform.tfvars` is committed to the repo — secrets must never live there.

---

## Final Thoughts

The part that surprised me most was how much Terraform forces you to think about dependencies explicitly. In the portal, you just click in whatever order feels right. In Terraform, you have to understand that AKS needs a subnet ID from networking and an ACR ID from the registry — and wiring those through module outputs makes those relationships visible in the code rather than implicit.

The Azure Policy module also changed how I think about governance. Before this, tagging felt like a best-effort suggestion. With a Deny policy at the subscription level, it becomes a hard constraint — infrastructure that is not compliant simply cannot be created. That is a fundamentally different model.

If I were doing this again, I would set up a pipeline stage that runs `terraform plan` on pull requests so reviewers can see the infrastructure diff alongside the code diff. Right now, apply is a manual step. Making plan output part of the PR review would close the feedback loop significantly earlier.

Github: https://github.com/bhat0155/WeatherApp_azureservices
