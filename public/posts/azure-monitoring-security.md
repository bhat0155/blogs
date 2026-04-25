# Azure Monitoring & Security: Building Real Observability for a Cloud App

## What Is Azure Monitoring?

Azure Monitoring is not a single tool — it is a combination of services that work together to answer three key questions:

- Is my system healthy? → Metrics (CPU, memory, disk)
- What exactly happened? → Logs (requests, errors, traces)
- How do I know when something breaks? → Alerts

In Azure, this is primarily handled by:

- **Azure Monitor** — collects metrics and triggers alerts
- **Log Analytics Workspace** — stores and queries logs
- **Application Insights** — tracks application-level behavior

Instead of guessing what is happening inside your system, these tools provide visibility, diagnostics, and automation.

## Why Monitoring Matters

Without monitoring:

- Your app can fail silently
- Users experience issues before you notice
- Debugging becomes guesswork

With monitoring:

- You detect issues before users report them
- You receive alerts instead of surprises
- You can trace problems from infrastructure down to the individual request

This is the difference between reacting to problems and proactively managing a system.

## What I Built

I implemented a basic but realistic monitoring setup for a cloud-based application running on Azure.

The setup includes:

- Virtual Machines (vm-1, vm-2, vm-3)
- Azure Monitor alerts (CPU-based)
- Log Analytics Workspace (log querying)
- Application Insights (request tracking)
- A custom dashboard (centralized view)
- Basic security (NSG + RBAC)

The goal was not only to configure these services, but to make them work together as a cohesive system.

## 1. Setting Up Monitoring

### Azure Monitor — Metrics and Alerts

I started with CPU monitoring on virtual machines.

Configuration:
- Metric: Percentage CPU
- Threshold: greater than 30%
- Evaluation: every 1 minute, over the last 5 minutes

The 30% threshold is intentionally low — not production-grade, but useful for testing alerting behavior quickly without generating heavy load.

### Testing the Alert

To simulate CPU load, I ran:

```bash
stress --cpu 2 --timeout 300
```

This artificially increased CPU usage on the VM.

Result:

- CPU spiked above the threshold
- The alert rule triggered
- An email notification was sent via the action group

This confirmed the full alerting pipeline:

```
Metric → Alert Rule → Action Group → Email
```

### Log Analytics Workspace — Logs and Queries

Azure had already provisioned a default Log Analytics Workspace, so I reused it rather than creating a new one.

What I verified:

- VM heartbeat logs were being collected
- Logs could be queried using KQL (Kusto Query Language)

Example query:

```kql
Heartbeat
| summarize LastCall = max(TimeGenerated) by Computer
| order by LastCall desc
```

This query shows which machines are actively reporting and when they last checked in.

### Application Insights — Application-Level Telemetry

I queried recent application requests using:

```kql
requests
| order by timestamp desc
| take 10
```

What I observed:

- Endpoints such as `/todos/...` were being tracked automatically
- Response codes: 200, 201
- Response times: mostly under 250ms

**Insight:** Metrics tell you CPU is elevated. Logs tell you what was happening at that time. Application Insights tells you whether users were actually affected. Together, these three layers provide complete visibility into a running system.

## 2. Creating a Dashboard

Monitoring tools are ineffective if you have to navigate across multiple services to see the state of your system. To address this, I created a centralized dashboard.

### Dashboard: Todo App Health

Widgets added:

- CPU usage for vm-1
- CPU usage for vm-2
- CPU usage for vm-3

Each VM was added as a separate tile rather than combined into a single chart.

**Rationale:** Separate tiles make it easier to isolate which machine is experiencing elevated load. A combined graph can mask individual machine behavior.

Result:

- Real-time CPU trends are visible at a glance
- Spikes from stress testing are clearly visible
- The dashboard serves as a central operational view

## 3. Application Insights Integration

Rather than configuring Application Insights from scratch, I validated an existing integration.

What it provided:

- Request tracking per endpoint
- Response time metrics
- Success and failure rates

**Observation:** During the testing period, the application behaved normally — no significant failures and consistent response times. This confirms the system is not only running but performing correctly under normal conditions.

## 4. Basic Security Configuration

### Network Security Group (NSG)

I configured inbound rules to restrict traffic:

- Allowed: SSH (port 22) and HTTP (port 80)
- All other inbound traffic was blocked by default

Without an NSG, a VM with a public IP is exposed to the internet with no traffic filtering. The NSG enforces a minimal, explicit allowlist.

### Identity and Access Control (RBAC)

- Created a user in Microsoft Entra ID (formerly Azure Active Directory)
- Assigned a scoped role (Reader or Contributor as appropriate)

**Rationale:** Using a shared admin account across environments is a security risk. Role-based access control allows you to grant each user exactly the permissions they need, nothing more. All access is logged and auditable.

### Key Vault — Secret Management (Conceptual)

Although not fully implemented in this setup, the intended architecture uses Azure Key Vault to store credentials such as database connection strings and API keys. Applications access secrets via a Managed Identity assigned to the VM — no credentials are stored in code or configuration files.

Hardcoding secrets in application code or environment files is a common source of credential exposure. Key Vault centralizes secret management and enables rotation without touching application code.

## 5. Security Posture (Conceptual)

Microsoft Defender for Cloud was not fully configured in this setup, but its role in a production environment is to:

- Continuously scan resources against the Azure Security Benchmark
- Surface prioritized security recommendations
- Enforce policies such as multi-factor authentication

Enabling MFA for all portal users is one of the first recommendations Defender raises, and one of the most impactful — it prevents account takeover even if a password is compromised.

## Key Takeaways

### 1. Monitoring is not a single tool

Effective observability requires three layers working together:
- **Metrics** — system health
- **Logs** — debugging and root cause analysis
- **Application telemetry** — user-facing impact

### 2. Alerts must be verified end-to-end

An alert rule that has never fired gives you no confidence. Manually triggering your alert conditions is the only way to confirm the full pipeline — from metric threshold to delivered notification — actually works.

### 3. Dashboards reduce response time

During an incident, a centralized dashboard lets you immediately identify which resource is affected, without navigating multiple services. It is the difference between a 30-second assessment and a 5-minute one.

### 4. Security is layered by design

No single control is sufficient:
- **NSG** — controls network traffic
- **RBAC** — controls identity and access
- **Key Vault** — controls secret management

Each layer addresses a different attack surface. Together they reduce overall exposure.

## Final Architecture

This setup includes:

- **Azure Monitor** — metrics collection and alert rules
- **Log Analytics Workspace** — centralized log storage and querying
- **Application Insights** — per-request telemetry and performance data
- **Dashboard** — consolidated operational view
- **NSG** — inbound traffic filtering
- **RBAC** — scoped identity-based access control

## Final Thoughts

What stands out from this setup is how interconnected the components are. A single CPU spike can now be detected automatically, trigger an alert, be investigated through logs, and correlated with application request data — all from a single dashboard.

This is what production cloud operations depend on: not just running code, but maintaining continuous visibility into how it behaves.

If extended further, the next steps would be:

- Add memory and disk space alerts
- Add failure-rate alerts from Application Insights
- Complete the Key Vault and Managed Identity integration

That would move this from a basic monitoring setup to a production-ready observability stack.
