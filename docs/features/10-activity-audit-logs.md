# Feature: Activity & Audit Logging

## Overview
Append-only audit trail recording who did what, when, and from where. Logs include module (auth, mfa, sso, tenants, etc.), action (login, create, update, delete), entity type/ID, before/after change data, IP address, user agent, and metadata.

## What's Implemented
- `ActivityLog` model: module, action, entity_type, entity_id, actor (user), IP, user agent, metadata, before/after change values, tenant scope
- Automatic logging in identity views (auth, MFA, SSO, tenants, customers, roles)
- Frontend log viewer with pagination
- Redux slice for state management

## File Locations
| Layer | Path |
|---|---|
| Backend model | `backend/metis-orchestrate/identity/models.py` (ActivityLog) |
| Logging helper | `backend/metis-orchestrate/identity/activity_log.py` |
| Backend views | `backend/metis-orchestrate/identity/views/` (activity_logs.py implied) |
| Frontend | `frontend/pages/dashboard/activity-logs.tsx` |
| Redux slice | `frontend/store/slices/activityLogsSlice.ts` |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Activity log coverage for orchestration** — scenario CRUD, run triggers, connection changes, email template changes are NOT confirmed to write activity logs (only identity module is confirmed)
- [ ] **Filtering and search in UI** — frontend viewer likely lacks filters by module, action, date range, user, or entity
- [ ] **Export to CSV / JSON** — no download/export of audit log data for compliance
- [ ] **Log retention policy** — no automated purge of old logs; unbounded growth in production

### P2 — Medium Priority
- [ ] **Real-time log streaming** — logs appear only on page refresh; no live tail / push
- [ ] **Log forwarding to external SIEM** — no webhook or connector to send logs to Splunk, Datadog, etc.
- [ ] **Alert rules on audit events** — no ability to define "notify me when X user does Y action"
- [ ] **Tenant-isolated log access** — tenant admins should only see logs for their tenant; access control audit needed

### P3 — Low Priority
- [ ] **Log integrity verification** (tamper-evident hashing)
- [ ] **Compliance report generation** (SOC2, GDPR data access report)
