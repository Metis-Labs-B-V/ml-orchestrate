# Feature: Roles & Permissions

## Overview
Granular RBAC system. Permissions have a code, name, description, and category. Roles can be system-level, default, or custom; they exist at tenant and workspace scope. Users are assigned one or more roles per scope.

## What's Implemented
- Permission model: code, name, description, category
- Role model: name, slug, description, is_system, is_default, parent role (hierarchy), tenant/customer scope
- `RolePermission` join: multiple permissions per role
- `UserRole` join: user ↔ role per tenant or workspace scope
- Role CRUD with unique slug constraints
- Seeding endpoint for initial system roles/permissions

## File Locations
| Layer | Path |
|---|---|
| Backend views | `backend/metis-orchestrate/identity/views/roles.py` |
| Backend models | `backend/metis-orchestrate/identity/models.py` (Permission, Role, RolePermission, UserRole) |
| Backend seed | `backend/metis-orchestrate/identity/views/seed.py` |
| Frontend | `frontend/pages/dashboard/roles.tsx` |
| Redux slice | `frontend/store/slices/rolesSlice.ts` |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Permission enforcement on all API endpoints** — roles/permissions exist in DB but it's unclear if every view checks them; full permission gate audit needed
- [ ] **Permission-based UI gating** — frontend should hide/disable UI elements based on user's effective permissions (currently unclear if implemented)
- [ ] **Effective permission resolution** — with role hierarchy (parent roles), effective permission set must be computed; no utility function confirmed
- [ ] **Default role auto-assignment** — when a user is added to a tenant/workspace, a default role should be auto-assigned; not confirmed implemented

### P2 — Medium Priority
- [ ] **Role duplication** — no clone/copy-role feature in UI
- [ ] **Role change audit log** — role assignment/revocation not confirmed in activity log
- [ ] **Permission categories and grouping in UI** — permissions should be displayed grouped by category in the role editor
- [ ] **Bulk role assignment** — assign a role to multiple users at once

### P3 — Low Priority
- [ ] **Temporary role grants** — time-bounded role assignments
- [ ] **Role analytics** — which roles have the most/least users; which permissions are rarely used
