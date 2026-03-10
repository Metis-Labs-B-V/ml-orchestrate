# Metis Orchestrate — Feature Overview

## Project Summary
Multi-tenant workflow orchestration platform. Organizations (tenants) manage workspaces (customers). Scenarios are visual node-based workflows that integrate with external services (Jira, Jenkins, HubSpot, Email, HTTP). Runs are executed by Celery workers and fully audited.

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 13.5, React 18, TypeScript, Redux Toolkit, Tailwind CSS |
| Backend | Django 4.2, Django REST Framework, PostgreSQL 15 |
| Workers | Celery 5.4 + Redis broker |
| Auth | JWT with JWE encryption, TOTP MFA, OAuth 2.0 SSO |
| API docs | drf-spectacular (OpenAPI / Swagger at `/api/v1/swagger/`) |
| Container | Docker + docker-compose |

## Feature Files

| # | Feature | File |
|---|---|---|
| 01 | Authentication & Session Management | [01-authentication.md](01-authentication.md) |
| 02 | Multi-Factor Authentication (MFA / TOTP) | [02-mfa.md](02-mfa.md) |
| 03 | Single Sign-On (SSO / OAuth) | [03-sso.md](03-sso.md) |
| 04 | Tenant Management | [04-tenant-management.md](04-tenant-management.md) |
| 05 | Customer / Workspace Management | [05-customer-workspace-management.md](05-customer-workspace-management.md) |
| 06 | Roles & Permissions (RBAC) | [06-roles-permissions.md](06-roles-permissions.md) |
| 07 | Scenario Builder & Execution Engine | [07-scenario-builder.md](07-scenario-builder.md) |
| 08 | Integrations & Connections | [08-integrations-connections.md](08-integrations-connections.md) |
| 09 | Email Templates | [09-email-templates.md](09-email-templates.md) |
| 10 | Activity & Audit Logging | [10-activity-audit-logs.md](10-activity-audit-logs.md) |
| 11 | User Impersonation | [11-impersonation.md](11-impersonation.md) |

## Quick Priority Summary

### Highest Impact Missing Items (P1 across features)
1. **Webhook trigger receiver** — scenarios with webhook triggers can't receive payloads (07)
2. **Conditional / branching nodes** — no if/else logic in scenario graphs (07)
3. **OAuth token auto-refresh** — OAuth connections break silently on token expiry (08)
4. **Real-time run status** — no WebSocket/SSE for live execution feedback (07)
5. **Tenant suspension enforcement** — suspended tenants still have API access (04)
6. **Permission enforcement audit** — RBAC model exists but full enforcement across all APIs unverified (06)
7. **MFA backup/recovery codes** — users locked out permanently if authenticator is lost (02)
8. **SSO per-tenant config UI** — SSO credentials require env vars; no admin UI (03)
9. **Activity log coverage for orchestration** — scenario/run/connection changes may not be logged (10)
10. **Impersonation stop / session return** — no clean "exit impersonation" flow (11)

## How to Use These Files
Drop any individual feature .md into a new conversation and say:
> "Implement the P1 pending items from this feature spec."

Claude will read the implemented context, file locations, and pending list to produce a focused implementation plan.
