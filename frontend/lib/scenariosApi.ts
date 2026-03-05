import { API_PATHS } from "./apiPaths";
import { apiFetch } from "./api";
import type {
  ConnectionRecord,
  IntegrationCatalog,
  ScenarioGraph,
  ScenarioRecord,
} from "../types/scenarios";

type ApiEnvelope<T> = {
  status?: string;
  message?: string;
  data?: T;
  errors?: Record<string, unknown> | null;
};

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    query.set(key, String(value));
  });
  return query.toString();
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  let payload: ApiEnvelope<T> = {};
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const message =
      payload?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function fetchIntegrationCatalog(): Promise<IntegrationCatalog> {
  const response = await apiFetch(API_PATHS.integrations.catalog);
  const payload = await parseEnvelope<IntegrationCatalog>(response);
  return payload.data || { categories: [], apps: [] };
}

export async function listScenarios(scope: {
  tenantId?: string | number | null;
  workspaceId?: string | number | null;
}): Promise<{ items: ScenarioRecord[]; count: number }> {
  const query = buildQuery({
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
  });
  const response = await apiFetch(API_PATHS.scenarios.list(query));
  const payload = await parseEnvelope<{
    items: ScenarioRecord[];
    count: number;
  }>(response);
  return payload.data || { items: [], count: 0 };
}

export async function getScenario(scenarioId: string | number): Promise<ScenarioRecord> {
  const response = await apiFetch(API_PATHS.scenarios.detail(scenarioId));
  const payload = await parseEnvelope<ScenarioRecord>(response);
  if (!payload.data) {
    throw new Error("Scenario not found.");
  }
  return payload.data;
}

export async function createScenario(payload: {
  name: string;
  description?: string;
  tenant_id?: string | number | null;
  workspace_id?: string | number | null;
  graph_json?: ScenarioGraph;
}): Promise<ScenarioRecord> {
  const response = await apiFetch(API_PATHS.scenarios.list(), {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const envelope = await parseEnvelope<ScenarioRecord>(response);
  if (!envelope.data) {
    throw new Error("Unable to create scenario.");
  }
  return envelope.data;
}

export async function updateScenario(
  scenarioId: string | number,
  payload: Partial<ScenarioRecord>
): Promise<ScenarioRecord> {
  const response = await apiFetch(API_PATHS.scenarios.detail(scenarioId), {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  const envelope = await parseEnvelope<ScenarioRecord>(response);
  if (!envelope.data) {
    throw new Error("Unable to update scenario.");
  }
  return envelope.data;
}

export async function publishScenario(
  scenarioId: string | number,
  graph: ScenarioGraph
): Promise<ScenarioRecord> {
  const response = await apiFetch(API_PATHS.scenarios.publish(scenarioId), {
    method: "POST",
    body: JSON.stringify({ graph_json: graph }),
  });
  const envelope = await parseEnvelope<{ scenario: ScenarioRecord }>(response);
  if (!envelope.data?.scenario) {
    throw new Error("Unable to publish scenario.");
  }
  return envelope.data.scenario;
}

export async function activateScenario(
  scenarioId: string | number
): Promise<ScenarioRecord> {
  const response = await apiFetch(API_PATHS.scenarios.activate(scenarioId), {
    method: "POST",
  });
  const envelope = await parseEnvelope<ScenarioRecord>(response);
  if (!envelope.data) {
    throw new Error("Unable to activate scenario.");
  }
  return envelope.data;
}

export async function runScenario(
  scenarioId: string | number
): Promise<Record<string, unknown>> {
  const response = await apiFetch(API_PATHS.runs.create, {
    method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
  const envelope = await parseEnvelope<Record<string, unknown>>(response);
  if (!envelope.data) {
    throw new Error("Unable to run scenario.");
  }
  return envelope.data;
}

export async function listConnections(scope: {
  tenantId?: string | number | null;
  workspaceId?: string | number | null;
  provider?: string | null;
}): Promise<{ items: ConnectionRecord[]; count: number }> {
  const query = buildQuery({
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    provider: scope.provider,
  });
  const response = await apiFetch(API_PATHS.connections.list(query));
  const payload = await parseEnvelope<{
    items: ConnectionRecord[];
    count: number;
    results?: ConnectionRecord[];
  }>(response);
  if (Array.isArray(payload.data?.results)) {
    return {
      items: payload.data?.results || [],
      count: Number(payload.data?.count || 0),
    };
  }
  return payload.data || { items: [], count: 0 };
}

export async function createApiTokenConnection(payload: {
  display_name: string;
  provider: "jira" | "hubspot";
  tenant_id?: string | number | null;
  workspace_id?: string | number | null;
  secret_payload: Record<string, unknown>;
}): Promise<ConnectionRecord> {
  const response = await apiFetch(API_PATHS.connections.list(), {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      auth_type: "apiToken",
    }),
  });
  const envelope = await parseEnvelope<ConnectionRecord>(response);
  if (!envelope.data) {
    throw new Error("Unable to create connection.");
  }
  return envelope.data;
}

export async function testConnection(connectionId: string | number): Promise<void> {
  const response = await apiFetch(API_PATHS.connections.test(connectionId), {
    method: "POST",
  });
  await parseEnvelope<Record<string, unknown>>(response);
}

export async function startJenkinsOauth(payload: {
  base_url: string;
  display_name: string;
  workspace_id?: string | number | null;
  tenant_id?: string | number | null;
}): Promise<{ url: string; state: string }> {
  const response = await apiFetch(API_PATHS.integrations.jenkinsOauthStart, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const envelope = await parseEnvelope<{ url: string; state: string }>(response);
  if (!envelope.data?.url || !envelope.data?.state) {
    throw new Error("Unable to start Jenkins OAuth.");
  }
  return envelope.data;
}

export async function exchangeJenkinsOauth(payload: {
  code: string;
  state: string;
}): Promise<ConnectionRecord> {
  const response = await apiFetch(API_PATHS.integrations.jenkinsOauthExchange, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const envelope = await parseEnvelope<ConnectionRecord>(response);
  if (!envelope.data) {
    throw new Error("Unable to complete Jenkins OAuth.");
  }
  return envelope.data;
}

export async function startJiraOauth(payload: {
  display_name: string;
  service_url?: string;
  workspace_id?: string | number | null;
  tenant_id?: string | number | null;
}): Promise<{ url: string; state: string }> {
  const response = await apiFetch(API_PATHS.integrations.jiraOauthStart, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const envelope = await parseEnvelope<{ url: string; state: string }>(response);
  if (!envelope.data?.url || !envelope.data?.state) {
    throw new Error("Unable to start Jira OAuth.");
  }
  return envelope.data;
}

export async function exchangeJiraOauth(payload: {
  code: string;
  state: string;
}): Promise<ConnectionRecord> {
  const response = await apiFetch(API_PATHS.integrations.jiraOauthExchange, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const envelope = await parseEnvelope<ConnectionRecord>(response);
  if (!envelope.data) {
    throw new Error("Unable to complete Jira OAuth.");
  }
  return envelope.data;
}
