# Feature: Customer / Workspace Management

## Overview
Workspaces (called "customers" in the data model) are sub-units within a tenant. They group users, scenarios, connections, and email templates. Each workspace has metadata (VAT, KVK, address), an owner, and optional parent-child hierarchy.

## What's Implemented
- Customer CRUD with search and filtering
- Auto-slugified customer names
- Metadata fields: VAT, KVK, address, contact info
- Hierarchical customers (parent_customer FK)
- Customer owner assignment
- `UserCustomer` join model: user ↔ workspace with owner flag and active/inactive status
- Workspace-scoped user listing, adding, and removal
- Customer ordered by creation date

## File Locations
| Layer | Path |
|---|---|
| Backend views | `backend/metis-orchestrate/identity/views/customers.py` |
| Backend models | `backend/metis-orchestrate/identity/models.py` (Customer, UserCustomer) |
| Frontend list | `frontend/pages/dashboard/clients.tsx` |
| Frontend create | `frontend/pages/dashboard/clients/new.tsx` |
| Frontend detail | `frontend/pages/dashboard/clients/[clientId].tsx` |
| Frontend add user | `frontend/pages/dashboard/clients/[clientId]/users/new.tsx` |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Workspace suspension / archiving** — no way to archive or suspend a workspace without deleting it
- [ ] **Workspace-level permissions** — roles assigned at workspace level but enforcement across all APIs needs audit
- [ ] **Customer deletion safe-guard** — no confirmation flow or cascade analysis before deleting a workspace
- [ ] **Workspace invite flow** — no email invite for users to join a workspace

### P2 — Medium Priority
- [ ] **Workspace settings page** — no dedicated UI for workspace-level config (default timezone, logo, branding)
- [ ] **Workspace usage dashboard** — no per-workspace summary of scenarios, runs, connections
- [ ] **Transfer workspace ownership** — no ownership transfer flow
- [ ] **Bulk user import to workspace** — users must be added one at a time

### P3 — Low Priority
- [ ] **Workspace-level API keys** — per-workspace machine-to-machine tokens for external integrations
- [ ] **Customer / workspace public profile page**
