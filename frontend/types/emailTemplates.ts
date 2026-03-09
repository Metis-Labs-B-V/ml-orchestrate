export type EmailTemplateCategory =
  | "transactional"
  | "support"
  | "sales"
  | "reminder"
  | "internal_notification";

export type EmailTemplateVariableSchema = {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  description?: string;
};

export type EmailTemplateRecord = {
  id: number;
  name: string;
  slug: string;
  category: EmailTemplateCategory;
  description: string;
  subject_template: string;
  html_template: string;
  text_template: string;
  variables_schema: EmailTemplateVariableSchema[];
  sample_payload: Record<string, unknown>;
  is_system_template: boolean;
  is_active: boolean;
  version: number;
  current_version: number;
  tenant_id: number | null;
  tenant_name?: string;
  workspace_id: number | null;
  workspace_name?: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type EmailTemplateVersionRecord = {
  id: number;
  template_id: number;
  version: number;
  name: string;
  slug: string;
  category: EmailTemplateCategory;
  description: string;
  subject_template: string;
  html_template: string;
  text_template: string;
  variables_schema: EmailTemplateVariableSchema[];
  sample_payload: Record<string, unknown>;
  change_note: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type EmailTemplatePreviewResult = {
  subject: string;
  html: string;
  text: string;
  missing_variables: string[];
  used_variables: string[];
  context: Record<string, unknown>;
};

export type EmailTemplateUpsertPayload = {
  name: string;
  slug?: string;
  category: EmailTemplateCategory;
  description?: string;
  subject_template?: string;
  html_template?: string;
  text_template?: string;
  variables_schema?: EmailTemplateVariableSchema[];
  sample_payload?: Record<string, unknown>;
  tenant_id?: number | null;
  workspace_id?: number | null;
};

export type EmailTemplatePreviewPayload = {
  template_id?: number;
  name?: string;
  slug?: string;
  category?: EmailTemplateCategory;
  description?: string;
  subject_template?: string;
  html_template?: string;
  text_template?: string;
  variables_schema?: EmailTemplateVariableSchema[];
  sample_payload?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  bindings?: Record<string, unknown>;
  subject_override?: string;
  html_override?: string;
  text_override?: string;
};

export type EmailTemplateTestSendPayload = EmailTemplatePreviewPayload & {
  connection_id: number;
  to: string[] | string;
  cc?: string[] | string;
  bcc?: string[] | string;
  reply_to?: string;
};
