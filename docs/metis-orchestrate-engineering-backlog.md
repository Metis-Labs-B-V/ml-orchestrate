# Metis Orchestrate Engineering Backlog

This backlog converts the current completion review into concrete execution phases.
It tracks what remains after the core scenario builder, HTTP, Jira, HubSpot,
email, email templates, async execution, and secret encryption work that already exists.

## Phase 0: Stability and Reliability

### P0.1 Execution watchdogs
- Status: In progress
- Goal: Prevent runs from remaining in `queued` or `running` forever after worker loss or process crashes.
- Deliverables:
  - stale queued run detection
  - stale running run detection
  - periodic Celery beat recovery task
  - failure metadata for recovered runs
  - tests and env controls

### P0.2 Run observability
- Status: Pending
- Goal: Make queued/running/completed state easier to understand in the builder.
- Deliverables:
  - explicit run state badges
  - more compact latest-run metadata
  - stale-run messaging surfaced in UI

### P0.3 Regression coverage
- Status: Pending
- Goal: Protect the execution core that is already built.
- Deliverables:
  - connector smoke tests for HTTP/Jira/HubSpot/Email
  - run lifecycle tests for queue, worker, and schedule paths

## Phase 1: Integration Runtime Standardization

### P1.1 Connector contract
- Status: Pending
- Goal: Replace prefix-based execution branching with a formal connector runtime contract.
- Deliverables:
  - connector definition interface
  - action definition interface
  - auth handler interface
  - trigger handler interface

### P1.2 Registry and catalog cleanup
- Status: Pending
- Goal: Stop hard-coding integration metadata in one file.
- Deliverables:
  - registry-driven catalog generation
  - per-connector metadata modules
  - shared field schema conventions

## Phase 2: Builder Decomposition

### P2.1 Scenario page split
- Status: Pending
- Goal: Break the monolithic builder page into maintainable units.
- Deliverables:
  - canvas component
  - run panel component
  - connector config panels
  - mapping widgets
  - shared node action hooks

### P2.2 Mapping UX unification
- Status: Pending
- Goal: Make token insertion, JSON mapping, HTTP mapping, and email variable binding feel consistent.
- Deliverables:
  - shared variable picker
  - reusable mapped-input controls
  - connector-aware token filtering

## Phase 3: Trigger Platform

### P3.1 Polling trigger standardization
- Status: Pending
- Goal: Move polling logic out of ad hoc connector behavior into a connector trigger contract.

### P3.2 Webhook ingestion framework
- Status: Pending
- Goal: Support future webhook connectors without rewriting the execution entrypoint.

## Phase 4: Product Hardening

### P4.1 Permission model cleanup
- Status: Pending
- Goal: Replace legacy domain naming and strengthen workspace access boundaries.

### P4.2 Operational controls
- Status: Pending
- Goal: Add monitoring, alerting, retention tooling, and admin-grade auditability.

### P4.3 Secret management upgrade path
- Status: Pending
- Goal: Keep encrypted DB storage compatible while preparing for external secret managers.

## Exit Criteria

The backlog is considered materially complete when:
- runs cannot remain silently stuck
- builder interactions are split into maintainable components
- integrations share a standardized runtime contract
- trigger implementations follow one framework
- operational visibility and permission controls are strong enough for real customers
