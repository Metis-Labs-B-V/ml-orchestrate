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
