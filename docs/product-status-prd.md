# Metis Orchestrate — Product Status PRD

**Product:** Metis Orchestrate — a no-code workflow automation platform (think Zapier / n8n)
**Repo:** `ml-orchestrate` (monorepo — Django backend + Next.js frontend)
**Last Updated:** 2026-03-17

---

## What Is Built ✅

### 1. Identity & Auth

| Feature | Status |
|---|---|
| Email/password login | Done |
| JWT + JWE encrypted tokens (access 30min, refresh 7d) | Done |
| Token rotation & blacklist on logout | Done |
| Email verification on signup | Done |
| Password reset flow | Done |
| MFA (TOTP-based) — setup, confirm, disable, verify | Done |
| Login OTP fallback | Done |
| SSO — Google + Microsoft OAuth | Done |
| Multi-tenancy (Tenant → Customers/Workspaces → Users) | Done |
| RBAC — Roles & Permissions at Tenant and Customer level | Done |
| Admin impersonation with audit log | Done |
| Activity logs | Done |

---

### 2. Scenario Builder (Core Product)

| Feature | Status |
|---|---|
| Scenario CRUD (draft, published, active, inactive) | Done |
| Scenario versioning (`ScenarioVersion`) | Done |
| Publish / Activate / Deactivate actions | Done |
| Graph-based DAG execution engine (topological ordering) | Done |
| Node input/output port type matching | Done |
| Variable/template substitution in payloads (`template_runtime`) | Done |
| Manual run dispatch | Done |
| Polling schedule triggers (interval-based) | Done |
| Per-step run tracking (input, output, error, duration) | Done |
| Run status lifecycle: QUEUED → RUNNING → SUCCEEDED/FAILED/CANCELED | Done |
| Stale run recovery (timeout handling) | Done |
| Scenario run history & audit trail explorer | Done |
| Scenario canvas UI (visual builder) | Done |
| Node context menu (add/edit/delete nodes) | Done |

---

### 3. Connections (Credential Management)

| Feature | Status |
|---|---|
| Connection CRUD (API Token + OAuth types) | Done |
| Secret encryption with Fernet | Done |
| Connection test endpoint | Done |

---

### 4. Integrations

| Integration | Modules | Auth | Status |
|---|---|---|---|
| **Jira Cloud** | Watch issues, search, create/update/transition, comments | API Token + OAuth | Done |
| **HubSpot** | Object search, list members, record properties, custom objects | API Token | Done |
| **Email (SMTP/IMAP)** | Send, search, get message, watch inbox | Password + OAuth | Mostly done |
| **HTTP (Generic)** | Make request, download file, resolve URL | None/Token/OAuth | Done |
| **JSON (Utility)** | Create JSON objects | N/A | Done |
| **Jenkins** | OAuth callback page only | OAuth | Partial |
| **GitHub** | Nothing | — | Not started |

---

### 5. Email Templates

| Feature | Status |
|---|---|
| Template CRUD with category support | Done |
| Template versioning with change notes | Done |
| Variables schema (JSON) for dynamic content | Done |
| Duplicate template | Done |
| Template preview | Done |
| Test send | Done |

---

### 6. Dashboard UI

| Page | Status |
|---|---|
| Login, Signup, Password Reset, OTP, MFA Setup | Done |
| SSO callback pages | Done |
| Scenario list & editor | Done |
| Scenario run history explorer | Done |
| Email template management | Done |
| Integrations (Jira + Jenkins OAuth callbacks) | Done |
| User management | Done |
| Role management | Done |
| Tenant management | Done |
| Customer (workspace) management | Done |
| Activity logs | Done |
| Impersonation logs | Done |
| Account settings | Done |

---

### 7. Infrastructure

| Feature | Status |
|---|---|
| Docker Compose (API, worker, beat, Redis, Postgres, frontend) | Done |
| Celery async task execution | Done |
| Celery Beat scheduled scanning | Done |
| Azure Pipelines CI/CD | Done |
| Azure Key Vault env sync script | Done |
| OpenAPI / Swagger documentation | Done |
| Request ID correlation middleware | Done |

---

## What Is Pending / Incomplete ⚠️

### High Priority Gaps

| Feature | Gap | Notes |
|---|---|---|
| **Jenkins integration** | OAuth set up but no actual Jenkins API calls implemented | Unlike Jira/HubSpot which have full adapters |
| **GitHub integration** | Listed in settings, zero implementation | No adapter, no modules, no catalog entries |
| **Email watch inbox trigger** | Module defined in catalog but not wired into the execution engine | `email.watch.inbox` doesn't fire |
| **Webhook triggers** | `ScenarioSchedule` has webhook metadata field but no inbound webhook endpoint | Polling works; push-based webhooks don't |

---

### Security Hardening Backlog

Documented in `SECURITY_STANDARDS.md`.

| Item | Status |
|---|---|
| Rate limiting on API endpoints | Not implemented |
| Idempotency keys | Not implemented |
| Expanded audit logging | Partial |
| OpenAPI request/response validation middleware | Not implemented |
| Security headers (CSP, HSTS, etc.) | Not implemented |
| Frontend: Migrate tokens to HttpOnly cookies | Not implemented (currently localStorage/memory) |
| Frontend: CSP headers | Not implemented |
| UI brute force protection | Not implemented |
| Suspicious login warnings | Not implemented |

---

### Test Coverage Gaps

| Area | Status |
|---|---|
| OAuth flow integration tests | Missing |
| Scenario builder UI component tests | Missing |
| End-to-end tests (scenario → execution → result) | Missing |
| Jenkins / HubSpot adapter unit tests | Missing |
| Load / performance tests | Missing |

---

### Minor / Quality Items

| Item | Notes |
|---|---|
| `core/settings.py` has legacy commented-out database config | Dead code, cleanup needed |
| Cycle detection in DAG is optional (`ORCHESTRATE_ALLOW_CYCLES`) | Should be enforced by default |
| Data isolation uses `created_by` email scoping instead of FK tenant/customer scoping | Could be more robust |
| Frontend scenario editor is a single large component | Candidate for refactoring into smaller components |

---

## Summary

**Core platform is MVP-complete.** Auth, RBAC, scenario building, execution engine, Jira/HubSpot/Email integrations, email templates, and the full dashboard are all functional.

**Key next steps in priority order:**

1. Complete Jenkins integration (actual API calls)
2. Implement GitHub integration
3. Wire email `watch.inbox` trigger into the execution engine
4. Build inbound webhook trigger support
5. Security hardening (rate limiting, HttpOnly cookies, CSP)
6. Expand test coverage (OAuth, E2E, adapters)
