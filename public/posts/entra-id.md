
## Core architecture & hybrid identity

### 1. How is Entra ID architecturally different from on-prem Active Directory?

AD is domain/network-centric: it was built around domain controllers, Group Policy Objects (GPOs), Organizational Units (OUs), and a schema you can extend. Entra ID is identity/application-centric: it's built around modern protocols — OAuth 2.0, OpenID Connect, Conditional Access, MFA — that AD never had natively. Entra ID's RBAC (roles, groups, scoped access) is also more granular than the ACL-based model AD relies on.

The part that actually matters in a migration is that AD's control surface (GPOs pushed to domain-joined machines) has no direct equivalent in Entra ID, because there are no domain controllers.


### 2. PHS vs. PTA vs. Federation (ADFS) — and what happens when AD goes down

| Method | How it validates | If on-prem AD is down |
|---|---|---|
| **Password Hash Sync (PHS)** | A hash of the password hash is synced to Entra; Entra validates locally | Authentication still works |
| **Pass-through Authentication (PTA)** | Entra forwards the request to an on-prem agent, which checks it against AD directly | Authentication fails |
| **Federation (ADFS)** | Sign-in is redirected to an on-prem ADFS server, which checks AD and returns the result | Authentication fails, and there's more infrastructure to maintain (ADFS + WAP) |

**Gotcha:** PHS doesn't actually sync AD's password hash. It syncs a hash *of* the hash (an extra SHA-256 round happens before it leaves on-prem), so Entra never stores the literal value AD has. It's a detail that's easy to gloss over but worth knowing cold.

## Authorization models (RBAC & Entra roles)

### 3. Azure RBAC vs. Microsoft Entra roles

Azure RBAC controls what you can do to **Azure resources** — VMs, storage accounts, subscriptions. Entra roles control what you can do **inside Entra ID itself** — users, groups, directory settings.

The failure mode: giving someone Contributor on a subscription doesn't let them reset a password, and giving someone an Entra role doesn't let them touch a VM. Use the wrong model and you either lock someone out of a task they need, or — worse — over-grant a broad role (like Contributor) as a workaround for something a narrowly-scoped Entra role should have handled.

### 4. Designing a helpdesk role that can't touch Global Admins

The pattern is least privilege plus scoping:

1. Create an **Administrative Unit (AU)** containing the standard users the helpdesk agent should manage.
2. Assign the agent a delegated Entra role (e.g., Helpdesk Administrator) **scoped to that AU**, not tenant-wide.
3. Require MFA/Conditional Access on the helpdesk agent's own account, since it now has elevated capability.

**Gotcha:** even without AU scoping, Entra has a built-in protection tier — roles like Helpdesk Administrator or Password Administrator cannot reset Global Admin (or other privileged role) passwords by default. AU scoping isn't what protects you from Global Admins; it's what protects users **outside** your intended scope (other departments, other business units) from an over-broad helpdesk role.

## Conditional Access, rollout, and resilience

### 5. Conditional Access evaluation order and safe rollout

**Evaluation order:** Entra first collects sign-in signals (user, device, app, location, risk). It finds every policy whose conditions match that sign-in, and evaluates all matching policies **together**, not sequentially. Access is granted only if every matching policy's grant controls are satisfied — and if any matching policy specifies **Block**, that wins outright regardless of what other policies allow.

**Safe rollout pattern:**
1. Report-only mode first — see who *would* be affected without enforcing anything.
2. Exclude break-glass/emergency accounts.
3. Roll out to a pilot group.
4. Check sign-in logs for unintended impact.
5. Expand to the full tenant.

### 6. Blocking legacy auth without locking yourself out

**What's at risk:** anything still authenticating with basic auth — older Office clients, SMTP AUTH, scan-to-email printers, IMAP/POP clients, and forgotten service accounts or scripts.

**Guardrails:** same rollout pattern as above — audit what's using legacy auth first, report-only mode, break-glass exclusion, pilot group, gradual rollout with monitoring.

### 7. What makes a break-glass account correct

- Global Administrator (or equivalent high) privilege
- A dedicated account, never a personal admin account
- A strong, unshared credential (not tied to a single person's MFA device)
- Explicitly **excluded** from Conditional Access policies
- Continuously monitored — any sign-in should raise an alert
- Protected from accidental deletion, and tested periodically

Its entire purpose is to be the account that still works when everything else — MFA, Conditional Access, even your identity provider's normal flow — is unavailable or has locked you out.

## Threat signals & token enforcement

### 8. Risky sign-in vs. risky user

A **risky sign-in** is a property of a single sign-in event: unfamiliar location, anonymous IP, impossible travel, unfamiliar browser. A **risky user** is a property of the identity itself: credentials found in a leaked-credential dump, for example — which can trigger risky-user status without any sign-in attempt at all.

Remediation differs accordingly: risky sign-ins are usually handled with MFA/Conditional Access step-up; risky users generally require a credential reset or explicit admin remediation before the account is trusted again.

### 9. Continuous Access Evaluation (CAE)

Standard OAuth tokens are valid until they expire — typically ~1 hour — regardless of what happens to the user in the meantime. CAE closes that gap: for critical events (user disabled, password changed, account deleted, location/risk change), Entra pushes a revocation signal to the app and cuts access in near real time, instead of waiting out the token's lifetime.

## Privileged Identity Management & JIT

### 10. PIM end-to-end

PIM eliminates *standing* privileged access by making roles **eligible** (can be activated) rather than **active** (currently in effect) by default. Activating a role can require MFA, a justification, a bounded duration, and approval, depending on policy. Every activation is logged and audited. PIM requires Entra ID Governance (or Entra ID P2) licensing.

### 11. PIM JIT vs. Defender for Cloud JIT VM access

These sound similar but operate at different layers:

- **PIM JIT** answers: *do I currently hold the role/permission* (e.g., Contributor) to act?
- **Defender for Cloud JIT VM access** answers: *can I even reach the VM* — is RDP/SSH open to me right now?

You can have the role and still be network-blocked, or have network access and still lack the role. It's an easy trap to fall into if you conflate identity-layer and network-layer access controls.

## Passwordless and authentication strength

### 12. Why FIDO2 resists phishing when SMS and push don't

FIDO2 uses public-key cryptography where the credential is cryptographically bound to the legitimate site's origin — a phishing site simply cannot obtain a valid signature, even if the user is fooled. SMS codes and push approvals have no such binding, so they can be relayed or socially engineered (MFA fatigue, real-time phishing proxies). The trade-off is deployment complexity: physical keys (like a YubiKey) need to be provisioned, distributed, and supported.

### 13. Temporary Access Pass (TAP) and Authentication Strengths

**TAP** is a short-lived credential used to bootstrap onboarding — it lets a new employee set up MFA and a password without ever needing a standing credential shared out-of-band.

**Authentication Strengths** let you require different levels of assurance for different populations via Conditional Access — e.g., regular users get password + MFA, while Global Admins are required to use phishing-resistant methods like FIDO2. Same tenant, different bar, enforced by policy rather than trust.

## Workload identity, apps, and consent

### 14. System-assigned vs. user-assigned Managed Identities, and Workload Identity Federation

- **System-assigned identity:** 1:1 with a single resource. An App Service that needs to read a Key Vault gets one. Its lifecycle is tied to the resource — delete the resource, the identity is gone.
- **User-assigned identity:** a standalone identity you create once and attach to as many resources as you like. It survives resource deletion/recreation and must be cleaned up manually.
- **Workload Identity Federation:** lets an external workload (e.g., a GitHub Actions pipeline) authenticate without a stored secret. The workload presents an OIDC token; Entra validates it against a configured federated credential (trust relationship); if it matches, Entra issues a short-lived access token. The point of the whole mechanism is exactly that: no secret to leak, rotate, or maintain.

### 15. App Registration vs. Service Principal, and detecting illicit consent grants

**App Registration vs. Service Principal:** the App Registration is the app's *definition* — permissions, redirect URIs, credentials — created once in its home tenant. The Service Principal is the actual security principal **instantiated** from that definition in a given tenant, and it's the Service Principal — not the App Registration — that gets assigned RBAC and actually authenticates. Registering an app auto-creates a Service Principal in the home tenant; using it in another tenant (via admin consent) creates a Service Principal there too, without a separate registration.

**Illicit consent grants** happen when a malicious OAuth app tricks a user into granting it permissions to company resources — no password theft required, just a consent click. Detecting it means watching the Enterprise Applications / consent audit logs: who granted what, to which app, and how broad the requested scopes are. Unusual high-privilege scopes (Mail.Read, Files.ReadWrite.All) landing on an unfamiliar third-party app is the signal to chase.

---

