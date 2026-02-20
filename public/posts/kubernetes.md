GitHub Repo: https://github.com/bhat0155/xeffect

# Integrating Kubernetes Into My Existing Docker Project (XEffect)

## 1. Why I Moved Beyond Docker Compose
I moved beyond Docker Compose because I wanted to learn how orchestration works in real life. With Kubernetes, I’m not just “starting containers” — I’m declaring what I want (like 2 backend pods), and Kubernetes keeps trying to match that desired state. If a pod crashes, it comes back. If I need more capacity, I can scale replicas (and in real setups you can even autoscale). Plus, it supports rolling updates, health checks that control traffic, and clean separation of config, secrets, storage, and routing in YAML — which feels much closer to how teams run production.

---

## 2. What XEffect Looked Like Before Kubernetes
Before Kubernetes, XEffect was just three services in Docker Compose: frontend, backend, and Postgres. The frontend hit the backend over local ports, and the backend connected to Postgres. All the wiring was done with `docker-compose.yml` (service names/ports) and `.env` files. It worked fine locally, but it still felt like “start containers and hope they stay up,” which is why I wanted to move to Kubernetes for more real orchestration.

---

## 3. The Architecture I Wanted (And Why)
The architecture I wanted was basically “production vibes.” One hostname, and then routing based on paths (Ingress style): `/auth`, `/docs`, `/health` (and API routes) go to the backend, and `/` goes to the frontend. Internally, I wanted each component to be its own thing with a stable Service (ClusterIP), so pods talk to each other using service names like `db-svc` instead of random IPs.

For the database, persistence was non-negotiable. I created a PVC (request for disk), then in the DB Deployment I defined a pod-level volume backed by that PVC, and mounted it into the Postgres container at `/var/lib/postgresql/data`. That way Postgres writes real DB files onto persistent storage, and if the DB pod gets recreated, it reattaches the same PVC and the data is still there.

I also wanted clean separation of config vs credentials (ConfigMap vs Secret) injected at runtime, plus health checks so pods only get traffic when they’re ready (and can be restarted if they get stuck).

---

## 4. Choosing Minikube + NGINX Ingress for Local Dev
By “local cluster,” I mean a real Kubernetes cluster running on my laptop (control plane + a node), so I can practice the same objects I’d use in the cloud. I went with Minikube because it’s simple: one command to get a cluster, plus add-ons for stuff like ingress.

For routing, I used the NGINX Ingress Controller because Ingress by itself is just rules — the controller is the thing that actually receives HTTP traffic and routes it. That let me map one hostname with different paths and decide whether a request should go to the backend or the frontend, like a production setup.

One macOS gotcha: with the Docker driver, reaching NodePort/minikube IP can be flaky, so I used `kubectl port-forward` to the ingress controller as the reliable way to access the app locally.

---

## 5. Namespace First: Isolating the App Cleanly
I created a dedicated `xeffect` namespace to keep everything organized and isolated. Instead of dumping resources into `default`, I can run `kubectl -n xeffect get all` and see only this app’s pods, services, config, and ingress. It also makes debugging less messy and cleanup way easier — if I ever want a full reset, deleting the namespace wipes the whole app in one shot.

---

## 6. ConfigMaps and Secrets: Separating Config From Credentials
I split normal settings from sensitive credentials. ConfigMaps hold non-secret stuff (ports, allowed frontend origin, callback URLs, etc.). Secrets hold sensitive values like `DATABASE_URL`, JWT secret, and API keys — stuff that should never be baked into the Docker image or pushed to GitHub. Kubernetes injects both into pods at runtime, which makes changes way easier because I can update config/credentials without rebuilding my images.

---

## 7. Persistent Storage: Making Postgres Survive Restarts
Persistent storage matters because pods are disposable — Kubernetes can delete and recreate them anytime. First I created a PVC, which is basically a request for persistent disk storage. Then in the Postgres Deployment, I defined a pod-level volume called `db-data` that’s backed by that PVC (`db-pvc`). After that, inside the Postgres container, I used `volumeMounts` to mount `db-data` at `/var/lib/postgresql/data` (where Postgres stores its database files).

The result is: Postgres writes to `/var/lib/postgresql/data`, but that path is actually backed by the PVC disk, so the data survives restarts. If the DB pod gets recreated, the new pod mounts the same PVC again and the database files are still there.

---

## 8. Deploying the Database Layer
Next I deployed the database layer. I created a Postgres Deployment (`replicas: 1`) that runs the `postgres:16-alpine` container and mounts my PVC so `/var/lib/postgresql/data` persists across restarts. Then I created a ClusterIP Service (`db-svc`) that selects the DB pod by label and gives it a stable DNS name inside the cluster. That way the backend can always connect using `db-svc:5432`, even if the DB pod gets recreated.

---

## 9. Deploying the Backend API (With Migrations on Startup)
Then I deployed the backend. I created a backend Deployment with 2 replicas, so I always have two API pods running. The pods load config and credentials at runtime using `envFrom` (ConfigMap + Secret), so nothing sensitive is baked into the image. The container exposes port 4000 because that’s where my Express API listens.

On startup, I run `npx prisma migrate deploy && npm start` so the database schema is up to date before the server begins handling requests. Finally, I created `backend-svc` on port 4000, which gives a stable internal DNS name and load-balances traffic across both backend pods.

---

## 10. Deploying the Frontend and Wiring Internal Services
Frontend was similar. I created a frontend Deployment labeled `app=frontend` using the `xeffect-frontend:dev` image. The container exposes port 5173 because Vite listens there, and I made sure Vite binds to `0.0.0.0` so it’s reachable inside Kubernetes (not just `localhost` inside the container). Then I created `frontend-svc` (ClusterIP) on port 5173 to give the frontend a stable internal DNS name, which Ingress can route to.

---

## 11. Ingress Routing: /api, /auth, /docs, and /
Ingress became the “front door” for the whole app. The Ingress resource defines the routing rules, and the NGINX Ingress Controller is the component that actually receives HTTP traffic and applies those rules. I set up one host with path-based routing — backend paths like `/health`, `/docs`, `/auth` go to `backend-svc`, and everything else (`/`) goes to `frontend-svc`. Ingress doesn’t talk to pods directly; it forwards to Services, and Services route to the right pods.

---

## 12. macOS Gotcha: Why Port-Forwarding Beat NodePort
This was the biggest macOS gotcha. Even though my Ingress and services were correct, I couldn’t reliably hit `$(minikube ip):NodePort` from my Mac (Docker driver networking can be flaky/unreachable for that). So instead I used `kubectl port-forward` on the ingress-nginx controller: `18080:80`. That way `http://localhost:18080` tunneled straight into the ingress controller through the Kubernetes API connection. Lesson learned: local cluster networking can behave differently depending on OS/driver, and port-forward is the “it always works” option.

Example:
```bash
kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller 18080:80