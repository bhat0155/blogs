# Building a CI/CD Pipeline for a .NET + React App on Azure DevOps

  ---

  ## Introduction

  Before I built this pipeline, every deployment was manual. Run `dotnet publish` locally, zip the output,
  upload to Azure. Run `npm run build`, drag the `dist/` folder into the portal. Do it again for staging. Do
   it again for production. It took 30 minutes and it was easy to forget a step.

  CI/CD solves this. Every time I push code to Azure Repos, the pipeline takes over — it builds, runs all
  tests, and deploys through Dev → Staging → Production automatically. Production requires my manual
  approval before it goes live. The whole thing takes about 10 minutes and I never touch a server.

  This post walks through exactly how I built it.

  ---

  ## What We Built

  - A **4-stage Azure Pipeline** (Build → Deploy Dev → Deploy Staging → Deploy Prod)
  - Automated testing as a hard gate — broken code never reaches any environment
  - Separate Azure SQL databases, App Services, and Static Web Apps per environment
  - Secret management via Azure DevOps Variable Groups (no secrets in YAML)
  - Manual approval gate on Production using Azure DevOps Environments
  - Azure Monitor alerts and an Application Insights dashboard for production observability

  **Tech stack:**
  - Backend: ASP.NET Core (.NET 9) + Entity Framework Core + Azure SQL
  - Frontend: React + Vite
  - Hosting: Azure App Service (Linux) + Azure Static Web Apps
  - Pipeline: Azure DevOps Pipelines (YAML)

  ---

  ## Architecture Overview

  ```
  git push → main
          │
          ▼
  ┌─────────────────────────────────────────────┐
  │              Azure DevOps Pipeline          │
  │                                             │
  │  Stage 1: Build                             │
  │  ├── dotnet restore                         │
  │  ├── dotnet build                           │
  │  ├── dotnet test  ◄── GATE (stops if fails) │
  │  ├── dotnet publish → artifact uploaded     │
  │  ├── npm ci                                 │
  │  └── npm run build (per environment)        │
  │                                             │
  │  Stage 2: Deploy Dev (automatic)            │
  │  ├── API → weatherapp-api-dev               │
  │  └── Frontend → weatherapp-frontend-dev     │
  │                                             │
  │  Stage 3: Deploy Staging (automatic)        │
  │  ├── API → weatherapp-api-staging           │
  │  └── Frontend → weatherapp-frontend-staging │
  │                                             │
  │  Stage 4: Deploy Prod (approval required)   │
  │  ├── ⏸  Wait for manual approval            │
  │  ├── API → weatherapp-api-prod              │
  │  └── Frontend → weatherapp-frontend-prod    │
  └─────────────────────────────────────────────┘
  ```

  ---

  ## Phase 1 — Azure Infrastructure

  Before writing a single line of YAML, I provisioned all the Azure resources manually. The pipeline deploys
   to infrastructure that already exists — it doesn't create it.

  ### Three environments, fully isolated

  | Resource | Dev | Staging | Prod |
  |---|---|---|---|
  | Resource Group | `rg-dev` | `rg-staging` | `rg-prod` |
  | App Service | `weatherapp-api-dev` | `weatherapp-api-staging` | `weatherapp-api-prod` |
  | Static Web App | `weatherapp-frontend-dev` | `weatherapp-frontend-staging` | `weatherapp-frontend-prod`
  |
  | SQL Database | `weatherapp-db-dev` | `weatherapp-db-staging` | `weatherapp-db-prod` |

  Each environment is completely isolated. A bad migration in Dev never touches Production data.

  ### EF Core auto-migrations on startup

  ```csharp
  // Program.cs — runs in all environments, not just Development
  using (var scope = app.Services.CreateScope())
  {
      var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
      db.Database.Migrate();
  }
  ```

  This means every deployment self-migrates. No manual `dotnet ef database update` needed.

  ### Static Web Apps for the frontend

  Azure Static Web Apps is free, comes with a global CDN, and auto-provisions SSL. I set the deployment
  source to **Other** (not GitHub/Azure DevOps directly) so the pipeline controls deployments using a
  deployment token stored as a secret.

  ---

  ## Phase 2 — The CI Pipeline (Build Stage)

  The build stage runs on every push to `main`. It spins up a fresh Ubuntu VM — nothing installed, nothing
  cached — and does everything from scratch.

  ```yaml
  trigger:
    branches:
      include:
        - main

  pool:
    vmImage: 'ubuntu-latest'

  stages:
  - stage: Build
    jobs:
    - job: Backend
      steps:
      - task: UseDotNet@2
        inputs:
          packageType: 'sdk'
          version: '9.x'

      - script: dotnet restore
        workingDirectory: backend

      - script: dotnet build --no-restore --configuration Release
        workingDirectory: backend

      - script: |
          dotnet test --no-build --configuration Release \
            --logger trx \
            --results-directory $(Agent.TempDirectory)/test-results
        workingDirectory: backend
        displayName: 'dotnet test (gate)'

      - task: PublishTestResults@2
        inputs:
          testResultsFormat: 'VSTest'
          testResultsFiles: '$(Agent.TempDirectory)/test-results/*.trx'

      - script: |
          dotnet publish WeatherApp.Api/WeatherApp.Api.csproj \
            --no-build --configuration Release \
            --output $(Build.ArtifactStagingDirectory)/api
        workingDirectory: backend

      - task: PublishBuildArtifacts@1
        inputs:
          PathtoPublish: '$(Build.ArtifactStagingDirectory)/api'
          ArtifactName: 'api'
  ```

  ### Why `dotnet test` is the gate

  If even one test fails, the pipeline stops here. No artifact is uploaded. No deployment happens. This is
  the entire point of CI — you can't accidentally ship broken code.

  ### Where do artifacts go?

  `PublishBuildArtifacts@1` uploads the compiled API output to **Azure DevOps' own temporary storage** —
  attached to that specific pipeline run. You can see it in Azure DevOps → Pipelines → click a run → **"1 
  published"**.

  When Deploy stages run later on fresh VMs, Azure DevOps automatically downloads the artifact to
  `$(Pipeline.Workspace)/api` before your steps execute.

  ```
  CI VM: dotnet publish → PublishBuildArtifacts → Azure DevOps storage → CI VM dies
  Deploy VM (fresh): Azure DevOps auto-downloads → $(Pipeline.Workspace)/api → AzureWebApp@1 deploys it
  ```

  ---

  ## Phase 3 — Secrets and Variable Groups

  The pipeline needs connection strings, API keys, and deployment tokens for each environment. These cannot
  go in the YAML file — that file lives in the repo.

  Azure DevOps **Variable Groups** (Pipelines → Library) are the solution. I created three:

  - `weatherapp-vars-dev`
  - `weatherapp-vars-staging`
  - `weatherapp-vars-prod`

  Each holds the same variable names but environment-specific values:

  | Variable | Secret? |
  |---|---|
  | `API_APP_NAME` | No |
  | `SQL_CONNECTION_STRING` | Yes |
  | `OWM_API_KEY` | Yes |
  | `STATIC_WEB_APP_TOKEN` | Yes |
  | `VITE_API_BASE_URL` | No |

  In the YAML, you reference them with `$(VARIABLE_NAME)`:

  ```yaml
  - stage: DeployDev
    variables:
      - group: weatherapp-vars-dev
    jobs:
    - deployment: API
      steps:
      - task: AzureWebApp@1
        inputs:
          appName: $(API_APP_NAME)
          appSettings: >-
            -ConnectionStrings__DefaultConnection "$(SQL_CONNECTION_STRING)"
            -OpenWeatherMap__ApiKey "$(OWM_API_KEY)"
  ```

  At runtime, Azure DevOps substitutes the actual values. Secrets are masked in logs — you'll see `***`
  instead of the real value.

  ---

  ## Phase 4 — The CD Pipeline (Deploy Stages)

  ### API deployment

  The API is built once in CI and the same artifact deploys to all three environments. This guarantees that
  what you tested in Dev is exactly what runs in Production.

  ```yaml
  - task: AzureWebApp@1
    inputs:
      azureSubscription: 'azure-service-connection'
      appType: webAppLinux
      appName: $(API_APP_NAME)
      package: '$(Pipeline.Workspace)/api'
      appSettings: >-
        -ConnectionStrings__DefaultConnection "$(SQL_CONNECTION_STRING)"
        -OpenWeatherMap__ApiKey "$(OWM_API_KEY)"
  ```

  The `appSettings` inject secrets as App Service environment variables at **runtime**. The app reads them
  on startup via `IConfiguration`.

  ### Frontend deployment — why it rebuilds per environment

  The frontend cannot reuse a single artifact. Vite bakes `VITE_API_BASE_URL` into the JavaScript bundle at
  **compile time**. After build, it's a static file — there's no runtime to inject values into.

  If you built once with the dev URL hardcoded in the bundle and deployed that to Production, your prod
  frontend would call the dev API.

  So each deploy stage rebuilds the frontend with its own URL:

  ```yaml
  - deployment: Frontend
    steps:
    - checkout: self   # fresh VM has no code — pull from Azure Repos

    - task: NodeTool@0
      inputs:
        versionSpec: '20.x'

    - script: npm ci
      workingDirectory: frontend

    - script: npm run build
      workingDirectory: frontend
      env:
        VITE_API_BASE_URL: $(VITE_API_BASE_URL)

    - task: AzureStaticWebApp@0
      inputs:
        app_location: 'frontend/dist'
        skip_app_build: true
        azure_static_web_apps_api_token: $(STATIC_WEB_APP_TOKEN)
  ```

  ### The approval gate

  The Production stage references the `prod` environment:

  ```yaml
  - stage: DeployProd
    dependsOn: DeployStaging
    jobs:
    - deployment: API
      environment: prod
  ```

  The approval check is configured on the **Environment** in the Azure DevOps UI, not in the YAML. When the
  pipeline hits this job it pauses, I get an email, click Approve, and the deployment proceeds. You can add
  or remove approvers without touching the pipeline YAML.

  ---

  ## Phase 5 — Monitoring

  ### Azure Monitor alerts on Production

  | Alert | Signal | Condition | Severity |
  |---|---|---|---|
  | High Response Time | `HttpResponseTime` | Average > 2s over 5 min | 2 — Warning |
  | App Down | `HealthCheckStatus` | Average < 1 over 5 min | 0 — Critical |

  Both send email via an Action Group and auto-resolve when the condition clears.

  ### Application Insights dashboard

  The dashboard tiles show server response time, failed requests, server requests, and availability — all
  pulled from the Application Insights instance that auto-provisioned with the App Service.

  ---

  ## Key Takeaways

  - **Every pipeline run uses fresh VMs per job** — nothing carries over, which is why `dotnet restore` and
  `npm ci` run every time
  - **Artifacts are the handoff between CI and CD** — CI uploads to Azure DevOps temporary storage, CD
  downloads from there onto a new VM
  - **Secrets never touch the YAML** — Variable Groups inject them at runtime; YAML only holds references
  like `$(SQL_CONNECTION_STRING)`
  - **API and frontend handle environment config differently** — API reads config at runtime, frontend bakes
   it in at build time, so the frontend must rebuild per environment
  - **Approval gates live on the Environment, not in YAML** — you can change who approves Production without
   a code change

  ---

  ## Conclusion

  Going from manual deployments to a fully automated pipeline is one of the most satisfying engineering
  improvements you can make. The pipeline is now the source of truth for how the app gets built and deployed — not a set of steps someone has to remember.


  Github: https://github.com/bhat0155/WeatherApp_azureservices