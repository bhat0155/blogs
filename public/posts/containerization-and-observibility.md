# Containerizing a .NET 9 + React App on AKS: Docker, Kubernetes, Azure DevOps CI/CD, and Production Observability

## What Is This Project?

This is a full end-to-end containerization and deployment of a weather application — a .NET 9 API backend and a React + Vite frontend — running on Azure Kubernetes Service (AKS) with a fully automated Azure DevOps CI/CD pipeline and a production-grade observability stack.

In Project 1, the app was deployed as a zip artifact to Azure App Service. Azure managed the runtime. You had little control over how the app ran, how it scaled, or what was happening inside it at any given moment.

In Project 2, the app runs in Docker containers orchestrated by Kubernetes. Every deployment is a rolling update. Every push to `main` triggers a pipeline that builds images, pushes them to a private registry, and rolls them out to the cluster with zero downtime. And every HTTP request the API handles is measured, stored, and visible in a Grafana dashboard — in real time.

The analogy: App Service is a managed apartment — Microsoft handles the building. AKS is owning the building. You control everything, and you're responsible for everything.

---

## Why Does It Matter?

Most junior DevOps engineers learn Docker and Kubernetes in isolation — they run a container locally, deploy a toy app on Minikube, and call it done. What they miss is the full picture: a working CI/CD pipeline that goes from code to production, and an observability layer that tells you whether what you just deployed is actually healthy.

Without observability, you are flying blind. You can deploy successfully (green pipeline, pods Running) and still have a broken app — slow responses, silent errors, memory leaks. You'll find out when a user complains, not before.

Without a proper pipeline, every deploy is a manual, error-prone process. Without rolling updates, every deploy causes downtime.

This project closes all three gaps at once:
- **Pipeline**: code → tested → containerized → deployed automatically
- **Zero downtime**: rolling updates replace pods one at a time, old pods serve traffic until new ones are healthy
- **Observability**: Prometheus scrapes the API every 15 seconds, Grafana visualises request rate, error rate, and latency — the three metrics that tell you whether a service is healthy

---

## What I Built

A production-style deployment pipeline for a weather app:

- **Backend**: .NET 9 Web API, containerized with a multi-stage Dockerfile
- **Frontend**: React + Vite SPA, containerized with a multi-stage Dockerfile, served by NGINX
- **Registry**: Azure Container Registry (ACR) — private Docker image store
- **Cluster**: AKS with 2 nodes, NGINX Ingress Controller, Kubernetes Secrets, ConfigMaps
- **Pipeline**: Azure DevOps 3-stage pipeline — Build & Test → Docker Build & Push → Deploy to AKS
- **Observability**:
  - Azure Monitor Container Insights — infrastructure metrics (DaemonSet on each node)
  - Prometheus + Grafana — application metrics via `prometheus-net.AspNetCore`
  - ServiceMonitor CRD — automatic target discovery via Prometheus Operator

Success looked like: push to `main`, watch three pipeline stages go green, confirm the rolling update completed, and see live request metrics in Grafana — all without touching the cluster manually.

---

## How I Implemented It

### Stage 1 — Multi-Stage Docker Builds

The first decision was image size. A single-stage Dockerfile that copies the source code and SDK into the image produces a ~900MB image. That image ships the compiler, test projects, and source files — none of which are needed at runtime.

Multi-stage builds solve this:

```dockerfile
# Stage 1 — BUILD
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY WeatherApp.sln .
COPY WeatherApp.Api/WeatherApp.Api.csproj WeatherApp.Api/
COPY WeatherApp.Tests/WeatherApp.Tests.csproj WeatherApp.Tests/
RUN dotnet restore WeatherApp.sln

COPY . .
RUN dotnet publish WeatherApp.Api/WeatherApp.Api.csproj \
    --no-restore --configuration Release --output /app/publish

# Stage 2 — RUNTIME
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "WeatherApp.Api.dll"]
```

The final image is ~230MB. The SDK never ships. Project files are copied before source files deliberately — Docker caches each layer, so if only `.cs` files change, the restore layer is reused and the build is ~30 seconds faster.

For the frontend, `VITE_API_BASE_URL` must be passed as a build argument — Vite bakes `import.meta.env` variables into the JS bundle at build time. There is no runtime injection:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Gotcha**: On Apple Silicon (ARM64), `docker build` produces an ARM64 image. AKS nodes run AMD64. The pipeline must use `--platform linux/amd64` explicitly, or every pod will fail with `ImagePullBackOff` due to platform mismatch.

---

### Stage 2 — Kubernetes Manifests

Seven YAML files declare the desired state of the app. Kubernetes reads them and makes reality match.

The deployment uses rolling updates with `maxUnavailable: 0` and `maxSurge: 1`:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1        # spin up 1 extra pod before killing old ones
    maxUnavailable: 0  # never drop below 2 running pods during update
```

This means: during a deploy, a third pod starts, passes its readiness probe, and only then does Kubernetes kill one of the original two. Traffic never drops.

Readiness and liveness probes are critical:

```yaml
readinessProbe:
  httpGet:
    path: /api/health
    port: 8080
  initialDelaySeconds: 15
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /api/health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 30
```

The readiness probe gates traffic — a pod only receives requests once it returns 200 on `/api/health`. The liveness probe restarts the container if it becomes unresponsive. Without these, Kubernetes routes traffic to pods that are still starting up.

Kubernetes Secrets are never committed to the repo. The pipeline creates them at deploy time:

```bash
kubectl create secret generic weatherapp-secrets \
  --from-literal=sql-connection-string="$(SQL_CONNECTION_STRING)" \
  --from-literal=owm-api-key="$(OWM_API_KEY)" \
  --namespace weatherapp \
  --dry-run=client -o yaml | kubectl apply -f -
```

`--dry-run=client -o yaml | kubectl apply -f -` is idempotent — it creates the secret if missing, updates it if it exists. No `secret.yaml` file exists in the repo. A placeholder file with fake base64 values would get picked up by `kubectl apply -f k8s/` and silently overwrite the real secret.

---

### Stage 3 — The Azure DevOps Pipeline

Three stages, each gating the next:

```
Stage 1: Build & Test
  dotnet restore → build → test (gate) → publish results

Stage 2: DockerBuild
  docker login ACR
  docker build + push API image (tagged with Build.BuildId + latest)
  docker build + push Frontend image (with VITE_API_BASE_URL baked in)

Stage 3: DeployDev
  az aks get-credentials
  kubectl apply namespace, configmap, secret, services, ingress
  sed IMAGE_TAG + ACR_LOGIN_SERVER into deployment manifests | kubectl apply
  kubectl rollout status --timeout=5m (blocks until rollout completes)
  curl /api/health (smoke test)
```

The deploy stage uses `deployment` (not `job`) to get environment tracking, approval history, and rollback visibility in Azure DevOps.

All kubectl commands live inside a single `AzureCLI@2` task. The reason: `az aks get-credentials` writes auth to `~/.kube/config`. That context is not guaranteed to survive across separate steps. One task = one shell = context always valid.

```yaml
- task: AzureCLI@2
  displayName: 'Deploy to AKS'
  inputs:
    azureSubscription: 'azure-service-connection'
    scriptType: 'bash'
    scriptLocation: 'inlineScript'
    inlineScript: |
      set -e
      az aks get-credentials \
        --resource-group $(AKS_RESOURCE_GROUP) \
        --name $(AKS_CLUSTER_NAME) \
        --overwrite-existing
      # ... kubectl commands
```

`set -e` stops the script on the first non-zero exit. Without it, a failed `kubectl apply` would be silently ignored and the pipeline would report success.

Image tags are substituted in-stream using `sed` — no files on disk are modified:

```bash
sed -e 's/IMAGE_TAG/$(imageTag)/g' \
    -e 's|ACR_LOGIN_SERVER|$(ACR_LOGIN_SERVER)|g' \
    k8s/api-deployment.yaml | kubectl apply -f -
```

This keeps the manifest files clean (no hardcoded registry URLs) and makes them reusable across environments.

---

### Stage 4 — Observability

This is the part that separates a deployed app from an observable one.

#### The Three Pillars

Observability is the ability to ask any question about your system's internal state from the outside, without deploying new code.

```
METRICS  → numbers over time. "47 errors in the last 5 minutes"
LOGS     → raw event records. "NullReferenceException at line 42"
TRACES   → end-to-end path of a single request. "800ms total, 600ms was the OWM API call"
```

This project covers Pillar 1 (Metrics) in depth with two complementary layers.

#### Layer 1 — Azure Monitor Container Insights

Enabled via a single click in the Azure Portal. Deploys as a **DaemonSet** — a Kubernetes object that runs exactly one pod per node. When a new node joins the cluster, the DaemonSet pod is automatically scheduled on it. This is how cluster-wide agents (monitoring, logging, security) are always deployed.

What it collects with zero code changes:
- CPU and memory per pod and per node
- Container restart counts (CrashLoopBackOff detection)
- Pod scheduling failures and OOM kills
- Kubernetes events (scale events, evictions)
- Node disk and network I/O

This answers: **"Is the infrastructure healthy?"**

#### Layer 2 — Prometheus + Grafana

Installed via Helm in one command:

```bash
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword="WeatherApp@Grafana123" \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
```

`serviceMonitorSelectorNilUsesHelmValues=false` is not optional. Without it, Prometheus only discovers ServiceMonitors created by this Helm release and silently ignores everything else. The WeatherApp ServiceMonitor would never be picked up — no error, just empty graphs.

The stack installs:
- **Prometheus** — scrapes and stores metrics (pull model — Prometheus visits `/metrics`, not the other way)
- **Grafana** — visualises metrics with PromQL queries
- **Alertmanager** — routes alerts to email, Slack, PagerDuty
- **Node Exporter** — exposes OS-level metrics per node
- **kube-state-metrics** — exposes Kubernetes object metrics (pod counts, deployment status)
- **Prometheus Operator** — watches for ServiceMonitor CRDs and auto-configures Prometheus

#### Wiring the .NET API into Prometheus

One NuGet package instruments every HTTP request automatically:

```xml
<PackageReference Include="prometheus-net.AspNetCore" Version="8.*" />
```

Two lines in `Program.cs`:

```csharp
using Prometheus;

// after app.UseCors(...)
app.UseHttpMetrics();  // records route, method, status code, duration per request
app.MapMetrics();      // registers GET /metrics endpoint
```

`UseHttpMetrics` exposes three metric families directly mapping to the **RED method**:

```
R — Rate      http_requests_received_total
E — Errors    http_requests_received_total filtered by code=~"5.."
D — Duration  http_request_duration_seconds (histogram with p50/p95/p99 buckets)
```

The RED method is the industry standard for answering "is this service healthy?" for any microservice.

#### The ServiceMonitor — Automatic Target Discovery

The Prometheus Operator introduces a custom Kubernetes resource called `ServiceMonitor`. Instead of editing Prometheus config files and restarting, you declare scrape targets as Kubernetes objects:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: weatherapp-api-monitor
  namespace: monitoring        # must be in the monitoring namespace
  labels:
    release: monitoring        # must match the Helm release name
spec:
  namespaceSelector:
    matchNames:
      - weatherapp
  selector:
    matchLabels:
      app: weatherapp-api      # matches metadata.labels in api-service.yaml
  endpoints:
  - port: http                 # named port from api-service.yaml
    path: /metrics
    interval: 15s
```

The label chain must be correct end-to-end:

```
ServiceMonitor.labels.release: monitoring
    ↓ Prometheus Operator finds it
ServiceMonitor.spec.selector.matchLabels.app: weatherapp-api
    ↓ matches
api-service.yaml.metadata.labels.app: weatherapp-api
    ↓ Prometheus resolves pod IPs and scrapes each one
weatherapp-api pod /metrics
    ↓ returns Prometheus text format
Prometheus stores time-series data
    ↓
Grafana renders dashboards
```

If any label is wrong, Prometheus scrapes nothing silently. No error message. Just empty graphs. Getting this chain right is the most common point of failure when setting up Prometheus on Kubernetes.

#### Why `/metrics` Must Not Go Through the Ingress

The Ingress routes `/api/*` to the API and `/` to the frontend (catch-all). A request to `/metrics` matches `/` and hits the frontend NGINX pod — wrong pod, no metrics, no error.

Prometheus bypasses the Ingress entirely and hits the ClusterIP Service directly using the internal pod IP. The endpoint is never public. This is the correct architecture.

Verification:

```bash
# Port-forward directly to the API service — bypasses the Ingress
kubectl port-forward svc/weatherapp-api-svc 8080:80 -n weatherapp
curl http://localhost:8080/metrics

# Expected output:
# http_requests_received_total{code="200",method="GET",...} 43
# http_request_duration_seconds_bucket{...,le="0.032"} 43
```

#### PromQL — The Three Queries That Matter

```promql
# Rate — requests per second (5-minute rolling average)
rate(http_requests_received_total{job="weatherapp-api-svc"}[5m])

# Errors — 5xx per second
rate(http_requests_received_total{job="weatherapp-api-svc", code=~"5.."}[5m])

# Duration — p95 latency (95% of requests are faster than this)
histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket{job="weatherapp-api-svc"}[5m])
)
```

Why p95 and not average? Average latency hides outliers. If 94 requests take 10ms and 6 take 5 seconds, the average is ~300ms — fast-looking. p95 reveals those 6 slow requests directly. p99 reveals the worst 1%. In production, the outliers are what users complain about.

---

## Key Takeaways

- **Multi-stage Docker builds are non-negotiable** — shipping the SDK in your production image is a security and size problem. Layer caching (copy project files before source) makes subsequent builds significantly faster.
- **`VITE_API_BASE_URL` is baked at build time, not runtime** — Vite replaces `import.meta.env` variables during `npm run build`. If the value is wrong when the image is built, no amount of environment variable changes at runtime will fix it. Rebuild the image.
- **Never commit `secret.yaml`** — use `kubectl create secret --dry-run=client -o yaml | kubectl apply -f -` in the pipeline. Idempotent, never on disk, never in git.
- **`set -e` in pipeline scripts is not optional** — without it, a failed `kubectl apply` continues silently and the pipeline reports success.
- **The Prometheus Operator label chain must be exact** — a single label mismatch produces no error and no metrics. Always verify with `kubectl port-forward` to Prometheus UI → Status → Targets.
- **`serviceMonitorSelectorNilUsesHelmValues=false` is required** — omitting this flag causes Prometheus to silently ignore all ServiceMonitors not created by its own Helm release.
- **The RED method is portable** — Rate, Errors, Duration. These three metrics apply to any service, any language, any cloud. Learn them once, use them everywhere.
- **p95 latency beats average latency** — average hides the outliers that users actually experience. Always track percentiles.

---

## Final Thoughts

The biggest shift in thinking this project created was around observability. I had assumed that a green pipeline and running pods meant a healthy app. What I learned is that "running" and "healthy" are two different things — a pod can be running and silently returning errors or responding slowly, and you'll never know without metrics.

The label chain in the ServiceMonitor setup was the hardest part — not because it's technically complex, but because a wrong label produces no feedback at all. Prometheus doesn't tell you it can't find the service. It just shows nothing. That silent failure mode is a production debugging trap worth understanding deeply before you need to diagnose it under pressure.

If I were doing this again, I'd set up the observability layer earlier — even before the pipeline is stable. Seeing request counts and latency in Grafana while manually testing manifests would have made the SQL connection debugging significantly faster.
