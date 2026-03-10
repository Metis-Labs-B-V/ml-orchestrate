# Feature: User Impersonation

## Overview
Super-admins can impersonate any user within a tenant to debug or support issues. Impersonation events are recorded in `ImpersonationLog`. Logs are read-only and accessible to auditors.

## What's Implemented
- List impersonatable users (tenant-scoped)
- Impersonate user: generates JWE tokens for the target user
- Admin-only access guard
- `ImpersonationLog` model: impersonator, target user, IP, user agent, timestamp
- Frontend impersonation log viewer
- Redux slice for impersonation log state

## File Locations
| Layer | Path |
|---|---|
| Backend views | `backend/metis-orchestrate/identity/views/impersonation.py` |
| Backend model | `backend/metis-orchestrate/identity/models.py` (ImpersonationLog) |
| Frontend logs | `frontend/pages/dashboard/impersonation-logs.tsx` |
| Redux slice | `frontend/store/slices/impersonationLogsSlice.ts` |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Impersonation session expiry** — impersonation token should have a shorter TTL than a normal session; not confirmed enforced
- [ ] **Stop impersonation / return to own session** — no "exit impersonation" button that cleanly returns admin to their original session
- [ ] **Impersonation reason / justification** — no required reason field before impersonating; needed for compliance
- [ ] **User notification on impersonation** — impersonated user is not notified that their account was accessed

### P2 — Medium Priority
- [ ] **Impersonation log filtering in UI** — no filters by impersonator, target user, or date range
- [ ] **Export impersonation logs** — no CSV/JSON export for compliance audits
- [ ] **Scope restriction** — currently any admin can impersonate any tenant user; should enforce that tenant admins can only impersonate within their own tenant
- [ ] **Actions-during-impersonation log** — activity logs should tag entries made while impersonating as `impersonated_by: <admin_id>`

### P3 — Low Priority
- [ ] **Time-limited impersonation approvals** — two-admin approval workflow before impersonation is granted
