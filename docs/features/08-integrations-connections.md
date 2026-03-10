# Feature: Integrations & Connections

## Overview
Integration adapters allow scenario nodes to interact with external services. Connections store credentials (API token or OAuth) per workspace. Secrets can be optionally encrypted at rest.

## Implemented Integrations

| Integration | Auth Type | Actions |
|---|---|---|
| Jira Cloud | OAuth + API Token | Watch issues (trigger), list users, search users |
| Jenkins | OAuth | Build job, check job status |
| HubSpot | OAuth | Contact, company, deal operations |
| Email (SMTP) | Credentials | Send email (with template support) |
| HTTP Module | None/Basic/Bearer/Custom | GET, POST, PUT, DELETE, PATCH |
| JSON Module | Built-in | Parse, transform JSON |

## What's Implemented
- Connection CRUD (create, read, update, delete)
- Auth types: API Token, OAuth
- Connection status: active / inactive / error
- Optional AES secret encryption at rest
- Secret migration (plaintext → encrypted)
- Connection test action with last-tested timestamp
- Tenant and workspace scoping
- OAuth callback pages for Jira and Jenkins
- Jira: dual auth (OAuth or API token), cloud ID detection
- Email: full SMTP config, TLS/SSL, to/cc/bcc/reply-to, template variable injection
- HTTP: all methods, query params, body types, redirect and SSL config

## File Locations
| Layer | Path |
|---|---|
| Backend models | `backend/metis-orchestrate/app/models.py` (Connection) |
| Integration adapters | `backend/metis-orchestrate/app/integrations/` |
| Secret service | `backend/metis-orchestrate/app/services/connection_secrets.py` |
| Email template svc | `backend/metis-orchestrate/app/services/email_templates.py` |
| Backend views | `backend/metis-orchestrate/app/views.py` (ConnectionViewSet) |
| Frontend catalog | `frontend/pages/dashboard/` (integration catalog UI) |
| OAuth callbacks | `frontend/pages/dashboard/` (Jira, Jenkins callback pages) |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Slack integration** — send message, post to channel, list channels
- [ ] **GitHub / GitLab integration** — trigger workflow on PR/push, create issues, manage repos
- [ ] **OAuth token refresh** — when OAuth access tokens expire, no automatic refresh; runs will fail silently
- [ ] **Connection health check / re-test on use** — connections only tested on-demand; no background health monitoring
- [ ] **OAuth re-authorization flow in UI** — when OAuth token is invalid, user cannot re-auth from the connections UI

### P2 — Medium Priority
- [ ] **Salesforce integration** — create/update records, query SOQL
- [ ] **Google Sheets / Drive integration**
- [ ] **Webhook integration (outbound)** — send structured payload to any URL (distinct from HTTP module — includes retry, signature)
- [ ] **Database integrations** — PostgreSQL, MySQL, BigQuery as scenario nodes
- [ ] **Connection sharing across workspaces** — currently scoped to one workspace; tenant-level shared connections
- [ ] **Connection usage tracking** — which scenarios use which connection; impact analysis before deleting
- [ ] **Bulk connection import** — CSV or JSON import of connection definitions

### P3 — Low Priority
- [ ] **Zapier / Make (Integromat) compatibility layer**
- [ ] **Custom integration SDK** — allow customers to bring their own integration adapters
- [ ] **Integration marketplace / catalog versioning**
