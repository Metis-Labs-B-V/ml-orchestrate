export type ScenarioStatus = "draft" | "published" | "active" | "inactive";

export type ScenarioNode = {
  id: string;
  type: string;
  title: string;
  app: string;
  kind?: "trigger" | "action" | "search" | "utility";
  acceptsInput?: boolean;
  inputPortType?: string;
  outputPortType?: string;
  position?: {
    x: number;
    y: number;
  };
  config?: Record<string, unknown>;
};

export type ScenarioEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  sourcePortType?: string;
  targetPortType?: string;
  label?: string;
};

export type ScenarioGraph = {
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
};

export type ScenarioRecord = {
  id: number;
  name: string;
  description: string;
  status: ScenarioStatus;
  graph_json: ScenarioGraph;
  current_version: number;
  activated_at: string | null;
  tenant_id: number | null;
  tenant_name?: string;
  workspace_id: number | null;
  workspace_name?: string;
  created_at: string;
  updated_at: string;
};

export type IntegrationCategory = {
  key: string;
  label: string;
};

export type IntegrationModule = {
  type: string;
  title: string;
  kind: "trigger" | "action" | "search" | "utility";
  description: string;
  group?: string;
  acceptsInput?: boolean;
  inputPortType?: string;
  outputPortType?: string;
};

export type IntegrationApp = {
  key: string;
  name: string;
  verified: boolean;
  categories: string[];
  modules: IntegrationModule[];
};

export type IntegrationCatalog = {
  categories: IntegrationCategory[];
  apps: IntegrationApp[];
};

export type ConnectionRecord = {
  id: number;
  provider: string;
  auth_type: "apiToken" | "oauth";
  display_name: string;
  tenant_id: number | null;
  tenant_name?: string;
  workspace_id: number | null;
  workspace_name?: string;
  metadata?: Record<string, unknown>;
  status: "active" | "inactive" | "error";
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
};
