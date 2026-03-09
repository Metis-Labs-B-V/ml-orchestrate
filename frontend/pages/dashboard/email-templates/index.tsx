import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MLAlert, MLAlertDescription, MLAlertTitle, MLButton, MLInput } from "ml-uikit";
import { Copy, Eye, Plus, RefreshCw, Save, Search, Trash2, Upload } from "lucide-react";

import {
  createEmailTemplate,
  deleteEmailTemplate,
  duplicateEmailTemplate,
  listEmailTemplates,
  listEmailTemplateVersions,
  previewEmailTemplate,
  updateEmailTemplate,
} from "../../../lib/scenariosApi";
import type {
  EmailTemplateCategory,
  EmailTemplatePreviewResult,
  EmailTemplateRecord,
  EmailTemplateUpsertPayload,
  EmailTemplateVariableSchema,
  EmailTemplateVersionRecord,
} from "../../../types/emailTemplates";
import type { DashboardPage } from "../../../types/dashboard";

const CATEGORY_OPTIONS: Array<{ value: EmailTemplateCategory; label: string }> = [
  { value: "transactional", label: "Transactional" },
  { value: "support", label: "Support" },
  { value: "sales", label: "Sales" },
  { value: "reminder", label: "Reminder" },
  { value: "internal_notification", label: "Internal notification" },
];

type TemplateFormState = {
  id: number | null;
  name: string;
  slug: string;
  category: EmailTemplateCategory;
  description: string;
  subject_template: string;
  html_template: string;
  text_template: string;
  variables_schema_text: string;
  sample_payload_text: string;
  is_system_template: boolean;
};

const EMPTY_FORM: TemplateFormState = {
  id: null,
  name: "",
  slug: "",
  category: "transactional",
  description: "",
  subject_template: "",
  html_template: "",
  text_template: "",
  variables_schema_text: "[]",
  sample_payload_text: "{}",
  is_system_template: false,
};

const safeJsonStringify = (value: unknown, fallback: string) => {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback), null, 2);
  } catch {
    return fallback;
  }
};

const formFromTemplate = (template: EmailTemplateRecord): TemplateFormState => ({
  id: template.id,
  name: template.name,
  slug: template.slug,
  category: template.category,
  description: template.description || "",
  subject_template: template.subject_template || "",
  html_template: template.html_template || "",
  text_template: template.text_template || "",
  variables_schema_text: safeJsonStringify(template.variables_schema || [], "[]"),
  sample_payload_text: safeJsonStringify(template.sample_payload || {}, "{}"),
  is_system_template: template.is_system_template,
});

const parseJsonObject = (value: string, fieldName: string) => {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${fieldName} must be a JSON object.`);
    }
    return { value: parsed as Record<string, unknown>, error: "" };
  } catch (error) {
    return {
      value: {} as Record<string, unknown>,
      error: error instanceof Error ? error.message : `${fieldName} is invalid.`,
    };
  }
};

const parseJsonArray = (value: string, fieldName: string) => {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) {
      throw new Error(`${fieldName} must be a JSON array.`);
    }
    return { value: parsed as EmailTemplateVariableSchema[], error: "" };
  } catch (error) {
    return {
      value: [] as EmailTemplateVariableSchema[],
      error: error instanceof Error ? error.message : `${fieldName} is invalid.`,
    };
  }
};

const EmailTemplatesPage: DashboardPage = () => {
  const [templates, setTemplates] = useState<EmailTemplateRecord[]>([]);
  const [versions, setVersions] = useState<EmailTemplateVersionRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateFormState>(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [preview, setPreview] = useState<EmailTemplatePreviewResult | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || null,
    [selectedTemplateId, templates]
  );

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await listEmailTemplates({
        category: category === "all" ? null : category,
        search,
      });
      setTemplates(result.items || []);
      if (selectedTemplateId && !result.items.some((item) => item.id === selectedTemplateId)) {
        setSelectedTemplateId(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load email templates.");
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [category, search, selectedTemplateId]);

  const loadVersions = useCallback(async (templateId: number) => {
    try {
      const payload = await listEmailTemplateVersions(templateId);
      setVersions(payload.items || []);
    } catch {
      setVersions([]);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!selectedTemplate) {
      setVersions([]);
      return;
    }
    setForm(formFromTemplate(selectedTemplate));
    void loadVersions(selectedTemplate.id);
  }, [loadVersions, selectedTemplate]);

  const resetEditor = () => {
    setSelectedTemplateId(null);
    setForm(EMPTY_FORM);
    setPreview(null);
    setVersions([]);
    setError("");
    setStatusMessage("");
  };

  const buildPayloadFromForm = (): { payload: EmailTemplateUpsertPayload | null; error: string } => {
    const parsedSchema = parseJsonArray(form.variables_schema_text, "Variables schema");
    if (parsedSchema.error) {
      return { payload: null, error: parsedSchema.error };
    }
    const parsedSample = parseJsonObject(form.sample_payload_text, "Sample payload");
    if (parsedSample.error) {
      return { payload: null, error: parsedSample.error };
    }
    const payload: EmailTemplateUpsertPayload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      category: form.category,
      description: form.description.trim(),
      subject_template: form.subject_template,
      html_template: form.html_template,
      text_template: form.text_template,
      variables_schema: parsedSchema.value,
      sample_payload: parsedSample.value,
    };
    if (!payload.name) {
      return { payload: null, error: "Template name is required." };
    }
    if (!form.html_template.trim() && !form.text_template.trim()) {
      return { payload: null, error: "Provide HTML or text content." };
    }
    return { payload, error: "" };
  };

  const handleSave = async () => {
    const built = buildPayloadFromForm();
    if (built.error || !built.payload) {
      setError(built.error || "Invalid template payload.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const saved = form.id
        ? await updateEmailTemplate(form.id, built.payload)
        : await createEmailTemplate(built.payload);
      setStatusMessage(form.id ? "Email template updated." : "Email template created.");
      setSelectedTemplateId(saved.id);
      await loadTemplates();
      setPreview(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save email template.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedTemplate) {
      return;
    }
    setIsDuplicating(true);
    setError("");
    try {
      const duplicated = await duplicateEmailTemplate({ templateId: selectedTemplate.id });
      setStatusMessage("Email template duplicated.");
      await loadTemplates();
      setSelectedTemplateId(duplicated.id);
    } catch (duplicateError) {
      setError(
        duplicateError instanceof Error
          ? duplicateError.message
          : "Unable to duplicate email template."
      );
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate || selectedTemplate.is_system_template) {
      return;
    }
    setIsDeleting(true);
    setError("");
    try {
      await deleteEmailTemplate(selectedTemplate.id);
      setStatusMessage("Email template deleted.");
      resetEditor();
      await loadTemplates();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete email template."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePreview = async () => {
    const built = buildPayloadFromForm();
    if (built.error || !built.payload) {
      setError(built.error || "Invalid template payload.");
      return;
    }
    setIsPreviewLoading(true);
    setError("");
    try {
      const result = await previewEmailTemplate({
        ...built.payload,
        payload: built.payload.sample_payload || {},
      });
      setPreview(result);
      setStatusMessage("Preview generated.");
    } catch (previewError) {
      setError(
        previewError instanceof Error ? previewError.message : "Unable to preview email template."
      );
      setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleHtmlImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    setForm((previous) => ({
      ...previous,
      html_template: text,
    }));
    setStatusMessage(`Imported HTML from ${file.name}.`);
    event.target.value = "";
  };

  const templateCountLabel = isLoading ? "Loading..." : `${templates.length} templates`;

  return (
    <section className="email-templates-page">
      {error ? (
        <MLAlert className="email-templates-alert">
          <MLAlertTitle>Email template error</MLAlertTitle>
          <MLAlertDescription>{error}</MLAlertDescription>
        </MLAlert>
      ) : null}
      {statusMessage ? (
        <MLAlert className="email-templates-alert email-templates-alert--success">
          <MLAlertTitle>Success</MLAlertTitle>
          <MLAlertDescription>{statusMessage}</MLAlertDescription>
        </MLAlert>
      ) : null}

      <div className="email-templates-toolbar">
        <div className="email-templates-search">
          <Search className="h-4 w-4" />
          <MLInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search email templates"
          />
        </div>
        <select
          className="email-templates-select"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">All categories</option>
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <MLButton type="button" variant="outline" onClick={loadTemplates} disabled={isLoading}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </MLButton>
        <MLButton type="button" onClick={resetEditor}>
          <Plus className="h-4 w-4" />
          New template
        </MLButton>
      </div>

      <div className="email-templates-layout">
        <aside className="email-templates-sidebar">
          <div className="email-templates-sidebar-header">
            <h3>Library</h3>
            <span>{templateCountLabel}</span>
          </div>
          <div className="email-templates-list">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div key={`email-template-skeleton-${index}`} className="email-template-card email-template-card--loading">
                  <div className="ui-shimmer-line ui-shimmer-line--md" />
                  <div className="ui-shimmer-line ui-shimmer-line--sm" />
                </div>
              ))
            ) : templates.length ? (
              templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={[
                    "email-template-card",
                    selectedTemplateId === template.id ? "email-template-card--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setStatusMessage("");
                    setPreview(null);
                  }}
                >
                  <div className="email-template-card-header">
                    <strong>{template.name}</strong>
                    <span>{template.category.replace(/_/g, " ")}</span>
                  </div>
                  <p>{template.description || "No description yet."}</p>
                  <div className="email-template-card-meta">
                    <span>{template.is_system_template ? "System" : "Custom"}</span>
                    <span>v{template.current_version}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="email-templates-empty">No templates matched the current filters.</p>
            )}
          </div>
        </aside>

        <div className="email-templates-editor">
          <div className="email-templates-editor-header">
            <div>
              <h3>{form.id ? form.name || "Edit template" : "New email template"}</h3>
              <p>
                {form.is_system_template
                  ? "System templates are read-only. Duplicate to customize."
                  : "Configure reusable subject, HTML, text, and variables."}
              </p>
            </div>
            <div className="email-templates-editor-actions">
              <label className="email-templates-upload">
                <Upload className="h-4 w-4" />
                Import HTML
                <input type="file" accept=".html,text/html" onChange={handleHtmlImport} />
              </label>
              <MLButton
                type="button"
                variant="outline"
                onClick={handleDuplicate}
                disabled={!selectedTemplate || isDuplicating}
              >
                <Copy className="h-4 w-4" />
                Duplicate
              </MLButton>
              <MLButton
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={!selectedTemplate || selectedTemplate.is_system_template || isDeleting}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </MLButton>
              <MLButton type="button" variant="outline" onClick={handlePreview} disabled={isPreviewLoading}>
                <Eye className="h-4 w-4" />
                Preview
              </MLButton>
              <MLButton type="button" onClick={handleSave} disabled={isSaving || form.is_system_template}>
                <Save className="h-4 w-4" />
                Save
              </MLButton>
            </div>
          </div>

          <div className="email-templates-form-grid">
            <label className="email-template-field">
              <span>Name</span>
              <input
                className="scenario-config-input"
                value={form.name}
                disabled={form.is_system_template}
                onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Support ticket update"
              />
            </label>
            <label className="email-template-field">
              <span>Slug</span>
              <input
                className="scenario-config-input"
                value={form.slug}
                disabled={form.is_system_template}
                onChange={(event) => setForm((previous) => ({ ...previous, slug: event.target.value }))}
                placeholder="support-ticket-update"
              />
            </label>
            <label className="email-template-field">
              <span>Category</span>
              <select
                className="scenario-config-select"
                value={form.category}
                disabled={form.is_system_template}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    category: event.target.value as EmailTemplateCategory,
                  }))
                }
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="email-template-field email-template-field--full">
              <span>Description</span>
              <input
                className="scenario-config-input"
                value={form.description}
                disabled={form.is_system_template}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, description: event.target.value }))
                }
                placeholder="Short internal description"
              />
            </label>
            <label className="email-template-field email-template-field--full">
              <span>Subject template</span>
              <input
                className="scenario-config-input"
                value={form.subject_template}
                disabled={form.is_system_template}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, subject_template: event.target.value }))
                }
                placeholder='Ticket {{ticket_id}} update'
              />
            </label>
            <label className="email-template-field email-template-field--full">
              <span>HTML template</span>
              <textarea
                className="scenario-config-textarea"
                value={form.html_template}
                disabled={form.is_system_template}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, html_template: event.target.value }))
                }
                placeholder="<div>Hello {{customer_name}}</div>"
              />
            </label>
            <label className="email-template-field email-template-field--full">
              <span>Text template</span>
              <textarea
                className="scenario-config-textarea"
                value={form.text_template}
                disabled={form.is_system_template}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, text_template: event.target.value }))
                }
                placeholder="Hello {{customer_name}}"
              />
            </label>
            <label className="email-template-field email-template-field--full">
              <span>Variables schema (JSON array)</span>
              <textarea
                className="scenario-config-textarea"
                value={form.variables_schema_text}
                disabled={form.is_system_template}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    variables_schema_text: event.target.value,
                  }))
                }
                placeholder='[{"key":"customer_name","label":"Customer name","type":"string","required":true}]'
              />
            </label>
            <label className="email-template-field email-template-field--full">
              <span>Sample payload (JSON object)</span>
              <textarea
                className="scenario-config-textarea"
                value={form.sample_payload_text}
                disabled={form.is_system_template}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    sample_payload_text: event.target.value,
                  }))
                }
                placeholder='{"customer_name":"Ava Patel"}'
              />
            </label>
          </div>

          <div className="email-templates-preview-grid">
            <section className="email-template-preview-card">
              <h4>Rendered preview</h4>
              {preview ? (
                <>
                  <div className="email-template-preview-section">
                    <span>Subject</span>
                    <p>{preview.subject || "No subject"}</p>
                  </div>
                  <div className="email-template-preview-section">
                    <span>HTML</span>
                    <div
                      className="email-template-preview-html"
                      dangerouslySetInnerHTML={{ __html: preview.html || "<p>No HTML output.</p>" }}
                    />
                  </div>
                  <div className="email-template-preview-section">
                    <span>Text</span>
                    <pre>{preview.text || "No text output."}</pre>
                  </div>
                  <div className="email-template-preview-meta">
                    <span>Used: {preview.used_variables.join(", ") || "None"}</span>
                    <span>
                      Missing: {preview.missing_variables.length ? preview.missing_variables.join(", ") : "None"}
                    </span>
                  </div>
                </>
              ) : (
                <p className="email-templates-empty">
                  Generate a preview to inspect rendered subject and body.
                </p>
              )}
            </section>

            <section className="email-template-preview-card">
              <h4>Versions</h4>
              {versions.length ? (
                <div className="email-template-version-list">
                  {versions.map((version) => (
                    <div key={version.id} className="email-template-version-item">
                      <strong>v{version.version}</strong>
                      <span>{version.change_note || "Updated template snapshot"}</span>
                      <small>{new Date(version.created_at).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="email-templates-empty">No versions available yet.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </section>
  );
};

EmailTemplatesPage.dashboardMeta = () => ({
  title: "Email templates",
  description: "Manage reusable email templates for workflow scenarios.",
});

export default EmailTemplatesPage;
