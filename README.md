# Metis Orchestrate

Monorepo for the Metis Orchestrate web application.

## Repository Structure

```text
.
├── backend
│   ├── README.md
│   ├── common_utils
│   └── metis-orchestrate
├── docs
├── frontend
├── deploy-vm.sh
├── docker-compose.yml
└── get-updated-env.sh
```

## Run With Docker Compose

Start frontend + backend:

```bash
docker compose up --build -d
```

The compose stack now includes:
- API (`metis-orchestrate`)
- Celery worker (`metis-orchestrate-worker`)
- Celery beat scheduler (`metis-orchestrate-beat`)
- Redis broker (`redis`)
- Frontend (`frontend`)

Use the local profile when you also want Postgres:

```bash
docker compose --profile local up --build -d
```

Default service URLs:
- Frontend: http://localhost:3000
- Backend health: http://localhost:8001/health/
- Backend sample API: http://localhost:8001/api/v1/metis-orchestrate/items/

## Run Services Individually (Docker)

Backend:

```bash
docker compose build metis-orchestrate
docker compose up -d metis-orchestrate
```

Frontend:

```bash
docker compose build frontend
docker compose up -d frontend
```

Optional Postgres only:

```bash
docker compose --profile local up -d postgres_db
```

## Run Locally Without Docker

Backend setup and dependency workflow are documented in [backend/README.md](backend/README.md).

Quick backend run:

```bash
cd backend/metis-orchestrate
python manage.py migrate
python manage.py runserver 127.0.0.1:8001
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Sync Environment Variables From Key Vault

Write both frontend and backend env files:

```bash
./get-updated-env.sh <keyvault-name>
```

Dry run:

```bash
./get-updated-env.sh --dry-run <keyvault-name>
```

Only one side:

```bash
./get-updated-env.sh --frontend-only <keyvault-name>
./get-updated-env.sh --backend-only <keyvault-name>
```

Notes:
- Requires Azure CLI (`az`) and an authenticated session.
- Frontend secrets are selected by tag `isFrontend=true`.
- Secret names are normalized from `-` to `_`.

## Scenario MVP Environment Variables

Add these keys for the scenario-builder MVP contracts and UI integration.

Backend (`backend/.env`):

```bash
ORCHESTRATE_DEFAULT_POLL_INTERVAL_MINUTES=15
ORCHESTRATE_RUN_RETENTION_DAYS=30
ORCHESTRATE_ALLOW_CYCLES=false
JIRA_API_TIMEOUT_SECONDS=30
ORCHESTRATE_HTTP_TIMEOUT_SECONDS=30
ORCHESTRATE_EMAIL_TIMEOUT_SECONDS=30
ORCHESTRATE_SECRET_ENCRYPTION_ENABLED=true
ORCHESTRATE_SECRET_ENCRYPTION_KEY=<32-byte-fernet-key-or-passphrase>
ORCHESTRATE_SCHEDULE_SCAN_INTERVAL_SECONDS=60
ORCHESTRATE_STALE_QUEUED_RUN_SECONDS=1800
ORCHESTRATE_STALE_RUNNING_RUN_SECONDS=900
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1
CELERY_TASK_ALWAYS_EAGER=false
CELERY_WORKER_CONCURRENCY=2
CELERY_TASK_TIME_LIMIT=300
CELERY_TASK_SOFT_TIME_LIMIT=270
JIRA_OAUTH_AUTHORIZE_URL=https://auth.atlassian.com/authorize
JIRA_OAUTH_TOKEN_URL=https://auth.atlassian.com/oauth/token
JIRA_OAUTH_ACCESSIBLE_RESOURCES_URL=https://api.atlassian.com/oauth/token/accessible-resources
JIRA_OAUTH_CLIENT_ID=<atlassian-client-id>
JIRA_OAUTH_CLIENT_SECRET=<atlassian-client-secret>
JIRA_OAUTH_REDIRECT_URI=http://localhost:3000/dashboard/integrations/jira/oauth-callback
JIRA_OAUTH_SCOPES=read:jira-user,read:jira-work,write:jira-work,offline_access
JENKINS_OAUTH_AUTHORIZE_URL=https://<your-provider>/oauth/authorize
JENKINS_OAUTH_TOKEN_URL=https://<your-provider>/oauth/token
JENKINS_OAUTH_CLIENT_ID=<client-id>
JENKINS_OAUTH_CLIENT_SECRET=<client-secret>
JENKINS_OAUTH_REDIRECT_URI=http://localhost:3000/dashboard/integrations/jenkins/oauth-callback
JENKINS_OAUTH_SCOPES=read,write
```

Frontend (`frontend/.env`):

```bash
NEXT_PUBLIC_SERVICE1_BASE_URL=http://localhost:8001
NEXT_PUBLIC_SERVICE1_PATH_PREFIX=/api/v1/metis-orchestrate
```

Jira OAuth callback route used by the UI:
- `http://localhost:3000/dashboard/integrations/jira/oauth-callback`

Jenkins OAuth callback route used by the UI:
- `http://localhost:3000/dashboard/integrations/jenkins/oauth-callback`

HTTP module quick config example (`http.make_request` node):

```json
{
  "method": "POST",
  "url": "https://httpbin.org/anything",
  "authType": "none",
  "headers": {
    "Content-Type": "application/json"
  },
  "query": {
    "source": "orchestrate"
  },
  "bodyType": "json",
  "body": "{\"issue\":\"{{jira_1.key}}\"}",
  "parseResponse": true,
  "failOnHttpError": true,
  "allowRedirects": true,
  "timeoutSeconds": 30
}
```

## Node Context Menu (Canvas)

Right-click on a module node in the scenario canvas opens the custom node context menu.

- Component: `frontend/components/scenarios/NodeContextMenu.tsx`
- Wiring + action dispatch: `frontend/pages/dashboard/scenarios/[scenarioId].tsx`
- Styles: `frontend/styles/globals.css` (`.scenario-context-menu*`)

To add/remove menu actions, update `contextMenuEntries` and `handleContextMenuSelect` in the scenario page.

## Bootstrap Login User + Prerequisites

This creates/updates:
- Login user (verified, active, OTP/MFA disabled)
- Tenant
- Workspace (customer)
- Required permissions
- Tenant roles + workspace roles
- User memberships and admin role assignment

Run:

```bash
cd backend/metis-orchestrate
./scripts/bootstrap_mvp_user.sh
```

Default credentials seeded by this script:
- Email: `deepak.kushwaha@metislabs.eu`
- Password: `Admin@123456`

Optional overrides:

```bash
BOOTSTRAP_EMAIL=you@company.com \
BOOTSTRAP_PASSWORD='StrongPass@1234' \
BOOTSTRAP_TENANT_NAME='Metis Orchestrate' \
BOOTSTRAP_WORKSPACE_NAME='Metis Orchestrate Workspace' \
./backend/metis-orchestrate/scripts/bootstrap_mvp_user.sh
```

Optional secret backfill for existing connections:

```bash
cd backend/metis-orchestrate
python manage.py backfill_connection_secrets
```

## Deploy On VM

Use the deployment helper to refresh env + redeploy containers:

```bash
./deploy-vm.sh
./deploy-vm.sh frontend
./deploy-vm.sh backend
```

## Tests

Frontend:

```bash
cd frontend
npm test
```

Backend:

```bash
cd backend/metis-orchestrate
python manage.py test
```
