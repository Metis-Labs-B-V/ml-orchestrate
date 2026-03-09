# Scenario History Explorer Plan

## Objective
Make backend operations for each scenario visible through a search-first, user-friendly history experience.

The feature will distinguish between:
- execution history: runs and step traces
- scenario audit history: publish, activate, schedule changes, manual run requests

## Product Shape

### Primary surfaces
- `Canvas`
- `History`
- `Audit`

### History UX
- search-first run list
- status and trigger quick filters
- run summary cards
- selected run timeline
- step details inspector
- expandable raw request/response payloads

### Audit UX
- searchable timeline of scenario changes
- human-readable event labels
- structured metadata for each event

## Phases

### Phase 1
- Add `ScenarioAuditEvent` model
- Record audit events for:
  - scenario create
  - scenario update
  - scenario publish
  - scenario activate
  - scenario deactivate
  - schedule create
  - schedule update
  - manual run queued
- Add scenario-scoped history APIs:
  - `GET /scenarios/:id/history/summary/`
  - `GET /scenarios/:id/history/runs/`
  - `GET /scenarios/:id/history/audit/`
- Add `History` and `Audit` tabs to scenario page
- Add run list, timeline, and inspector

### Phase 2
- Add richer search support for runs:
  - status
  - trigger
  - text search by node id, node type, error text, run id
- Add query chips and saved filters
- Add jump-to-node on canvas from history trace
- Add better response summaries for connector steps

### Phase 3
- Compare runs
- Export trace
- Live trace refresh for running scenarios
- Performance insights and slow-run detection

## Backend Design

### Data model
Use existing:
- `Run`
- `RunStep`

Add:
- `ScenarioAuditEvent`

### API design
Summary endpoint returns:
- total runs
- success rate
- average duration
- last run
- last failed run
- counts by status

Run list endpoint returns:
- paginated runs
- lightweight summaries
- quick step counts
- first error summary
- providers used

Audit endpoint returns:
- paginated audit events
- human-readable labels
- actor
- timestamp
- structured payload

## Frontend Design

### History tab
- toolbar with search box and quick filter chips
- left run list
- center timeline
- right inspector

### Audit tab
- search box
- event timeline cards
- payload expansion

## Security and data handling
- redact secrets from rendered request/response details
- do not persist tokens/passwords in audit payloads
- continue using scenario scope rules already enforced by the backend

## Delivery order
1. data model and audit service
2. history APIs
3. scenario page tabs and history explorer
4. search/filter improvements
5. polish and verification
