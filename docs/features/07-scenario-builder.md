# Feature: Scenario Builder

## Overview
Visual, node-based workflow builder. Scenarios are directed graphs of integration nodes. They can be versioned, published, and triggered manually, on a schedule, or via webhook. Execution runs on Celery workers with full status tracking.

## What's Implemented
- Scenario CRUD (create, read, update, delete)
- Node + edge graph stored as JSON
- Scenario status: draft → published → active / inactive
- Publish and activate/deactivate actions
- Scenario versioning (ScenarioVersion model, version number, published flag)
- Run engine: topological sort → execute nodes in order
- Run status: queued → running → succeeded / failed / canceled
- Trigger types: manual, schedule (polling), webhook (model exists)
- RunStep tracking per node
- Retry logic (attempt count)
- Schedule polling via Celery Beat (60-second interval)
- Stale run recovery task
- Run history with stats (success rate, avg duration, provider usage)
- Frontend canvas editor with node context menu
- Frontend scenario history explorer

## File Locations
| Layer | Path |
|---|---|
| Backend models | `backend/metis-orchestrate/app/models.py` (Scenario, ScenarioVersion, Run, RunStep, ScenarioSchedule) |
| Execution service | `backend/metis-orchestrate/app/services/execution.py` |
| Run dispatcher | `backend/metis-orchestrate/app/services/run_dispatcher.py` |
| Schedule dispatcher | `backend/metis-orchestrate/app/services/schedule_dispatcher.py` |
| Run recovery | `backend/metis-orchestrate/app/services/run_recovery.py` |
| History service | `backend/metis-orchestrate/app/services/history.py` |
| Celery tasks | `backend/metis-orchestrate/app/tasks.py` |
| Backend views | `backend/metis-orchestrate/app/views.py` (ScenarioViewSet, RunViewSet) |
| Frontend list | `frontend/pages/dashboard/scenarios/index.tsx` |
| Frontend editor | `frontend/pages/dashboard/scenarios/[scenarioId].tsx` |
| Node context menu | `frontend/components/NodeContextMenu.tsx` |
| History explorer | `frontend/components/ScenarioHistoryExplorer.tsx` |
| Redux | `frontend/store/slices/settingsSlice.ts` |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Webhook trigger receiver** — `webhook` trigger type is modeled but no HTTP endpoint exists to receive incoming webhook payloads and enqueue a run
- [ ] **Conditional / branching nodes** — no if/else or switch logic; workflows are strictly linear sequential
- [ ] **Run retry with exponential backoff** — attempt count exists but no automatic retry policy or backoff configuration
- [ ] **Real-time run status updates** — frontend polls; no WebSocket or SSE for live node-by-node progress
- [ ] **Run cancellation** — `canceled` status exists but no confirmed UI action or API endpoint to cancel a running job
- [ ] **Node output passing between steps** — unclear if run steps pass output data to downstream nodes as input

### P2 — Medium Priority
- [ ] **Scenario import / export (JSON)** — no bulk export or portable scenario format
- [ ] **Scenario templates / marketplace** — no pre-built starter templates for common workflows
- [ ] **Scenario duplicate** — no clone-scenario action
- [ ] **Variable / environment store** — no global or workspace-level variable store accessible across nodes
- [ ] **Run input parameters** — no way to pass runtime variables when manually triggering a run
- [ ] **Node error handling config** — no per-node "on error: skip / fail / retry" setting
- [ ] **Scenario canvas zoom / minimap** — UX improvement for large graphs

### P3 — Low Priority
- [ ] **Scenario sharing between workspaces**
- [ ] **Advanced run analytics dashboard** (time series charts, error breakdown)
- [ ] **Scenario diff viewer** between versions
- [ ] **Parallel / fan-out node execution**
