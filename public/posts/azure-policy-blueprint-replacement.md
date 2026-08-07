## What Is Azure Policy-as-Governance?

Azure Policy is a service that evaluates resources against rules and can **audit**, **block (Deny)**, or **auto-remediate (DeployIfNotExists/Modify)** violations. It answers a different question than RBAC does. RBAC governs *who can do something*: a principal, a role, a scope. Policy governs *what is allowed to exist*: a resource's configuration, independent of who created it.

The two are easy to conflate because they live in the same "governance" bucket, but they solve different problems. You can give someone Contributor access (RBAC says they're allowed to create resources) and still have Policy refuse to let them create a storage account outside `canadacentral` or with public network access enabled. Neither replaces the other. A mature governance setup needs both.

Until mid-2026, Azure also had **Blueprints**, a service that bundled RBAC role assignments, Policy assignments, and ARM/Bicep resource templates into one versioned, assignable package. The idea was "onboard a new team or subscription with one click and get consistent guardrails every time." Microsoft retired Blueprints (service sunset completed July 2026). Its recommended replacement isn't a single service, it's a *pattern*: **Bicep Template Specs** (versioned, shareable templates) deployed via **Deployment Stacks** (lifecycle-managed, lockable deployments), combined with **Policy Initiatives** (bundles of related policy definitions) attached to the same scope. Same outcome, just three composable pieces instead of one.

## Why Does It Matter?

Without Policy, "compliance" is a checklist someone runs manually, or worse, discovers during an audit or an incident. A developer spins up a storage account in the wrong region, or with public blob access on by accident, and nobody notices until a security review months later. The cost isn't hypothetical. It's the gap between "we have a written policy that says no public storage accounts" and "we have a system that makes it physically impossible to create one."

Policy closes that gap by moving enforcement from a document into the deployment pipeline itself. Audit-effect policies give you visibility (a compliance percentage, a list of offenders) without breaking anything. Deny-effect policies make violations impossible to create in the first place. DeployIfNotExists policies go further and *fix* resources that already violate the rule, without a human running a script.

Losing Blueprints mattered because it was the one service that made "package all of this together and hand it to a new team" a single operation. Without a replacement pattern, you're back to manually applying RBAC, then manually assigning policies, then manually deploying a baseline template: three separate, driftable steps instead of one auditable unit. Rebuilding that as Bicep + Deployment Stacks + Initiatives isn't just a like-for-like swap either. You get better versioning (real deployment IDs, not just a blueprint "version string") and a lifecycle lock that Blueprints never had.

## What I Built

I built a small but complete governance baseline for a test Azure subscription, in three stages:

1. A **custom Policy Initiative** (`contoso-retail-compliance-baseline`) bundling three built-in policies: Allowed Locations (Deny), a storage/network-access audit policy, and a DeployIfNotExists policy that deploys diagnostic settings to Log Analytics for resources that lack them.
2. A **subscription-scope Bicep template** that creates a tagged resource group, an RBAC role assignment, and a secure-by-default storage account (TLS 1.2 minimum, HTTPS-only, no anonymous blob access, public network access disabled), the direct replacement for a Blueprint's "artifacts."
3. A **Deployment Stack** that deploys that template with a lifecycle lock, and has the Initiative attached to its resource group, reproducing the "one operation onboards a team with RBAC + policy + resources" outcome Blueprints used to provide.

Success meant: a disallowed-region deployment gets blocked with a real policy error, a compliant one succeeds, an existing non-compliant resource gets auto-remediated, and the whole baseline can be redeployed and versioned without manual cleanup.

## How I Implemented It

### Stage 1: Start with Audit, not Deny

I assigned the built-in "Allowed locations" policy with **Audit** effect first, scoped to the subscription, restricted to `canadacentral`. Audit reports without blocking, which is the safe way to see the blast radius of a rule before it can break anything. After the first evaluation cycle, the compliance dashboard showed 75% (3 of 4 resources), correctly flagging a Key Vault sitting in East US.

**Why Audit first:** if I'd gone straight to Deny, I'd have no way to distinguish "this rule is well-scoped" from "this rule is about to lock me out of half my subscription." Audit gives you the data before you commit to enforcement.

### Stage 2: Switch to Deny, and hit a real enforcement gotcha

I changed the assignment's effect to `"Deny"` and tried creating a storage account in East US, expecting it to fail. It succeeded. I waited 15 minutes in case it was a propagation delay. Still succeeded.

The actual cause: this tenant's Policy Assignment UI has a third **enforcement mode** beyond Default and "Do not enforce," called **Enroll**. Setting `Effect: Deny` is not enough on its own. The target scope has to be explicitly enrolled via a "Create enrollment" action before Deny actually blocks anything. Until then, a Deny-effect assignment silently behaves like Audit.

```text
# Before enrollment: deployment "succeeds" despite Effect=Deny
# After running "Create enrollment" on the subscription scope:

New-AzResourceGroupDeployment ... (storage account, East US)
> ERROR: RequestDisallowedByPolicy
> Policy: "Allowed-locations-audit"
```

I validated the fix two ways: a disallowed-region deployment now fails with `RequestDisallowedByPolicy` naming the specific policy, and a control deployment in `canadacentral` still succeeds, confirming the block is scoped correctly and not just broken open.

**Why this matters beyond this one tenant:** if you only test Deny by checking the assignment's saved config, you'll conclude enforcement is broken when it's actually just unenrolled. Always confirm via the assignment's enrollment-status table (or a real deployment attempt), not the parameter value alone.

### Stage 3: Remediate what already exists

DeployIfNotExists policies only evaluate *new or updated* resources by default. They don't retroactively fix resources that existed before the policy was assigned. I assigned "Deploy Diagnostic Settings ... to Log Analytics workspace" (DeployIfNotExists) and then ran an explicit **Remediation task** against the already-existing, already-non-compliant vault resource.

```text
Remediation task: "Deploy Diagnostic Settings for Recovery Services Vault..."
Scope: subscription
State: Complete
Remediated Resources: 1 of 1
```

I validated it by opening the vault's Diagnostic Settings blade directly and confirming a new setting (`setbypolicy_logAnalytics`) pointing at the Log Analytics workspace, rather than just trusting the task's "Complete" status.

### Stage 4: Package into an Initiative

Assigning policies one at a time doesn't scale past a handful of rules. I grouped the three policies above into a custom Initiative. This is also the unit that carries forward into the Blueprint-replacement pattern. Instead of re-assigning three separate policies to every new resource group, you assign one Initiative.

### Stage 5: Build the Bicep replacement for Blueprint "artifacts"

```bicep
targetScope = 'subscription'
```

Subscription-scope Bicep is required here because creating a resource group is itself a subscription-level operation, and a module-scoped template can't do it. The role-assignment and storage modules are then deployed with `scope: baselineRg` so they land *inside* the new resource group rather than at the subscription.

Role assignment names were generated with:

```bicep
name: guid(resourceGroup().id, principalId, roleDefinitionId)
```

**Why:** a hardcoded or random name would create a duplicate role assignment every time the template re-ran. Deriving the name deterministically from scope + principal + role means re-running the deployment is idempotent: same inputs, same resulting name, no duplicates.

Before touching Azure, I validated with:

```bash
az deployment sub what-if --location canadacentral --template-file infra/main.bicep --parameters ...
```

`what-if` previews exactly what would be created or changed with zero actual changes. The output confirmed 3 resources planned (resource group, role assignment, storage account), all properties matching the template, no surprises.

### Stage 6: Deploy via Deployment Stack, with a lifecycle lock

```bash
az stack sub create \
  --name stack-baseline-day3 \
  --location canadacentral \
  --template-file infra/main.bicep \
  --deny-settings-mode denyDelete \
  --action-on-unmanage deleteAll
```

`--deny-settings-mode denyDelete` creates an actual Azure **Deny assignment** on the stack-managed resources, which is a different mechanism from Policy's Deny effect. Policy's Deny blocks *creating or updating* a resource into a non-compliant state. A stack's deny-delete blocks the *delete* action on existing resources, for everyone, including the Owner role. I proved this by trying to delete the resource group directly afterward:

```text
DenyAssignmentAuthorizationFailed
```

Blocked despite Owner permissions, because of the Deny assignment the stack created. `--action-on-unmanage deleteAll` means if a resource is later dropped from the template, the stack cleans it up automatically on the next update instead of leaving an orphan.

Attaching the Initiative to the new resource group failed the first time with an error requiring a managed identity. **Why:** the Initiative includes a DeployIfNotExists policy, and that effect actively deploys a remediation resource on Azure's behalf. It needs an identity with permission to do that deployment. Enabling a system-assigned identity on the assignment (Azure auto-detected and attached the needed roles: Monitoring Contributor, Log Analytics Contributor) resolved it.

### Stage 7: Version and redeploy, and hit a self-inflicted policy conflict

I changed the role assignment from Reader to Contributor and redeployed the same stack. Because the role assignment's name is derived from `guid(..., roleDefinitionId)`, changing the role produces a *new* resource name, and with `--action-on-unmanage deleteAll`, the stack automatically removed the now-orphaned old Reader assignment as part of the update. I'd initially assumed old and new assignments would just accumulate side-by-side. They don't, as long as unmanage cleanup is configured.

The redeploy then failed on the storage account, a resource that already existed and was already compliant, with `RequestDisallowedByPolicy`. The cause: redeploying re-evaluates the resource against Policy as part of the PUT operation, and the Initiative's Allowed Locations rule had been hardcoded to `canadacentral` only as a *static value* inside the Initiative definition (leftover from earlier Deny testing), not exposed as an overridable parameter. Editing the assignment's Parameters tab did nothing, because nothing was exposed there to override. The fix had to happen one level up, in the Initiative definition's own "Policy parameters" tab.

This is worth calling out explicitly: **your own compliance baseline can block your own infrastructure**, and the fix location depends on whether the constrained value lives at the assignment level or is baked into the initiative definition itself.

Finally, I checked where version history actually lives. The resource group's Deployments blade reuses static module deployment names, so it only shows the latest run per module, not a real history. The authoritative trail is the Deployment Stack resource itself:

```bash
az stack sub show --name stack-baseline-day3
```

Two distinct `deploymentId` values across the two runs, with `systemData.lastModifiedAt` updating and `createdAt` staying fixed.

## Key Takeaways

- **RBAC and Policy answer different questions**, "who can act" vs. "what's allowed to exist," and a real governance setup needs both, not one standing in for the other.
- **Always roll out Deny-effect policies starting from Audit.** Audit tells you the blast radius before you can break anything; jumping straight to Deny means you find out the hard way.
- **Don't trust a saved Deny effect at face value.** Check for tenant-specific enforcement modes (like "Enroll") and confirm with a real deployment attempt or the enrollment-status table, not just the assignment's configuration.
- **DeployIfNotExists only catches new/changed resources.** Pre-existing violations need an explicit Remediation task. The policy assignment alone won't reach back in time.
- **DeployIfNotExists/Modify policies need a managed identity** on the assignment, because the policy engine deploys remediation resources on your behalf. Plan for this before attaching an Initiative that includes one.
- **A stack's deny-delete lock and a Policy Deny effect are different mechanisms.** One blocks lifecycle actions on existing resources (even for Owners), the other blocks creating/updating into a non-compliant state.
- **Hardcoded values inside an Initiative definition don't show up as overridable assignment parameters.** If a rule needs to change per-environment, promote it to an initiative-level parameter when you author it, not after it's already blocking a deployment.
- **Real deployment/version history for a Deployment Stack lives on the stack resource** (`deploymentId`, `lastModifiedAt`), not the resource group's Deployments blade, which silently only shows the latest run per static module name.

## Final Thoughts

What surprised me most wasn't any single Azure quirk, it was how many of the "gotchas" were really governance lessons in disguise. The Enroll enforcement mode, the managed-identity requirement, the initiative parameter conflict: each one forced me to actually understand the mechanism instead of clicking through a wizard and assuming it worked. If I did this again, I'd promote every policy parameter to an initiative-level override from day one. The cost of doing that upfront is a few extra minutes, and the cost of not doing it is a redeploy blocked by your own compliance baseline, discovered at the worst possible time.
