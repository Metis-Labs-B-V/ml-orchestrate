import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLButton,
  MLInput,
} from "ml-uikit";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import NodeContextMenu, {
  type ContextMenuEntry,
  type ContextMenuState,
} from "../../../components/scenarios/NodeContextMenu";
import ScenarioHistoryExplorer from "../../../components/scenarios/ScenarioHistoryExplorer";
import {
  createApiTokenConnection,
  startJiraOauth,
  activateScenario,
  getRun,
  listEmailTemplates,
  fetchIntegrationCatalog,
  getScenario,
  listConnections,
  previewStoredEmailTemplate,
  publishScenario,
  type RunSummary,
  runScenario,
  startJenkinsOauth,
  testConnection,
  testSendEmailTemplate,
  updateScenario,
} from "../../../lib/scenariosApi";
import type {
  EmailTemplatePreviewResult,
  EmailTemplateRecord,
} from "../../../types/emailTemplates";
import type {
  ConnectionRecord,
  IntegrationApp,
  IntegrationCatalog,
  IntegrationModule,
  ScenarioEdge,
  ScenarioGraph,
  ScenarioNode,
  ScenarioRecord,
} from "../../../types/scenarios";
import type { DashboardPage } from "../../../types/dashboard";

const DEFAULT_CATEGORIES = [
  { key: "all", label: "All apps" },
  { key: "featured", label: "Featured" },
  { key: "built_in", label: "Built-in tools" },
  { key: "productivity", label: "Productivity" },
  { key: "ai", label: "AI" },
];

const NODE_WIDTH = 220;
const NODE_HEIGHT = 108;
const NODE_START_X = 110;
const NODE_START_Y = 40;
const NODE_GAP_X = 300;
const NODE_GAP_Y = 170;
const RUN_TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled"]);

type NodeKind = "trigger" | "action" | "search" | "utility";
type NodeProvider = "jira" | "jenkins" | "hubspot" | "email" | "http" | "json" | "other";
type ModuleGroup = {
  label: string;
  modules: IntegrationModule[];
};

type CanvasPoint = {
  x: number;
  y: number;
};

type DragState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
};

type FloatingPanelDragState = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

type ConnectionDraft = {
  sourceNodeId: string;
  sourcePortType: string;
  start: CanvasPoint;
  current: CanvasPoint;
};

type NodeRuntimeMeta = {
  kind: NodeKind;
  acceptsInput: boolean;
  inputPortType: string;
  outputPortType: string;
};

type HttpAuthType = "none" | "basic" | "bearer" | "apiKey";
type HttpBodyType = "none" | "json" | "text";

type HttpPair = {
  key: string;
  value: string;
};

type HttpNodeFormState = {
  method: string;
  url: string;
  authType: HttpAuthType;
  basicUsername: string;
  basicPassword: string;
  bearerToken: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyIn: "header" | "query";
  headers: HttpPair[];
  query: HttpPair[];
  bodyType: HttpBodyType;
  bodyText: string;
  parseResponse: boolean;
  failOnHttpError: boolean;
  allowRedirects: boolean;
  timeoutSeconds: string;
};

type JsonFieldMapping = {
  id: string;
  fieldName: string;
  sourceType: "mapped" | "custom";
  sourceToken: string;
  customValue: string;
};

type JsonTokenOption = {
  token: string;
  label: string;
  nodeId: string;
};

type EmailComposeMode = "inline" | "template";

type EmailTemplateBindingRow = {
  id: string;
  variableName: string;
  label: string;
  required: boolean;
  sourceType: "mapped" | "custom";
  sourceToken: string;
  customValue: string;
};

type EmailTemplateNodeFormState = {
  composeMode: EmailComposeMode;
  templateId: string;
  to: string;
  cc: string;
  bcc: string;
  fromEmail: string;
  replyTo: string;
  subjectOverride: string;
  htmlOverride: string;
  textOverride: string;
  bindings: EmailTemplateBindingRow[];
};

type NodeContextActionId =
  | "run-module-only"
  | "add-error-handler"
  | "rename-module"
  | "clone-module"
  | "copy-module"
  | "add-note"
  | "delete-module";

type RunStepView = Record<string, unknown>;

const getScenarioIdFromPath = (pathname: string) => pathname.split("/").pop() || "";

const isNodeKind = (value: unknown): value is NodeKind =>
  value === "trigger" || value === "action" || value === "search" || value === "utility";

const normalizePortType = (value: unknown) => String(value || "").trim().toLowerCase() || "any";

const getNodeProvider = (nodeType: string): NodeProvider => {
  const prefix = String(nodeType || "").split(".")[0]?.toLowerCase();
  if (prefix === "jira") {
    return "jira";
  }
  if (prefix === "jenkins") {
    return "jenkins";
  }
  if (prefix === "hubspot") {
    return "hubspot";
  }
  if (prefix === "email") {
    return "email";
  }
  if (prefix === "http") {
    return "http";
  }
  if (prefix === "json") {
    return "json";
  }
  return "other";
};

const HUBSPOT_GROUP_ORDER = [
  "CRM Objects",
  "Records (Deals, Contacts, Companies)",
  "Custom Objects",
  "Contacts",
  "Deals",
  "Companies",
  "Engagements",
  "Events and Notifications",
  "Files",
  "Users",
  "Tickets",
  "Forms",
  "Workflows",
  "Subscriptions",
  "Quotes",
  "Other",
] as const;

const getHubspotModuleGroup = (moduleType: string): string => {
  if (moduleType.startsWith("hubspot.crm.objects.") || moduleType.startsWith("hubspot.crm.list.")) {
    return "CRM Objects";
  }
  if (moduleType === "hubspot.crm.record.property.get") {
    return "Records (Deals, Contacts, Companies)";
  }
  if (moduleType.startsWith("hubspot.custom_object.")) {
    return "Custom Objects";
  }
  if (moduleType.startsWith("hubspot.contact.")) {
    return "Contacts";
  }
  if (moduleType.startsWith("hubspot.deal.")) {
    return "Deals";
  }
  if (moduleType.startsWith("hubspot.company.")) {
    return "Companies";
  }
  if (moduleType.startsWith("hubspot.engagement.")) {
    return "Engagements";
  }
  if (moduleType.startsWith("hubspot.timeline.")) {
    return "Events and Notifications";
  }
  if (moduleType.startsWith("hubspot.file.")) {
    return "Files";
  }
  if (moduleType.startsWith("hubspot.owner.")) {
    return "Users";
  }
  if (moduleType.startsWith("hubspot.ticket.")) {
    return "Tickets";
  }
  if (moduleType.startsWith("hubspot.form.")) {
    return "Forms";
  }
  if (moduleType.startsWith("hubspot.workflow.")) {
    return "Workflows";
  }
  if (moduleType.startsWith("hubspot.subscription.")) {
    return "Subscriptions";
  }
  if (moduleType.startsWith("hubspot.quote.")) {
    return "Quotes";
  }
  return "Other";
};

const isPortTypeCompatible = (sourcePortType: string, targetPortType: string) => {
  const source = normalizePortType(sourcePortType);
  const target = normalizePortType(targetPortType);
  if (source === "any" || target === "any") {
    return true;
  }
  if (source === target) {
    return true;
  }
  if (source === "event" && (target === "event" || target === "data")) {
    return true;
  }
  return false;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const createDefaultHttpNodeForm = (): HttpNodeFormState => ({
  method: "GET",
  url: "",
  authType: "none",
  basicUsername: "",
  basicPassword: "",
  bearerToken: "",
  apiKeyName: "",
  apiKeyValue: "",
  apiKeyIn: "header",
  headers: [],
  query: [],
  bodyType: "none",
  bodyText: "",
  parseResponse: true,
  failOnHttpError: true,
  allowRedirects: true,
  timeoutSeconds: "30",
});

const objectToPairs = (value: unknown): HttpPair[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).map(([key, raw]) => ({
    key,
    value: raw === undefined || raw === null ? "" : String(raw),
  }));
};

const pairsToObject = (pairs: HttpPair[]): Record<string, string> => {
  const next: Record<string, string> = {};
  pairs.forEach((pair) => {
    const key = pair.key.trim();
    if (!key) {
      return;
    }
    next[key] = pair.value;
  });
  return next;
};

const flattenJsonPaths = (
  value: unknown,
  basePath: string,
  depth = 0,
  limit = 120
): JsonTokenOption[] => {
  if (depth > 4 || limit <= 0) {
    return [];
  }

  const options: JsonTokenOption[] = [];
  if (Array.isArray(value)) {
    const max = Math.min(value.length, 10);
    for (let index = 0; index < max; index += 1) {
      const childPath = `${basePath}[${index}]`;
      options.push({
        token: `{{${childPath}}}`,
        label: childPath,
        nodeId: basePath.split(".")[0] || basePath,
      });
      options.push(...flattenJsonPaths(value[index], childPath, depth + 1, limit - options.length));
      if (options.length >= limit) {
        break;
      }
    }
    return options;
  }

  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      if (options.length >= limit) {
        return;
      }
      const safeKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `["${key.replace(/"/g, '\\"')}"]`;
      const childPath = `${basePath}.${safeKey}`;
      options.push({
        token: `{{${childPath}}}`,
        label: childPath,
        nodeId: basePath.split(".")[0] || basePath,
      });
      options.push(...flattenJsonPaths(child, childPath, depth + 1, limit - options.length));
    });
  }
  return options;
};

const isTokenExpression = (value: string) => /^\s*\{\{.*\}\}\s*$/.test(value || "");

const JSON_TEMPLATE_TOKEN_RE = /\{\{\s*.*?\s*\}\}/g;
const QUOTED_JSON_TEMPLATE_TOKEN_RE = /"\s*(\{\{\s*.*?\s*\}\})\s*"/g;
const JSON_TOKEN_PLACEHOLDER_PREFIX = "__METIS_JSON_TOKEN__";

const normalizeJsonTemplateForParse = (raw: string): { normalized: string; tokens: string[] } => {
  const tokens: string[] = [];
  let index = 0;
  const createPlaceholder = (token: string) => {
    const trimmed = token.trim();
    const placeholder = `${JSON_TOKEN_PLACEHOLDER_PREFIX}${index}__`;
    tokens.push(trimmed);
    index += 1;
    return placeholder;
  };

  let normalized = raw.replace(QUOTED_JSON_TEMPLATE_TOKEN_RE, (_match, token: string) => {
    return `"${createPlaceholder(token)}"`;
  });

  normalized = normalized.replace(JSON_TEMPLATE_TOKEN_RE, (token) => {
    return `"${createPlaceholder(token)}"`;
  });

  return { normalized, tokens };
};

const restoreJsonTemplateTokens = (raw: string, tokens: string[]): string => {
  let restored = raw;
  tokens.forEach((token, index) => {
    const quotedPlaceholder = `"${JSON_TOKEN_PLACEHOLDER_PREFIX}${index}__"`;
    restored = restored.split(quotedPlaceholder).join(`"${token}"`);
  });
  return restored;
};

const beautifyJsonTemplate = (raw: string): { value: string; error: string } => {
  const text = raw.trim();
  if (!text) {
    return { value: "", error: "" };
  }
  try {
    const { normalized, tokens } = normalizeJsonTemplateForParse(raw);
    const parsed = JSON.parse(normalized);
    const pretty = JSON.stringify(parsed, null, 2);
    return { value: restoreJsonTemplateTokens(pretty, tokens), error: "" };
  } catch {
    return {
      value: raw,
      error:
        "Body JSON is invalid. For mapped string values use quotes, e.g. \"email\": \"{{node_x.body.email}}\".",
    };
  }
};

const parseCustomJsonFieldValue = (value: string): unknown => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeJsonFieldMappings = (config: Record<string, unknown>): JsonFieldMapping[] => {
  const payload = config.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  return Object.entries(payload as Record<string, unknown>).map(([fieldName, value], index) => {
    const isMappedValue = typeof value === "string" && isTokenExpression(value);
    return {
      id: `json_map_${index}_${Date.now()}`,
      fieldName,
      sourceType: isMappedValue ? "mapped" : "custom",
      sourceToken: isMappedValue ? value.trim() : "",
      customValue:
        isMappedValue || value === undefined || value === null
          ? ""
          : typeof value === "string"
            ? value
            : JSON.stringify(value),
    };
  });
};

const normalizeHttpNodeForm = (config: Record<string, unknown>): HttpNodeFormState => {
  const next = createDefaultHttpNodeForm();
  const method = String(config.method || "GET").toUpperCase();
  next.method = method || "GET";
  next.url = String(config.url || config.endpoint || "");

  const authType = String(config.authType || "none");
  if (authType === "basic" || authType === "bearer" || authType === "apiKey") {
    next.authType = authType;
  }
  next.basicUsername = String(config.basicUsername || "");
  next.basicPassword = String(config.basicPassword || "");
  next.bearerToken = String(config.bearerToken || "");
  next.apiKeyName = String(config.apiKeyName || "");
  next.apiKeyValue = String(config.apiKeyValue || "");
  next.apiKeyIn = String(config.apiKeyIn || "header").toLowerCase() === "query" ? "query" : "header";

  next.headers = objectToPairs(config.headers);
  next.query = objectToPairs(config.query ?? config.params);

  const bodyTypeRaw = String(config.bodyType || "").toLowerCase();
  if (bodyTypeRaw === "json" || bodyTypeRaw === "text" || bodyTypeRaw === "none") {
    next.bodyType = bodyTypeRaw;
  } else if (config.body !== undefined && config.body !== null && config.body !== "") {
    next.bodyType = typeof config.body === "string" ? "text" : "json";
  }

  const bodyValue = config.body;
  if (bodyValue !== undefined && bodyValue !== null && bodyValue !== "") {
    if (typeof bodyValue === "string") {
      next.bodyText = bodyValue;
    } else {
      next.bodyText = JSON.stringify(bodyValue, null, 2);
    }
  }

  if (typeof config.parseResponse === "boolean") {
    next.parseResponse = config.parseResponse;
  }
  if (typeof config.failOnHttpError === "boolean") {
    next.failOnHttpError = config.failOnHttpError;
  }
  if (typeof config.allowRedirects === "boolean") {
    next.allowRedirects = config.allowRedirects;
  }
  if (config.timeoutSeconds !== undefined && config.timeoutSeconds !== null) {
    next.timeoutSeconds = String(config.timeoutSeconds);
  }

  return next;
};

const buildHttpNodeConfig = (state: HttpNodeFormState): Record<string, unknown> => {
  const config: Record<string, unknown> = {
    method: state.method.toUpperCase(),
    url: state.url.trim(),
    authType: state.authType,
    parseResponse: state.parseResponse,
    failOnHttpError: state.failOnHttpError,
    allowRedirects: state.allowRedirects,
  };
  const timeout = Number(state.timeoutSeconds);
  if (Number.isFinite(timeout) && timeout > 0) {
    config.timeoutSeconds = Math.min(300, Math.max(1, Math.floor(timeout)));
  }
  const headers = pairsToObject(state.headers);
  if (Object.keys(headers).length) {
    config.headers = headers;
  }
  const query = pairsToObject(state.query);
  if (Object.keys(query).length) {
    config.query = query;
  }

  if (state.authType === "basic") {
    config.basicUsername = state.basicUsername.trim();
    config.basicPassword = state.basicPassword;
  } else if (state.authType === "bearer") {
    config.bearerToken = state.bearerToken.trim();
  } else if (state.authType === "apiKey") {
    config.apiKeyName = state.apiKeyName.trim();
    config.apiKeyValue = state.apiKeyValue;
    config.apiKeyIn = state.apiKeyIn;
  }

  if (state.bodyType !== "none") {
    config.bodyType = state.bodyType;
    if (state.bodyText.trim()) {
      config.body = state.bodyText;
    }
  }
  return config;
};

const createDefaultEmailTemplateNodeForm = (): EmailTemplateNodeFormState => ({
  composeMode: "inline",
  templateId: "",
  to: "",
  cc: "",
  bcc: "",
  fromEmail: "",
  replyTo: "",
  subjectOverride: "",
  htmlOverride: "",
  textOverride: "",
  bindings: [],
});

const normalizeEmailList = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
};

const normalizeEmailTemplateBindings = (config: Record<string, unknown>): EmailTemplateBindingRow[] => {
  const mappedValues =
    asRecord(config.templateBindings) || asRecord(config.bindings) || {};
  const literalValues =
    asRecord(config.templatePayload) || asRecord(config.payload) || {};

  const rows: EmailTemplateBindingRow[] = [];
  const keys = new Set<string>([
    ...Object.keys(mappedValues),
    ...Object.keys(literalValues),
  ]);
  Array.from(keys).forEach((key, index) => {
    const mappedValue = mappedValues[key];
    const literalValue = literalValues[key];
    const mappedToken =
      typeof mappedValue === "string" && isTokenExpression(mappedValue) ? mappedValue.trim() : "";
    rows.push({
      id: `email_template_binding_${key}_${index}`,
      variableName: key,
      label: key,
      required: false,
      sourceType: mappedToken ? "mapped" : "custom",
      sourceToken: mappedToken,
      customValue:
        mappedToken || literalValue === undefined || literalValue === null
          ? ""
          : typeof literalValue === "string"
            ? literalValue
            : JSON.stringify(literalValue),
    });
  });
  return rows;
};

const normalizeEmailTemplateNodeForm = (
  config: Record<string, unknown>
): EmailTemplateNodeFormState => ({
  composeMode:
    String(config.composeMode || "inline").toLowerCase() === "template" ? "template" : "inline",
  templateId: String(config.templateId || ""),
  to: normalizeEmailList(config.to),
  cc: normalizeEmailList(config.cc),
  bcc: normalizeEmailList(config.bcc),
  fromEmail: String(config.from || config.fromEmail || ""),
  replyTo: String(config.replyTo || ""),
  subjectOverride: String(config.subjectOverride || ""),
  htmlOverride: String(config.htmlOverride || ""),
  textOverride: String(config.textOverride || ""),
  bindings: normalizeEmailTemplateBindings(config),
});

const parseCommaSeparatedList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const extractTokenPath = (token: string): string => {
  const match = token.match(/^\s*\{\{\s*(.*?)\s*\}\}\s*$/);
  return match?.[1] || "";
};

const parseTokenSegments = (path: string): Array<string | number> => {
  const segments: Array<string | number> = [];
  let current = "";
  for (let index = 0; index < path.length; index += 1) {
    const char = path[index];
    if (char === ".") {
      if (current) {
        segments.push(current);
        current = "";
      }
      continue;
    }
    if (char === "[") {
      if (current) {
        segments.push(current);
        current = "";
      }
      const endIndex = path.indexOf("]", index);
      if (endIndex === -1) {
        break;
      }
      const raw = path.slice(index + 1, endIndex).trim();
      if (/^\d+$/.test(raw)) {
        segments.push(Number(raw));
      } else {
        segments.push(raw.replace(/^["']|["']$/g, ""));
      }
      index = endIndex;
      continue;
    }
    current += char;
  }
  if (current) {
    segments.push(current);
  }
  return segments;
};

const getValueAtTokenPath = (source: unknown, segments: Array<string | number>): unknown => {
  let current = source;
  for (const segment of segments) {
    if (typeof segment === "number") {
      if (!Array.isArray(current) || current[segment] === undefined) {
        return undefined;
      }
      current = current[segment];
      continue;
    }
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const getRunStepId = (step: RunStepView, index: number): string => {
  const id = step.id;
  if (typeof id === "string" || typeof id === "number") {
    return String(id);
  }
  const nodeId = step.node_id;
  if (typeof nodeId === "string" && nodeId.trim()) {
    return nodeId;
  }
  return `step_${index + 1}`;
};

const getRunStepStatus = (step: RunStepView): string =>
  String(step.status || "unknown").trim().toLowerCase() || "unknown";

const getRunStepErrorMessage = (step: RunStepView): string => {
  const errorJson = asRecord(step.error_json);
  if (!errorJson) {
    return "";
  }
  const message = errorJson.message;
  if (typeof message === "string") {
    return message;
  }
  return "";
};

const hasRunSectionValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  const record = asRecord(value);
  if (record) {
    return Object.keys(record).length > 0;
  }
  return true;
};

const formatRunLabel = (value: unknown): string => {
  const raw = String(value || "unknown").trim();
  if (!raw) {
    return "Unknown";
  }
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
};

const formatRunDateTime = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "n/a";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatRunDurationMs = (value: unknown): string => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  const seconds = value / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
};

const parseHeaderValue = (value: string): HttpPair | null => {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  const key = value.slice(0, separatorIndex).trim();
  const headerValue = value.slice(separatorIndex + 1).trim();
  if (!key) {
    return null;
  }
  return { key, value: headerValue };
};

const tokenizeCurlCommand = (raw: string): string[] => {
  const normalized = raw.replace(/\\\r?\n/g, " ").trim();
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (quote) {
    throw new Error("Unclosed quotes in cURL command.");
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
};

const trySplitUrlAndQuery = (
  rawUrl: string
): { url: string; queryPairs: HttpPair[] } => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { url: "", queryPairs: [] };
  }

  const questionIndex = trimmed.indexOf("?");
  if (questionIndex < 0) {
    return { url: trimmed, queryPairs: [] };
  }

  const baseUrl = trimmed.slice(0, questionIndex).trim();
  const rawQuery = trimmed.slice(questionIndex + 1);
  const search = new URLSearchParams(rawQuery);
  const queryPairs: HttpPair[] = [];
  search.forEach((value, key) => {
    queryPairs.push({ key, value });
  });
  return { url: baseUrl, queryPairs };
};

const parseCurlToHttpNodeForm = (
  curlCommand: string,
  previous: HttpNodeFormState
): HttpNodeFormState => {
  const tokens = tokenizeCurlCommand(curlCommand);
  if (!tokens.length || tokens[0].toLowerCase() !== "curl") {
    throw new Error("Paste a valid cURL command starting with `curl`.");
  }

  let method = "GET";
  let rawUrl = "";
  const headers: HttpPair[] = [];
  const queryPairs: HttpPair[] = [];
  const dataChunks: string[] = [];
  let forceGet = false;
  let authType: HttpAuthType = "none";
  let basicUsername = "";
  let basicPassword = "";
  let bearerToken = "";
  let apiKeyName = "";
  let apiKeyValue = "";
  let apiKeyIn: "header" | "query" = "header";
  let contentTypeHeader = "";

  const consumeValue = (index: number): string => {
    const value = tokens[index + 1];
    if (!value) {
      throw new Error(`Missing value for flag ${tokens[index]}.`);
    }
    return value;
  };

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.toLowerCase();

    if ((token === "-X" || lower === "--request") && index + 1 < tokens.length) {
      method = consumeValue(index).toUpperCase();
      index += 1;
      continue;
    }

    if ((token === "-H" || lower === "--header") && index + 1 < tokens.length) {
      const parsed = parseHeaderValue(consumeValue(index));
      if (parsed) {
        const headerName = parsed.key.trim().toLowerCase();
        if (headerName === "authorization") {
          const authValue = parsed.value.trim();
          if (/^bearer\s+/i.test(authValue)) {
            authType = "bearer";
            bearerToken = authValue.replace(/^bearer\s+/i, "").trim();
          } else {
            headers.push(parsed);
          }
        } else if (headerName === "content-type") {
          contentTypeHeader = parsed.value.trim().toLowerCase();
          headers.push(parsed);
        } else {
          headers.push(parsed);
        }
      }
      index += 1;
      continue;
    }

    if ((token === "-u" || lower === "--user") && index + 1 < tokens.length) {
      const userInfo = consumeValue(index);
      const [username, ...passwordParts] = userInfo.split(":");
      authType = "basic";
      basicUsername = username || "";
      basicPassword = passwordParts.join(":");
      index += 1;
      continue;
    }

    if (token === "-G" || lower === "--get") {
      forceGet = true;
      method = "GET";
      continue;
    }

    if (token === "-I" || lower === "--head") {
      method = "HEAD";
      continue;
    }

    if (token === "--url" && index + 1 < tokens.length) {
      rawUrl = consumeValue(index);
      index += 1;
      continue;
    }

    if (
      token === "-d" ||
      lower === "--data" ||
      lower === "--data-raw" ||
      lower === "--data-binary" ||
      lower === "--data-urlencode"
    ) {
      if (index + 1 < tokens.length) {
        dataChunks.push(consumeValue(index));
        index += 1;
      }
      continue;
    }

    if (lower === "--compressed" || token === "-L" || lower === "--location") {
      continue;
    }

    if (!token.startsWith("-") && !rawUrl) {
      rawUrl = token;
    }
  }

  if (!rawUrl) {
    throw new Error("Could not detect URL in cURL command.");
  }

  const split = trySplitUrlAndQuery(rawUrl);
  if (split.queryPairs.length) {
    queryPairs.push(...split.queryPairs);
  }

  if (forceGet && dataChunks.length) {
    dataChunks.forEach((chunk) => {
      const parts = new URLSearchParams(chunk);
      parts.forEach((value, key) => {
        queryPairs.push({ key, value });
      });
    });
  }

  const dataText = dataChunks.join(forceGet ? "&" : "");
  let bodyType: HttpBodyType = "none";
  let bodyText = "";
  if (!forceGet && dataText) {
    const trimmed = dataText.trim();
    const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
    const contentSuggestsJson = contentTypeHeader.includes("application/json");
    if (looksJson || contentSuggestsJson) {
      bodyType = "json";
      bodyText = dataText;
    } else {
      bodyType = "text";
      bodyText = dataText;
    }
    if (method === "GET") {
      method = "POST";
    }
  }

  return {
    ...createDefaultHttpNodeForm(),
    parseResponse: previous.parseResponse,
    failOnHttpError: previous.failOnHttpError,
    allowRedirects: previous.allowRedirects,
    timeoutSeconds: previous.timeoutSeconds,
    method,
    url: split.url || rawUrl,
    authType,
    basicUsername,
    basicPassword,
    bearerToken,
    apiKeyName,
    apiKeyValue,
    apiKeyIn,
    headers,
    query: queryPairs,
    bodyType,
    bodyText,
  };
};

const getDefaultNodePosition = (index: number): CanvasPoint => {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: NODE_START_X + col * NODE_GAP_X,
    y: NODE_START_Y + row * NODE_GAP_Y,
  };
};

const buildEdgePath = (start: CanvasPoint, end: CanvasPoint) => {
  const controlOffset = Math.max(80, Math.abs(end.x - start.x) * 0.4);
  return `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;
};

const getFlowTailNode = (nodes: ScenarioNode[], edges: ScenarioEdge[]) => {
  if (!nodes.length) {
    return null;
  }
  const outgoingSources = new Set(edges.map((edge) => edge.source));
  const terminalNodes = nodes.filter((node) => !outgoingSources.has(node.id));
  const candidates = terminalNodes.length ? terminalNodes : nodes;
  return candidates.reduce((bestNode, currentNode) => {
    const bestX = bestNode.position?.x ?? NODE_START_X;
    const bestY = bestNode.position?.y ?? NODE_START_Y;
    const currentX = currentNode.position?.x ?? NODE_START_X;
    const currentY = currentNode.position?.y ?? NODE_START_Y;
    if (currentX > bestX) {
      return currentNode;
    }
    if (currentX === bestX && currentY > bestY) {
      return currentNode;
    }
    return bestNode;
  });
};

const wouldCreateCycle = (
  nodes: ScenarioNode[],
  edges: ScenarioEdge[],
  sourceId: string,
  targetId: string
) => {
  const adjacency = new Map<string, string[]>();
  nodes.forEach((node) => adjacency.set(node.id, []));
  edges.forEach((edge) => {
    const targets = adjacency.get(edge.source);
    if (targets) {
      targets.push(edge.target);
    }
  });
  const sourceTargets = adjacency.get(sourceId);
  if (sourceTargets) {
    sourceTargets.push(targetId);
  }

  const stack = [targetId];
  const visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    if (current === sourceId) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const next = adjacency.get(current) || [];
    next.forEach((nodeId) => {
      if (!visited.has(nodeId)) {
        stack.push(nodeId);
      }
    });
  }
  return false;
};

const ensureGraphShape = (graph?: ScenarioGraph | null): ScenarioGraph => {
  const rawNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const nodes: ScenarioNode[] = rawNodes.map((node, index) => {
    const fallbackPosition = getDefaultNodePosition(index);
    const x = Number.isFinite(node?.position?.x) ? Number(node.position?.x) : fallbackPosition.x;
    const y = Number.isFinite(node?.position?.y) ? Number(node.position?.y) : fallbackPosition.y;
    const kind = isNodeKind(node?.kind) ? node.kind : undefined;
    return {
      id: String(node?.id || `node_${index + 1}`),
      type: String(node?.type || ""),
      title: String(node?.title || node?.type || `Node ${index + 1}`),
      app: String(node?.app || "Module"),
      kind,
      acceptsInput: typeof node?.acceptsInput === "boolean" ? node.acceptsInput : undefined,
      inputPortType:
        typeof node?.inputPortType === "string" ? String(node.inputPortType) : undefined,
      outputPortType:
        typeof node?.outputPortType === "string" ? String(node.outputPortType) : undefined,
      position: { x, y },
      config:
        node?.config && typeof node.config === "object" && !Array.isArray(node.config)
          ? (node.config as Record<string, unknown>)
          : {},
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const rawEdges = Array.isArray(graph?.edges) ? graph.edges : [];
  const edges: ScenarioEdge[] = rawEdges
    .filter((edge) => nodeIds.has(String(edge?.source || "")) && nodeIds.has(String(edge?.target || "")))
    .map((edge, index) => ({
      id: String(edge?.id || `edge_${index + 1}`),
      source: String(edge.source),
      target: String(edge.target),
      sourceHandle:
        typeof edge?.sourceHandle === "string" ? String(edge.sourceHandle) : undefined,
      targetHandle:
        typeof edge?.targetHandle === "string" ? String(edge.targetHandle) : undefined,
      sourcePortType:
        typeof edge?.sourcePortType === "string" ? String(edge.sourcePortType) : undefined,
      targetPortType:
        typeof edge?.targetPortType === "string" ? String(edge.targetPortType) : undefined,
      label: typeof edge?.label === "string" ? String(edge.label) : undefined,
    }));

  return { nodes, edges };
};

const ScenarioCanvasPage: DashboardPage = () => {
  const router = useRouter();
  const pathname = usePathname() || "";
  const scenarioId = useMemo(() => getScenarioIdFromPath(pathname), [pathname]);

  const [scenario, setScenario] = useState<ScenarioRecord | null>(null);
  const [activeScenarioView, setActiveScenarioView] = useState<"canvas" | "history" | "audit">(
    "canvas"
  );
  const [catalog, setCatalog] = useState<IntegrationCatalog>({
    categories: DEFAULT_CATEGORIES,
    apps: [],
  });
  const [graph, setGraph] = useState<ScenarioGraph>({ nodes: [], edges: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<RunSummary | null>(null);
  const [isRefreshingRunOutput, setIsRefreshingRunOutput] = useState(false);
  const [isRunOutputMinimized, setIsRunOutputMinimized] = useState(false);
  const [expandedRunSteps, setExpandedRunSteps] = useState<Record<string, boolean>>({});
  const [expandedRunSections, setExpandedRunSections] = useState<Record<string, boolean>>({});
  const [runOutputPosition, setRunOutputPosition] = useState<CanvasPoint | null>(null);
  const [runOutputDragState, setRunOutputDragState] =
    useState<FloatingPanelDragState | null>(null);
  const [curlImportText, setCurlImportText] = useState("");
  const [curlImportError, setCurlImportError] = useState("");

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [selectedApp, setSelectedApp] = useState<IntegrationApp | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [nodeConnection, setNodeConnection] = useState("");
  const [nodeConfigJson, setNodeConfigJson] = useState("{}");
  const [nodeConfigError, setNodeConfigError] = useState("");
  const [httpNodeForm, setHttpNodeForm] = useState<HttpNodeFormState>(createDefaultHttpNodeForm);
  const [httpFocusedField, setHttpFocusedField] = useState("");
  const [httpTokenPickerValue, setHttpTokenPickerValue] = useState("");
  const [httpBearerTokenPickerValue, setHttpBearerTokenPickerValue] = useState("");
  const [nodeConfigTokenPickerValue, setNodeConfigTokenPickerValue] = useState("");
  const [jsonFieldMappings, setJsonFieldMappings] = useState<JsonFieldMapping[]>([]);
  const [emailNodeForm, setEmailNodeForm] = useState<EmailTemplateNodeFormState>(
    createDefaultEmailTemplateNodeForm
  );
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateRecord[]>([]);
  const [isEmailTemplatesLoading, setIsEmailTemplatesLoading] = useState(false);
  const [emailTemplatePreview, setEmailTemplatePreview] =
    useState<EmailTemplatePreviewResult | null>(null);
  const [emailTemplatePreviewError, setEmailTemplatePreviewError] = useState("");
  const [isEmailTemplatePreviewLoading, setIsEmailTemplatePreviewLoading] = useState(false);
  const [isEmailTemplateTestSending, setIsEmailTemplateTestSending] = useState(false);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [isConnectionsLoading, setIsConnectionsLoading] = useState(false);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [connectionModalError, setConnectionModalError] = useState("");
  const [connectionModalStatus, setConnectionModalStatus] = useState("");
  const [isCreatingConnection, setIsCreatingConnection] = useState(false);
  const [jiraConnectionAuthMode, setJiraConnectionAuthMode] = useState<"apiToken" | "oauth">(
    "oauth"
  );
  const [jiraConnectionName, setJiraConnectionName] = useState("Jira Cloud Platform connection");
  const [jiraServiceUrl, setJiraServiceUrl] = useState("");
  const [jiraOauthServiceUrl, setJiraOauthServiceUrl] = useState("");
  const [jiraUsername, setJiraUsername] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [jenkinsConnectionName, setJenkinsConnectionName] = useState("Jenkins OAuth connection");
  const [jenkinsBaseUrl, setJenkinsBaseUrl] = useState("");
  const [hubspotConnectionName, setHubspotConnectionName] = useState("HubSpot CRM connection");
  const [hubspotServiceUrl, setHubspotServiceUrl] = useState("https://api.hubapi.com");
  const [hubspotAccessToken, setHubspotAccessToken] = useState("");
  const [emailConnectionAuthMode, setEmailConnectionAuthMode] = useState<"apiToken" | "oauth">(
    "apiToken"
  );
  const [emailConnectionName, setEmailConnectionName] = useState("Email connection");
  const [emailUsername, setEmailUsername] = useState("");
  const [emailDefaultFromEmail, setEmailDefaultFromEmail] = useState("");
  const [emailSmtpHost, setEmailSmtpHost] = useState("");
  const [emailSmtpPort, setEmailSmtpPort] = useState("587");
  const [emailSmtpUseSsl, setEmailSmtpUseSsl] = useState(false);
  const [emailSmtpUseStarttls, setEmailSmtpUseStarttls] = useState(true);
  const [emailSmtpPassword, setEmailSmtpPassword] = useState("");
  const [emailSmtpAccessToken, setEmailSmtpAccessToken] = useState("");
  const [emailImapHost, setEmailImapHost] = useState("");
  const [emailImapPort, setEmailImapPort] = useState("993");
  const [emailImapUseSsl, setEmailImapUseSsl] = useState(true);
  const [emailImapPassword, setEmailImapPassword] = useState("");
  const [emailImapAccessToken, setEmailImapAccessToken] = useState("");
  const [emailMailbox, setEmailMailbox] = useState("INBOX");

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({ open: false });

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasBodyRef = useRef<HTMLDivElement | null>(null);
  const runOutputRef = useRef<HTMLElement | null>(null);
  const nodeConfigTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const httpBodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const graphRef = useRef<ScenarioGraph>({ nodes: [], edges: [] });
  const dragMovedRef = useRef(false);
  const runPollRequestRef = useRef(0);

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(
    () => () => {
      runPollRequestRef.current += 1;
    },
    []
  );

  const updateGraphState = useCallback((nextGraph: ScenarioGraph) => {
    setGraph(nextGraph);
    graphRef.current = nextGraph;
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuState({ open: false });
  }, []);

  const moduleIndex = useMemo(() => {
    const index = new Map<string, IntegrationModule>();
    catalog.apps.forEach((app) => {
      app.modules.forEach((module) => {
        index.set(module.type, module);
      });
    });
    return index;
  }, [catalog.apps]);

  const getNodeMeta = useCallback(
    (node: ScenarioNode): NodeRuntimeMeta => {
      const module = moduleIndex.get(node.type);
      const fallbackKind = node.type.includes(".watch.") ? "trigger" : "action";
      const rawKind = node.kind ?? module?.kind ?? fallbackKind;
      const kind: NodeKind = isNodeKind(rawKind) ? rawKind : "action";
      const acceptsInput =
        typeof node.acceptsInput === "boolean"
          ? node.acceptsInput
          : typeof module?.acceptsInput === "boolean"
            ? module.acceptsInput
            : kind !== "trigger";
      const inputPortType =
        typeof node.inputPortType === "string"
          ? node.inputPortType
          : typeof module?.inputPortType === "string"
            ? module.inputPortType
            : "event";
      const outputPortType =
        typeof node.outputPortType === "string"
          ? node.outputPortType
          : typeof module?.outputPortType === "string"
            ? module.outputPortType
            : "event";
      return {
        kind,
        acceptsInput,
        inputPortType: normalizePortType(inputPortType),
        outputPortType: normalizePortType(outputPortType),
      };
    },
    [moduleIndex]
  );

  const selectedNode = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) || null,
    [graph.nodes, selectedNodeId]
  );

  const selectedEdge = useMemo(
    () => graph.edges.find((edge) => edge.id === selectedEdgeId) || null,
    [graph.edges, selectedEdgeId]
  );
  const selectedNodeMeta = useMemo(
    () => (selectedNode ? getNodeMeta(selectedNode) : null),
    [getNodeMeta, selectedNode]
  );
  const isSelectedTriggerNode = selectedNodeMeta?.kind === "trigger";
  const isSelectedHttpRequestNode = selectedNode?.type === "http.make_request";
  const isSelectedJsonCreateNode = selectedNode?.type === "json.create";
  const isSelectedEmailSendNode = selectedNode?.type === "email.send";

  const selectedNodeProvider = useMemo<NodeProvider>(
    () => (selectedNode ? getNodeProvider(selectedNode.type) : "other"),
    [selectedNode]
  );

  const selectedNodeNeedsConnection = useMemo(
    () =>
      selectedNodeProvider === "jira" ||
      selectedNodeProvider === "jenkins" ||
      selectedNodeProvider === "hubspot" ||
      selectedNodeProvider === "email",
    [selectedNodeProvider]
  );

  const nodeConfigHintText = useMemo(() => {
    if (selectedNodeProvider === "jira") {
      return "Add node-specific Jira payload here. `connectionId` is managed by the connection field.";
    }
    if (selectedNodeProvider === "jenkins") {
      return "Add Jenkins API call payload here. `connectionId` is managed by the connection field.";
    }
    if (selectedNodeProvider === "hubspot") {
      return "Add HubSpot operation payload here. `connectionId` is managed by the connection field.";
    }
    if (selectedNodeProvider === "email") {
      if (selectedNode?.type === "email.send") {
        return "Use `to`, `cc`, `bcc`, `subject`, `bodyText`/`bodyHtml`, and optional `attachments` (base64).";
      }
      if (selectedNode?.type === "email.watch.inbox") {
        return "Use `mailbox`, `search`, `maxMessages`, `markAsSeen` for IMAP trigger polling.";
      }
      return "Add Email operation payload here. `connectionId` is managed by the connection field.";
    }
    if (selectedNodeProvider === "json") {
      return "Use `payload` to create JSON output. Example: {\"payload\":{\"dealId\":\"{{http_1.body.id}}\"}}";
    }
    return "Add node-specific payload here.";
  }, [selectedNode, selectedNodeProvider]);

  const nodeById = useMemo(() => {
    const map = new Map<string, ScenarioNode>();
    graph.nodes.forEach((node) => {
      map.set(node.id, node);
    });
    return map;
  }, [graph.nodes]);

  const handleJumpToCanvasNode = useCallback(
    (nodeId: string) => {
      setActiveScenarioView("canvas");
      setSelectedNodeId(nodeId);
      setSelectedEdgeId("");
      setConnectionDraft(null);
      closeContextMenu();
    },
    [closeContextMenu]
  );

  const flowTailNode = useMemo(
    () => getFlowTailNode(graph.nodes, graph.edges),
    [graph.edges, graph.nodes]
  );

  const selectedEmailTemplate = useMemo(
    () =>
      emailTemplates.find((template) => String(template.id) === emailNodeForm.templateId) || null,
    [emailNodeForm.templateId, emailTemplates]
  );

  const floatingPlusPosition = useMemo(() => {
    if (!flowTailNode || !graph.nodes.length) {
      return null as CanvasPoint | null;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    const maxX = Math.max(16, (rect?.width || 1400) - 62 - 16);
    const maxY = Math.max(16, (rect?.height || 700) - 62 - 16);
    const baseX = (flowTailNode.position?.x ?? NODE_START_X) + NODE_WIDTH + 24;
    const baseY = (flowTailNode.position?.y ?? NODE_START_Y) + NODE_HEIGHT / 2 - 31;
    return {
      x: clamp(baseX, 16, maxX),
      y: clamp(baseY, 16, maxY),
    };
  }, [flowTailNode, graph.nodes.length]);

  const contextMenuNode = useMemo(() => {
    if (!contextMenuState.open) {
      return null;
    }
    return nodeById.get(contextMenuState.nodeId) || null;
  }, [contextMenuState, nodeById]);

  useEffect(() => {
    if (contextMenuState.open && !contextMenuNode) {
      closeContextMenu();
    }
  }, [closeContextMenu, contextMenuNode, contextMenuState.open]);

  const contextMenuEntries = useMemo<ContextMenuEntry[]>(() => {
    if (!contextMenuNode) {
      return [];
    }

    return [
      { type: "header", label: "Settings" },
      {
        type: "item",
        id: "run-module-only",
        label: "Run this module only",
        disabled: true,
      },
      {
        type: "item",
        id: "add-error-handler",
        label: "Add error handler",
        disabled: true,
      },
      { type: "item", id: "rename-module", label: "Rename" },
      { type: "item", id: "clone-module", label: "Clone" },
      { type: "item", id: "copy-module", label: "Copy module" },
      {
        type: "item",
        id: "add-note",
        label: "Add a note",
        disabled: true,
      },
      { type: "divider" },
      {
        type: "item",
        id: "delete-module",
        label: "Delete module",
        disabled: isSaving,
        danger: true,
      },
    ];
  }, [contextMenuNode, isSaving]);

  const priorNodeIdsForSelectedNode = useMemo(() => {
    if (!selectedNode) {
      return [] as string[];
    }

    const selectedId = selectedNode.id;
    const reverseAdjacency = new Map<string, string[]>();
    graph.edges.forEach((edge) => {
      const current = reverseAdjacency.get(edge.target) || [];
      current.push(edge.source);
      reverseAdjacency.set(edge.target, current);
    });

    const ancestors = new Set<string>();
    const stack = [...(reverseAdjacency.get(selectedId) || [])];
    while (stack.length) {
      const nodeId = stack.pop();
      if (!nodeId || ancestors.has(nodeId)) {
        continue;
      }
      ancestors.add(nodeId);
      (reverseAdjacency.get(nodeId) || []).forEach((parentId) => stack.push(parentId));
    }

    if (ancestors.size) {
      return graph.nodes.filter((node) => ancestors.has(node.id)).map((node) => node.id);
    }

    const selectedIndex = graph.nodes.findIndex((node) => node.id === selectedId);
    if (selectedIndex <= 0) {
      return graph.nodes.filter((node) => node.id !== selectedId).map((node) => node.id);
    }
    return graph.nodes.slice(0, selectedIndex).map((node) => node.id);
  }, [graph.edges, graph.nodes, selectedNode]);

  const runStepOutputByNodeId = useMemo(() => {
    const stepMap = new Map<string, unknown>();
    const steps = Array.isArray(runOutput?.steps) ? runOutput.steps : [];
    steps.forEach((step) => {
      if (!step || typeof step !== "object") {
        return;
      }
      const nodeId = String((step as Record<string, unknown>).node_id || "");
      if (!nodeId) {
        return;
      }
      const output = (step as Record<string, unknown>).output_raw_json;
      stepMap.set(nodeId, output);
    });
    return stepMap;
  }, [runOutput]);

  const runSteps = useMemo(() => {
    const steps = runOutput?.steps;
    if (!Array.isArray(steps)) {
      return [] as RunStepView[];
    }
    return steps.filter((step): step is RunStepView => Boolean(asRecord(step)));
  }, [runOutput]);

  const runOutputMetadata = useMemo(
    () => asRecord(runOutput?.metadata) || {},
    [runOutput]
  );

  const runStepCounts = useMemo(() => {
    const counts: Record<string, number> = {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      canceled: 0,
      unknown: 0,
    };
    runSteps.forEach((step) => {
      const status = getRunStepStatus(step);
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [runSteps]);

  const runLifecycleSummary = useMemo(() => {
    const nodeCount = Number(runOutputMetadata.node_count || 0);
    const executedNodes = Number(runOutputMetadata.executed_nodes || 0);
    const startedAt = runOutput?.started_at || null;
    const endedAt = runOutput?.ended_at || null;
    const queuedAt = runOutput?.queued_at || null;
    const durationMs =
      startedAt && endedAt
        ? Math.max(new Date(endedAt).getTime() - new Date(startedAt).getTime(), 0)
        : null;
    return {
      runId: runOutput?.id || null,
      status: String(runOutput?.status || "unknown").toLowerCase(),
      triggerType: formatRunLabel(runOutput?.trigger_type || "manual"),
      queuedAt,
      startedAt,
      endedAt,
      durationMs,
      attemptCount: Number(runOutput?.attempt_count || 0),
      nodeCount: nodeCount > 0 ? nodeCount : runSteps.length,
      executedNodes: executedNodes > 0 ? executedNodes : runSteps.length,
    };
  }, [runOutput, runOutputMetadata, runSteps.length]);

  const latestRecoveryEvent = useMemo(() => {
    const recoveryEvents = runOutputMetadata.recovery_events;
    if (!Array.isArray(recoveryEvents) || !recoveryEvents.length) {
      return null;
    }
    const lastEvent = recoveryEvents[recoveryEvents.length - 1];
    return asRecord(lastEvent);
  }, [runOutputMetadata]);

  const runRecoveryMessage = useMemo(() => {
    const fatalError = runOutputMetadata.fatal_error;
    const fatalText = typeof fatalError === "string" ? fatalError : "";
    if (!latestRecoveryEvent && !fatalText) {
      return "";
    }
    const reason = formatRunLabel(latestRecoveryEvent?.reason || "recovered");
    const at = latestRecoveryEvent?.at ? ` at ${formatRunDateTime(latestRecoveryEvent.at)}` : "";
    if (fatalText) {
      return `${reason}${at}. ${fatalText}`;
    }
    return `${reason}${at}.`;
  }, [latestRecoveryEvent, runOutputMetadata]);

  useEffect(() => {
    if (!runSteps.length) {
      setExpandedRunSteps({});
      setExpandedRunSections({});
      return;
    }
    const nextSteps: Record<string, boolean> = {};
    const nextSections: Record<string, boolean> = {};
    runSteps.forEach((step, index) => {
      const stepId = getRunStepId(step, index);
      const failed = getRunStepStatus(step) === "failed";
      nextSteps[stepId] = failed || index === runSteps.length - 1;
      nextSections[`${stepId}:input`] = false;
      nextSections[`${stepId}:output`] = !failed;
      nextSections[`${stepId}:error`] = failed;
    });
    setExpandedRunSteps(nextSteps);
    setExpandedRunSections(nextSections);
  }, [runSteps]);

  const jsonMappingTokenOptions = useMemo(() => {
    const options: JsonTokenOption[] = [];
    const appendOptionsFromNode = (nodeId: string, labelSuffix = "") => {
      const rootToken = `{{${nodeId}}}`;
      options.push({ token: rootToken, label: `${nodeId}${labelSuffix}`, nodeId });

      const output = runStepOutputByNodeId.get(nodeId);
      if (output !== undefined) {
        options.push(
          ...flattenJsonPaths(output, nodeId).map((option) => ({
            ...option,
            label: `${option.label}${labelSuffix}`,
          }))
        );
      } else {
        const node = nodeById.get(nodeId);
        if (node?.type.startsWith("http.")) {
          options.push(
            { token: `{{${nodeId}.body}}`, label: `${nodeId}.body${labelSuffix}`, nodeId },
            {
              token: `{{${nodeId}.statusCode}}`,
              label: `${nodeId}.statusCode${labelSuffix}`,
              nodeId,
            },
            { token: `{{${nodeId}.headers}}`, label: `${nodeId}.headers${labelSuffix}`, nodeId }
          );
        } else if (node?.type === "json.create") {
          const payload = (node.config as Record<string, unknown> | undefined)?.payload;
          if (payload !== undefined) {
            options.push(
              ...flattenJsonPaths(payload, nodeId).map((option) => ({
                ...option,
                label: `${option.label}${labelSuffix}`,
              }))
            );
          }
        }
      }
    };

    priorNodeIdsForSelectedNode.forEach((nodeId) => {
      appendOptionsFromNode(nodeId);
    });

    const priorNodeSet = new Set(priorNodeIdsForSelectedNode);
    graph.nodes.forEach((node) => {
      if (node.id === selectedNode?.id || priorNodeSet.has(node.id)) {
        return;
      }
      if (node.type === "json.create") {
        appendOptionsFromNode(node.id, " (other node)");
      }
    });

    const unique = new Map<string, JsonTokenOption>();
    options.forEach((option) => {
      if (!unique.has(option.token)) {
        unique.set(option.token, option);
      }
    });
    return Array.from(unique.values());
  }, [graph.nodes, nodeById, priorNodeIdsForSelectedNode, runStepOutputByNodeId, selectedNode?.id]);

  const getNodeInputPoint = useCallback(
    (node: ScenarioNode): CanvasPoint => ({
      x: node.position?.x ?? 0,
      y: (node.position?.y ?? 0) + NODE_HEIGHT / 2,
    }),
    []
  );

  const getNodeOutputPoint = useCallback(
    (node: ScenarioNode): CanvasPoint => ({
      x: (node.position?.x ?? 0) + NODE_WIDTH,
      y: (node.position?.y ?? 0) + NODE_HEIGHT / 2,
    }),
    []
  );

  const toCanvasPoint = useCallback((clientX: number, clientY: number): CanvasPoint => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: clientX, y: clientY };
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const copyTextToClipboard = useCallback(async (value: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) {
      throw new Error("Clipboard is not available.");
    }
  }, []);

  useEffect(() => {
    if (!selectedNode) {
      setNodeConnection("");
      setNodeConfigJson("{}");
      setHttpNodeForm(createDefaultHttpNodeForm());
      setHttpFocusedField("");
      setHttpTokenPickerValue("");
      setHttpBearerTokenPickerValue("");
      setNodeConfigTokenPickerValue("");
      setCurlImportText("");
      setCurlImportError("");
      setJsonFieldMappings([]);
      setEmailNodeForm(createDefaultEmailTemplateNodeForm());
      setEmailTemplatePreview(null);
      setEmailTemplatePreviewError("");
      setNodeConfigError("");
      return;
    }
    const connectionId = selectedNode?.config?.connectionId;
    setNodeConnection(connectionId ? String(connectionId) : "");
    const config = { ...(selectedNode.config || {}) };
    delete config.connectionId;
    if (selectedNode.type === "http.make_request") {
      const normalizedHttpForm = normalizeHttpNodeForm(config);
      setHttpNodeForm(normalizedHttpForm);
      setHttpFocusedField("");
      setHttpTokenPickerValue("");
      setHttpBearerTokenPickerValue(
        isTokenExpression(normalizedHttpForm.bearerToken)
          ? normalizedHttpForm.bearerToken
          : ""
      );
      setNodeConfigTokenPickerValue("");
      setNodeConfigJson("{}");
      setCurlImportError("");
      setJsonFieldMappings([]);
      setEmailNodeForm(createDefaultEmailTemplateNodeForm());
      setEmailTemplatePreview(null);
      setEmailTemplatePreviewError("");
    } else if (selectedNode.type === "json.create") {
      const mappings = normalizeJsonFieldMappings(config);
      setJsonFieldMappings(
        mappings.length
          ? mappings
          : [
              {
                id: `json_map_${Date.now()}`,
                fieldName: "",
                sourceType: "mapped",
                sourceToken: "",
                customValue: "",
              },
            ]
      );
      setNodeConfigJson("{}");
      setHttpNodeForm(createDefaultHttpNodeForm());
      setHttpFocusedField("");
      setHttpTokenPickerValue("");
      setHttpBearerTokenPickerValue("");
      setNodeConfigTokenPickerValue("");
      setCurlImportText("");
      setCurlImportError("");
      setEmailNodeForm(createDefaultEmailTemplateNodeForm());
      setEmailTemplatePreview(null);
      setEmailTemplatePreviewError("");
    } else if (selectedNode.type === "email.send") {
      const normalizedEmailForm = normalizeEmailTemplateNodeForm(config);
      setEmailNodeForm(normalizedEmailForm);
      setNodeConfigJson(
        normalizedEmailForm.composeMode === "inline" && Object.keys(config).length
          ? JSON.stringify(config, null, 2)
          : "{}"
      );
      setHttpNodeForm(createDefaultHttpNodeForm());
      setHttpFocusedField("");
      setHttpTokenPickerValue("");
      setHttpBearerTokenPickerValue("");
      setNodeConfigTokenPickerValue("");
      setCurlImportText("");
      setCurlImportError("");
      setJsonFieldMappings([]);
      setEmailTemplatePreview(null);
      setEmailTemplatePreviewError("");
    } else {
      setNodeConfigJson(Object.keys(config).length ? JSON.stringify(config, null, 2) : "{}");
      setHttpNodeForm(createDefaultHttpNodeForm());
      setHttpFocusedField("");
      setHttpTokenPickerValue("");
      setHttpBearerTokenPickerValue("");
      setNodeConfigTokenPickerValue("");
      setCurlImportText("");
      setCurlImportError("");
      setJsonFieldMappings([]);
      setEmailNodeForm(createDefaultEmailTemplateNodeForm());
      setEmailTemplatePreview(null);
      setEmailTemplatePreviewError("");
    }
    setNodeConfigError("");
  }, [selectedNode]);

  useEffect(() => {
    if (!isSelectedEmailSendNode) {
      return;
    }
    setEmailNodeForm((previous) => {
      const existing = new Map(previous.bindings.map((item) => [item.variableName, item]));
      const templateVariables = Array.isArray(selectedEmailTemplate?.variables_schema)
        ? selectedEmailTemplate?.variables_schema
        : [];
      if (!templateVariables.length) {
        return previous;
      }
      const nextBindings: EmailTemplateBindingRow[] = templateVariables.map((field, index) => {
        const key = String(field?.key || "").trim();
        const existingRow = existing.get(key);
        return (
          existingRow || {
            id: `email_template_binding_${key || index}`,
            variableName: key,
            label: String(field?.label || key || `Variable ${index + 1}`),
            required: Boolean(field?.required),
            sourceType: "mapped",
            sourceToken: "",
            customValue:
              field?.default === undefined || field?.default === null
                ? ""
                : typeof field.default === "string"
                  ? field.default
                  : JSON.stringify(field.default),
          }
        );
      });
      previous.bindings.forEach((binding) => {
        if (templateVariables.some((field) => String(field?.key || "") === binding.variableName)) {
          return;
        }
        if (!binding.variableName.trim()) {
          return;
        }
        nextBindings.push(binding);
      });
      return {
        ...previous,
        bindings: nextBindings,
      };
    });
  }, [isSelectedEmailSendNode, selectedEmailTemplate]);

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const payload =
        event.data && typeof event.data === "object"
          ? (event.data as Record<string, unknown>)
          : null;
      const type = String(payload?.type || "");
      if (!type.startsWith("metis:")) {
        return;
      }
      const isJira = type.startsWith("metis:jira-oauth");
      const isJenkins = type.startsWith("metis:jenkins-oauth");
      if (!isJira && !isJenkins) {
        return;
      }
      const providerLabel = isJira ? "Jira" : "Jenkins";

      if (type === "metis:jenkins-oauth-success" || type === "metis:jira-oauth-success") {
        const connection = payload?.connection as ConnectionRecord | undefined;
        if (!connection?.id) {
          setConnectionModalError(
            `${providerLabel} OAuth completed but connection payload is invalid.`
          );
          return;
        }
        setConnections((previous) => {
          const exists = previous.some((item) => item.id === connection.id);
          if (exists) {
            return previous.map((item) => (item.id === connection.id ? connection : item));
          }
          return [connection, ...previous];
        });
        setNodeConnection(String(connection.id));
        setConnectionModalError("");
        setConnectionModalStatus(`${providerLabel} connection created and selected.`);
        setIsConnectionModalOpen(false);
        setStatusMessage(`${providerLabel} OAuth connection created.`);
        return;
      }

      if (type === "metis:jenkins-oauth-error" || type === "metis:jira-oauth-error") {
        const message = String(payload?.message || `${providerLabel} OAuth failed.`);
        setConnectionModalStatus("");
        setConnectionModalError(message);
      }
    };

    window.addEventListener("message", handleOAuthMessage);
    return () => {
      window.removeEventListener("message", handleOAuthMessage);
    };
  }, []);

  useEffect(() => {
    if (!graph.nodes.length || moduleIndex.size === 0) {
      return;
    }
    let changed = false;
    const nextNodes = graph.nodes.map((node) => {
      const module = moduleIndex.get(node.type);
      if (!module) {
        return node;
      }
      const enriched: ScenarioNode = {
        ...node,
        kind: node.kind || module.kind,
        acceptsInput:
          typeof node.acceptsInput === "boolean"
            ? node.acceptsInput
            : module.acceptsInput,
        inputPortType: node.inputPortType || module.inputPortType,
        outputPortType: node.outputPortType || module.outputPortType,
      };
      if (
        enriched.kind !== node.kind ||
        enriched.acceptsInput !== node.acceptsInput ||
        enriched.inputPortType !== node.inputPortType ||
        enriched.outputPortType !== node.outputPortType
      ) {
        changed = true;
      }
      return enriched;
    });
    if (changed) {
      updateGraphState({ ...graph, nodes: nextNodes, edges: graph.edges });
    }
  }, [graph, moduleIndex, updateGraphState]);

  const filteredApps = useMemo(() => {
    const searchTerms = searchText
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const matchesSearch = (value: string) =>
      searchTerms.every((term) => value.toLowerCase().includes(term));

    return catalog.apps.filter((app) => {
      const categoryMatch = selectedCategory === "all" || app.categories.includes(selectedCategory);
      if (!categoryMatch) {
        return false;
      }
      if (!searchTerms.length) {
        return true;
      }
      const appText = `${app.name} ${app.key}`;
      const moduleMatch = app.modules.some((module) =>
        matchesSearch(`${module.title} ${module.description} ${module.type}`)
      );
      return (
        matchesSearch(appText) ||
        moduleMatch
      );
    });
  }, [catalog.apps, searchText, selectedCategory]);

  const filteredModulesForSelectedApp = useMemo(() => {
    if (!selectedApp) {
      return [] as IntegrationModule[];
    }
    const searchTerms = searchText
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!searchTerms.length) {
      return selectedApp.modules;
    }
    return selectedApp.modules.filter((module) => {
      const text = `${module.title} ${module.description} ${module.type}`.toLowerCase();
      return searchTerms.every((term) => text.includes(term));
    });
  }, [searchText, selectedApp]);

  const groupedModulesForSelectedApp = useMemo<ModuleGroup[]>(() => {
    if (!selectedApp || !filteredModulesForSelectedApp.length) {
      return [];
    }

    const bucket = new Map<string, IntegrationModule[]>();
    filteredModulesForSelectedApp.forEach((module) => {
      const label =
        module.group ||
        (selectedApp.key === "hubspot" ? getHubspotModuleGroup(module.type) : "Modules");
      const existing = bucket.get(label);
      if (existing) {
        existing.push(module);
      } else {
        bucket.set(label, [module]);
      }
    });

    if (selectedApp.key !== "hubspot") {
      return [{ label: "Modules", modules: filteredModulesForSelectedApp }];
    }

    return Array.from(bucket.entries())
      .sort((a, b) => {
        const aIndex = HUBSPOT_GROUP_ORDER.indexOf(a[0] as (typeof HUBSPOT_GROUP_ORDER)[number]);
        const bIndex = HUBSPOT_GROUP_ORDER.indexOf(b[0] as (typeof HUBSPOT_GROUP_ORDER)[number]);
        const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
        const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
        if (safeA === safeB) {
          return a[0].localeCompare(b[0]);
        }
        return safeA - safeB;
      })
      .map(([label, modules]) => ({ label, modules }));
  }, [filteredModulesForSelectedApp, selectedApp]);

  const loadScenario = useCallback(async () => {
    if (!scenarioId) {
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const [scenarioData, catalogData] = await Promise.all([
        getScenario(scenarioId),
        fetchIntegrationCatalog(),
      ]);
      const normalizedGraph = ensureGraphShape(scenarioData.graph_json);
      setScenario({
        ...scenarioData,
        graph_json: normalizedGraph,
      });
      updateGraphState(normalizedGraph);
      setCatalog(catalogData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load scenario.");
    } finally {
      setIsLoading(false);
    }
  }, [scenarioId, updateGraphState]);

  useEffect(() => {
    loadScenario();
  }, [loadScenario]);

  const loadConnectionsForProvider = useCallback(
    async (provider: NodeProvider) => {
      if (
        (provider !== "jira" &&
          provider !== "jenkins" &&
          provider !== "hubspot" &&
          provider !== "email") ||
        !scenario
      ) {
        setConnections([]);
        return;
      }
      setIsConnectionsLoading(true);
      try {
        const payload = await listConnections({
          provider,
          tenantId: scenario.tenant_id,
          workspaceId: scenario.workspace_id ?? undefined,
        });
        setConnections(payload.items || []);
      } catch (connectionError) {
        setConnections([]);
        setError(
          connectionError instanceof Error
            ? connectionError.message
            : "Unable to load connections."
        );
      } finally {
        setIsConnectionsLoading(false);
      }
    },
    [scenario]
  );

  useEffect(() => {
    if (!selectedNode || !selectedNodeNeedsConnection) {
      setConnections([]);
      return;
    }
    void loadConnectionsForProvider(selectedNodeProvider);
  }, [
    loadConnectionsForProvider,
    selectedNode,
    selectedNodeNeedsConnection,
    selectedNodeProvider,
  ]);

  const loadEmailTemplatesForScenario = useCallback(async () => {
    if (!scenario) {
      setEmailTemplates([]);
      return;
    }
    setIsEmailTemplatesLoading(true);
    try {
      const payload = await listEmailTemplates({
        tenantId: scenario.tenant_id,
        workspaceId: scenario.workspace_id ?? undefined,
      });
      setEmailTemplates(payload.items || []);
    } catch (templateError) {
      setEmailTemplates([]);
      setError(
        templateError instanceof Error
          ? templateError.message
          : "Unable to load email templates."
      );
    } finally {
      setIsEmailTemplatesLoading(false);
    }
  }, [scenario]);

  useEffect(() => {
    if (!isSelectedEmailSendNode) {
      return;
    }
    void loadEmailTemplatesForScenario();
  }, [isSelectedEmailSendNode, loadEmailTemplatesForScenario]);

  const closeModulePicker = useCallback(() => {
    setIsPickerOpen(false);
    setSelectedApp(null);
  }, []);

  const openModulePicker = useCallback(() => {
    closeContextMenu();
    setSelectedApp(null);
    setIsPickerOpen(true);
  }, [closeContextMenu]);

  const persistGraph = useCallback(
    async (nextGraph: ScenarioGraph, message = "Scenario saved.") => {
      if (!scenario) {
        return;
      }
      setIsSaving(true);
      setError("");
      try {
        const updatedScenario = await updateScenario(scenario.id, {
          graph_json: nextGraph,
        });
        const normalizedGraph = ensureGraphShape(updatedScenario.graph_json);
        setScenario({
          ...updatedScenario,
          graph_json: normalizedGraph,
        });
        updateGraphState(normalizedGraph);
        setStatusMessage(message);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Unable to save scenario.");
      } finally {
        setIsSaving(false);
      }
    },
    [scenario, updateGraphState]
  );

  const persistScenarioName = useCallback(async () => {
    if (!scenario) {
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const updatedScenario = await updateScenario(scenario.id, {
        name: scenario.name,
      });
      const normalizedGraph = ensureGraphShape(updatedScenario.graph_json);
      setScenario({
        ...updatedScenario,
        graph_json: normalizedGraph,
      });
      updateGraphState(normalizedGraph);
      setStatusMessage("Scenario name saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save scenario.");
    } finally {
      setIsSaving(false);
    }
  }, [scenario, updateGraphState]);

  const addModuleNode = async (app: IntegrationApp, module: IntegrationModule) => {
    if (!scenario) {
      return;
    }

    const tailNode = getFlowTailNode(graph.nodes, graph.edges);
    const fallbackPosition = getDefaultNodePosition(graph.nodes.length);
    const proposedPosition: CanvasPoint = tailNode
      ? {
          x: (tailNode.position?.x ?? NODE_START_X) + NODE_GAP_X,
          y: tailNode.position?.y ?? NODE_START_Y,
        }
      : fallbackPosition;
    const rect = canvasRef.current?.getBoundingClientRect();
    const maxX = Math.max(20, (rect?.width || 1400) - NODE_WIDTH - 20);
    const maxY = Math.max(20, (rect?.height || 700) - NODE_HEIGHT - 20);

    const nextNode: ScenarioNode = {
      id: `node_${Date.now()}`,
      type: module.type,
      title: module.title,
      app: app.name,
      kind: module.kind,
      acceptsInput:
        typeof module.acceptsInput === "boolean" ? module.acceptsInput : module.kind !== "trigger",
      inputPortType: module.inputPortType || "event",
      outputPortType: module.outputPortType || "event",
      position: {
        x: clamp(proposedPosition.x, 20, maxX),
        y: clamp(proposedPosition.y, 20, maxY),
      },
      config: {},
    };

    const nextGraph: ScenarioGraph = {
      ...graph,
      nodes: [...graph.nodes, nextNode],
      edges: graph.edges,
    };

    updateGraphState(nextGraph);
    setSelectedNodeId(nextNode.id);
    setSelectedEdgeId("");
    closeModulePicker();
    setConnectionDraft(null);

    await persistGraph(nextGraph, `Added ${module.title} node.`);
  };

  const createEdge = useCallback(
    async (sourceNodeId: string, targetNodeId: string, sourcePortType?: string) => {
      if (!scenario) {
        return;
      }

      const sourceNode = nodeById.get(sourceNodeId);
      const targetNode = nodeById.get(targetNodeId);
      if (!sourceNode || !targetNode) {
        setError("Unable to connect nodes. Missing source or target.");
        setConnectionDraft(null);
        return;
      }

      if (sourceNodeId === targetNodeId) {
        setError("Self-loop connections are not allowed.");
        setConnectionDraft(null);
        return;
      }

      if (graph.edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId)) {
        setError("This connection already exists.");
        setConnectionDraft(null);
        return;
      }

      if (wouldCreateCycle(graph.nodes, graph.edges, sourceNodeId, targetNodeId)) {
        setError("This connection would create a cycle. Cycles are blocked in MVP.");
        setConnectionDraft(null);
        return;
      }

      const sourceMeta = getNodeMeta(sourceNode);
      const targetMeta = getNodeMeta(targetNode);
      const resolvedSourcePort = normalizePortType(sourcePortType || sourceMeta.outputPortType);
      const resolvedTargetPort = normalizePortType(targetMeta.inputPortType);

      if (!targetMeta.acceptsInput) {
        setError(`${targetNode.title} does not accept inbound connections.`);
        setConnectionDraft(null);
        return;
      }

      if (!isPortTypeCompatible(resolvedSourcePort, resolvedTargetPort)) {
        setError(
          `Incompatible port types: ${resolvedSourcePort} -> ${resolvedTargetPort}.`
        );
        setConnectionDraft(null);
        return;
      }

      const nextEdge: ScenarioEdge = {
        id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        source: sourceNodeId,
        target: targetNodeId,
        sourceHandle: "output",
        targetHandle: "input",
        sourcePortType: resolvedSourcePort,
        targetPortType: resolvedTargetPort,
      };

      const nextGraph: ScenarioGraph = {
        ...graph,
        nodes: graph.nodes,
        edges: [...graph.edges, nextEdge],
      };

      updateGraphState(nextGraph);
      setConnectionDraft(null);
      setSelectedNodeId("");
      setSelectedEdgeId(nextEdge.id);
      setError("");
      await persistGraph(nextGraph, "Connection saved.");
    },
    [scenario, nodeById, graph, getNodeMeta, persistGraph, updateGraphState]
  );

  const handleDeleteSelectedEdge = async () => {
    if (!selectedEdgeId) {
      return;
    }
    const nextGraph: ScenarioGraph = {
      ...graph,
      edges: graph.edges.filter((edge) => edge.id !== selectedEdgeId),
    };
    updateGraphState(nextGraph);
    setSelectedEdgeId("");
    closeContextMenu();
    await persistGraph(nextGraph, "Connection removed.");
  };

  const handleDeleteNode = useCallback(
    async (nodeId: string, messagePrefix = "Deleted") => {
      const node = nodeById.get(nodeId);
      if (!node) {
        return;
      }

      const nextGraph: ScenarioGraph = {
        ...graph,
        nodes: graph.nodes.filter((item) => item.id !== nodeId),
        edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      };
      updateGraphState(nextGraph);
      setSelectedNodeId((previous) => (previous === nodeId ? "" : previous));
      setSelectedEdgeId("");
      setConnectionDraft(null);
      closeContextMenu();
      await persistGraph(nextGraph, `${messagePrefix} ${node.title}.`);
    },
    [closeContextMenu, graph, nodeById, persistGraph, updateGraphState]
  );

  const handleDeleteSelectedTrigger = async () => {
    if (!selectedNode || !isSelectedTriggerNode) {
      return;
    }
    await handleDeleteNode(selectedNode.id, "Trigger deleted");
  };

  const handleRenameNode = useCallback(
    async (nodeId: string) => {
      const node = nodeById.get(nodeId);
      if (!node) {
        return;
      }

      const nextTitle = window.prompt("Rename module", node.title);
      if (nextTitle === null) {
        return;
      }

      const title = nextTitle.trim();
      if (!title || title === node.title) {
        return;
      }

      const nextGraph: ScenarioGraph = {
        ...graph,
        nodes: graph.nodes.map((item) => (item.id === nodeId ? { ...item, title } : item)),
        edges: graph.edges,
      };
      updateGraphState(nextGraph);
      setSelectedNodeId(nodeId);
      setSelectedEdgeId("");
      closeContextMenu();
      await persistGraph(nextGraph, `Renamed module to ${title}.`);
    },
    [closeContextMenu, graph, nodeById, persistGraph, updateGraphState]
  );

  const handleCloneNode = useCallback(
    async (nodeId: string) => {
      const node = nodeById.get(nodeId);
      if (!node) {
        return;
      }

      const rect = canvasRef.current?.getBoundingClientRect();
      const maxX = Math.max(20, (rect?.width || 1400) - NODE_WIDTH - 20);
      const maxY = Math.max(20, (rect?.height || 700) - NODE_HEIGHT - 20);
      const clonedNode: ScenarioNode = {
        ...node,
        id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: `${node.title} (copy)`,
        position: {
          x: clamp((node.position?.x ?? NODE_START_X) + 36, 20, maxX),
          y: clamp((node.position?.y ?? NODE_START_Y) + 36, 20, maxY),
        },
        config: { ...(node.config || {}) },
      };

      const nextGraph: ScenarioGraph = {
        ...graph,
        nodes: [...graph.nodes, clonedNode],
        edges: graph.edges,
      };
      updateGraphState(nextGraph);
      setSelectedNodeId(clonedNode.id);
      setSelectedEdgeId("");
      closeContextMenu();
      await persistGraph(nextGraph, `Cloned ${node.title}.`);
    },
    [closeContextMenu, graph, nodeById, persistGraph, updateGraphState]
  );

  const handleCopyNode = useCallback(
    async (nodeId: string) => {
      const node = nodeById.get(nodeId);
      if (!node) {
        return;
      }
      const payload = {
        node,
        edges: {
          incoming: graph.edges.filter((edge) => edge.target === nodeId),
          outgoing: graph.edges.filter((edge) => edge.source === nodeId),
        },
      };
      try {
        await copyTextToClipboard(JSON.stringify(payload, null, 2));
        setStatusMessage(`${node.title} copied to clipboard.`);
      } catch (copyError) {
        setError(copyError instanceof Error ? copyError.message : "Unable to copy module.");
      }
      closeContextMenu();
    },
    [closeContextMenu, copyTextToClipboard, graph.edges, nodeById]
  );

  const handleOutputHandleClick = (event: ReactMouseEvent<HTMLButtonElement>, node: ScenarioNode) => {
    event.stopPropagation();
    const sourceMeta = getNodeMeta(node);
    const start = getNodeOutputPoint(node);
    setConnectionDraft({
      sourceNodeId: node.id,
      sourcePortType: sourceMeta.outputPortType,
      start,
      current: start,
    });
    setError("");
    setStatusMessage(`Connecting from ${node.title}. Select a target input.`);
  };

  const handleInputHandleClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    node: ScenarioNode
  ) => {
    event.stopPropagation();
    if (!connectionDraft) {
      return;
    }
    void createEdge(connectionDraft.sourceNodeId, node.id, connectionDraft.sourcePortType);
  };

  const handleNodeMouseDown = (
    event: ReactMouseEvent<HTMLDivElement>,
    nodeId: string
  ) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.dataset.handle === "true") {
      return;
    }
    const node = nodeById.get(nodeId);
    if (!node?.position) {
      return;
    }
    const point = toCanvasPoint(event.clientX, event.clientY);
    dragMovedRef.current = false;
    closeContextMenu();
    setDragState({
      nodeId,
      offsetX: point.x - node.position.x,
      offsetY: point.y - node.position.y,
    });
    setSelectedNodeId(nodeId);
    setSelectedEdgeId("");
    setConnectionDraft(null);
  };

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const point = toCanvasPoint(event.clientX, event.clientY);
      const maxX = Math.max(20, (rect?.width || 1400) - NODE_WIDTH - 20);
      const maxY = Math.max(20, (rect?.height || 700) - NODE_HEIGHT - 20);
      const nextX = clamp(point.x - dragState.offsetX, 20, maxX);
      const nextY = clamp(point.y - dragState.offsetY, 20, maxY);

      setGraph((previous) => {
        const nextNodes = previous.nodes.map((node) => {
          if (node.id !== dragState.nodeId) {
            return node;
          }
          const currentX = node.position?.x ?? 0;
          const currentY = node.position?.y ?? 0;
          if (Math.abs(currentX - nextX) < 1 && Math.abs(currentY - nextY) < 1) {
            return node;
          }
          dragMovedRef.current = true;
          return {
            ...node,
            position: { x: nextX, y: nextY },
          };
        });
        const nextGraph = { ...previous, nodes: nextNodes };
        graphRef.current = nextGraph;
        return nextGraph;
      });
    };

    const handleMouseUp = () => {
      const moved = dragMovedRef.current;
      setDragState(null);
      if (moved) {
        void persistGraph(graphRef.current, "Node position updated.");
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, persistGraph, toCanvasPoint]);

  const handleCanvasMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!connectionDraft) {
      return;
    }
    setConnectionDraft((previous) => {
      if (!previous) {
        return previous;
      }
      return {
        ...previous,
        current: toCanvasPoint(event.clientX, event.clientY),
      };
    });
  };

  const handleCanvasMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button === 0) {
      closeContextMenu();
    }
  };

  const handleCanvasClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(".scenario-node-card") || target.closest(".scenario-edge-hitbox")) {
      return;
    }
    if (connectionDraft) {
      setConnectionDraft(null);
      setStatusMessage("Connection canceled.");
    }
    closeContextMenu();
    setSelectedNodeId("");
    setSelectedEdgeId("");
  };

  const handleRunOutputHeaderMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !runOutput) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }
    const bodyRect = canvasBodyRef.current?.getBoundingClientRect();
    const panelRect = runOutputRef.current?.getBoundingClientRect();
    if (!bodyRect || !panelRect) {
      return;
    }
    const currentPosition = runOutputPosition ?? {
      x: panelRect.left - bodyRect.left,
      y: panelRect.top - bodyRect.top,
    };
    const pointer = toCanvasPoint(event.clientX, event.clientY);
    setRunOutputPosition(currentPosition);
    setRunOutputDragState({
      offsetX: pointer.x - currentPosition.x,
      offsetY: pointer.y - currentPosition.y,
      width: panelRect.width,
      height: panelRect.height,
    });
    event.preventDefault();
  };

  useEffect(() => {
    if (!runOutputDragState) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const bodyRect = canvasBodyRef.current?.getBoundingClientRect();
      if (!bodyRect) {
        return;
      }
      const pointerX = event.clientX - bodyRect.left;
      const pointerY = event.clientY - bodyRect.top;
      const min = 8;
      const maxX = Math.max(min, bodyRect.width - runOutputDragState.width - min);
      const maxY = Math.max(min, bodyRect.height - runOutputDragState.height - min);
      const nextX = clamp(pointerX - runOutputDragState.offsetX, min, maxX);
      const nextY = clamp(pointerY - runOutputDragState.offsetY, min, maxY);
      setRunOutputPosition({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      setRunOutputDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [runOutputDragState]);

  const openConnectionModal = () => {
    if (!selectedNode) {
      return;
    }
    const provider = getNodeProvider(selectedNode.type);
    if (
      provider !== "jira" &&
      provider !== "jenkins" &&
      provider !== "hubspot" &&
      provider !== "email"
    ) {
      setConnectionModalError("This node type does not require a connection.");
      return;
    }
    setConnectionModalError("");
    setConnectionModalStatus("");
    if (provider === "jira") {
      setJiraConnectionName(`${selectedNode.app} connection`);
      setJiraConnectionAuthMode("oauth");
      setJiraOauthServiceUrl((previous) => previous || jiraServiceUrl);
    } else if (provider === "jenkins") {
      setJenkinsConnectionName(`${selectedNode.app} connection`);
    } else if (provider === "hubspot") {
      setHubspotConnectionName(`${selectedNode.app} connection`);
      setHubspotServiceUrl((previous) => previous || "https://api.hubapi.com");
    } else if (provider === "email") {
      setEmailConnectionName(`${selectedNode.app} connection`);
      setEmailConnectionAuthMode("apiToken");
      setEmailMailbox((previous) => previous || "INBOX");
    }
    setIsConnectionModalOpen(true);
  };

  const handleCreateJiraConnection = async () => {
    if (!jiraConnectionName.trim() || !jiraServiceUrl.trim() || !jiraUsername.trim() || !jiraApiToken.trim()) {
      setConnectionModalError("All Jira connection fields are required.");
      return;
    }

    setIsCreatingConnection(true);
    setConnectionModalError("");
    setConnectionModalStatus("");
    try {
      const created = await createApiTokenConnection({
        provider: "jira",
        display_name: jiraConnectionName.trim(),
        tenant_id: scenario?.tenant_id,
        workspace_id: scenario?.workspace_id ?? undefined,
        secret_payload: {
          serviceUrl: jiraServiceUrl.trim(),
          username: jiraUsername.trim(),
          apiToken: jiraApiToken.trim(),
        },
      });
      await testConnection(created.id);
      setConnections((previous) => [created, ...previous.filter((item) => item.id !== created.id)]);
      setNodeConnection(String(created.id));
      setConnectionModalStatus("Jira connection created.");
      setStatusMessage("Jira connection created and selected.");
      setIsConnectionModalOpen(false);
      setJiraApiToken("");
      void loadConnectionsForProvider("jira");
    } catch (createError) {
      setConnectionModalStatus("");
      setConnectionModalError(
        createError instanceof Error ? createError.message : "Unable to create Jira connection."
      );
    } finally {
      setIsCreatingConnection(false);
    }
  };

  const handleStartJiraOAuth = async () => {
    if (!jiraConnectionName.trim()) {
      setConnectionModalError("Connection name is required.");
      return;
    }

    const popup = window.open(
      "",
      "metis_jira_oauth",
      "popup=yes,width=720,height=840,left=120,top=120"
    );

    setIsCreatingConnection(true);
    setConnectionModalError("");
    setConnectionModalStatus("");
    try {
      const oauth = await startJiraOauth({
        display_name: jiraConnectionName.trim(),
        service_url: jiraOauthServiceUrl.trim() || undefined,
        tenant_id: scenario?.tenant_id,
        workspace_id: scenario?.workspace_id ?? undefined,
      });

      if (!popup || popup.closed) {
        window.location.href = oauth.url;
        return;
      }
      popup.location.href = oauth.url;
      setConnectionModalStatus("OAuth window opened. Complete consent to finish connection.");
    } catch (oauthError) {
      if (popup && !popup.closed) {
        popup.close();
      }
      setConnectionModalStatus("");
      setConnectionModalError(
        oauthError instanceof Error ? oauthError.message : "Unable to start Jira OAuth."
      );
    } finally {
      setIsCreatingConnection(false);
    }
  };

  const handleStartJenkinsOAuth = async () => {
    if (!jenkinsConnectionName.trim() || !jenkinsBaseUrl.trim()) {
      setConnectionModalError("Connection name and Jenkins base URL are required.");
      return;
    }

    const popup = window.open(
      "",
      "metis_jenkins_oauth",
      "popup=yes,width=720,height=840,left=120,top=120"
    );

    setIsCreatingConnection(true);
    setConnectionModalError("");
    setConnectionModalStatus("");
    try {
      const oauth = await startJenkinsOauth({
        display_name: jenkinsConnectionName.trim(),
        base_url: jenkinsBaseUrl.trim(),
        tenant_id: scenario?.tenant_id,
        workspace_id: scenario?.workspace_id ?? undefined,
      });

      if (!popup || popup.closed) {
        window.location.href = oauth.url;
        return;
      }
      popup.location.href = oauth.url;
      setConnectionModalStatus("OAuth window opened. Complete consent to finish connection.");
    } catch (oauthError) {
      if (popup && !popup.closed) {
        popup.close();
      }
      setConnectionModalStatus("");
      setConnectionModalError(
        oauthError instanceof Error ? oauthError.message : "Unable to start Jenkins OAuth."
      );
    } finally {
      setIsCreatingConnection(false);
    }
  };

  const handleCreateHubspotConnection = async () => {
    if (!hubspotConnectionName.trim() || !hubspotAccessToken.trim()) {
      setConnectionModalError("Connection name and HubSpot access token are required.");
      return;
    }

    setIsCreatingConnection(true);
    setConnectionModalError("");
    setConnectionModalStatus("");
    try {
      const created = await createApiTokenConnection({
        provider: "hubspot",
        display_name: hubspotConnectionName.trim(),
        tenant_id: scenario?.tenant_id,
        workspace_id: scenario?.workspace_id ?? undefined,
        secret_payload: {
          serviceUrl: hubspotServiceUrl.trim() || "https://api.hubapi.com",
          accessToken: hubspotAccessToken.trim(),
        },
      });
      await testConnection(created.id);
      setConnections((previous) => [created, ...previous.filter((item) => item.id !== created.id)]);
      setNodeConnection(String(created.id));
      setConnectionModalStatus("HubSpot connection created.");
      setStatusMessage("HubSpot connection created and selected.");
      setIsConnectionModalOpen(false);
      setHubspotAccessToken("");
      void loadConnectionsForProvider("hubspot");
    } catch (createError) {
      setConnectionModalStatus("");
      setConnectionModalError(
        createError instanceof Error ? createError.message : "Unable to create HubSpot connection."
      );
    } finally {
      setIsCreatingConnection(false);
    }
  };

  const handleCreateEmailConnection = async () => {
    const smtpHost = emailSmtpHost.trim();
    const imapHost = emailImapHost.trim();
    const smtpPassword = emailSmtpPassword;
    const imapPassword = emailImapPassword || smtpPassword;
    const smtpAccessToken = emailSmtpAccessToken.trim();
    const imapAccessToken = emailImapAccessToken.trim() || smtpAccessToken;

    if (!emailConnectionName.trim() || !emailUsername.trim()) {
      setConnectionModalError("Connection name and username are required.");
      return;
    }
    if (!smtpHost && !imapHost) {
      setConnectionModalError("Provide at least one host: SMTP or IMAP.");
      return;
    }

    if (emailConnectionAuthMode === "oauth") {
      if ((smtpHost && !smtpAccessToken) || (imapHost && !imapAccessToken)) {
        setConnectionModalError("OAuth mode requires access token fields for configured hosts.");
        return;
      }
    } else if ((smtpHost && !smtpPassword) || (imapHost && !imapPassword)) {
      setConnectionModalError("Password mode requires password fields for configured hosts.");
      return;
    }

    setIsCreatingConnection(true);
    setConnectionModalError("");
    setConnectionModalStatus("");
    try {
      const created = await createApiTokenConnection({
        provider: "email",
        auth_type: emailConnectionAuthMode,
        display_name: emailConnectionName.trim(),
        tenant_id: scenario?.tenant_id,
        workspace_id: scenario?.workspace_id ?? undefined,
        secret_payload: {
          username: emailUsername.trim(),
          fromEmail: emailDefaultFromEmail.trim() || emailUsername.trim(),
          smtpHost,
          smtpPort: Number(emailSmtpPort || 0) || (emailSmtpUseSsl ? 465 : 587),
          smtpUseSsl: emailSmtpUseSsl,
          smtpUseStarttls: emailSmtpUseStarttls,
          smtpPassword: emailConnectionAuthMode === "apiToken" ? smtpPassword : "",
          smtpAccessToken: emailConnectionAuthMode === "oauth" ? smtpAccessToken : "",
          imapHost,
          imapPort: Number(emailImapPort || 0) || 993,
          imapUseSsl: emailImapUseSsl,
          imapPassword: emailConnectionAuthMode === "apiToken" ? imapPassword : "",
          imapAccessToken: emailConnectionAuthMode === "oauth" ? imapAccessToken : "",
          mailbox: emailMailbox.trim() || "INBOX",
          password: emailConnectionAuthMode === "apiToken" ? smtpPassword : "",
          accessToken: emailConnectionAuthMode === "oauth" ? smtpAccessToken : "",
        },
      });
      await testConnection(created.id);
      setConnections((previous) => [created, ...previous.filter((item) => item.id !== created.id)]);
      setNodeConnection(String(created.id));
      setConnectionModalStatus("Email connection created.");
      setStatusMessage("Email connection created and selected.");
      setIsConnectionModalOpen(false);
      setEmailSmtpPassword("");
      setEmailImapPassword("");
      setEmailSmtpAccessToken("");
      setEmailImapAccessToken("");
      void loadConnectionsForProvider("email");
    } catch (createError) {
      setConnectionModalStatus("");
      setConnectionModalError(
        createError instanceof Error ? createError.message : "Unable to create Email connection."
      );
    } finally {
      setIsCreatingConnection(false);
    }
  };

  const handleImportCurl = () => {
    if (!curlImportText.trim()) {
      setCurlImportError("Paste a cURL command first.");
      return;
    }
    try {
      const parsed = parseCurlToHttpNodeForm(curlImportText, httpNodeForm);
      setHttpNodeForm(parsed);
      setCurlImportError("");
      setNodeConfigError("");
      setStatusMessage("cURL imported into HTTP request fields.");
    } catch (importError) {
      setCurlImportError(
        importError instanceof Error
          ? importError.message
          : "Unable to parse cURL command."
      );
    }
  };

  const handleApplyHttpMappedToken = () => {
    const token = httpTokenPickerValue.trim();
    if (!token) {
      setNodeConfigError("Select a mapped value first.");
      return;
    }
    const target = httpFocusedField || "bodyText";
    const bodyTextarea = httpBodyTextareaRef.current;
    let nextBodyCursor: number | null = null;

    setHttpNodeForm((previous) => {
      const next: HttpNodeFormState = {
        ...previous,
        headers: [...previous.headers],
        query: [...previous.query],
      };

      const headerMatch = target.match(/^headers\.(\d+)\.(key|value)$/);
      if (headerMatch) {
        const index = Number(headerMatch[1]);
        const key = headerMatch[2] as "key" | "value";
        if (next.headers[index]) {
          next.headers[index] = { ...next.headers[index], [key]: token };
        }
        return next;
      }

      const queryMatch = target.match(/^query\.(\d+)\.(key|value)$/);
      if (queryMatch) {
        const index = Number(queryMatch[1]);
        const key = queryMatch[2] as "key" | "value";
        if (next.query[index]) {
          next.query[index] = { ...next.query[index], [key]: token };
        }
        return next;
      }

      if (target === "url") {
        next.url = token;
        return next;
      }
      if (target === "bodyText") {
        if (next.bodyType === "none") {
          next.bodyType = "json";
        }
        const tokenValue = next.bodyType === "json" ? `"${token}"` : token;
        if (bodyTextarea) {
          const start = bodyTextarea.selectionStart ?? next.bodyText.length;
          const end = bodyTextarea.selectionEnd ?? next.bodyText.length;
          next.bodyText = `${next.bodyText.slice(0, start)}${tokenValue}${next.bodyText.slice(end)}`;
          nextBodyCursor = start + tokenValue.length;
        } else if (next.bodyText) {
          next.bodyText = `${next.bodyText}${tokenValue}`;
        } else {
          next.bodyText = tokenValue;
        }
        return next;
      }
      if (target === "basicUsername") {
        next.basicUsername = token;
        return next;
      }
      if (target === "basicPassword") {
        next.basicPassword = token;
        return next;
      }
      if (target === "bearerToken") {
        next.bearerToken = token;
        return next;
      }
      if (target === "apiKeyName") {
        next.apiKeyName = token;
        return next;
      }
      if (target === "apiKeyValue") {
        next.apiKeyValue = token;
        return next;
      }

      if (next.bodyType === "none") {
        next.bodyType = "json";
      }
      const tokenValue = `"${token}"`;
      if (bodyTextarea) {
        const start = bodyTextarea.selectionStart ?? next.bodyText.length;
        const end = bodyTextarea.selectionEnd ?? next.bodyText.length;
        next.bodyText = `${next.bodyText.slice(0, start)}${tokenValue}${next.bodyText.slice(end)}`;
        nextBodyCursor = start + tokenValue.length;
      } else if (next.bodyText) {
        next.bodyText = `${next.bodyText}${tokenValue}`;
      } else {
        next.bodyText = tokenValue;
      }
      return next;
    });

    if (bodyTextarea && nextBodyCursor !== null) {
      requestAnimationFrame(() => {
        bodyTextarea.focus();
        bodyTextarea.setSelectionRange(nextBodyCursor as number, nextBodyCursor as number);
      });
    }
    if (target === "bearerToken") {
      setHttpBearerTokenPickerValue(token);
    }

    setNodeConfigError("");
    setStatusMessage(
      `Mapped value inserted into ${httpFocusedField || "body content"}.`
    );
  };

  const handleInsertNodeConfigMappedToken = () => {
    const token = nodeConfigTokenPickerValue.trim();
    if (!token) {
      setNodeConfigError("Select a mapped value first.");
      return;
    }
    const textarea = nodeConfigTextareaRef.current;
    const current = nodeConfigJson || "";
    const start = textarea ? textarea.selectionStart ?? current.length : current.length;
    const end = textarea ? textarea.selectionEnd ?? current.length : current.length;
    const nextValue = `${current.slice(0, start)}${token}${current.slice(end)}`;
    setNodeConfigJson(nextValue);
    setNodeConfigError("");
    setStatusMessage("Mapped value inserted into operation config.");

    if (textarea) {
      requestAnimationFrame(() => {
        textarea.focus();
        const nextCursor = start + token.length;
        textarea.setSelectionRange(nextCursor, nextCursor);
      });
    }
  };

  const handleApplyBearerTokenMappedValue = () => {
    const token = httpBearerTokenPickerValue.trim();
    if (!token) {
      setNodeConfigError("Select a mapped token field first.");
      return;
    }
    setHttpNodeForm((previous) => ({
      ...previous,
      bearerToken: token,
    }));
    setHttpFocusedField("bearerToken");
    setHttpTokenPickerValue(token);
    setNodeConfigError("");
    setStatusMessage("Mapped value applied to bearer token.");
  };

  const updateEmailTemplateBinding = useCallback(
    (bindingId: string, key: keyof EmailTemplateBindingRow, value: string | boolean) => {
      setEmailNodeForm((previous) => ({
        ...previous,
        bindings: previous.bindings.map((binding) =>
          binding.id === bindingId ? { ...binding, [key]: value } : binding
        ),
      }));
      setNodeConfigError("");
      setEmailTemplatePreviewError("");
    },
    []
  );

  const addEmailTemplateBinding = useCallback(() => {
    setEmailNodeForm((previous) => ({
      ...previous,
      bindings: [
        ...previous.bindings,
        {
          id: `email_template_binding_${Date.now()}`,
          variableName: "",
          label: "",
          required: false,
          sourceType: "mapped",
          sourceToken: "",
          customValue: "",
        },
      ],
    }));
  }, []);

  const removeEmailTemplateBinding = useCallback((bindingId: string) => {
    setEmailNodeForm((previous) => ({
      ...previous,
      bindings: previous.bindings.filter((binding) => binding.id !== bindingId),
    }));
  }, []);

  const resolvePreviewTokenValue = useCallback(
    (token: string): { found: boolean; value?: unknown } => {
      const path = extractTokenPath(token);
      if (!path) {
        return { found: false };
      }
      const segments = parseTokenSegments(path);
      const [nodeId, ...rest] = segments;
      if (typeof nodeId !== "string" || !nodeId.trim()) {
        return { found: false };
      }
      let source = runStepOutputByNodeId.get(nodeId);
      if (source === undefined) {
        const node = nodeById.get(nodeId);
        if (node?.type === "json.create") {
          source = asRecord(node.config)?.payload;
        }
      }
      if (source === undefined) {
        return { found: false };
      }
      if (!rest.length) {
        return { found: true, value: source };
      }
      const value = getValueAtTokenPath(source, rest);
      if (value === undefined) {
        return { found: false };
      }
      return { found: true, value };
    },
    [nodeById, runStepOutputByNodeId]
  );

  const buildEmailTemplatePreviewPayload = useCallback(() => {
    const payload: Record<string, unknown> = {};
    const bindings: Record<string, unknown> = {};
    const unresolved: string[] = [];

    emailNodeForm.bindings.forEach((binding) => {
      const variableName = binding.variableName.trim();
      if (!variableName) {
        return;
      }
      if (binding.sourceType === "mapped") {
        const sourceToken = binding.sourceToken.trim();
        if (!sourceToken) {
          return;
        }
        const resolved = resolvePreviewTokenValue(sourceToken);
        if (!resolved.found) {
          unresolved.push(variableName);
          return;
        }
        bindings[variableName] = resolved.value;
        return;
      }

      if (!binding.customValue.trim()) {
        return;
      }
      payload[variableName] = parseCustomJsonFieldValue(binding.customValue);
    });

    return {
      payload,
      bindings,
      unresolved,
    };
  }, [emailNodeForm.bindings, resolvePreviewTokenValue]);

  const handlePreviewEmailTemplate = useCallback(async () => {
    if (!selectedEmailTemplate) {
      setNodeConfigError("Select an email template first.");
      return;
    }
    setIsEmailTemplatePreviewLoading(true);
    setEmailTemplatePreviewError("");
    setNodeConfigError("");
    try {
      const previewPayload = buildEmailTemplatePreviewPayload();
      const preview = await previewStoredEmailTemplate({
        templateId: selectedEmailTemplate.id,
        data: {
          payload: previewPayload.payload,
          bindings: previewPayload.bindings,
          subject_override: emailNodeForm.subjectOverride.trim(),
          html_override: emailNodeForm.htmlOverride,
          text_override: emailNodeForm.textOverride,
        },
      });
      setEmailTemplatePreview(preview);
      if (previewPayload.unresolved.length) {
        setEmailTemplatePreviewError(
          `Preview skipped unresolved mapped values: ${previewPayload.unresolved.join(", ")}. Run upstream nodes to resolve them.`
        );
      }
    } catch (previewError) {
      setEmailTemplatePreview(null);
      setEmailTemplatePreviewError(
        previewError instanceof Error ? previewError.message : "Unable to preview email template."
      );
    } finally {
      setIsEmailTemplatePreviewLoading(false);
    }
  }, [buildEmailTemplatePreviewPayload, emailNodeForm.htmlOverride, emailNodeForm.subjectOverride, emailNodeForm.textOverride, selectedEmailTemplate]);

  const handleTestSendSelectedEmailTemplate = useCallback(async () => {
    if (!selectedEmailTemplate) {
      setNodeConfigError("Select an email template first.");
      return;
    }
    if (!nodeConnection.trim()) {
      setNodeConfigError("Select an email connection first.");
      return;
    }
    const toRecipients = parseCommaSeparatedList(emailNodeForm.to);
    if (!toRecipients.length) {
      setNodeConfigError("Add at least one recipient in To.");
      return;
    }
    setIsEmailTemplateTestSending(true);
    setNodeConfigError("");
    try {
      const previewPayload = buildEmailTemplatePreviewPayload();
      await testSendEmailTemplate({
        templateId: selectedEmailTemplate.id,
        data: {
          connection_id: Number(nodeConnection),
          to: toRecipients,
          cc: parseCommaSeparatedList(emailNodeForm.cc),
          bcc: parseCommaSeparatedList(emailNodeForm.bcc),
          reply_to: emailNodeForm.replyTo.trim(),
          payload: previewPayload.payload,
          bindings: previewPayload.bindings,
          subject_override: emailNodeForm.subjectOverride.trim(),
          html_override: emailNodeForm.htmlOverride,
          text_override: emailNodeForm.textOverride,
        },
      });
      setStatusMessage("Test email sent.");
    } catch (sendError) {
      setNodeConfigError(sendError instanceof Error ? sendError.message : "Unable to send test email.");
    } finally {
      setIsEmailTemplateTestSending(false);
    }
  }, [
    buildEmailTemplatePreviewPayload,
    emailNodeForm.bcc,
    emailNodeForm.cc,
    emailNodeForm.htmlOverride,
    emailNodeForm.replyTo,
    emailNodeForm.subjectOverride,
    emailNodeForm.textOverride,
    emailNodeForm.to,
    nodeConnection,
    selectedEmailTemplate,
  ]);

  const handleNodeConfigSave = async () => {
    if (!scenario || !selectedNode) {
      return;
    }
    let parsedConfig: Record<string, unknown> = {};
    if (selectedNode.type === "http.make_request") {
      if (!httpNodeForm.url.trim()) {
        setNodeConfigError("URL is required.");
        return;
      }
      let nextHttpNodeForm = httpNodeForm;
      if (httpNodeForm.bodyType === "json" && httpNodeForm.bodyText.trim()) {
        const result = beautifyJsonTemplate(httpNodeForm.bodyText);
        if (result.error) {
          setNodeConfigError(result.error);
          return;
        }
        nextHttpNodeForm = { ...httpNodeForm, bodyText: result.value };
        if (result.value !== httpNodeForm.bodyText) {
          setHttpNodeForm(nextHttpNodeForm);
        }
      }
      parsedConfig = buildHttpNodeConfig(nextHttpNodeForm);
    } else if (selectedNode.type === "json.create") {
      const payload: Record<string, unknown> = {};
      for (const mapping of jsonFieldMappings) {
        const fieldName = mapping.fieldName.trim();
        const sourceType = mapping.sourceType || "mapped";
        const sourceToken = mapping.sourceToken.trim();
        const customValue = mapping.customValue;

        if (sourceType === "mapped") {
          if (!fieldName && !sourceToken) {
            continue;
          }
          if (!fieldName) {
            setNodeConfigError("Each mapping row requires a field name.");
            return;
          }
          if (!sourceToken) {
            setNodeConfigError(`Select a source value for field "${fieldName}".`);
            return;
          }
          payload[fieldName] = sourceToken;
          continue;
        }

        if (!fieldName && !customValue.trim()) {
          continue;
        }
        if (!fieldName) {
          setNodeConfigError("Each mapping row requires a field name.");
          return;
        }
        payload[fieldName] = parseCustomJsonFieldValue(customValue);
      }
      if (!Object.keys(payload).length) {
        setNodeConfigError("Add at least one JSON mapping field.");
        return;
      }
      parsedConfig = { payload };
    } else if (selectedNode.type === "email.send") {
      if (emailNodeForm.composeMode === "template") {
        if (!emailNodeForm.templateId.trim()) {
          setNodeConfigError("Select an email template.");
          return;
        }
        const templateBindings: Record<string, string> = {};
        const templatePayload: Record<string, unknown> = {};

        for (const binding of emailNodeForm.bindings) {
          const variableName = binding.variableName.trim();
          if (!variableName) {
            if (
              binding.sourceToken.trim() ||
              binding.customValue.trim()
            ) {
              setNodeConfigError("Each template binding row requires a variable name.");
              return;
            }
            continue;
          }
          if (binding.sourceType === "mapped") {
            if (!binding.sourceToken.trim()) {
              if (binding.required) {
                setNodeConfigError(`Select a mapped value for required variable "${variableName}".`);
                return;
              }
              continue;
            }
            templateBindings[variableName] = binding.sourceToken.trim();
            continue;
          }
          if (!binding.customValue.trim()) {
            if (binding.required) {
              setNodeConfigError(`Provide a value for required variable "${variableName}".`);
              return;
            }
            continue;
          }
          templatePayload[variableName] = parseCustomJsonFieldValue(binding.customValue);
        }

        const config: Record<string, unknown> = {
          composeMode: "template",
          templateId: Number(emailNodeForm.templateId),
          to: parseCommaSeparatedList(emailNodeForm.to),
          cc: parseCommaSeparatedList(emailNodeForm.cc),
          bcc: parseCommaSeparatedList(emailNodeForm.bcc),
        };
        const recipients = [
          ...(config.to as string[]),
          ...(config.cc as string[]),
          ...(config.bcc as string[]),
        ];
        if (!recipients.length) {
          setNodeConfigError("Add at least one recipient in To, CC, or BCC.");
          return;
        }
        if (Object.keys(templateBindings).length) {
          config.templateBindings = templateBindings;
        }
        if (Object.keys(templatePayload).length) {
          config.templatePayload = templatePayload;
        }
        if (emailNodeForm.fromEmail.trim()) {
          config.from = emailNodeForm.fromEmail.trim();
        }
        if (emailNodeForm.replyTo.trim()) {
          config.replyTo = emailNodeForm.replyTo.trim();
        }
        if (emailNodeForm.subjectOverride.trim()) {
          config.subjectOverride = emailNodeForm.subjectOverride.trim();
        }
        if (emailNodeForm.htmlOverride.trim()) {
          config.htmlOverride = emailNodeForm.htmlOverride;
        }
        if (emailNodeForm.textOverride.trim()) {
          config.textOverride = emailNodeForm.textOverride;
        }
        parsedConfig = config;
      } else if (nodeConfigJson.trim()) {
        try {
          const raw = JSON.parse(nodeConfigJson);
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            setNodeConfigError("Operation config must be a JSON object.");
            return;
          }
          parsedConfig = raw as Record<string, unknown>;
        } catch {
          setNodeConfigError("Operation config JSON is invalid.");
          return;
        }
      }
    } else if (nodeConfigJson.trim()) {
      try {
        const raw = JSON.parse(nodeConfigJson);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          setNodeConfigError("Operation config must be a JSON object.");
          return;
        }
        parsedConfig = raw as Record<string, unknown>;
      } catch {
        setNodeConfigError("Operation config JSON is invalid.");
        return;
      }
    }

    if (selectedNodeNeedsConnection && !nodeConnection.trim()) {
      setNodeConfigError("Value must not be empty.");
      return;
    }
    const nextNodes = graph.nodes.map((node) =>
      node.id === selectedNode.id
        ? {
            ...node,
            config: selectedNodeNeedsConnection
              ? {
                  ...parsedConfig,
                  connectionId: nodeConnection.trim(),
                }
              : parsedConfig,
          }
        : node
    );
    const nextGraph = { ...graph, nodes: nextNodes, edges: graph.edges };
    updateGraphState(nextGraph);
    await persistGraph(nextGraph, "Node configuration saved.");
    setNodeConfigError("");
  };

  const handleBeautifyHttpBodyJson = () => {
    if (httpNodeForm.bodyType !== "json") {
      setNodeConfigError("Switch body content type to JSON first.");
      return;
    }
    if (!httpNodeForm.bodyText.trim()) {
      setNodeConfigError("Body is empty.");
      return;
    }
    const result = beautifyJsonTemplate(httpNodeForm.bodyText);
    if (result.error) {
      setNodeConfigError(result.error);
      return;
    }
    setHttpNodeForm((previous) => ({
      ...previous,
      bodyText: result.value,
    }));
    setNodeConfigError("");
    setStatusMessage("HTTP JSON body beautified.");
  };

  const updateHttpPair = (
    field: "headers" | "query",
    index: number,
    key: "key" | "value",
    value: string
  ) => {
    setHttpNodeForm((previous) => {
      const list = [...previous[field]];
      if (!list[index]) {
        return previous;
      }
      list[index] = { ...list[index], [key]: value };
      return { ...previous, [field]: list };
    });
  };

  const addHttpPair = (field: "headers" | "query") => {
    setHttpNodeForm((previous) => ({
      ...previous,
      [field]: [...previous[field], { key: "", value: "" }],
    }));
  };

  const removeHttpPair = (field: "headers" | "query", index: number) => {
    setHttpNodeForm((previous) => ({
      ...previous,
      [field]: previous[field].filter((_, pairIndex) => pairIndex !== index),
    }));
  };

  const updateJsonFieldMapping = (
    mappingId: string,
    key: "fieldName" | "sourceType" | "sourceToken" | "customValue",
    value: string
  ) => {
    setJsonFieldMappings((previous) =>
      previous.map((mapping) =>
        mapping.id === mappingId ? { ...mapping, [key]: value } : mapping
      )
    );
  };

  const addJsonFieldMapping = () => {
    setJsonFieldMappings((previous) => [
      ...previous,
      {
        id: `json_map_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fieldName: "",
        sourceType: "mapped",
        sourceToken: "",
        customValue: "",
      },
    ]);
  };

  const removeJsonFieldMapping = (mappingId: string) => {
    setJsonFieldMappings((previous) =>
      previous.filter((mapping) => mapping.id !== mappingId)
    );
  };

  const handlePublish = async () => {
    if (!scenario) {
      return;
    }
    setIsPublishing(true);
    setError("");
    try {
      const published = await publishScenario(scenario.id, graph);
      const normalizedGraph = ensureGraphShape(published.graph_json);
      setScenario({ ...published, graph_json: normalizedGraph });
      updateGraphState(normalizedGraph);
      setStatusMessage("Scenario published.");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish scenario.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleActivate = async () => {
    if (!scenario) {
      return;
    }
    setIsActivating(true);
    setError("");
    try {
      const activated = await activateScenario(scenario.id);
      const normalizedGraph = ensureGraphShape(activated.graph_json);
      setScenario({ ...activated, graph_json: normalizedGraph });
      updateGraphState(normalizedGraph);
      setStatusMessage("Scenario activated.");
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Unable to activate scenario.");
    } finally {
      setIsActivating(false);
    }
  };

  const handleRunOnce = async () => {
    if (!scenario) {
      return;
    }
    setIsRunning(true);
    setError("");
    const requestId = runPollRequestRef.current + 1;
    runPollRequestRef.current = requestId;
    try {
      const queuedRun = await runScenario(scenario.id);
      setRunOutput(queuedRun);
      setIsRunOutputMinimized(false);
      const runId = Number(queuedRun.id);
      if (!Number.isFinite(runId) || runId <= 0) {
        setStatusMessage("Run queued.");
        return;
      }
      setStatusMessage("Run queued.");

      let latestRun = queuedRun;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const latestStatus = String(latestRun.status || "").toLowerCase();
        if (RUN_TERMINAL_STATUSES.has(latestStatus)) {
          setStatusMessage(`Run ${latestStatus}.`);
          return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        if (runPollRequestRef.current !== requestId) {
          return;
        }
        latestRun = await getRun(runId);
        if (runPollRequestRef.current !== requestId) {
          return;
        }
        setRunOutput(latestRun);
        const status = String(latestRun.status || "").toLowerCase();
        if (status === "running") {
          setStatusMessage("Run in progress...");
        }
        if (RUN_TERMINAL_STATUSES.has(status)) {
          setStatusMessage(`Run ${status}.`);
          return;
        }
      }
      setStatusMessage("Run is taking longer than expected. Refresh run output in a few seconds.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run scenario.");
    } finally {
      if (runPollRequestRef.current === requestId) {
        setIsRunning(false);
      }
    }
  };

  const handleRefreshRunOutput = useCallback(async () => {
    const runId = Number(runOutput?.id);
    if (!Number.isFinite(runId) || runId <= 0) {
      return;
    }
    setIsRefreshingRunOutput(true);
    setError("");
    try {
      const refreshedRun = await getRun(runId);
      setRunOutput(refreshedRun);
      setStatusMessage(`Latest run refreshed. Status: ${formatRunLabel(refreshedRun.status)}.`);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : "Unable to refresh latest run."
      );
    } finally {
      setIsRefreshingRunOutput(false);
    }
  }, [runOutput]);

  const toggleRunStep = (stepId: string) => {
    setExpandedRunSteps((previous) => ({
      ...previous,
      [stepId]: !previous[stepId],
    }));
  };

  const toggleRunSection = (stepId: string, section: "input" | "output" | "error") => {
    const key = `${stepId}:${section}`;
    setExpandedRunSections((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  const handleContextMenuSelect = useCallback(
    (actionId: string) => {
      if (!contextMenuState.open) {
        return;
      }
      const nodeId = contextMenuState.nodeId;
      const node = nodeById.get(nodeId);
      if (!node) {
        return;
      }

      const action = actionId as NodeContextActionId;
      switch (action) {
        case "rename-module":
          void handleRenameNode(nodeId);
          break;
        case "clone-module":
          void handleCloneNode(nodeId);
          break;
        case "copy-module":
          void handleCopyNode(nodeId);
          break;
        case "delete-module":
          void handleDeleteNode(nodeId);
          break;
        case "run-module-only":
          setStatusMessage(`Run module only is not available yet for ${node.title}.`);
          break;
        case "add-error-handler":
          setStatusMessage(`Error handler is not available yet for ${node.title}.`);
          break;
        case "add-note":
          setStatusMessage(`Notes are not available yet for ${node.title}.`);
          break;
        default:
          break;
      }
    },
    [
      contextMenuState,
      handleCloneNode,
      handleCopyNode,
      handleDeleteNode,
      handleRenameNode,
      nodeById,
    ]
  );

  useEffect(() => {
    if (!contextMenuState.open) {
      return;
    }
    if (dragState || connectionDraft) {
      closeContextMenu();
    }
  }, [closeContextMenu, connectionDraft, contextMenuState.open, dragState]);

  useEffect(() => {
    if (!isPickerOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModulePicker();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeModulePicker, isPickerOpen]);

  if (isLoading) {
    return (
      <section className="scenario-canvas-page" role="status" aria-live="polite" aria-label="Loading scenario">
        <div className="scenario-canvas-header scenario-canvas-header--skeleton" aria-hidden="true">
          <div className="ui-shimmer-line ui-shimmer-line--md" />
          <div className="ui-shimmer-line ui-shimmer-line--sm" />
        </div>
        <div className="scenario-canvas-body scenario-canvas-body--skeleton">
          <div className="scenario-canvas-grid scenario-canvas-grid--skeleton">
            <div className="scenario-node-skeleton scenario-node-skeleton--one" />
            <div className="scenario-node-skeleton scenario-node-skeleton--two" />
            <div className="scenario-node-skeleton scenario-node-skeleton--three" />
          </div>
        </div>
      </section>
    );
  }

  if (!scenario) {
    return <p className="scenario-canvas-loading">Scenario not found.</p>;
  }

  return (
    <section className="scenario-canvas-page">
      {error ? (
        <MLAlert className="scenarios-alert">
          <MLAlertTitle>Scenario error</MLAlertTitle>
          <MLAlertDescription>{error}</MLAlertDescription>
        </MLAlert>
      ) : null}
      {statusMessage ? (
        <MLAlert className="scenarios-alert scenarios-alert--success">
          <MLAlertTitle>Success</MLAlertTitle>
          <MLAlertDescription>{statusMessage}</MLAlertDescription>
        </MLAlert>
      ) : null}

      <div className="scenario-canvas-header">
        <div className="scenario-canvas-title">
          <MLButton
            type="button"
            variant="ghost"
            className="scenario-back-button"
            onClick={() => router.push("/dashboard/scenarios")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </MLButton>
          <MLInput
            value={scenario.name}
            onChange={(event) =>
              setScenario((previous) => (previous ? { ...previous, name: event.target.value } : previous))
            }
            onBlur={persistScenarioName}
            className="scenario-title-input"
          />
          <span className={`scenario-status scenario-status--${scenario.status}`}>
            {scenario.status}
          </span>
        </div>
        <div className="scenario-canvas-actions">
          <MLButton
            type="button"
            variant="outline"
            onClick={() => persistGraph(graph)}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save draft"}
          </MLButton>
          <MLButton type="button" variant="outline" onClick={handlePublish} disabled={isPublishing}>
            {isPublishing ? "Publishing..." : "Publish"}
          </MLButton>
          <MLButton type="button" onClick={handleActivate} disabled={isActivating}>
            {isActivating ? "Activating..." : "Activate"}
          </MLButton>
          <MLButton
            type="button"
            variant="outline"
            onClick={handleDeleteSelectedEdge}
            disabled={!selectedEdge || isSaving}
            className="scenario-delete-edge"
          >
            <Trash2 className="h-4 w-4" />
            Delete edge
          </MLButton>
          <MLButton
            type="button"
            variant="outline"
            onClick={handleDeleteSelectedTrigger}
            disabled={!isSelectedTriggerNode || isSaving}
            className="scenario-delete-trigger"
          >
            <Trash2 className="h-4 w-4" />
            Delete trigger
          </MLButton>
        </div>
      </div>

      <div className="scenario-view-tabs" role="tablist" aria-label="Scenario workspace views">
        {[
          { key: "canvas", label: "Canvas" },
          { key: "history", label: "History" },
          { key: "audit", label: "Audit" },
        ].map((view) => (
          <button
            key={view.key}
            type="button"
            role="tab"
            aria-selected={activeScenarioView === view.key}
            className={`scenario-view-tab ${
              activeScenarioView === view.key ? "scenario-view-tab--active" : ""
            }`}
            onClick={() => setActiveScenarioView(view.key as "canvas" | "history" | "audit")}
          >
            {view.label}
          </button>
        ))}
      </div>

      {activeScenarioView === "canvas" ? (
      <div ref={canvasBodyRef} className="scenario-canvas-body">
        <div
          ref={canvasRef}
          className={`scenario-canvas-grid ${graph.nodes.length ? "" : "scenario-canvas-grid--empty"}`}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onClick={handleCanvasClick}
        >
          <svg className="scenario-edge-layer">
            <defs>
              <marker
                id="scenario-arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" className="scenario-edge-arrow" />
              </marker>
              <marker
                id="scenario-arrow-draft"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,6 L9,3 z" className="scenario-edge-arrow scenario-edge-arrow--draft" />
              </marker>
            </defs>

            {graph.edges.map((edge) => {
              const sourceNode = nodeById.get(edge.source);
              const targetNode = nodeById.get(edge.target);
              if (!sourceNode || !targetNode) {
                return null;
              }
              const sourcePoint = getNodeOutputPoint(sourceNode);
              const targetPoint = getNodeInputPoint(targetNode);
              const path = buildEdgePath(sourcePoint, targetPoint);
              const isSelected = edge.id === selectedEdgeId;
              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    className={`scenario-edge ${isSelected ? "scenario-edge--selected" : ""}`}
                    markerEnd="url(#scenario-arrow)"
                  />
                  <path
                    d={path}
                    className="scenario-edge-hitbox"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeContextMenu();
                      setSelectedEdgeId(edge.id);
                      setSelectedNodeId("");
                    }}
                  />
                </g>
              );
            })}

            {connectionDraft ? (
              <path
                d={buildEdgePath(connectionDraft.start, connectionDraft.current)}
                className="scenario-edge scenario-edge--draft"
                markerEnd="url(#scenario-arrow-draft)"
              />
            ) : null}
          </svg>

          {graph.nodes.map((node) => {
            const meta = getNodeMeta(node);
            const isSelected = node.id === selectedNodeId;
            const isDragging = dragState?.nodeId === node.id;
            return (
              <div
                key={node.id}
                className={`scenario-node-card ${isSelected ? "scenario-node-card--active" : ""} ${
                  isDragging ? "scenario-node-card--dragging" : ""
                }`}
                style={{
                  left: node.position?.x ?? 0,
                  top: node.position?.y ?? 0,
                }}
                onMouseDown={(event) => handleNodeMouseDown(event, node.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  closeContextMenu();
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId("");
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId("");
                  setConnectionDraft(null);
                  setContextMenuState({
                    open: true,
                    kind: "node",
                    nodeId: node.id,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                {meta.acceptsInput ? (
                  <button
                    type="button"
                    data-handle="true"
                    className="scenario-node-handle scenario-node-handle--input"
                    onClick={(event) => handleInputHandleClick(event, node)}
                    title={`Input (${meta.inputPortType})`}
                    aria-label={`Input handle for ${node.title}`}
                  />
                ) : null}
                <button
                  type="button"
                  data-handle="true"
                  className="scenario-node-handle scenario-node-handle--output"
                  onClick={(event) => handleOutputHandleClick(event, node)}
                  title={`Output (${meta.outputPortType})`}
                  aria-label={`Output handle for ${node.title}`}
                />

                <div className="scenario-node-card-body">
                  <span className="scenario-node-kind">{meta.kind}</span>
                  <strong>{node.title}</strong>
                  <p>{node.app}</p>
                  <small>ID: {node.id}</small>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className={`scenario-plus ${graph.nodes.length ? "scenario-plus--floating" : ""}`}
            style={
              graph.nodes.length && floatingPlusPosition
                ? {
                    left: floatingPlusPosition.x,
                    top: floatingPlusPosition.y,
                    bottom: "auto",
                  }
                : undefined
            }
            onClick={(event) => {
              event.stopPropagation();
              openModulePicker();
            }}
          >
            <Plus className="h-14 w-14" />
          </button>

          {!graph.nodes.length ? (
            <p className="scenario-canvas-empty-hint">Add your first module to start wiring the flow.</p>
          ) : null}
        </div>

        <NodeContextMenu
          state={contextMenuState}
          entries={contextMenuEntries}
          onClose={closeContextMenu}
          onSelect={handleContextMenuSelect}
        />

        {isPickerOpen ? (
          <div
            className="scenario-picker-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeModulePicker();
              }
            }}
          >
            <div className="scenario-picker" onMouseDown={(event) => event.stopPropagation()}>
              <div className="scenario-picker-toolbar">
                <div className="scenario-picker-search">
                  <Search className="h-4 w-4" />
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Search apps or modules"
                  />
                </div>
                <button
                  type="button"
                  className="scenario-picker-close"
                  onClick={closeModulePicker}
                  aria-label="Close module picker"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="scenario-picker-content">
                <div className="scenario-picker-list">
                  {selectedApp ? (
                    <>
                      <button
                        type="button"
                        className="scenario-picker-back"
                        onClick={() => setSelectedApp(null)}
                      >
                        Back
                      </button>
                      <div className="scenario-picker-app scenario-picker-app--selected">
                        <h3>{selectedApp.name}</h3>
                        <p>{selectedApp.verified ? "Verified" : "Community"}</p>
                      </div>
                      <div className="scenario-module-list">
                        {groupedModulesForSelectedApp.map((group) => (
                          <div key={`module-group-${group.label}`} className="scenario-module-group">
                            {selectedApp.key === "hubspot" ? (
                              <p className="scenario-module-group-label">{group.label}</p>
                            ) : null}
                            {group.modules.map((module) => (
                              <button
                                key={module.type}
                                type="button"
                                className="scenario-module-item"
                                onClick={() => {
                                  void addModuleNode(selectedApp, module);
                                }}
                              >
                                <strong>{module.title}</strong>
                                <span>{module.description}</span>
                              </button>
                            ))}
                          </div>
                        ))}
                        {!groupedModulesForSelectedApp.length ? (
                          <p className="scenario-config-hint">No modules matched your search.</p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      {filteredApps.map((app) => (
                        <button
                          key={app.key}
                          type="button"
                          className="scenario-picker-app"
                          onClick={() => setSelectedApp(app)}
                        >
                          <strong>{app.name}</strong>
                          <span>{app.modules.length} modules</span>
                        </button>
                      ))}
                      {!filteredApps.length ? (
                        <p className="scenario-config-hint">No apps matched your search.</p>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="scenario-picker-categories">
                  {(catalog.categories?.length ? catalog.categories : DEFAULT_CATEGORIES).map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      className={`scenario-picker-category ${
                        selectedCategory === category.key ? "scenario-picker-category--active" : ""
                      }`}
                      onClick={() => {
                        setSelectedCategory(category.key);
                        setSelectedApp(null);
                      }}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {selectedNode ? (
          <aside className="scenario-config-panel">
            <h3>{selectedNode.app}</h3>
            <p>{selectedNode.title}</p>
            {selectedNodeNeedsConnection ? (
              <>
                <label className="scenario-config-label">
                  Connection <span>*</span>
                </label>
                <MLButton
                  type="button"
                  className="scenario-config-create"
                  onClick={openConnectionModal}
                >
                  Create a connection
                </MLButton>
                {isConnectionsLoading ? (
                  <div className="scenario-config-loading" aria-hidden="true">
                    <div className="ui-shimmer-line ui-shimmer-line--full" />
                    <div className="ui-shimmer-line ui-shimmer-line--sm" />
                  </div>
                ) : null}
                <select
                  className="scenario-config-select"
                  value={nodeConnection}
                  disabled={isConnectionsLoading}
                  onChange={(event) => setNodeConnection(event.target.value)}
                >
                  <option value="">Select connection</option>
                  {nodeConnection &&
                  !connections.some((connection) => String(connection.id) === nodeConnection) ? (
                    <option value={nodeConnection}>Current connection #{nodeConnection}</option>
                  ) : null}
                  {connections.map((connection) => (
                    <option key={connection.id} value={String(connection.id)}>
                      {connection.display_name} (#{connection.id})
                    </option>
                  ))}
                </select>
                {!isConnectionsLoading && !connections.length ? (
                  <p className="scenario-config-hint">
                    No {selectedNodeProvider} connection exists yet for your account.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="scenario-config-hint">
                This node type does not require a connection.
              </p>
            )}
            {nodeConfigError ? <p className="scenario-config-error">{nodeConfigError}</p> : null}
            {isSelectedHttpRequestNode ? (
              <>
                <label className="scenario-config-label">Import cURL</label>
                <textarea
                  className="scenario-config-textarea scenario-http-import-input"
                  value={curlImportText}
                  onChange={(event) => setCurlImportText(event.target.value)}
                  placeholder={`curl -X POST "https://api.example.com/v1/items" -H "Content-Type: application/json" -d '{"name":"Demo"}'`}
                />
                {curlImportError ? <p className="scenario-config-error">{curlImportError}</p> : null}
                <div className="scenario-http-import-actions">
                  <MLButton
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCurlImportText("");
                      setCurlImportError("");
                    }}
                  >
                    Clear
                  </MLButton>
                  <MLButton type="button" onClick={handleImportCurl}>
                    Fill fields
                  </MLButton>
                </div>

                <label className="scenario-config-label">Insert mapped value</label>
                <div className="scenario-http-map-row">
                  <select
                    className="scenario-config-select"
                    value={httpTokenPickerValue}
                    onChange={(event) => setHttpTokenPickerValue(event.target.value)}
                  >
                    <option value="">Select prior node output</option>
                    {jsonMappingTokenOptions.map((option) => (
                      <option key={`http-token-${option.token}`} value={option.token}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <MLButton
                    type="button"
                    variant="outline"
                    onClick={handleApplyHttpMappedToken}
                    disabled={!httpTokenPickerValue}
                  >
                    Insert
                  </MLButton>
                </div>
                <p className="scenario-config-hint">
                  {jsonMappingTokenOptions.length
                    ? "Click an HTTP field first, then insert mapped value."
                    : "No mapped output available yet. Save or run upstream nodes to populate choices."}
                  {" "}
                  {httpFocusedField ? `Target: ${httpFocusedField}` : "Default target: body content"}
                </p>

                <label className="scenario-config-label">
                  Authentication type <span>*</span>
                </label>
                <select
                  className="scenario-config-select"
                  value={httpNodeForm.authType}
                  onChange={(event) =>
                    setHttpNodeForm((previous) => ({
                      ...previous,
                      authType: event.target.value as HttpAuthType,
                    }))
                  }
                >
                  <option value="none">No authentication</option>
                  <option value="basic">Basic auth</option>
                  <option value="bearer">Bearer token</option>
                  <option value="apiKey">API key</option>
                </select>

                {httpNodeForm.authType === "basic" ? (
                  <div className="scenario-http-grid">
                    <input
                      className="scenario-config-input"
                      value={httpNodeForm.basicUsername}
                      onFocus={() => setHttpFocusedField("basicUsername")}
                      onChange={(event) =>
                        setHttpNodeForm((previous) => ({
                          ...previous,
                          basicUsername: event.target.value,
                        }))
                      }
                      placeholder="Username"
                    />
                    <input
                      type={isTokenExpression(httpNodeForm.basicPassword) ? "text" : "password"}
                      className="scenario-config-input"
                      value={httpNodeForm.basicPassword}
                      onFocus={() => setHttpFocusedField("basicPassword")}
                      onChange={(event) =>
                        setHttpNodeForm((previous) => ({
                          ...previous,
                          basicPassword: event.target.value,
                        }))
                      }
                      placeholder="Password"
                    />
                  </div>
                ) : null}

                {httpNodeForm.authType === "bearer" ? (
                  <>
                    <input
                      type={isTokenExpression(httpNodeForm.bearerToken) ? "text" : "password"}
                      className="scenario-config-input"
                      value={httpNodeForm.bearerToken}
                      onFocus={() => setHttpFocusedField("bearerToken")}
                      onChange={(event) =>
                        setHttpNodeForm((previous) => ({
                          ...previous,
                          bearerToken: event.target.value,
                        }))
                      }
                      placeholder="Bearer token"
                    />
                    <div className="scenario-http-map-row">
                      <select
                        className="scenario-config-select"
                        value={httpBearerTokenPickerValue}
                        onChange={(event) =>
                          setHttpBearerTokenPickerValue(event.target.value)
                        }
                      >
                        <option value="">Select mapped token field</option>
                        {jsonMappingTokenOptions.map((option) => (
                          <option
                            key={`http-bearer-token-${option.token}`}
                            value={option.token}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <MLButton
                        type="button"
                        variant="outline"
                        onClick={handleApplyBearerTokenMappedValue}
                        disabled={!httpBearerTokenPickerValue}
                      >
                        Use token
                      </MLButton>
                    </div>
                    <p className="scenario-config-hint">
                      Select a mapped value to set bearer token directly.
                    </p>
                  </>
                ) : null}

                {httpNodeForm.authType === "apiKey" ? (
                  <>
                    <div className="scenario-http-grid">
                      <input
                        className="scenario-config-input"
                        value={httpNodeForm.apiKeyName}
                        onFocus={() => setHttpFocusedField("apiKeyName")}
                        onChange={(event) =>
                          setHttpNodeForm((previous) => ({
                            ...previous,
                            apiKeyName: event.target.value,
                          }))
                        }
                        placeholder="API key name"
                      />
                      <input
                        type={isTokenExpression(httpNodeForm.apiKeyValue) ? "text" : "password"}
                        className="scenario-config-input"
                        value={httpNodeForm.apiKeyValue}
                        onFocus={() => setHttpFocusedField("apiKeyValue")}
                        onChange={(event) =>
                          setHttpNodeForm((previous) => ({
                            ...previous,
                            apiKeyValue: event.target.value,
                          }))
                        }
                        placeholder="API key value"
                      />
                    </div>
                    <select
                      className="scenario-config-select"
                      value={httpNodeForm.apiKeyIn}
                      onChange={(event) =>
                        setHttpNodeForm((previous) => ({
                          ...previous,
                          apiKeyIn: event.target.value === "query" ? "query" : "header",
                        }))
                      }
                    >
                      <option value="header">Send in header</option>
                      <option value="query">Send in query</option>
                    </select>
                  </>
                ) : null}

                <label className="scenario-config-label">
                  URL <span>*</span>
                </label>
                <input
                  className="scenario-config-input"
                  value={httpNodeForm.url}
                  onFocus={() => setHttpFocusedField("url")}
                  onChange={(event) =>
                    setHttpNodeForm((previous) => ({
                      ...previous,
                      url: event.target.value,
                    }))
                  }
                  placeholder="https://api.example.com/v1/resource"
                />

                <label className="scenario-config-label">
                  Method <span>*</span>
                </label>
                <select
                  className="scenario-config-select"
                  value={httpNodeForm.method}
                  onChange={(event) =>
                    setHttpNodeForm((previous) => ({
                      ...previous,
                      method: event.target.value.toUpperCase(),
                    }))
                  }
                >
                  {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>

                <label className="scenario-config-label">Headers</label>
                <div className="scenario-http-list">
                  {httpNodeForm.headers.map((pair, index) => (
                    <div key={`header-${index}`} className="scenario-http-row">
                      <input
                        className="scenario-config-input"
                        value={pair.key}
                        onFocus={() => setHttpFocusedField(`headers.${index}.key`)}
                        onChange={(event) =>
                          updateHttpPair("headers", index, "key", event.target.value)
                        }
                        placeholder="Header name"
                      />
                      <input
                        className="scenario-config-input"
                        value={pair.value}
                        onFocus={() => setHttpFocusedField(`headers.${index}.value`)}
                        onChange={(event) =>
                          updateHttpPair("headers", index, "value", event.target.value)
                        }
                        placeholder="Value"
                      />
                      <button
                        type="button"
                        className="scenario-http-remove"
                        onClick={() => removeHttpPair("headers", index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="scenario-http-add"
                    onClick={() => addHttpPair("headers")}
                  >
                    + Add header
                  </button>
                </div>

                <label className="scenario-config-label">Query parameters</label>
                <div className="scenario-http-list">
                  {httpNodeForm.query.map((pair, index) => (
                    <div key={`query-${index}`} className="scenario-http-row">
                      <input
                        className="scenario-config-input"
                        value={pair.key}
                        onFocus={() => setHttpFocusedField(`query.${index}.key`)}
                        onChange={(event) =>
                          updateHttpPair("query", index, "key", event.target.value)
                        }
                        placeholder="Parameter name"
                      />
                      <input
                        className="scenario-config-input"
                        value={pair.value}
                        onFocus={() => setHttpFocusedField(`query.${index}.value`)}
                        onChange={(event) =>
                          updateHttpPair("query", index, "value", event.target.value)
                        }
                        placeholder="Value"
                      />
                      <button
                        type="button"
                        className="scenario-http-remove"
                        onClick={() => removeHttpPair("query", index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="scenario-http-add"
                    onClick={() => addHttpPair("query")}
                  >
                    + Add parameter
                  </button>
                </div>

                <label className="scenario-config-label">Body content type</label>
                <select
                  className="scenario-config-select"
                  value={httpNodeForm.bodyType}
                  onChange={(event) =>
                    setHttpNodeForm((previous) => ({
                      ...previous,
                      bodyType: event.target.value as HttpBodyType,
                    }))
                  }
                >
                  <option value="none">No body</option>
                  <option value="json">JSON</option>
                  <option value="text">Text</option>
                </select>
                {httpNodeForm.bodyType !== "none" ? (
                  <>
                    <textarea
                      ref={httpBodyTextareaRef}
                      className="scenario-config-textarea"
                      value={httpNodeForm.bodyText}
                      onFocus={() => setHttpFocusedField("bodyText")}
                      onChange={(event) =>
                        setHttpNodeForm((previous) => ({
                          ...previous,
                          bodyText: event.target.value,
                        }))
                      }
                      placeholder={
                        httpNodeForm.bodyType === "json"
                          ? '{"email":"{{node_1.body.email}}","password":"admin@123"}'
                          : "Raw request body"
                      }
                    />
                    {httpNodeForm.bodyType === "json" ? (
                      <>
                        <div className="scenario-http-import-actions">
                          <MLButton type="button" variant="outline" onClick={handleBeautifyHttpBodyJson}>
                            Beautify JSON
                          </MLButton>
                        </div>
                        <p className="scenario-config-hint">
                          For mapped string values use quotes, for example:
                          {" "}
                          <code>{`"email":"{{node_1.body.email}}"`}</code>
                        </p>
                      </>
                    ) : null}
                  </>
                ) : null}

                <details className="scenario-http-advanced">
                  <summary>Advanced settings</summary>
                  <label className="scenario-http-toggle">
                    <input
                      type="checkbox"
                      checked={httpNodeForm.parseResponse}
                      onChange={(event) =>
                        setHttpNodeForm((previous) => ({
                          ...previous,
                          parseResponse: event.target.checked,
                        }))
                      }
                    />
                    Parse response body
                  </label>
                  <label className="scenario-http-toggle">
                    <input
                      type="checkbox"
                      checked={httpNodeForm.failOnHttpError}
                      onChange={(event) =>
                        setHttpNodeForm((previous) => ({
                          ...previous,
                          failOnHttpError: event.target.checked,
                        }))
                      }
                    />
                    Return error on 4xx/5xx
                  </label>
                  <label className="scenario-http-toggle">
                    <input
                      type="checkbox"
                      checked={httpNodeForm.allowRedirects}
                      onChange={(event) =>
                        setHttpNodeForm((previous) => ({
                          ...previous,
                          allowRedirects: event.target.checked,
                        }))
                      }
                    />
                    Follow redirects
                  </label>
                  <label className="scenario-config-label">Timeout (seconds)</label>
                  <input
                    className="scenario-config-input"
                    value={httpNodeForm.timeoutSeconds}
                    onChange={(event) =>
                      setHttpNodeForm((previous) => ({
                        ...previous,
                        timeoutSeconds: event.target.value,
                      }))
                    }
                    placeholder="30"
                  />
                </details>
              </>
            ) : isSelectedJsonCreateNode ? (
              <>
                <label className="scenario-config-label">JSON trigger mapping</label>
                <div className="scenario-json-map-list">
                  {jsonFieldMappings.map((mapping) => (
                    <div key={mapping.id} className="scenario-json-map-row">
                      <input
                        className="scenario-config-input"
                        value={mapping.fieldName}
                        onChange={(event) =>
                          updateJsonFieldMapping(mapping.id, "fieldName", event.target.value)
                        }
                        placeholder="Custom field name"
                      />
                      <select
                        className="scenario-config-select"
                        value={mapping.sourceType}
                        onChange={(event) =>
                          updateJsonFieldMapping(mapping.id, "sourceType", event.target.value)
                        }
                      >
                        <option value="mapped">Mapped value</option>
                        <option value="custom">Custom value</option>
                      </select>
                      {mapping.sourceType === "mapped" ? (
                        <select
                          className="scenario-config-select"
                          value={mapping.sourceToken}
                          onChange={(event) =>
                            updateJsonFieldMapping(mapping.id, "sourceToken", event.target.value)
                          }
                        >
                          <option value="">Select prior node output</option>
                          {mapping.sourceToken &&
                          !jsonMappingTokenOptions.some(
                            (option) => option.token === mapping.sourceToken
                          ) ? (
                            <option value={mapping.sourceToken}>{mapping.sourceToken}</option>
                          ) : null}
                          {jsonMappingTokenOptions.map((option) => (
                            <option key={`${mapping.id}-${option.token}`} value={option.token}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="scenario-config-input"
                          value={mapping.customValue}
                          onChange={(event) =>
                            updateJsonFieldMapping(mapping.id, "customValue", event.target.value)
                          }
                          placeholder='Custom value (example: "hello", 123, true, {"a":1})'
                        />
                      )}
                      <button
                        type="button"
                        className="scenario-http-remove scenario-json-map-remove"
                        onClick={() => removeJsonFieldMapping(mapping.id)}
                        aria-label="Remove JSON field mapping"
                        title="Remove mapping"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="scenario-http-add"
                    onClick={addJsonFieldMapping}
                  >
                    + Add field mapping
                  </button>
                </div>
                <p className="scenario-config-hint">
                  Choose a source from prior node outputs. Run once to populate deeper response paths.
                </p>
                <div className="scenario-json-map-preview">
                  <p className="scenario-config-hint">Preview payload</p>
                  <pre>
                    {JSON.stringify(
                      {
                        payload: jsonFieldMappings.reduce<Record<string, unknown>>((acc, item) => {
                          const key = item.fieldName.trim();
                          if (!key) {
                            return acc;
                          }
                          if ((item.sourceType || "mapped") === "mapped") {
                            const token = item.sourceToken.trim();
                            if (token) {
                              acc[key] = token;
                            }
                            return acc;
                          }
                          acc[key] = parseCustomJsonFieldValue(item.customValue);
                          return acc;
                        }, {}),
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              </>
            ) : isSelectedEmailSendNode ? (
              <>
                <label className="scenario-config-label">Compose mode</label>
                <select
                  className="scenario-config-select"
                  value={emailNodeForm.composeMode}
                  onChange={(event) =>
                    setEmailNodeForm((previous) => ({
                      ...previous,
                      composeMode:
                        event.target.value === "template" ? "template" : "inline",
                    }))
                  }
                >
                  <option value="inline">Inline config</option>
                  <option value="template">Template</option>
                </select>

                {emailNodeForm.composeMode === "template" ? (
                  <>
                    <div className="scenario-email-template-toolbar">
                      <MLButton
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void loadEmailTemplatesForScenario();
                        }}
                        disabled={isEmailTemplatesLoading}
                      >
                        Refresh templates
                      </MLButton>
                      <MLButton
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            window.open("/dashboard/email-templates", "_blank", "noopener,noreferrer");
                          }
                        }}
                      >
                        Open library
                      </MLButton>
                    </div>

                    <label className="scenario-config-label">
                      Template <span>*</span>
                    </label>
                    <select
                      className="scenario-config-select"
                      value={emailNodeForm.templateId}
                      disabled={isEmailTemplatesLoading}
                      onChange={(event) =>
                        setEmailNodeForm((previous) => ({
                          ...previous,
                          templateId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select template</option>
                      {emailTemplates.map((template) => (
                        <option key={template.id} value={String(template.id)}>
                          {template.name} ({template.category.replace(/_/g, " ")})
                        </option>
                      ))}
                    </select>
                    {selectedEmailTemplate ? (
                      <div className="scenario-email-template-summary">
                        <strong>{selectedEmailTemplate.name}</strong>
                        <span>
                          v{selectedEmailTemplate.current_version}
                          {selectedEmailTemplate.is_system_template ? " · system" : ""}
                        </span>
                        <p>{selectedEmailTemplate.description || "Reusable template."}</p>
                      </div>
                    ) : null}

                    <div className="scenario-http-grid">
                      <label className="email-template-field">
                        <span>To</span>
                        <input
                          className="scenario-config-input"
                          value={emailNodeForm.to}
                          onChange={(event) =>
                            setEmailNodeForm((previous) => ({
                              ...previous,
                              to: event.target.value,
                            }))
                          }
                          placeholder="user@example.com, ops@example.com"
                        />
                      </label>
                      <label className="email-template-field">
                        <span>CC</span>
                        <input
                          className="scenario-config-input"
                          value={emailNodeForm.cc}
                          onChange={(event) =>
                            setEmailNodeForm((previous) => ({
                              ...previous,
                              cc: event.target.value,
                            }))
                          }
                          placeholder="team@example.com"
                        />
                      </label>
                      <label className="email-template-field">
                        <span>BCC</span>
                        <input
                          className="scenario-config-input"
                          value={emailNodeForm.bcc}
                          onChange={(event) =>
                            setEmailNodeForm((previous) => ({
                              ...previous,
                              bcc: event.target.value,
                            }))
                          }
                          placeholder="audit@example.com"
                        />
                      </label>
                      <label className="email-template-field">
                        <span>From override</span>
                        <input
                          className="scenario-config-input"
                          value={emailNodeForm.fromEmail}
                          onChange={(event) =>
                            setEmailNodeForm((previous) => ({
                              ...previous,
                              fromEmail: event.target.value,
                            }))
                          }
                          placeholder="no-reply@example.com"
                        />
                      </label>
                      <label className="email-template-field">
                        <span>Reply-to</span>
                        <input
                          className="scenario-config-input"
                          value={emailNodeForm.replyTo}
                          onChange={(event) =>
                            setEmailNodeForm((previous) => ({
                              ...previous,
                              replyTo: event.target.value,
                            }))
                          }
                          placeholder="support@example.com"
                        />
                      </label>
                    </div>

                    <label className="scenario-config-label">Template variables</label>
                    <div className="scenario-email-template-bindings">
                      {emailNodeForm.bindings.length ? (
                        emailNodeForm.bindings.map((binding) => (
                          <div key={binding.id} className="scenario-email-template-binding-row">
                            <input
                              className="scenario-config-input"
                              value={binding.variableName}
                              onChange={(event) =>
                                updateEmailTemplateBinding(
                                  binding.id,
                                  "variableName",
                                  event.target.value
                                )
                              }
                              placeholder="Variable name"
                            />
                            <select
                              className="scenario-config-select"
                              value={binding.sourceType}
                              onChange={(event) =>
                                updateEmailTemplateBinding(
                                  binding.id,
                                  "sourceType",
                                  event.target.value
                                )
                              }
                            >
                              <option value="mapped">Mapped value</option>
                              <option value="custom">Custom value</option>
                            </select>
                            {binding.sourceType === "mapped" ? (
                              <select
                                className="scenario-config-select"
                                value={binding.sourceToken}
                                onChange={(event) =>
                                  updateEmailTemplateBinding(
                                    binding.id,
                                    "sourceToken",
                                    event.target.value
                                  )
                                }
                              >
                                <option value="">Select prior node output</option>
                                {binding.sourceToken &&
                                !jsonMappingTokenOptions.some(
                                  (option) => option.token === binding.sourceToken
                                ) ? (
                                  <option value={binding.sourceToken}>{binding.sourceToken}</option>
                                ) : null}
                                {jsonMappingTokenOptions.map((option) => (
                                  <option key={`${binding.id}-${option.token}`} value={option.token}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="scenario-config-input"
                                value={binding.customValue}
                                onChange={(event) =>
                                  updateEmailTemplateBinding(
                                    binding.id,
                                    "customValue",
                                    event.target.value
                                  )
                                }
                                placeholder='Custom value or JSON literal'
                              />
                            )}
                            <button
                              type="button"
                              className="scenario-http-remove scenario-json-map-remove"
                              onClick={() => removeEmailTemplateBinding(binding.id)}
                              aria-label="Remove template binding"
                              title="Remove binding"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <p className="scenario-config-hint scenario-email-template-binding-meta">
                              {binding.label || binding.variableName || "Variable"}
                              {binding.required ? " · required" : ""}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="scenario-config-hint">
                          No variables are defined yet. Add custom variables if needed.
                        </p>
                      )}
                      <button
                        type="button"
                        className="scenario-http-add"
                        onClick={addEmailTemplateBinding}
                      >
                        + Add template variable
                      </button>
                    </div>

                    <details className="scenario-http-advanced" open>
                      <summary>Preview and overrides</summary>
                      <label className="scenario-config-label">Subject override</label>
                      <input
                        className="scenario-config-input"
                        value={emailNodeForm.subjectOverride}
                        onChange={(event) =>
                          setEmailNodeForm((previous) => ({
                            ...previous,
                            subjectOverride: event.target.value,
                          }))
                        }
                        placeholder="Optional subject override"
                      />
                      <label className="scenario-config-label">HTML override</label>
                      <textarea
                        className="scenario-config-textarea"
                        value={emailNodeForm.htmlOverride}
                        onChange={(event) =>
                          setEmailNodeForm((previous) => ({
                            ...previous,
                            htmlOverride: event.target.value,
                          }))
                        }
                        placeholder="Optional HTML override"
                      />
                      <label className="scenario-config-label">Text override</label>
                      <textarea
                        className="scenario-config-textarea"
                        value={emailNodeForm.textOverride}
                        onChange={(event) =>
                          setEmailNodeForm((previous) => ({
                            ...previous,
                            textOverride: event.target.value,
                          }))
                        }
                        placeholder="Optional text override"
                      />
                      <div className="scenario-email-template-toolbar">
                        <MLButton
                          type="button"
                          variant="outline"
                          onClick={handlePreviewEmailTemplate}
                          disabled={!selectedEmailTemplate || isEmailTemplatePreviewLoading}
                        >
                          Preview
                        </MLButton>
                        <MLButton
                          type="button"
                          variant="outline"
                          onClick={handleTestSendSelectedEmailTemplate}
                          disabled={
                            !selectedEmailTemplate ||
                            !nodeConnection.trim() ||
                            isEmailTemplateTestSending
                          }
                        >
                          Test send
                        </MLButton>
                      </div>
                      {emailTemplatePreviewError ? (
                        <p className="scenario-config-error">{emailTemplatePreviewError}</p>
                      ) : null}
                      {emailTemplatePreview ? (
                        <div className="scenario-email-template-preview">
                          <div className="scenario-email-template-preview-section">
                            <span>Subject</span>
                            <strong>{emailTemplatePreview.subject || "No subject"}</strong>
                          </div>
                          <div className="scenario-email-template-preview-section">
                            <span>HTML preview</span>
                            <div
                              className="scenario-email-template-preview-html"
                              dangerouslySetInnerHTML={{
                                __html:
                                  emailTemplatePreview.html || "<p>No HTML content generated.</p>",
                              }}
                            />
                          </div>
                          <div className="scenario-email-template-preview-section">
                            <span>Text preview</span>
                            <pre>{emailTemplatePreview.text || "No text content generated."}</pre>
                          </div>
                          <p className="scenario-config-hint">
                            Missing variables:{" "}
                            {emailTemplatePreview.missing_variables.length
                              ? emailTemplatePreview.missing_variables.join(", ")
                              : "None"}
                          </p>
                        </div>
                      ) : null}
                    </details>
                  </>
                ) : (
                  <>
                    <label className="scenario-config-label">Insert mapped value</label>
                    <div className="scenario-http-map-row">
                      <select
                        className="scenario-config-select"
                        value={nodeConfigTokenPickerValue}
                        onChange={(event) => setNodeConfigTokenPickerValue(event.target.value)}
                      >
                        <option value="">Select prior node output</option>
                        {jsonMappingTokenOptions.map((option) => (
                          <option key={`node-config-token-${option.token}`} value={option.token}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <MLButton
                        type="button"
                        variant="outline"
                        onClick={handleInsertNodeConfigMappedToken}
                        disabled={!nodeConfigTokenPickerValue}
                      >
                        Insert
                      </MLButton>
                    </div>
                    <p className="scenario-config-hint">
                      Keep existing inline email config for backward compatibility.
                    </p>
                    <label className="scenario-config-label">Operation config (JSON)</label>
                    <textarea
                      ref={nodeConfigTextareaRef}
                      className="scenario-config-textarea"
                      value={nodeConfigJson}
                      onChange={(event) => setNodeConfigJson(event.target.value)}
                      placeholder='{"to":["user@example.com"],"subject":"Hello","bodyText":"Hi there"}'
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <label className="scenario-config-label">Insert mapped value</label>
                <div className="scenario-http-map-row">
                  <select
                    className="scenario-config-select"
                    value={nodeConfigTokenPickerValue}
                    onChange={(event) => setNodeConfigTokenPickerValue(event.target.value)}
                  >
                    <option value="">Select prior node output</option>
                    {jsonMappingTokenOptions.map((option) => (
                      <option key={`node-config-token-${option.token}`} value={option.token}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <MLButton
                    type="button"
                    variant="outline"
                    onClick={handleInsertNodeConfigMappedToken}
                    disabled={!nodeConfigTokenPickerValue}
                  >
                    Insert
                  </MLButton>
                </div>
                <p className="scenario-config-hint">
                  {jsonMappingTokenOptions.length
                    ? "Insert mapped values into any required field in operation config."
                    : "No mapped output available yet. Save or run upstream nodes to populate choices."}
                </p>
                <label className="scenario-config-label">Operation config (JSON)</label>
                <textarea
                  ref={nodeConfigTextareaRef}
                  className="scenario-config-textarea"
                  value={nodeConfigJson}
                  onChange={(event) => setNodeConfigJson(event.target.value)}
                  placeholder='{"issueIdOrKey":"ABC-123","jql":"project = ABC"}'
                />
                <p className="scenario-config-hint">{nodeConfigHintText}</p>
              </>
            )}
            <div className="scenario-config-actions">
              {isSelectedTriggerNode ? (
                <MLButton
                  type="button"
                  variant="outline"
                  className="scenario-delete-trigger"
                  onClick={handleDeleteSelectedTrigger}
                  disabled={isSaving}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete trigger
                </MLButton>
              ) : null}
              <MLButton
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedNodeId("");
                  setConnectionDraft(null);
                }}
              >
                Cancel
              </MLButton>
              <MLButton type="button" onClick={handleNodeConfigSave}>
                Save
              </MLButton>
            </div>
          </aside>
        ) : null}

        {isConnectionModalOpen && selectedNode ? (
          <div className="scenario-connection-modal-backdrop" role="presentation">
            <div className="scenario-connection-modal" role="dialog" aria-modal="true">
              <h3>Create a connection</h3>
              <p>
                {selectedNodeProvider === "jira"
                  ? jiraConnectionAuthMode === "oauth"
                    ? "Jira OAuth"
                    : "Jira API Token"
                  : selectedNodeProvider === "hubspot"
                    ? "HubSpot access token"
                    : selectedNodeProvider === "email"
                      ? emailConnectionAuthMode === "oauth"
                        ? "Email OAuth (XOAUTH2)"
                        : "Email SMTP/IMAP credentials"
                    : "Jenkins OAuth"}
              </p>

              {selectedNodeProvider === "jira" ? (
                <div className="scenario-connection-form">
                  <div className="scenario-connection-auth-switch">
                    <button
                      type="button"
                      className={
                        jiraConnectionAuthMode === "oauth"
                          ? "scenario-connection-auth-button scenario-connection-auth-button--active"
                          : "scenario-connection-auth-button"
                      }
                      onClick={() => setJiraConnectionAuthMode("oauth")}
                    >
                      OAuth
                    </button>
                    <button
                      type="button"
                      className={
                        jiraConnectionAuthMode === "apiToken"
                          ? "scenario-connection-auth-button scenario-connection-auth-button--active"
                          : "scenario-connection-auth-button"
                      }
                      onClick={() => setJiraConnectionAuthMode("apiToken")}
                    >
                      API token
                    </button>
                  </div>

                  <label>
                    Connection name
                    <input
                      value={jiraConnectionName}
                      onChange={(event) => setJiraConnectionName(event.target.value)}
                      placeholder="My Jira connection"
                    />
                  </label>

                  {jiraConnectionAuthMode === "oauth" ? (
                    <>
                      <label>
                        Preferred Jira site URL (optional)
                        <input
                          value={jiraOauthServiceUrl}
                          onChange={(event) => setJiraOauthServiceUrl(event.target.value)}
                          placeholder="https://your-domain.atlassian.net"
                        />
                      </label>
                      <p className="scenario-config-hint">
                        OAuth redirect URI must point to
                        {" "}
                        <code>/dashboard/integrations/jira/oauth-callback</code>.
                      </p>
                    </>
                  ) : (
                    <>
                      <label>
                        Service URL
                        <input
                          value={jiraServiceUrl}
                          onChange={(event) => setJiraServiceUrl(event.target.value)}
                          placeholder="https://your-domain.atlassian.net"
                        />
                      </label>
                      <label>
                        Username
                        <input
                          value={jiraUsername}
                          onChange={(event) => setJiraUsername(event.target.value)}
                          placeholder="user@example.com"
                        />
                      </label>
                      <label>
                        API token
                        <input
                          type="password"
                          value={jiraApiToken}
                          onChange={(event) => setJiraApiToken(event.target.value)}
                          placeholder="Atlassian API token"
                        />
                      </label>
                    </>
                  )}
                </div>
              ) : selectedNodeProvider === "hubspot" ? (
                <div className="scenario-connection-form">
                  <label>
                    Connection name
                    <input
                      value={hubspotConnectionName}
                      onChange={(event) => setHubspotConnectionName(event.target.value)}
                      placeholder="HubSpot CRM connection"
                    />
                  </label>
                  <label>
                    Service URL
                    <input
                      value={hubspotServiceUrl}
                      onChange={(event) => setHubspotServiceUrl(event.target.value)}
                      placeholder="https://api.hubapi.com"
                    />
                  </label>
                  <label>
                    Access token
                    <input
                      type="password"
                      value={hubspotAccessToken}
                      onChange={(event) => setHubspotAccessToken(event.target.value)}
                      placeholder="HubSpot private app token"
                    />
                  </label>
                </div>
              ) : selectedNodeProvider === "email" ? (
                <div className="scenario-connection-form">
                  <div className="scenario-connection-auth-switch">
                    <button
                      type="button"
                      className={
                        emailConnectionAuthMode === "apiToken"
                          ? "scenario-connection-auth-button scenario-connection-auth-button--active"
                          : "scenario-connection-auth-button"
                      }
                      onClick={() => setEmailConnectionAuthMode("apiToken")}
                    >
                      Password
                    </button>
                    <button
                      type="button"
                      className={
                        emailConnectionAuthMode === "oauth"
                          ? "scenario-connection-auth-button scenario-connection-auth-button--active"
                          : "scenario-connection-auth-button"
                      }
                      onClick={() => setEmailConnectionAuthMode("oauth")}
                    >
                      OAuth token
                    </button>
                  </div>
                  <label>
                    Connection name
                    <input
                      value={emailConnectionName}
                      onChange={(event) => setEmailConnectionName(event.target.value)}
                      placeholder="Email connection"
                    />
                  </label>
                  <label>
                    Username / mailbox
                    <input
                      value={emailUsername}
                      onChange={(event) => setEmailUsername(event.target.value)}
                      placeholder="notifications@yourdomain.com"
                    />
                  </label>
                  <label>
                    Default from email (optional)
                    <input
                      value={emailDefaultFromEmail}
                      onChange={(event) => setEmailDefaultFromEmail(event.target.value)}
                      placeholder="notifications@yourdomain.com"
                    />
                  </label>

                  <p className="scenario-config-hint">SMTP settings (required for email.send)</p>
                  <div className="scenario-http-grid">
                    <input
                      value={emailSmtpHost}
                      onChange={(event) => setEmailSmtpHost(event.target.value)}
                      placeholder="smtp.example.com"
                    />
                    <input
                      value={emailSmtpPort}
                      onChange={(event) => setEmailSmtpPort(event.target.value)}
                      placeholder={emailSmtpUseSsl ? "465" : "587"}
                    />
                  </div>
                  <label className="scenario-http-toggle">
                    <input
                      type="checkbox"
                      checked={emailSmtpUseSsl}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setEmailSmtpUseSsl(checked);
                        if (checked) {
                          setEmailSmtpUseStarttls(false);
                        }
                        setEmailSmtpPort((previous) => {
                          const trimmed = previous.trim();
                          if (trimmed && trimmed !== "587" && trimmed !== "465") {
                            return previous;
                          }
                          return checked ? "465" : "587";
                        });
                      }}
                    />
                    Use SMTP SSL
                  </label>
                  <label className="scenario-http-toggle">
                    <input
                      type="checkbox"
                      checked={emailSmtpUseStarttls}
                      onChange={(event) => setEmailSmtpUseStarttls(event.target.checked)}
                      disabled={emailSmtpUseSsl}
                    />
                    Use STARTTLS
                  </label>
                  {emailConnectionAuthMode === "oauth" ? (
                    <label>
                      SMTP access token
                      <input
                        type="password"
                        value={emailSmtpAccessToken}
                        onChange={(event) => setEmailSmtpAccessToken(event.target.value)}
                        placeholder="OAuth access token"
                      />
                    </label>
                  ) : (
                    <label>
                      SMTP password
                      <input
                        type="password"
                        value={emailSmtpPassword}
                        onChange={(event) => setEmailSmtpPassword(event.target.value)}
                        placeholder="Mailbox or app password"
                      />
                    </label>
                  )}

                  <p className="scenario-config-hint">IMAP settings (required for email.watch.inbox)</p>
                  <div className="scenario-http-grid">
                    <input
                      value={emailImapHost}
                      onChange={(event) => setEmailImapHost(event.target.value)}
                      placeholder="imap.example.com"
                    />
                    <input
                      value={emailImapPort}
                      onChange={(event) => setEmailImapPort(event.target.value)}
                      placeholder="993"
                    />
                  </div>
                  <label className="scenario-http-toggle">
                    <input
                      type="checkbox"
                      checked={emailImapUseSsl}
                      onChange={(event) => setEmailImapUseSsl(event.target.checked)}
                    />
                    Use IMAP SSL
                  </label>
                  {emailConnectionAuthMode === "oauth" ? (
                    <label>
                      IMAP access token (optional, falls back to SMTP token)
                      <input
                        type="password"
                        value={emailImapAccessToken}
                        onChange={(event) => setEmailImapAccessToken(event.target.value)}
                        placeholder="OAuth access token"
                      />
                    </label>
                  ) : (
                    <label>
                      IMAP password (optional, falls back to SMTP password)
                      <input
                        type="password"
                        value={emailImapPassword}
                        onChange={(event) => setEmailImapPassword(event.target.value)}
                        placeholder="Mailbox or app password"
                      />
                    </label>
                  )}
                  <label>
                    Default mailbox (optional)
                    <input
                      value={emailMailbox}
                      onChange={(event) => setEmailMailbox(event.target.value)}
                      placeholder="INBOX"
                    />
                  </label>
                </div>
              ) : (
                <div className="scenario-connection-form">
                  <label>
                    Connection name
                    <input
                      value={jenkinsConnectionName}
                      onChange={(event) => setJenkinsConnectionName(event.target.value)}
                      placeholder="My Jenkins OAuth connection"
                    />
                  </label>
                  <label>
                    Jenkins base URL
                    <input
                      value={jenkinsBaseUrl}
                      onChange={(event) => setJenkinsBaseUrl(event.target.value)}
                      placeholder="https://jenkins.example.com"
                    />
                  </label>
                  <p className="scenario-config-hint">
                    OAuth redirect URI must point to
                    {" "}
                    <code>/dashboard/integrations/jenkins/oauth-callback</code>.
                  </p>
                </div>
              )}

              {connectionModalError ? <p className="scenario-config-error">{connectionModalError}</p> : null}
              {connectionModalStatus ? <p className="scenario-config-success">{connectionModalStatus}</p> : null}

              <div className="scenario-config-actions">
                <MLButton
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsConnectionModalOpen(false);
                    setConnectionModalError("");
                    setConnectionModalStatus("");
                  }}
                >
                  Cancel
                </MLButton>
                {selectedNodeProvider === "jira" ? (
                  <MLButton
                    type="button"
                    onClick={
                      jiraConnectionAuthMode === "oauth"
                        ? handleStartJiraOAuth
                        : handleCreateJiraConnection
                    }
                    disabled={isCreatingConnection}
                  >
                    {isCreatingConnection
                      ? jiraConnectionAuthMode === "oauth"
                        ? "Opening OAuth..."
                        : "Creating..."
                      : jiraConnectionAuthMode === "oauth"
                        ? "Connect with OAuth"
                        : "Create connection"}
                  </MLButton>
                ) : selectedNodeProvider === "hubspot" ? (
                  <MLButton
                    type="button"
                    onClick={handleCreateHubspotConnection}
                    disabled={isCreatingConnection}
                  >
                    {isCreatingConnection ? "Creating..." : "Create connection"}
                  </MLButton>
                ) : selectedNodeProvider === "email" ? (
                  <MLButton
                    type="button"
                    onClick={handleCreateEmailConnection}
                    disabled={isCreatingConnection}
                  >
                    {isCreatingConnection ? "Creating..." : "Create connection"}
                  </MLButton>
                ) : (
                  <MLButton
                    type="button"
                    onClick={handleStartJenkinsOAuth}
                    disabled={isCreatingConnection}
                  >
                    {isCreatingConnection ? "Opening OAuth..." : "Connect with OAuth"}
                  </MLButton>
                )}
              </div>
            </div>
          </div>
        ) : null}
        <div className="scenario-runbar scenario-runbar--floating">
          <MLButton type="button" onClick={handleRunOnce} disabled={isRunning}>
            {isRunning ? "Running..." : "Run once"}
          </MLButton>
          <span>Polling trigger: Every 15 minutes</span>
          {selectedEdge ? (
            <span className="scenario-runbar-edge">
              Selected edge: {selectedEdge.source} → {selectedEdge.target}
            </span>
          ) : null}
        </div>

        {runOutput ? (
          <section
            ref={runOutputRef}
            className={`scenario-run-output scenario-run-output--floating ${
              runOutputDragState ? "scenario-run-output--dragging" : ""
            }`}
            style={
              runOutputPosition
                ? {
                    left: runOutputPosition.x,
                    top: runOutputPosition.y,
                    right: "auto",
                    bottom: "auto",
                  }
                : undefined
            }
          >
            <div
              className="scenario-run-output-header"
              onMouseDown={handleRunOutputHeaderMouseDown}
            >
              <div className="scenario-run-output-title">
                <h4>Latest run output</h4>
                <span className={`scenario-run-pill scenario-run-pill--${runLifecycleSummary.status}`}>
                  {formatRunLabel(runLifecycleSummary.status)}
                </span>
              </div>
              <div className="scenario-run-output-actions">
                <button
                  type="button"
                  className="scenario-run-output-action"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    void handleRefreshRunOutput();
                  }}
                  disabled={isRefreshingRunOutput}
                  aria-label="Refresh run output"
                  title="Refresh"
                >
                  <RefreshCw
                    className={
                      isRefreshingRunOutput
                        ? "h-4 w-4 scenario-run-output-action-icon--spinning"
                        : "h-4 w-4"
                    }
                  />
                </button>
                <button
                  type="button"
                  className="scenario-run-output-action"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => setIsRunOutputMinimized((previous) => !previous)}
                  aria-label={isRunOutputMinimized ? "Expand run output" : "Minimize run output"}
                  title={isRunOutputMinimized ? "Expand" : "Minimize"}
                >
                  {isRunOutputMinimized ? (
                    <Maximize2 className="h-4 w-4" />
                  ) : (
                    <Minimize2 className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  className="scenario-run-output-action"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => setRunOutput(null)}
                  aria-label="Close run output"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {!isRunOutputMinimized ? (
              <div className="scenario-run-output-body">
                <div className="scenario-run-summary">
                  <span className="scenario-run-meta-item">Run #{runLifecycleSummary.runId || "n/a"}</span>
                  <span className="scenario-run-meta-item">
                    Trigger: {runLifecycleSummary.triggerType}
                  </span>
                  <span className="scenario-run-meta-item">
                    Attempts: {runLifecycleSummary.attemptCount || 1}
                  </span>
                  <span className="scenario-run-meta-item">
                    Duration: {formatRunDurationMs(runLifecycleSummary.durationMs)}
                  </span>
                </div>

                <div className="scenario-run-metrics">
                  <article className="scenario-run-metric-card">
                    <span>Total steps</span>
                    <strong>{runSteps.length}</strong>
                  </article>
                  <article className="scenario-run-metric-card">
                    <span>Executed nodes</span>
                    <strong>
                      {runLifecycleSummary.executedNodes} / {runLifecycleSummary.nodeCount}
                    </strong>
                  </article>
                  <article className="scenario-run-metric-card">
                    <span>Succeeded</span>
                    <strong>{runStepCounts.succeeded || 0}</strong>
                  </article>
                  <article className="scenario-run-metric-card">
                    <span>Failed</span>
                    <strong>{runStepCounts.failed || 0}</strong>
                  </article>
                </div>

                <div className="scenario-run-timeline">
                  <div className="scenario-run-timeline-item">
                    <span>Queued</span>
                    <strong>{formatRunDateTime(runLifecycleSummary.queuedAt)}</strong>
                  </div>
                  <div className="scenario-run-timeline-item">
                    <span>Started</span>
                    <strong>{formatRunDateTime(runLifecycleSummary.startedAt)}</strong>
                  </div>
                  <div className="scenario-run-timeline-item">
                    <span>Ended</span>
                    <strong>{formatRunDateTime(runLifecycleSummary.endedAt)}</strong>
                  </div>
                </div>

                {runRecoveryMessage ? (
                  <div className="scenario-run-warning">
                    <strong>Recovery note</strong>
                    <p>{runRecoveryMessage}</p>
                  </div>
                ) : null}

                {runSteps.length ? (
                  <div className="scenario-run-steps">
                    {runSteps.map((step, index) => {
                      const stepId = getRunStepId(step, index);
                      const stepStatus = getRunStepStatus(step);
                      const isExpanded = Boolean(expandedRunSteps[stepId]);
                      const errorMessage = getRunStepErrorMessage(step);
                      const duration = step.duration_ms;
                      const stepTitle = String(step.node_type || step.node_id || stepId);
                      const sections = ([
                        { key: "input", label: "Input", value: step.input_json || {} },
                        {
                          key: "output",
                          label: "Output",
                          value: step.output_raw_json || step.output_normalized_json || {},
                        },
                        { key: "error", label: "Error", value: step.error_json || {} },
                      ] as Array<{
                        key: "input" | "output" | "error";
                        label: string;
                        value: unknown;
                      }>).filter((section) => hasRunSectionValue(section.value));

                      return (
                        <article
                          key={stepId}
                          className={`scenario-run-step scenario-run-step--${stepStatus}`}
                        >
                          <button
                            type="button"
                            className="scenario-run-step-toggle"
                            onClick={() => toggleRunStep(stepId)}
                          >
                            <span className="scenario-run-step-heading">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <strong>Step {index + 1}</strong>
                              <span className="scenario-run-step-title">{stepTitle}</span>
                            </span>
                            <span className={`scenario-run-step-badge scenario-run-step-badge--${stepStatus}`}>
                              {stepStatus}
                            </span>
                          </button>
                          {isExpanded ? (
                            <div className="scenario-run-step-content">
                              <div className="scenario-run-step-meta">
                                <span>Node: {String(step.node_id || stepId)}</span>
                                <span>
                                  Duration: {formatRunDurationMs(duration)}
                                </span>
                              </div>
                              {errorMessage ? (
                                <p className="scenario-run-step-error-summary">{errorMessage}</p>
                              ) : null}
                              {sections.length ? (
                                <div className="scenario-run-step-sections">
                                  {sections.map((section) => {
                                    const sectionKey = `${stepId}:${section.key}`;
                                    const isSectionExpanded = Boolean(
                                      expandedRunSections[sectionKey]
                                    );
                                    return (
                                      <div key={sectionKey} className="scenario-run-step-section">
                                        <div className="scenario-run-step-section-header">
                                          <strong>{section.label}</strong>
                                          <button
                                            type="button"
                                            className="scenario-run-step-section-toggle"
                                            onClick={() => toggleRunSection(stepId, section.key)}
                                          >
                                            {isSectionExpanded ? "Hide" : "Show"}
                                          </button>
                                        </div>
                                        {isSectionExpanded ? (
                                          <pre>{JSON.stringify(section.value ?? {}, null, 2)}</pre>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="scenario-config-hint">
                                  No structured input/output payload was captured for this step.
                                </p>
                              )}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="scenario-run-empty">
                    <strong>No step output captured yet.</strong>
                    <p>
                      This usually means the run is still waiting, still executing, or failed before
                      a node produced structured step output.
                    </p>
                  </div>
                )}

                <details className="scenario-run-raw-toggle">
                  <summary>Raw run JSON</summary>
                  <pre>{JSON.stringify(runOutput, null, 2)}</pre>
                </details>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
      ) : (
        <div className="scenario-canvas-body scenario-canvas-body--history">
          <ScenarioHistoryExplorer
            scenarioId={scenarioId}
            nodes={graph.nodes}
            mode={activeScenarioView === "audit" ? "audit" : "history"}
            onJumpToNode={handleJumpToCanvasNode}
          />
        </div>
      )}
    </section>
  );
};

ScenarioCanvasPage.dashboardMeta = (t) => ({
  title: t("nav.scenarios"),
  description: "Build scenario flows on the orchestration canvas.",
  hideHeader: true,
});

export default ScenarioCanvasPage;
