# Feature: Tenant Management

## Overview
Top-level organizational units (tenants) with support for hierarchical parent-child relationships. Tenants can be active or suspended. Admins manage tenants; each tenant has an owner user.

## What's Implemented
- Tenant CRUD (create, read, update, delete)
- Auto-slugified tenant names
- Tenant status: active / suspended
- Hierarchical tenants (parent_tenant FK)
- Tenant owner assignment
- `UserTenant` join model: links users to tenants with owner flag and active/inactive status
- Tenant-scoped user listing and addition

## File Locations
| Layer | Path |
|---|---|
| Backend views | `backend/metis-orchestrate/identity/views/tenants.py` |
| Backend models | `backend/metis-orchestrate/identity/models.py` (Tenant, UserTenant) |
| Frontend list | `frontend/pages/dashboard/tenants/index.tsx` |
| Frontend create | `frontend/pages/dashboard/tenants/new.tsx` |
| Frontend detail | `frontend/pages/dashboard/tenants/[tenantId].tsx` |
| Frontend add user | `frontend/pages/dashboard/tenants/[tenantId]/users/new.tsx` |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Tenant suspension enforcement** — `suspended` status stored but not enforced at API level (suspended tenants can still log in and call APIs)
- [ ] **Tenant billing / plan limits** — no concept of plan tier or resource limits (max users, scenarios, runs/month)
- [ ] **Tenant deletion cascade** — no safe-delete flow; hard delete risks orphaning data across models
- [ ] **Tenant onboarding flow** — no wizard or checklist after creation (configure SSO, invite users, etc.)

### P2 — Medium Priority
- [ ] **Tenant settings page** — no dedicated settings view (timezone, locale, notification preferences)
- [ ] **Tenant-level audit log view** — activity logs exist but no tenant-scoped dashboard in UI
- [ ] **Transfer tenant ownership** — no ownership transfer flow
- [ ] **Tenant invite via email** — users must be added manually; no email invite to join a tenant

### P3 — Low Priority
- [ ] **Tenant usage analytics** (scenarios run, API calls, active users)
- [ ] **Tenant-to-tenant isolation verification tests**
