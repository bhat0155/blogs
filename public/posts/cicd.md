# How I Integrated CI/CD into xeffect

CI/CD is supposed to be a boring process. And honestly, that's the point. It's a gate that ensures only good, tested code reaches production so end users never have to deal with broken builds. For xeffect, I chose Azure Pipelines for CI and Argo CD for CD, and this post walks through exactly how I set it up.

---

## The What

I needed to integrate CI/CD so that only tested, working code gets pushed to production. It's the industry standard for a reason: manual deployments are fragile, unauditable, and a disaster waiting to happen at 2am.

---

## Project Architecture and CI/CD Stack

Quick overview of the stack:

- Node.js backend
- React frontend
- PostgreSQL database

For CI/CD:

- Azure Pipelines for continuous integration
- Argo CD for continuous deployment
- Azure Container Registry (ACR) for storing Docker images
- AKS (Azure Kubernetes Service) as the Kubernetes cluster

---

## CI Setup in Azure DevOps

The pipeline has three stages: test, build, and push.

The first stage runs unit and integration tests. To make integration tests work, I spun up a temporary PostgreSQL container inside the pipeline so the tests have a real database to talk to, not mocks. Once that's up and initialized, I ran `npx prisma generate` to generate the Prisma client, set the required environment variables, and then ran the Jest test suite.

Once tests pass, the build stage kicks in and creates a new Docker image tagged with the pipeline's build number. Then the push stage pushes that image to ACR.

---

## Self-Hosted Agent Setup

Azure Pipelines needs compute to actually run the pipeline. I created my own agent pool by spinning up a VM, installing the Azure DevOps agent on it, configuring Docker with the right permissions, and pointing it at the pipeline. It listens for triggers and starts the pipeline whenever a new commit lands on the branch.

One thing I learned the hard way: the agent needs Docker installed and the agent user needs to be in the `docker` group. If you skip that, Docker tasks fail silently in weird ways.

---

## CD Setup with Argo CD

For CD, I used the GitOps model with Argo CD. The core idea behind GitOps is that the git repository is the single source of truth for what should be running in production. Argo CD sits inside the Kubernetes cluster and continuously watches the repo. If the live cluster state drifts from what's in git, it corrects it automatically.

This adds a layer of reliability that's hard to get otherwise: no one can push a change to the cluster that isn't tracked in git first.

---

## Connecting CI to CD

The bridge between CI and CD is a small update script at the end of the pipeline. After the new Docker image is pushed to ACR, this script updates the image tag in the Kubernetes deployment manifest (inside the `k8s/` directory of the repo) and commits that change back to the repo.

That's it. Argo CD sees the manifest change, detects the cluster is out of sync, and rolls out the new image to AKS automatically.

---

## Lessons Learned

These are the things that tripped me up or that I wish I'd known upfront:

- Argo CD watches git, not ACR. Pushing a new image to ACR does nothing on its own. The real deployment trigger is the manifest commit.
- A manifest update commit is the real deployment unit. This is what makes GitOps auditable: every deploy is a traceable git commit.
- Stage gating (test -> build -> push) actually works. Broken code simply doesn't make it to ACR. It fails at tests and stops there.
- Self-hosted agents need Docker installed and properly permissioned, or Docker tasks will fail.
- Integration tests in CI need a real database lifecycle: spin it up, run tests, tear it down.
- Prisma client generation must happen in CI before tests or build in clean environments. The generated client isn't committed to the repo.
- Missing env vars break the app at startup even if all tests passed. The test environment and the runtime environment need to be kept in sync.
- End-to-end validation should confirm the full chain: new tag visible in ACR -> manifest updated in the repo -> Argo CD app shows Synced -> AKS pods running the new image -> API/site serving the latest change.

---

That's the full setup. It took a few iterations to get right but once it was running, deployments genuinely became boring, which is exactly what you want.
