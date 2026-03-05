# Metis Orchestrate MVP - Scenario Builder Feature Spec

Status: Implementation-ready MVP scope  
Date: 2026-03-02  
Product: Metis Orchestrate

## 1. Objective

Build a Make.com-like scenario orchestration MVP in Metis Orchestrate with Jira as the first integration provider, API token auth first, OAuth-ready architecture, branching flow support, and multi-tenant + multi-workspace support.

## 2. Core User Journey

1. User logs in and sees main layout.
2. User opens `Scenarios` from left sidebar.
3. User sees scenario list and clicks `Add scenario`.
4. User lands on blank canvas with `+` add-module control.
5. User clicks `+`, opens module picker, searches/selects app (example: Jira Cloud Platform).
6. User selects a Jira operation (example: List users).
7. Node is added to canvas and right config panel opens.
8. User must select/create required connection.
9. If connection is missing and user saves, field shows validation error: `Value must not be empty.`
10. User runs scenario once and sees per-node output JSON.
11. User maps output values into downstream node fields.

## 3. Functional Requirements

### 3.1 Scenario Management

- Sidebar menu includes `Scenarios`.
- Scenario list page shows all scenarios and `Add scenario` CTA.
- Create scenario opens canvas page.
- Scenario supports draft editing and save.
- Scenario supports publish/activate lifecycle.
- Scenario data is scoped by workspace and tenant.

### 3.2 Canvas and Module Picker

- Canvas starts empty with `+` module insertion action.
- Module picker includes search bar, category tabs (`All apps`, `Featured`, `Built-in tools`, `Productivity`, `AI`), and app/module list with scrolling.
- Selecting app + operation inserts typed node on canvas.
- Selecting node opens right configuration panel.

### 3.3 Jira Modules (MVP and later)

- MVP operations: `jira.users.list`, `jira.users.search`, `jira.issue.get`, `jira.issue.search`, `jira.issue.create`, `jira.issue.update`, `jira.issue.comment.create`, `jira.api.call`.
- `jira.api.call` is unrestricted in MVP.
- MVP trigger support includes manual `Run once` and Jira watch-issues polling every 15 minutes.
- Phase-2+ operations: watch issues trigger, transitions/status update, assign/unassign, changelog, delete issue, comments/links/watchers/attachments CRUD, project components CRUD, project versions CRUD, custom fields/options CRUD + reorder.

### 3.4 Connection UX and Validation

- Right panel shows required `Connection*` field.
- `Create a connection` action opens modal.
- API token connection fields: `connectionName`, `serviceUrl`, `username`, `apiToken`.
- Save/Cancel controls on node panel and modal.
- Required-field error text: `Value must not be empty.`

### 3.5 Output, Mapping, and Transform

- Run output stores and displays node-by-node JSON.
- Keep `raw` provider payload for every node execution.
- Support mapped variables from previous node outputs.
- MVP mapping syntax uses token references with dot and bracket access:
- `{{nodeId.path.to.value}}`
- `{{nodeId.arrayField[0].value}}`
- `{{nodeId["custom-field-key"]}}`
- MVP expression helpers supported in mapping fields: `default`, `concat`, `upper`, `lower`, `trim`.
- JSONPath mode is out of MVP scope and can be introduced in a later phase.
- Provide MVP Transform node with: pick fields, rename fields, build object, merge objects, and basic string concat.

### 3.6 Extensibility and Adapter Model

- Jira is first provider.
- Next provider priority after Jira is HubSpot.
- Future providers after HubSpot: Notion, Asana, Azure, Slack, Teams.
- Flow engine must be provider-agnostic.
- Provider logic must stay inside adapters and node definitions.

## 4. Architecture Requirements

### 4.1 Services

- Scenario service: scenario CRUD, validation, versioning.
- Connection service: encrypted credentials, provider-specific validation/test.
- Integration registry: app catalog and node definitions.
- Execution service: run orchestration, retries, logs, status.
- Webhook gateway (later): provider trigger intake.

### 4.2 Node Definition Contract

```ts
type NodeDefinition = {
  type: string;
  title: string;
  app: string;
  category: "Trigger" | "Action" | "Search" | "Utility";
  configSchema: JSONSchema;
  uiSchema?: UISchema;
  outputSchema?: JSONSchema;
  auth: {
    provider: string;
    method: "apiToken" | "oauth";
    required: true;
  };
};
```

## 5. Backend API Surface (MVP)

- `GET /integrations/catalog`
- `POST /connections`
- `GET /connections?provider=jira`
- `POST /connections/:id/test`
- `POST /scenarios`
- `GET /scenarios`
- `GET /scenarios/:id`
- `PATCH /scenarios/:id`
- `POST /scenarios/:id/publish`
- `POST /scenarios/:id/activate`
- `POST /scenarios/:id/deactivate`
- `POST /runs`
- `GET /runs/:id`
- `POST /scenarios/:id/schedules`
- `PATCH /scenarios/:id/schedules/:scheduleId`

## 6. Data Model Draft

- `Scenario`: id, name, status, currentVersionId, createdBy, timestamps.
- `ScenarioVersion`: id, scenarioId, version, graphJson, publishedAt.
- `Connection`: id, provider, authType, displayName, metadata, secretRef, status.
- `Run`: id, scenarioId, versionId, triggerType, status, startedAt, endedAt.
- `RunStep`: id, runId, nodeId, status, inputJson, outputRawJson, outputNormalizedJson, errorJson, durationMs.

## 7. Reliability and Security Baseline

- Validate graph before run (required fields, valid references, no orphan nodes).
- Runs execute against immutable version.
- Retry/backoff for transient provider failures and 429.
- Idempotency strategy for write actions.
- Secrets are encrypted at rest and never returned to frontend.
- Persist execution logs for observability and debugging.
- Run history retention default is 30 days.

## 8. Delivery Plan

### Phase 1A

- Scenarios menu, scenario list, add scenario, blank canvas, module picker shell.

### Phase 1B

- Jira adapter with MVP actions/search operations.

### Phase 1C

- Jira API token connection modal, save/test, required validation.

### Phase 1D

- Run once, output viewer, mapping support, transform node.

### Phase 1E

- Publish/activate lifecycle and 15-minute Jira scheduled trigger execution.

## 9. Acceptance Criteria

- User can create a scenario from list page and open canvas.
- User can add Jira module node and select operation.
- User cannot save node without required connection.
- User can create Jira API-token connection and reuse it.
- User can run a scenario and view JSON output per node.
- User can map value from one node output into another node config.
- User can build branching flows on canvas and run them.
- User can publish and activate/deactivate scenarios.
- Tenant/workspace isolation is enforced for scenarios, runs, and connections.
- Architecture supports adding a second provider without flow engine rewrite.

## 10. Open Questions Before Development

- No open questions. Scope is locked for MVP implementation.
