### Building a Cloud-Native PDF Upload App on Microsoft Azure


---

## Introduction

This document walks through the complete process of designing, building, and deploying a cloud-native PDF upload application on Microsoft Azure. The app allows users to upload PDF files through a browser, stores those files in cloud storage, records metadata in a database, and automatically sends an email alert whenever a large file (over 1 MB) is uploaded — all without storing a single password in the application code.

This project is not just about writing code. It is about understanding how cloud services are wired together, how security works at the infrastructure level, and how modern applications are deployed and managed on a platform like Azure.

---

## What We Built

At its core, the application does five things:

1. Presents a web page where a user can upload a PDF file
2. Stores the uploaded file in Azure Blob Storage
3. Records the file's name, size, and storage URL in an Azure SQL Database
4. Triggers an automated email alert if the file is larger than 1 MB
5. Never stores any database password, storage key, or API key in the application code — all secrets live in Azure Key Vault

---

## Architecture Overview

Understanding how the components talk to each other is more important than any individual piece. Here is the full picture:

```
[ User's Browser ]
       |
       | HTTP request (uploads PDF)
       v
[ Azure App Service ]  — hosts the Node.js backend AND the HTML frontend
       |
       |— uploads file ——————> [ Azure Blob Storage ]
       |                              |
       |— saves metadata ——————> [ Azure SQL Database ]
                                      |
                              [ Azure Function ]  — fires automatically when a
                                      |            new blob is detected
                                      |
                              [ SendGrid Email ]  — sends alert if file > 1 MB

[ Azure Key Vault ]  — sits behind everything, holds all secrets
       ^
       | (fetched at runtime via Managed Identity — no passwords)
       |
[ App Service + Azure Function ]
```

Every arrow in this diagram represents a real Azure service talking to another. The key insight is that **no service ever uses a hardcoded password**. Instead, Azure services authenticate to each other using Managed Identity — an identity system built into Azure Active Directory.

---

## Phase 1 — Infrastructure and Security

### The Foundation: Resource Group

Before creating anything, a **Resource Group** was created to act as a container for every resource in this project. Think of it as a project folder at the cloud level. Every storage account, database, function, and app service belongs to this single group, which makes billing, access control, and cleanup much simpler.

**Resource group name:** `azureTrigger`

---

### The Secret Keeper: Azure Key Vault

The very first real service created was **Azure Key Vault**. This is the most important architectural decision in the entire project.

Key Vault is a secure, managed store for secrets — things like database passwords, API keys, and connection strings. The principle here is simple: application code should never contain sensitive values. If code is ever committed to a repository, shared with a teammate, or read by someone who should not have access, there is nothing sensitive to steal.

In this project, Key Vault holds:
- The SQL database connection string (which contains the database username and password)
- The SendGrid API key (used to send emails)

The application reads these values from Key Vault at runtime, every time they are needed.

**Key Vault name:** `triggerKeyVaultByEkam`

---

### The Compute Layer: App Service

An **App Service Plan** defines the server hardware — the CPU and memory available to run applications. An **App Service** is the actual web server that runs on top of that plan.

This is where the Node.js backend and the HTML frontend are hosted. Azure fully manages the operating system, patching, and uptime. Developers only deploy code — not servers.

**App Service name:** `BackendAppForTrigger`
**Region:** Canada Central (East US had no quota available on this subscription)

---

### The Identity Layer: Managed Identity

This is the most important security concept in the project. After the App Service was created, **System Assigned Managed Identity** was enabled on it.

Managed Identity gives the App Service an identity in Azure Active Directory — like an employee ID badge. Other Azure services can then say "I trust this App Service" and grant it access without any username or password being exchanged.

In practice, this means:
- The App Service can upload files to Blob Storage because it was granted the `Storage Blob Data Contributor` role on the storage account
- The App Service can read secrets from Key Vault because it was granted the `Key Vault Administrator` role on the vault
- No password was created, stored, or rotated for any of this

The same Managed Identity pattern was applied to the Azure Function later in the project.

---

## Phase 2 — Storage and Database

### Where Files Live: Azure Blob Storage

**Azure Blob Storage** is Azure's object storage service — designed to hold large amounts of unstructured data like documents, images, and videos. A **Storage Account** is the parent resource, and inside it, a **Container** called `pdf-uploads` was created specifically for uploaded PDFs.

Every PDF uploaded through the app lands in this container. Each file is given a unique name using a timestamp prefix to prevent naming collisions.

**Storage Account:** `triggerbyekam`
**Container:** `pdf-uploads`

The App Service was granted `Storage Blob Data Contributor` access to this storage account via the Managed Identity established in Phase 1. This means the Node.js backend authenticates to Blob Storage not with a key, but with its identity.

---

### Where Metadata Lives: Azure SQL Database

While Blob Storage holds the actual file bytes, **Azure SQL Database** holds structured information about each upload. Every time a PDF is uploaded, a row is inserted into the `FileMetadata` table with:

- The original filename
- The file size in bytes
- A human-readable size label (e.g. "2.4 MB")
- The full Blob Storage URL of the file
- The timestamp of the upload

This separation of concerns — files in Blob Storage, metadata in SQL — is a standard cloud architecture pattern. It allows querying file information efficiently without loading the actual files.

**SQL Server:** `sqlfortrigger`
**Database:** `sqldatabase`
**Table:** `FileMetadata`

The database connection string (which contains the password) is stored in Key Vault as `SqlConnectionString`. The Node.js backend fetches this secret from Key Vault at startup using Managed Identity — the password never appears in any configuration file or environment variable.

---

## Phase 3 — The Backend

### How the API Works

The Node.js backend built with Express.js is the central hub of the application. It handles one primary job: receiving a PDF upload, saving it to Blob Storage, and recording the metadata in SQL.

Here is the flow of a single upload request:

1. The user selects or drags a PDF onto the web page and clicks Upload
2. The browser sends the file to the Node.js backend via an HTTP POST request
3. The backend validates that the file is actually a PDF (not just named like one)
4. The file is streamed directly to Azure Blob Storage using the Azure SDK and Managed Identity
5. The backend fetches the SQL connection string from Key Vault (also using Managed Identity)
6. The file's metadata is written to the `FileMetadata` table in Azure SQL
7. The backend responds to the browser with a success message and the file's Blob URL

The backend also serves the HTML frontend directly, meaning a single App Service URL hosts both the API and the web page.

---

### Environment Variables vs. Key Vault

This is an important distinction the project makes deliberately.

**What goes in environment variables (safe — not sensitive):**
- The Key Vault URL (just a web address)
- The storage account name
- The blob container name
- The server port number

**What goes in Key Vault (sensitive):**
- The SQL connection string (contains password)
- The SendGrid API key

Environment variables on Azure App Service are visible in the portal to anyone with access. They are fine for configuration values. Secrets must never be put there.

---

## Phase 4 — The Email Alert Function

### Event-Driven Architecture

The email alert is handled by an **Azure Function** — a piece of serverless code that runs only when triggered by an event. In this case, the trigger is a new blob appearing in the `pdf-uploads` container.

This design decision is deliberate and important. The email alert was not built into the Node.js backend. If it were, every upload request would have to wait for the email to be sent before returning a response to the user — making uploads slower. By moving this logic to a separate function with a Blob Trigger, the upload API stays fast, and the email logic runs in the background, independently.

**Function App name:** `sendingemail`

---

### How the Blob Trigger Works

Azure Blob Storage and Azure Functions are connected through a Blob Trigger binding. When the Function App is configured to watch a specific container path (`pdf-uploads/{name}`), Azure automatically detects when a new file appears and invokes the function, passing the file content as input.

The function then:
1. Checks the file size
2. If the file is 1 MB or under, it logs a message and exits — no email sent
3. If the file exceeds 1 MB, it reads the SendGrid API key from Key Vault using Managed Identity
4. It sends an email alert to `bhat0155@algonquinlive.com` with the filename and size

The function has its own Managed Identity with `Key Vault Secrets User` access — completely separate from the App Service identity. Each service gets only the permissions it needs.

---

### The Storage Connection Problem

A subtle issue arose during setup: the Function App uses a storage account for its own internal operations (tracking trigger state, queues, etc.). This was a different storage account from `triggerbyekam` where PDFs are uploaded.

If the Blob Trigger watches the wrong storage account, it never fires. The fix was to add a dedicated app setting (`PdfStorageConnection`) pointing to the `triggerbyekam` connection string, and configure the function's binding to use that specific connection. This is a real-world subtlety that many tutorials skip.

---

## Phase 5 — The Frontend

### Serving the Web Page

The frontend is a single HTML page served directly from the Node.js backend. It provides:
- A drag-and-drop upload zone
- Click-to-browse file selection
- PDF file type validation (client-side)
- A file size display before upload
- Upload progress indication
- Success and error feedback after the API responds

Because the frontend is served from the same origin as the backend, there are no cross-origin (CORS) complications. The upload button sends a standard HTTP POST request to `/upload` on the same domain.

The frontend is intentionally simple. Its only job is to let users pick a PDF and see the result. All the real work — storage, database, email — happens on the server side.

---

## How Everything Depends on Each Other

This dependency chain is worth understanding clearly, because if any link breaks, the ones after it also break.

```
Key Vault
  └── App Service needs it to get the SQL password
        └── SQL Database needs the password to accept connections
              └── FileMetadata table needs the database to exist
                    └── Backend needs the table to record uploads

Key Vault
  └── Azure Function needs it to get the SendGrid API key
        └── SendGrid needs the key to accept email requests
              └── Email alert needs SendGrid to deliver

Blob Storage
  └── App Service needs Storage Blob Data Contributor role to write files
        └── PDF uploads need the role to succeed
              └── Blob Trigger needs the file to exist to fire
                    └── Azure Function needs the trigger to run

Managed Identity
  └── App Service identity needs Key Vault access policy
  └── App Service identity needs Blob Storage role
  └── Function identity needs Key Vault access policy
        └── Everything above depends on this identity layer
```

The Managed Identity layer is the foundation of the entire security model. Remove it, and every service would need a hardcoded password. Keep it, and no secret ever touches the application code.

---

## Azure Resources Summary

| Resource | Type | Purpose |
|---|---|---|
| `azureTrigger` | Resource Group | Container for all project resources |
| `triggerKeyVaultByEkam` | Key Vault | Stores SQL connection string and SendGrid API key |
| `triggerbyekam` | Storage Account | Holds the `pdf-uploads` blob container |
| `sqlfortrigger` | SQL Server | Database engine |
| `sqldatabase` | SQL Database | Stores `FileMetadata` rows |
| `BackendAppForTrigger` | App Service | Runs Node.js API and serves HTML frontend |
| `sendingemail` | Function App | Blob-triggered email alert function |

---

## Key Lessons

**1. Security is infrastructure, not code.**
Passwords do not belong in code, config files, or environment variables. Key Vault and Managed Identity make this achievable without extra complexity in the application code.

**2. Separation of concerns scales.**
Files go to Blob Storage. Metadata goes to SQL. Email logic goes to a Function. Each service does one thing and does it independently. This is why the upload API stays fast even when emails take time to send.

**3. Cloud services need explicit permissions.**
Nothing in Azure works by default. Every service-to-service connection — App Service to Key Vault, App Service to Blob Storage, Function to Key Vault — required an explicit role assignment. This is the Zero Trust model: deny by default, grant specifically.

**4. Region consistency matters.**
Resources in different regions can communicate, but it adds latency. In this project, some resources ended up in East US and others in Canada Central due to quota constraints. For production, all resources should share the same region.

**5. Event-driven logic belongs in functions.**
Putting the email alert in the backend would couple upload speed to email delivery speed. A Blob Trigger decouples them completely — the user gets a response the moment the file is saved, and the email logic runs whenever Azure is ready.

---

*Built on Microsoft Azure — App Service, Blob Storage, SQL Database, Key Vault, Azure Functions, SendGrid*
