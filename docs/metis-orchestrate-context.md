# Metis Orchestrate Codebase Context

Snapshot date: 2026-02-26

## 1) Current Repository Shape

- Monorepo with Next.js frontend (`frontend`) + Django REST backend (`backend/metis-orchestrate`).
- Backend shared utilities in `backend/common_utils`.
- Docker-based local/dev deployment via `docker-compose.yml`.
- Frontend state managed with Redux Toolkit (28 slices).

## 2) Implemented Product Surface Today

### Backend (Django/DRF)

- Core app: health endpoint + sample CRUD resource (`app` / `SampleItem`).
- Identity domain (`identity`):
- JWT auth (login/refresh/logout/me).
- Signup + password reset + change password.
- OTP verification flow.
- MFA (TOTP setup/confirm/disable + MFA login verification).
- SSO (Google/Microsoft start/callback/exchange).
- Impersonation (user selection + token swap + logs).
- Tenants/customers/roles/permissions CRUD and assignment.
- Activity + impersonation logs.
- Orchestrate domain (`orchestrate`):
- Connection CRUD.
- Store CRUD.
- Orchestrate OAuth install/callback.
- Connection orders fetch.

### Frontend (Next.js)

- 29 page routes, including:
- Auth routes (`/`, signup, forgot/reset, OTP, MFA setup, SSO callback).
- Admin dashboard routes for tenants, clients, users, roles, settings, logs.
- Orchestrate-specific routes (`/dashboard/connections`, `/dashboard/stores`, `/dashboard/orchestrate/[connectionId]/orders`).
- Role-aware dashboard navigation and permissions.
- Tenant/client management UI (forms, lists, tabs, user assignment).
- Connection/store management UI + modals.

### Ops and Docs

- VM deploy script (`deploy-vm.sh`) and Key Vault sync script (`get-updated-env.sh`).
- API/security standards docs are oriented to current identity + merchant integration model.

## 3) Strategic Gap vs Make.com-style Product

A Make.com replica needs scenario/workflow orchestration primitives that do not exist yet:

- Visual scenario builder (nodes/edges/canvas).
- Trigger/action module registry abstraction (not hard-coded Orchestrate entities).
- Execution engine with job queue + retries + backoff + concurrency controls.
- Scheduler + webhook-trigger runtime.
- Run history (per execution step logs, input/output snapshots, errors).
- Secret/credential vault per connector account.
- Versioned scenario publishing (draft vs active).
- Template library and blueprint import/export.
- Usage metering/billing controls.

## 4) What to Remove or Comment Out

This is the recommended cleanup from current folder structure for a Make.com trajectory.

### A. Remove first (high confidence)

These are domain-locked to merchant/store/Orchestrate behavior and will create noise while building orchestration core.

- Backend Orchestrate app:
- `backend/metis-orchestrate/orchestrate/**`
- Remove include from `backend/metis-orchestrate/core/urls.py`.
- Frontend Orchestrate/store pages:
- `frontend/pages/dashboard/connections.tsx`
- `frontend/pages/dashboard/stores.tsx`
- `frontend/pages/dashboard/orchestrate/[connectionId]/orders.tsx`
- Frontend Orchestrate/store components:
- `frontend/components/connections/**`
- `frontend/components/stores/**`
- `frontend/components/clients/ClientOrdersTab.tsx`
- Orchestrate/store Redux slices:
- `frontend/store/slices/connectionsSlice.ts`
- `frontend/store/slices/storesSlice.ts`
- `frontend/store/slices/clientStoresSlice.ts`
- Orchestrate assets/constants:
- `frontend/public/clients/orchestrate.svg`
- `frontend/public/clients/orchestrate.svg`
- `frontend/constants/assets.tsx`

### B. Comment out or feature-flag (short-term, then decide)

These are not mandatory for v1 orchestration and can slow down core execution work.

- Impersonation:
- Backend: `backend/metis-orchestrate/identity/views/impersonation.py`
- Frontend: `frontend/pages/dashboard/impersonation-logs.tsx`, `frontend/components/layout/ImpersonationBanner.tsx`, related slices.
- Tenant/Client-heavy admin UI (if you want single-workspace v1):
- `frontend/pages/dashboard/tenants/**`
- `frontend/pages/dashboard/clients/**`
- related client/tenant/user management slices.
- OTP + email verification flows (optional if SSO-first product):
- `frontend/pages/verify-otp.tsx`
- `frontend/pages/tenant/verify-email.tsx`
- related API paths and backend endpoints.
- Sample resource API (scaffold only):
- `backend/metis-orchestrate/app/models.py`
- `backend/metis-orchestrate/app/views.py` (keep health endpoint, remove `SampleItemViewSet`)

### C. Keep and reuse

These are strong foundations for Make.com-style SaaS auth and governance.

- JWT auth/session core.
- MFA and SSO (enterprise-ready access layer).
- Roles/permissions framework.
- Activity logging base.
- Shared API response/error middleware.
- Deployment and env sync scripts.

## 5) Recommended Rename/Refactor After Cleanup

- Replace `tenant/customer/client` vocabulary with `workspace/project/environment`.
- Keep service path naming aligned to `metis-orchestrate` across backend and compose config.
- Replace UI copy like "Orchestrate", "merchant integrations", "stores", "connections" with "scenarios", "modules", "runs", "webhooks".

## 6) Suggested Build Order (after cleanup)

- Phase 1: Workflow domain models (`Scenario`, `ScenarioNode`, `ScenarioEdge`, `ScenarioVersion`, `Run`, `RunStep`).
- Phase 2: Execution runtime (queue worker + retry + status machine).
- Phase 3: Trigger framework (scheduler/webhook/manual trigger).
- Phase 4: Connector SDK contract (actions/triggers as modules).
- Phase 5: Frontend scenario canvas + run logs UI.

## 7) Quick Risk Notes

- If Orchestrate removal is done without cleaning references in `frontend/store/index.ts`, `frontend/lib/apiPaths.ts`, and dashboard nav, build will fail.
- If backend orchestrate app is removed, remove URL includes and app registration from settings before migration cleanup.
- Migrations currently include Orchestrate and customer entities; plan migration strategy before deleting models in production environments.
