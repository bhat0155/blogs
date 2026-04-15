Azure Monitor: Catching Logs from a FastAPI App

  When I started learning about Azure monitoring, I kept hearing terms like Application Insights, Log
  Analytics Workspace, and telemetry. They sounded complicated. So instead of reading documentation, I built a
   small FastAPI app, deployed it to Azure, and learned each concept by actually using it.

  In this blog, I'll explain:

  - Application Insights
  - Log Analytics Workspace
  - Connection string and environment variables
  - Traces and KQL queries
  - Local vs deployed logging

  using the lab I built.

  The App

  The app was a simple FastAPI Python app called main.py.

  It had four endpoints:

  - GET / — health check
  - GET /items/{item_id} — item lookup
  - POST /events — custom event
  - GET /logs/generate — fires debug, info, warning, and error logs all at once

  The app was not doing anything complex. The whole point was to generate logs and see where they go.

  Application Insights

  Application Insights is an Azure service that collects telemetry from your app.

  Telemetry means things like:

  - log messages your app writes
  - HTTP requests coming into your app
  - errors and exceptions
  - custom events you define

  In my lab, I created an Application Insights resource called:

  - app-monitor-ai

  Once I connected my app to it using a connection string, every log message the app wrote started showing up
  in the Azure portal instead of just disappearing into the terminal.

  A simple way to think about it:

  - Terminal logs = only you see them, only while the app is running
  - Application Insights = logs are sent to Azure and stored permanently, queryable any time

  Log Analytics Workspace

  A Log Analytics Workspace is the actual database where the log data is stored.

  This confused me at first because Application Insights already seemed to show logs. So what was the
  workspace for?

  The relationship is:

  Your App → Application Insights → Log Analytics Workspace

  Application Insights is the front door. It collects the data and gives you a nice UI. But behind it, all the
   data is stored in the Log Analytics Workspace.

  When you click Logs inside Application Insights and run a query, you are actually querying the workspace.
  Application Insights is just the interface on top.

  In my lab:

  - Workspace: app-monitor-law
  - Application Insights: app-monitor-ai

  I created the workspace first, then linked it to Application Insights during setup. After that, everything
  the app sent automatically landed in both places.

  The workspace becomes especially powerful when you have multiple resources — an app, a database, a load
  balancer — all sending logs to the same workspace. Then one KQL query can look across all of them.

  Connection String and Environment Variables

  The app needed to know where to send its logs in Azure.

  That address is called a connection string. I copied it from the Application Insights overview page. It
  looked like this:

  InstrumentationKey=4561564a-...;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;...

  The app reads this value from an environment variable called APPLICATIONINSIGHTS_CONNECTION_STRING. If the
  variable is not set, the app only logs to the terminal. If it is set, the app sends logs to Azure too.

  For local development, I stored the value in a .env file:

  APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...

  And used the python-dotenv library to load it automatically on startup.

  One important rule I learned:

  ▎ Never commit .env to git. It contains a secret that gives anyone access to your Azure resource.

  So I added .env to .gitignore immediately.

  For the deployed app on Azure App Service, I set the same variable under Environment variables in the
  portal. Azure injects it at runtime, so the app behaves exactly the same way whether running locally or in
  the cloud.

  The SDK Problem

  This was the most interesting part of the debugging process.

  The original code used an old Python library called applicationinsights. It initialized correctly and
  printed the right startup messages. But no data ever arrived in Azure.

  The reason was simple once I understood it:

  ▎ The old SDK was built years ago. It ignored the IngestionEndpoint in the connection string and always sent
  ▎  data to a legacy Microsoft endpoint. My Application Insights resource was a modern workspace-based
  ▎ resource that expected data at the newer endpoint.

  Switching to the current SDK, azure-monitor-opentelemetry, fixed it immediately. The modern SDK reads the
  full connection string and sends data to the correct endpoint.

  The lesson:

  ▎ Always check whether the SDK you are using supports the type of Azure resource you created. Older
  ▎ libraries may not work with newer resource types.

  Running Locally and Seeing Logs in Azure

  Once the correct SDK was in place, the flow worked.

  I started the app locally:

  uvicorn main:app --reload --host 0.0.0.0 --port 8000

  Hit the endpoints:

  curl http://localhost:8000/logs/generate

  Waited about two minutes, then went to Application Insights → Logs and ran:

  traces
  | order by timestamp desc
  | take 20

  And saw this:

  Sample error log.     severity 3
  Sample warning log.   severity 2
  Sample info log.      severity 1
  Sample debug log.     severity 0

  That was the moment the whole thing clicked. My local app, running on my Mac, had just written logs into an
  Azure database I could query from anywhere.

  Deploying and Seeing the Difference

  After confirming local telemetry worked, I deployed the app to Azure App Service.

  The deployment used a ZIP file containing main.py and requirements.txt. One important setting was:

  SCM_DO_BUILD_DURING_DEPLOYMENT=true

  Without this, Azure deploys the files but does not install dependencies. The app would start and immediately
   fail with No module named uvicorn.

  After deployment I hit the same endpoints, waited a few minutes, and ran the same KQL query.

  The logs showed up again — but this time with a key difference:

  OS:       Linux        (not my Mac)
  Location: Toronto      (Canada Central, the Azure region)

  Same query. Same app. But now the logs were coming from Azure infrastructure, not my laptop.

  What I Learned from This Lab

  - Application Insights collects telemetry from your app and gives you a UI to explore it
  - Log Analytics Workspace is the database behind Application Insights where all data is actually stored
  - Connection string is how the app knows where to send its data
  - .env file is the right way to manage secrets locally — never use terminal exports, never commit to git
  - SDK version matters — old SDKs may silently fail with newer Azure resource types
  - KQL is the query language for searching logs in the workspace

  Final Thoughts

  Before this lab, Azure Monitor felt like an abstract concept. But building the app, connecting it to
  Application Insights, hitting endpoints, and watching logs appear in the portal made everything concrete.

  The biggest lesson was not about Azure specifically. It was this:

  ▎ Observability is just making your app's behaviour visible. Logs in a terminal disappear. Logs in Azure
  ▎ stay there, are searchable, and can be analysed over time.

  That is the real value of the whole setup.