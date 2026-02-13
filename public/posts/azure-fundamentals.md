# I’m Officially Azure Fundamentals Certified! ☁️ (AZ-900)

So, you know how to write code—but do you know where that code actually *lives*?

Welcome to **Cloud Infrastructure**.

The cloud is basically a way to use serious compute, storage, and services **without buying and maintaining physical hardware**. In the simplest terms, the **public cloud** feels like *renting* IT resources and paying only for what you use.

A few decades ago, a great idea meant buying servers, configuring networks, maintaining hardware, and dealing with a lot of operational overhead. Today, you can open an Azure account and start building.

---

## The AZ-900 “Cheat Sheet” (What to Know)

Based on the AZ-900 study guide topics, the exam focuses on cloud concepts, core Azure services, and Azure management/governance. 

### 1) Cloud Concepts (The “Why”)

**High Availability (HA)**  
Designing systems to stay up with minimal downtime (uptime matters).

**Scalability**  
Increasing capacity:
- **Vertical scaling**: bigger VM / more CPU-RAM
- **Horizontal scaling**: more instances

**Elasticity**  
Automatically adding/removing resources based on demand (scale out/in dynamically).

**Agility**  
Rapid provisioning and fast experimentation—spin up resources quickly.

**CapEx vs OpEx**
- **CapEx (Capital Expenditure):** upfront hardware spending
- **OpEx (Operational Expenditure):** pay-as-you-go (typical cloud model)

**Shared Responsibility Model**
- **IaaS:** you manage OS + apps; Microsoft manages physical infrastructure
- **PaaS:** you manage the app; Microsoft manages OS + platform
- **SaaS:** Microsoft manages almost everything (you mainly manage users/data/config)

---

### 2) Core Architecture (How Azure is Organized)

**Regions**  
Geographical areas that contain Azure datacenters (example: *West US*).

**Availability Zones**  
Physically separate datacenters within a region to reduce the impact of a datacenter failure.

**Region Pairs**  
Microsoft pairs many regions within the same geography to help with resilience and recovery patterns. The “300 miles apart” line is best remembered as **“typically”** (not guaranteed everywhere due to geography constraints). 

**Management Groups**  
Used to apply governance across multiple subscriptions (policy/RBAC at scale).

**Subscriptions**  
A billing + access boundary (often how organizations separate environments/teams).

**Resource Groups (RGs)**  
A logical container for resources.  
Pro tip: deleting an RG deletes the resources inside it (since the resources are part of that container).

---

### 3) Security & Governance (I got decent amount of questions)

**Defense in Depth**  
Layered security approach—multiple controls across identity, perimeter, network, compute, app, and data.

**Zero Trust**  
“Never trust, always verify.” Assume breach, verify explicitly, enforce least privilege.

**Microsoft Entra ID** (formerly Azure AD)  
Identity platform for users, SSO, MFA, app access, etc.

**Conditional Access**  
“If/Then” access rules (example: *If sign-in risk is high, require MFA*).

**RBAC (Role-Based Access Control)**  
Granular permissions using roles like **Owner / Contributor / Reader**.

**Azure Policy**  
Enforces rules and standards (example: “Only allow VMs in East US”).

**Resource Locks**
- **CanNotDelete:** can change, but can’t delete
- **ReadOnly:** can read, but can’t modify

---

### 4) Management & Tools

| Tool | What it does |
|---|---|
| **Azure Advisor** | Recommendations for cost, security, reliability, operational excellence |
| **ARM Templates** | Infrastructure as Code using **JSON** templates |
| **Azure Arc** | Manage servers/services across on-prem + multi-cloud from Azure |
| **TCO Calculator** | Estimate costs/savings *before* moving to Azure |
| **Cost Management** | Track and optimize real spending *after* moving |

---

### 5) Quick Hits (Common AZ-900 Services)

- **Azure IoT Hub:** two-way communication with IoT devices
- **Azure Functions:** serverless, event-driven code
- **Azure Logic Apps:** low-code/no-code workflows
- **Azure Key Vault:** secrets, keys, and certificates storage

**Public Preview / Early Access Notes**  
A safe rule for AZ-900: preview features often have limited guarantees; **don’t rely on them for production** unless you’ve confirmed the exact preview terms and risk. Some preview programs (especially “Early Access”) explicitly say **no production use**.

---

## Final Thoughts

AZ-900 is largely theoretical, but I strongly recommend doing a few hands-on labs—concepts like RBAC, Policy, resource groups, and cost management stick way better when you click through them yourself.

For practice, I personally used **Tutorials Dojo** practice tests—**the detailed explanations** are where most of the learning happens. If you’re consistently scoring **80%+** on practice exams and you understand *why* each option is right/wrong, you’re in a solid spot.

- Tutorial Dojo: https://tutorialsdojo.com/courses/az-900-microsoft-azure-fundamentals-practice-exams/
- Abhishek Veeramala (Youtube labs): [Youtube Link](https://www.youtube.com/watch?v=10jm7Waan8M&list=PLdpzxOOAlwvIcxgCUyBHVOcWs0Krjx9xR)

Good luck to everyone chasing their next certification! 🚀
