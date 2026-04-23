# Azure Functions: What They Are, Why They Matter, and How I Built One

---

## What Are Azure Functions?

Azure Functions are small pieces of code that run in the cloud without you managing any server.

You write a function, upload it to Azure, and it sits there doing nothing until something triggers it — an HTTP request, a timer, a file upload, a queue message. When the trigger fires, Azure runs your code, and when it is done, everything shuts back down.

This model is called **serverless**. The server still exists, you just never see it or manage it. Azure handles provisioning, scaling, and shutting it down automatically.

There are many types of triggers available:

- **HTTP trigger** — runs when someone calls a URL
- **Timer trigger** — runs on a schedule, like a cron job
- **Blob trigger** — runs when a file is uploaded to storage
- **Queue trigger** — runs when a message arrives in a queue

Each function does one specific job. That is intentional. The idea is to break work into small, independent units rather than one large application that does everything.

---

## Why Are They Useful?

### Pay Only for What You Use

With a traditional server, you pay 24/7 whether anyone is using your app or not. With Azure Functions on a Consumption plan, if nobody calls your function for an hour, you pay nothing for that hour. If a thousand people call it at once, Azure scales it automatically — and you still only pay for actual execution time.

This makes Azure Functions a great fit for:

- APIs and webhooks that do not need to run constantly
- Scheduled tasks like nightly data exports or cleanup jobs
- Event-driven work like processing a file the moment it gets uploaded
- Lightweight backend logic without the overhead of a full web app

### No Infrastructure to Manage

There is no server to patch, no container to maintain, no load balancer to configure. You write the function, set a few environment variables, and deploy. Azure handles the rest — OS updates, runtime patches, auto-scaling, availability.

For a small team or a solo developer, this is a significant reduction in operational overhead.

### Local Development Feels Like the Real Thing

Azure Functions Core Tools lets you run functions on your laptop with `func start`. The local environment behaves identically to the cloud environment. You test locally, confirm it works, then deploy. There are no surprises.

---

## Azure Blob Storage — Where the Files Live

Before getting into the function itself, it helps to understand **Azure Blob Storage**.

Blob Storage is Azure's object storage service — the place where you store unstructured files. Blob stands for Binary Large Object, which is just a way of saying any kind of file: text files, images, CSVs, JSON, videos, backups.

Inside a storage account, files are organised into **containers**. A container is like a top-level folder. You can have multiple containers inside one storage account, each holding a different set of files.

```
Storage Account (veryspecialstoragename)
└── Container: data
    ├── test-file.txt
    ├── report.csv
    └── config.json
```

To access a storage account programmatically, you need a **connection string** — a single string that contains the account name, the account key, and the endpoint. It acts as both the address and the password.

```
DefaultEndpointsProtocol=https;AccountName=veryspecialstoragename;AccountKey=...;EndpointSuffix=core.windows.net
```

This connection string is sensitive. Anyone who has it can read, write, or delete everything in that storage account. It should never be committed to git.

---

## What I Built

I built an HTTP-triggered Azure Function in Python that connects to Azure Blob Storage and lists all files in a container.

When you call the URL, the function:

1. Reads the storage connection string and container name from environment variables
2. Connects to Azure Blob Storage using the Python SDK
3. Lists every blob (file) in the container
4. Returns the file names as a plain-text HTTP response

The response looks like this:

```
Container  : data
Total files: 3

File Names:
  [1] test-file.txt
  [2] report.csv
  [3] config.json
```

If the environment variables are missing or the connection fails, the function returns a `500` error with a description of what went wrong. The function never crashes silently.

---

## How I Implemented It

### Local Setup

I used **Azure Functions Core Tools** to run the function locally before touching the cloud. This is the standard development workflow — build and test on your laptop first, deploy only when it works.

I set up a Python virtual environment using Python 3.11. Python version matters here — Azure Functions has a fixed list of supported versions (3.9, 3.10, 3.11). I had Python 3.14 installed via Homebrew, which is not on that list, so I installed 3.11 separately and used it explicitly:

```bash
/opt/homebrew/bin/python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

The two dependencies in `requirements.txt` were:

- `azure-functions` — the SDK that registers the function and handles HTTP requests
- `azure-storage-blob` — the SDK for connecting to and reading from Blob Storage

### Configuration and Secrets

The function reads two values from environment variables at startup:

```python
connection_string = os.environ.get("AzureWebJobsStorage")
container_name    = os.environ.get("BLOB_CONTAINER_NAME")
```

For local development, these are stored in `local.settings.json`:

```json
{
  "Values": {
    "AzureWebJobsStorage": "DefaultEndpointsProtocol=https;AccountName=veryspecialstoragename;AccountKey=...;EndpointSuffix=core.windows.net",
    "BLOB_CONTAINER_NAME": "data"
  }
}
```

This file is never committed to git. It contains the storage account key.

For the deployed function in Azure, the same values are set under **Environment variables** in the portal (called App Settings). The code reads from both places identically — it just calls `os.environ.get()` and does not care whether it is running locally or in the cloud.

This is the key insight: `local.settings.json` and Azure App Settings are two different homes for the same configuration. Get both right and the function behaves the same everywhere.

### Running Locally

Starting the function locally is one command:

```bash
func start
```

The terminal prints:

```
Functions:
    list_storage_files: [GET,POST] http://localhost:7071/api/list-blobs
```

Opening that URL in a browser returned the file list immediately. The function was running on my laptop but reading from a real Azure Storage container — a real cloud resource.

Logs appeared directly in the terminal:

```
[Information] === list-blobs function triggered ===
[Information] Container : data
[Information] Total files found: 3
[Information]   [1] test-file.txt
[Information] === list-blobs function completed ===
```

### Creating Azure Resources

In the Azure Portal I created:

- A **Resource Group** (`c40`) — a logical container that groups all related Azure resources for this project
- A **Storage Account** (`veryspecialstoragename`) — where the actual files live
- A **Container** named `data` inside it — with a test file uploaded to verify the function would return real output
- A second **Storage Account** for the Function App itself — Azure Functions needs its own storage for internal operations, separate from your data
- A **Function App** (`MyBlobListerApp`) running Python 3.11 on Linux with a Flex Consumption plan

One thing to watch: when creating the Function App, **Basic authentication** must be enabled under the Deployment tab. The portal lets you create the app with it disabled but the deployment command will fail silently if it is off.

### Deploying

With the Function App created and App Settings configured, deployment was one command:

```bash
func azure functionapp publish MyBlobListerApp
```

Azure packaged the code, ran a remote build to install dependencies from `requirements.txt`, uploaded the package to storage, and synced the trigger. The whole pipeline finished in under three minutes:

```
Finished deployment pipeline.
```

### Testing the Live Function

From the portal I opened the function, clicked **Get Function URL**, and copied the live URL. It includes a `?code=` parameter — a secret key that authenticates the request. Without it, Azure returns `401 Unauthorized`.

```
https://mybloblisterapp.azurewebsites.net/api/list-blobs?code=SECRET_KEY
```

Pasted it into a browser. The response was identical to local:

```
Container  : data
Total files: 3

File Names:
  [1] test-file.txt
  [2] report.csv
  [3] config.json
```

Same code. Same output. Now running on Azure infrastructure in Canada Central instead of on my laptop.

---

## Key Takeaways

- **Azure Functions are serverless** — no server to manage, scales automatically, pay only when your code runs
- **Triggers define when the function runs** — HTTP, timer, blob upload, queue message, and more
- **Blob Storage** is Azure's file storage, organised into containers inside a storage account
- **Connection strings are secrets** — never commit them to git, always use environment variables
- **`local.settings.json`** holds config for local development; **App Settings** in the portal hold the same config in the cloud — the code does not know the difference
- **Test locally first** with `func start` before deploying anything to Azure
- **Python version matters** — Azure Functions supports 3.9, 3.10, and 3.11 only

---

## Final Thoughts

What surprised me most about Azure Functions was how little setup was required to go from code on my laptop to a live HTTPS endpoint in the cloud. The local development experience with `func start` is nearly identical to the deployed experience, which makes debugging straightforward.

The serverless model also forces a useful discipline: each function does one thing. That constraint keeps code simple and makes each piece independently deployable and testable.

For anyone learning cloud development, Azure Functions is one of the most approachable entry points. The infrastructure complexity is minimal, the feedback loop is fast, and the concepts — triggers, bindings, environment variables — appear across every cloud platform in some form.
