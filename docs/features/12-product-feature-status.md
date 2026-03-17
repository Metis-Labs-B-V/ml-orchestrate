# Metis Orchestrate — Product Feature Status (Implemented vs Pending)

**Prepared by:** Product Owner  
**Last updated:** 2026-03-16

## Executive Summary
- Documented feature areas: **11**
- Implemented capability bullets across features: **83**
- Live integrations in catalog: **6** (Jira, Jenkins, HubSpot, Email, HTTP, JSON)
- Pending backlog items: **122**
- Pending by priority:
  - **P1:** 47
  - **P2:** 50
  - **P3:** 25

## Feature Status Matrix
| # | Feature | Implemented | Pending (P1/P2/P3) | Source Spec |
|---|---|---:|---:|---|
| 01 | Authentication & Session Management | 6 | 9 (4/3/2) | [01-authentication.md](./01-authentication.md) |
| 02 | Multi-Factor Authentication (MFA / TOTP) | 5 | 8 (3/3/2) | [02-mfa.md](./02-mfa.md) |
| 03 | Single Sign-On (SSO) | 6 | 11 (5/4/2) | [03-sso.md](./03-sso.md) |
| 04 | Tenant Management | 7 | 10 (4/4/2) | [04-tenant-management.md](./04-tenant-management.md) |
| 05 | Customer / Workspace Management | 8 | 10 (4/4/2) | [05-customer-workspace-management.md](./05-customer-workspace-management.md) |
| 06 | Roles & Permissions (RBAC) | 6 | 10 (4/4/2) | [06-roles-permissions.md](./06-roles-permissions.md) |
| 07 | Scenario Builder & Execution Engine | 15 | 17 (6/7/4) | [07-scenario-builder.md](./07-scenario-builder.md) |
| 08 | Integrations & Connections | 11 + 6 integrations | 15 (5/7/3) | [08-integrations-connections.md](./08-integrations-connections.md) |
| 09 | Email Templates | 9 | 13 (4/6/3) | [09-email-templates.md](./09-email-templates.md) |
| 10 | Activity & Audit Logging | 4 | 10 (4/4/2) | [10-activity-audit-logs.md](./10-activity-audit-logs.md) |
| 11 | User Impersonation | 6 | 9 (4/4/1) | [11-impersonation.md](./11-impersonation.md) |

## PO Priority Focus (Cross-Feature P1)
1. Webhook trigger receiver + run lifecycle improvements in Scenario Builder.
2. OAuth token refresh and re-authorization flow for integrations.
3. Tenant suspension enforcement and RBAC permission enforcement audit.
4. MFA backup/recovery codes and SSO tenant self-configuration UI.
5. End-to-end activity logging for orchestration entities.
6. Impersonation exit flow with stricter session controls.

---

## 01) Authentication & Session Management
**Implemented**
- Email + password login -> JWT access + refresh tokens (JWE encrypted)
- Token refresh endpoint
- Logout with token blacklisting
- Password reset flow: request email -> token -> set new password
- Email verification on signup
- Login OTP (one-time password) model exists

**Pending**
**P1**
- [ ] Login rate limiting
- [ ] Remember me / persistent sessions
- [ ] Account lockout notification
- [ ] Device/session listing

**P2**
- [ ] Passwordless login (magic link)
- [ ] Password strength enforcement
- [ ] Login audit enrichment

**P3**
- [ ] OAuth social login
- [ ] Passkey / WebAuthn support

---

## 02) Multi-Factor Authentication (MFA / TOTP)
**Implemented**
- MFA setup endpoint: generates TOTP secret + QR code URI
- MFA verification endpoint during login flow
- MFA enable / disable toggle per user
- Admin can force-enable or disable MFA for any user
- `mfa_enabled` and `mfa_secret` stored on User model

**Pending**
**P1**
- [ ] Backup / recovery codes
- [ ] MFA enforcement policy per tenant
- [ ] Re-verify before sensitive actions

**P2**
- [ ] SMS / email OTP as fallback
- [ ] MFA reset by admin with audit trail
- [ ] Trusted devices

**P3**
- [ ] Hardware key (FIDO2/WebAuthn) support
- [ ] Push notification MFA (Duo-style)

---

## 03) Single Sign-On (SSO)
**Implemented**
- SSO initiation endpoint: generates state token, returns authorization URL
- OAuth callback handler: exchanges code for tokens, issues JWE session
- `SsoState` and `SsoLoginToken` models for CSRF protection and token handoff
- SSO enable / disable per user
- Provider-agnostic implementation (configurable per provider)
- Support for Google and Microsoft flows

**Pending**
**P1**
- [ ] Per-tenant SSO configuration UI
- [ ] SAML 2.0 support
- [ ] SSO-only enforcement
- [ ] SSO domain matching
- [ ] Just-in-time (JIT) user provisioning

**P2**
- [ ] Multiple SSO providers per tenant
- [ ] SCIM user provisioning
- [ ] SSO group/role mapping
- [ ] SSO session expiry sync

**P3**
- [ ] Okta / Auth0 / Ping Identity dedicated adapters
- [ ] SSO audit log enrichment

---

## 04) Tenant Management
**Implemented**
- Tenant CRUD (create, read, update, delete)
- Auto-slugified tenant names
- Tenant status: active / suspended
- Hierarchical tenants (parent_tenant FK)
- Tenant owner assignment
- `UserTenant` join model: links users to tenants with owner flag and active/inactive status
- Tenant-scoped user listing and addition

**Pending**
**P1**
- [ ] Tenant suspension enforcement
- [ ] Tenant billing / plan limits
- [ ] Tenant deletion cascade
- [ ] Tenant onboarding flow

**P2**
- [ ] Tenant settings page
- [ ] Tenant-level audit log view
- [ ] Transfer tenant ownership
- [ ] Tenant invite via email

**P3**
- [ ] Tenant usage analytics
- [ ] Tenant-to-tenant isolation verification tests

---

## 05) Customer / Workspace Management
**Implemented**
- Customer CRUD with search and filtering
- Auto-slugified customer names
- Metadata fields: VAT, KVK, address, contact info
- Hierarchical customers (parent_customer FK)
- Customer owner assignment
- `UserCustomer` join model: user <-> workspace with owner flag and active/inactive status
- Workspace-scoped user listing, adding, and removal
- Customer ordered by creation date

**Pending**
**P1**
- [ ] Workspace suspension / archiving
- [ ] Workspace-level permissions
- [ ] Customer deletion safe-guard
- [ ] Workspace invite flow

**P2**
- [ ] Workspace settings page
- [ ] Workspace usage dashboard
- [ ] Transfer workspace ownership
- [ ] Bulk user import to workspace

**P3**
- [ ] Workspace-level API keys
- [ ] Customer / workspace public profile page

---

## 06) Roles & Permissions (RBAC)
**Implemented**
- Permission model: code, name, description, category
- Role model: name, slug, description, is_system, is_default, parent role (hierarchy), tenant/customer scope
- `RolePermission` join: multiple permissions per role
- `UserRole` join: user <-> role per tenant or workspace scope
- Role CRUD with unique slug constraints
- Seeding endpoint for initial system roles/permissions

**Pending**
**P1**
- [ ] Permission enforcement on all API endpoints
- [ ] Permission-based UI gating
- [ ] Effective permission resolution
- [ ] Default role auto-assignment

**P2**
- [ ] Role duplication
- [ ] Role change audit log
- [ ] Permission categories and grouping in UI
- [ ] Bulk role assignment

**P3**
- [ ] Temporary role grants
- [ ] Role analytics

---

## 07) Scenario Builder & Execution Engine
**Implemented**
- Scenario CRUD (create, read, update, delete)
- Node + edge graph stored as JSON
- Scenario status: draft -> published -> active / inactive
- Publish and activate/deactivate actions
- Scenario versioning (ScenarioVersion model, version number, published flag)
- Run engine: topological sort -> execute nodes in order
- Run status: queued -> running -> succeeded / failed / canceled
- Trigger types: manual, schedule (polling), webhook (model exists)
- RunStep tracking per node
- Retry logic (attempt count)
- Schedule polling via Celery Beat (60-second interval)
- Stale run recovery task
- Run history with stats (success rate, avg duration, provider usage)
- Frontend canvas editor with node context menu
- Frontend scenario history explorer

**Pending**
**P1**
- [ ] Webhook trigger receiver
- [ ] Conditional / branching nodes
- [ ] Run retry with exponential backoff
- [ ] Real-time run status updates
- [ ] Run cancellation
- [ ] Node output passing between steps

**P2**
- [ ] Scenario import / export (JSON)
- [ ] Scenario templates / marketplace
- [ ] Scenario duplicate
- [ ] Variable / environment store
- [ ] Run input parameters
- [ ] Node error handling config
- [ ] Scenario canvas zoom / minimap

**P3**
- [ ] Scenario sharing between workspaces
- [ ] Advanced run analytics dashboard
- [ ] Scenario diff viewer between versions
- [ ] Parallel / fan-out node execution

---

## 08) Integrations & Connections
**Implemented Integrations**
- Jira Cloud
- Jenkins
- HubSpot
- Email (SMTP)
- HTTP module
- JSON module

**Implemented Platform Capabilities**
- Connection CRUD (create, read, update, delete)
- Auth types: API Token, OAuth
- Connection status: active / inactive / error
- Optional AES secret encryption at rest
- Secret migration (plaintext -> encrypted)
- Connection test action with last-tested timestamp
- Tenant and workspace scoping
- OAuth callback pages for Jira and Jenkins
- Jira: dual auth (OAuth or API token), cloud ID detection
- Email: full SMTP config, TLS/SSL, to/cc/bcc/reply-to, template variable injection
- HTTP: all methods, query params, body types, redirect and SSL config

**Pending**
**P1**
- [ ] Slack integration
- [ ] GitHub / GitLab integration
- [ ] OAuth token refresh
- [ ] Connection health check / re-test on use
- [ ] OAuth re-authorization flow in UI

**P2**
- [ ] Salesforce integration
- [ ] Google Sheets / Drive integration
- [ ] Webhook integration (outbound)
- [ ] Database integrations (PostgreSQL, MySQL, BigQuery)
- [ ] Connection sharing across workspaces
- [ ] Connection usage tracking
- [ ] Bulk connection import

**P3**
- [ ] Zapier / Make compatibility layer
- [ ] Custom integration SDK
- [ ] Integration marketplace / catalog versioning

---

## 09) Email Templates
**Implemented**
- Template CRUD: name, slug, description, category, system flag
- Template content: subject, HTML body, text body, variables schema, sample payload
- Template versioning (EmailTemplateVersion): version number, published flag, change notes
- Duplicate template action
- Version history listing
- Variable substitution via template runtime (`{{variable}}` syntax)
- Inline preview with sample payload
- Test-send action: pick SMTP connection, specify recipients and payload
- Workspace and tenant scoping

**Pending**
**P1**
- [ ] Rich HTML editor (WYSIWYG)
- [ ] Template rendering error surfacing
- [ ] Unsubscribe / opt-out token injection
- [ ] Template-level SMTP connection binding

**P2**
- [ ] Template folders / organization
- [ ] Template import / export
- [ ] Scheduling a template send
- [ ] Recipient list / audience targeting
- [ ] Template analytics
- [ ] HTML template validation

**P3**
- [ ] Multilingual template variants
- [ ] A/B variant testing support
- [ ] Attachment support in templates

---

## 10) Activity & Audit Logging
**Implemented**
- `ActivityLog` model: module, action, entity, actor, IP, user agent, metadata, before/after values, tenant scope
- Automatic logging in identity views (auth, MFA, SSO, tenants, customers, roles)
- Frontend log viewer with pagination
- Redux slice for state management

**Pending**
**P1**
- [ ] Activity log coverage for orchestration
- [ ] Filtering and search in UI
- [ ] Export to CSV / JSON
- [ ] Log retention policy

**P2**
- [ ] Real-time log streaming
- [ ] Log forwarding to external SIEM
- [ ] Alert rules on audit events
- [ ] Tenant-isolated log access

**P3**
- [ ] Log integrity verification
- [ ] Compliance report generation

---

## 11) User Impersonation
**Implemented**
- List impersonatable users (tenant-scoped)
- Impersonate user: generates JWE tokens for target user
- Admin-only access guard
- `ImpersonationLog` model: impersonator, target user, IP, user agent, timestamp
- Frontend impersonation log viewer
- Redux slice for impersonation log state

**Pending**
**P1**
- [ ] Impersonation session expiry
- [ ] Stop impersonation / return to own session
- [ ] Impersonation reason / justification
- [ ] User notification on impersonation

**P2**
- [ ] Impersonation log filtering in UI
- [ ] Export impersonation logs
- [ ] Scope restriction
- [ ] Actions-during-impersonation log

**P3**
- [ ] Time-limited impersonation approvals

---

## Notes
- This consolidated file is derived from feature specs `01` through `11` in this directory.
- Detailed file-level implementation references remain in each individual feature spec.
