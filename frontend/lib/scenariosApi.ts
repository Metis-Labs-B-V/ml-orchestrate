import { API_PATHS } from "./apiPaths";
import { apiFetch } from "./api";
import type {
  ConnectionRecord,
  IntegrationCatalog,
  ScenarioGraph,
  ScenarioRecord,
} from "../types/scenarios";
import type {
  EmailTemplatePreviewPayload,
  EmailTemplatePreviewResult,
  EmailTemplateRecord,
  EmailTemplateTestSendPayload,
  EmailTemplateUpsertPayload,
  EmailTemplateVersionRecord,
} from "../types/emailTemplates";

type ApiEnvelope<T> = {
  status?: string;
  message?: string;
  data?: T;
  errors?: Record<string, unknown> | null;
};

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type RunSummary = {
  id: number;
  scenario_id: number;
  scenario_version: number;
  trigger_type: "manual" | "schedule" | "webhook";
  status: RunStatus;
  tenant_id: number | null;
  workspace_id: number | null;
  queued_at?: string | null;
  dispatched_at?: string | null;
  attempt_count?: number;
  started_at: string | null;
  ended_at: string | null;
  metadata?: Record<string, unknown>;
  steps?: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
};

export type RunHistorySummary = {
  total_runs: number;
  status_counts: Record<string, number>;
  success_rate: number;
  average_duration_ms: number;
  last_run: number | null;
  last_failed_run: number | null;
  providers_used: Record<string, number>;
};

export type RunHistoryListItem = RunSummary & {
  duration_ms: number;
  step_counts: Record<string, number>;
  first_error_message: string;
  providers_used: string[];
};

export type ScenarioAuditEvent = {
  id: number;
  scenario_id: number;
  run_id: number | null;
  event_type: string;
  event_label: string;
  payload_json: Record<string, unknown>;
  actor_email: string;
  created_at: string;
  updated_at: string;
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

export async function getScenarioHistorySummary(
  scenarioId: string | number
): Promise<RunHistorySummary> {
  const response = await apiFetch(API_PATHS.scenarios.historySummary(scenarioId));
  const payload = await parseEnvelope<RunHistorySummary>(response);
  return (
    payload.data || {
      total_runs: 0,
      status_counts: {},
      success_rate: 0,
      average_duration_ms: 0,
      last_run: null,
      last_failed_run: null,
      providers_used: {},
    }
  );
}

export async function listScenarioHistoryRuns(
  scenarioId: string | number,
  filters: {
    status?: string | null;
    trigger_type?: string | null;
    provider?: string | null;
    search?: string | null;
  } = {}
): Promise<{ items: RunHistoryListItem[]; count: number }> {
  const query = buildQuery(filters);
  const response = await apiFetch(API_PATHS.scenarios.historyRuns(scenarioId, query));
  const payload = await parseEnvelope<{
    items?: RunHistoryListItem[];
    results?: RunHistoryListItem[];
    count?: number;
  }>(response);
  if (Array.isArray(payload.data?.results)) {
    return {
      items: payload.data.results || [],
      count: Number(payload.data.count || 0),
    };
  }
  return {
    items: payload.data?.items || [],
    count: Number(payload.data?.count || 0),
  };
}

export async function listScenarioAuditEvents(
  scenarioId: string | number,
  filters: {
    search?: string | null;
    event_type?: string | null;
  } = {}
): Promise<{ items: ScenarioAuditEvent[]; count: number }> {
  const query = buildQuery(filters);
  const response = await apiFetch(API_PATHS.scenarios.historyAudit(scenarioId, query));
  const payload = await parseEnvelope<{
    items?: ScenarioAuditEvent[];
    results?: ScenarioAuditEvent[];
    count?: number;
  }>(response);
  if (Array.isArray(payload.data?.results)) {
    return {
      items: payload.data.results || [],
      count: Number(payload.data.count || 0),
    };
  }
  return {
    items: payload.data?.items || [],
    count: Number(payload.data?.count || 0),
  };
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
): Promise<RunSummary> {
  const response = await apiFetch(API_PATHS.runs.create, {
    method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
  const envelope = await parseEnvelope<RunSummary>(response);
  if (!envelope.data) {
    throw new Error("Unable to run scenario.");
  }
  return envelope.data;
}

export async function getRun(runId: string | number): Promise<RunSummary> {
  const response = await apiFetch(API_PATHS.runs.detail(runId));
  const envelope = await parseEnvelope<RunSummary>(response);
  if (!envelope.data) {
    throw new Error("Run not found.");
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
  provider: "jira" | "hubspot" | "email";
  auth_type?: "apiToken" | "oauth";
  tenant_id?: string | number | null;
  workspace_id?: string | number | null;
  secret_payload: Record<string, unknown>;
}): Promise<ConnectionRecord> {
  const response = await apiFetch(API_PATHS.connections.list(), {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      auth_type: payload.auth_type || "apiToken",
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

export async function listEmailTemplates(scope: {
  tenantId?: string | number | null;
  workspaceId?: string | number | null;
  category?: string | null;
  search?: string | null;
}): Promise<{ items: EmailTemplateRecord[]; count: number }> {
  const query = buildQuery({
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    category: scope.category,
    search: scope.search,
  });
  const response = await apiFetch(API_PATHS.emailTemplates.list(query));
  const payload = await parseEnvelope<{
    items?: EmailTemplateRecord[];
    results?: EmailTemplateRecord[];
    count?: number;
  }>(response);
  if (Array.isArray(payload.data?.results)) {
    return {
      items: payload.data.results || [],
      count: Number(payload.data?.count || 0),
    };
  }
  return {
    items: payload.data?.items || [],
    count: Number(payload.data?.count || 0),
  };
}

export async function getEmailTemplate(
  templateId: string | number
): Promise<EmailTemplateRecord> {
  const response = await apiFetch(API_PATHS.emailTemplates.detail(templateId));
  const payload = await parseEnvelope<EmailTemplateRecord>(response);
  if (!payload.data) {
    throw new Error("Email template not found.");
  }
  return payload.data;
}

export async function createEmailTemplate(
  payload: EmailTemplateUpsertPayload
): Promise<EmailTemplateRecord> {
  const response = await apiFetch(API_PATHS.emailTemplates.list(), {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const envelope = await parseEnvelope<EmailTemplateRecord>(response);
  if (!envelope.data) {
    throw new Error("Unable to create email template.");
  }
  return envelope.data;
}

export async function updateEmailTemplate(
  templateId: string | number,
  payload: Partial<EmailTemplateUpsertPayload>
): Promise<EmailTemplateRecord> {
  const response = await apiFetch(API_PATHS.emailTemplates.detail(templateId), {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  const envelope = await parseEnvelope<EmailTemplateRecord>(response);
  if (!envelope.data) {
    throw new Error("Unable to update email template.");
  }
  return envelope.data;
}

export async function deleteEmailTemplate(templateId: string | number): Promise<void> {
  const response = await apiFetch(API_PATHS.emailTemplates.detail(templateId), {
    method: "DELETE",
  });
  await parseEnvelope<Record<string, unknown>>(response);
}

export async function duplicateEmailTemplate(payload: {
  templateId: string | number;
  tenant_id?: string | number | null;
  workspace_id?: string | number | null;
}): Promise<EmailTemplateRecord> {
  const response = await apiFetch(API_PATHS.emailTemplates.duplicate(payload.templateId), {
    method: "POST",
    body: JSON.stringify({
      tenant_id: payload.tenant_id,
      workspace_id: payload.workspace_id,
    }),
  });
  const envelope = await parseEnvelope<EmailTemplateRecord>(response);
  if (!envelope.data) {
    throw new Error("Unable to duplicate email template.");
  }
  return envelope.data;
}

export async function listEmailTemplateVersions(
  templateId: string | number
): Promise<{ items: EmailTemplateVersionRecord[]; count: number }> {
  const response = await apiFetch(API_PATHS.emailTemplates.versions(templateId));
  const payload = await parseEnvelope<{
    items?: EmailTemplateVersionRecord[];
    count?: number;
  }>(response);
  return {
    items: payload.data?.items || [],
    count: Number(payload.data?.count || 0),
  };
}

export async function previewEmailTemplate(
  payload: EmailTemplatePreviewPayload
): Promise<EmailTemplatePreviewResult> {
  const response = await apiFetch(API_PATHS.emailTemplates.previewInline, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const envelope = await parseEnvelope<EmailTemplatePreviewResult>(response);
  if (!envelope.data) {
    throw new Error("Unable to preview email template.");
  }
  return envelope.data;
}

export async function previewStoredEmailTemplate(payload: {
  templateId: string | number;
  data: EmailTemplatePreviewPayload;
}): Promise<EmailTemplatePreviewResult> {
  const response = await apiFetch(API_PATHS.emailTemplates.preview(payload.templateId), {
    method: "POST",
    body: JSON.stringify(payload.data),
  });
  const envelope = await parseEnvelope<EmailTemplatePreviewResult>(response);
  if (!envelope.data) {
    throw new Error("Unable to preview email template.");
  }
  return envelope.data;
}

export async function testSendEmailTemplate(payload: {
  templateId: string | number;
  data: EmailTemplateTestSendPayload;
}): Promise<Record<string, unknown>> {
  const response = await apiFetch(API_PATHS.emailTemplates.testSend(payload.templateId), {
    method: "POST",
    body: JSON.stringify(payload.data),
  });
  const envelope = await parseEnvelope<Record<string, unknown>>(response);
  if (!envelope.data) {
    throw new Error("Unable to send test email.");
  }
  return envelope.data;
}
