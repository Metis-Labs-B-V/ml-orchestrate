from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

import bleach
from bleach.css_sanitizer import CSSSanitizer
from django.db import transaction
from django.utils import timezone
from django.utils.html import strip_tags
from django.utils.text import slugify

from app.integrations.email import EmailAdapter
from app.models import EmailTemplate, EmailTemplateVersion
from app.services.template_runtime import (
    lookup_reference,
    render_template_string,
    unique_values,
)


ALLOWED_HTML_TAGS = [
    "a",
    "b",
    "blockquote",
    "br",
    "code",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "span",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
]
ALLOWED_HTML_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "width", "height"],
    "*": ["class", "style"],
}
ALLOWED_CSS_PROPERTIES = [
    "background-color",
    "border",
    "border-collapse",
    "border-radius",
    "color",
    "display",
    "font-family",
    "font-size",
    "font-weight",
    "height",
    "line-height",
    "margin",
    "margin-bottom",
    "margin-top",
    "padding",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "padding-top",
    "text-align",
    "text-decoration",
    "width",
]


@dataclass
class EmailTemplateDefinition:
    name: str
    slug: str
    category: str
    description: str
    subject_template: str
    html_template: str
    text_template: str
    variables_schema: list[dict[str, Any]]
    sample_payload: dict[str, Any]


class EmailTemplateServiceError(Exception):
    def __init__(self, message: str, *, errors: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.errors = errors or {}


def _css_sanitizer() -> CSSSanitizer:
    return CSSSanitizer(allowed_css_properties=ALLOWED_CSS_PROPERTIES)


def sanitize_html(value: str) -> str:
    if not value:
        return ""
    return bleach.clean(
        value,
        tags=ALLOWED_HTML_TAGS,
        attributes=ALLOWED_HTML_ATTRIBUTES,
        protocols=["http", "https", "mailto"],
        css_sanitizer=_css_sanitizer(),
        strip=True,
    )


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if (
            key in merged
            and isinstance(merged[key], dict)
            and isinstance(value, dict)
        ):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def normalize_variables_schema(value: Any) -> list[dict[str, Any]]:
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise EmailTemplateServiceError(
            "variables_schema must be a list.",
            errors={"variables_schema": ["variables_schema must be a list."]},
        )

    normalized: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise EmailTemplateServiceError(
                "variables_schema must contain objects.",
                errors={"variables_schema": [f"Item at index {index} must be an object."]},
            )
        key = str(item.get("key") or "").strip()
        if not key:
            raise EmailTemplateServiceError(
                "Each variable requires a key.",
                errors={"variables_schema": [f"Item at index {index} is missing key."]},
            )
        if key in seen_keys:
            raise EmailTemplateServiceError(
                "Duplicate variable keys are not allowed.",
                errors={"variables_schema": [f"Duplicate variable key '{key}'."]},
            )
        seen_keys.add(key)
        normalized.append(
            {
                "key": key,
                "label": str(item.get("label") or key).strip(),
                "description": str(item.get("description") or "").strip(),
                "type": str(item.get("type") or "string").strip(),
                "required": bool(item.get("required", False)),
                "default": item.get("default"),
            }
        )
    return normalized


def normalize_sample_payload(value: Any) -> dict[str, Any]:
    if value in (None, ""):
        return {}
    if not isinstance(value, dict):
        raise EmailTemplateServiceError(
            "sample_payload must be an object.",
            errors={"sample_payload": ["sample_payload must be a JSON object."]},
        )
    return value


def build_definition(payload: dict[str, Any]) -> EmailTemplateDefinition:
    subject_template = str(payload.get("subject_template") or "").strip()
    html_template = str(payload.get("html_template") or "")
    text_template = str(payload.get("text_template") or "")
    if not html_template and not text_template:
        raise EmailTemplateServiceError(
            "At least one template body is required.",
            errors={
                "html_template": ["Provide html_template or text_template."],
                "text_template": ["Provide text_template or html_template."],
            },
        )
    return EmailTemplateDefinition(
        name=str(payload.get("name") or "").strip(),
        slug=str(payload.get("slug") or "").strip(),
        category=str(payload.get("category") or "").strip(),
        description=str(payload.get("description") or "").strip(),
        subject_template=subject_template,
        html_template=html_template,
        text_template=text_template,
        variables_schema=normalize_variables_schema(payload.get("variables_schema")),
        sample_payload=normalize_sample_payload(payload.get("sample_payload")),
    )


def template_to_definition(template: EmailTemplate) -> EmailTemplateDefinition:
    return EmailTemplateDefinition(
        name=template.name,
        slug=template.slug,
        category=template.category,
        description=template.description,
        subject_template=template.subject_template,
        html_template=template.html_template,
        text_template=template.text_template,
        variables_schema=normalize_variables_schema(template.variables_schema),
        sample_payload=normalize_sample_payload(template.sample_payload),
    )


def _build_template_context(
    definition: EmailTemplateDefinition,
    payload: dict[str, Any] | None = None,
    bindings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    context = dict(definition.sample_payload or {})
    schema = normalize_variables_schema(definition.variables_schema)
    for field in schema:
        key = field["key"]
        default = field.get("default")
        if default is not None and key not in context:
            context[key] = default

    if payload:
        context = _deep_merge(context, payload)
    if bindings:
        context = _deep_merge(context, bindings)

    now = timezone.now()
    context.setdefault("current_date", now.date().isoformat())
    context.setdefault("current_time", now.time().replace(microsecond=0).isoformat())
    context.setdefault("current_datetime", now.replace(microsecond=0).isoformat())
    return context


def _required_variables_missing(
    variables_schema: list[dict[str, Any]],
    context: dict[str, Any],
) -> list[str]:
    missing: list[str] = []
    for field in variables_schema:
        if not field.get("required"):
            continue
        lookup = lookup_reference(field["key"], context)
        if lookup.found and lookup.value not in (None, "", [], {}):
            continue
        if field.get("default") not in (None, "", [], {}):
            continue
        missing.append(field["key"])
    return missing


def render_definition(
    definition: EmailTemplateDefinition,
    *,
    payload: dict[str, Any] | None = None,
    bindings: dict[str, Any] | None = None,
    subject_override: str = "",
    html_override: str = "",
    text_override: str = "",
    mode: str = "preview",
) -> dict[str, Any]:
    context = _build_template_context(definition, payload=payload, bindings=bindings)

    subject_source = subject_override if subject_override else definition.subject_template
    html_source = html_override if html_override else definition.html_template
    text_source = text_override if text_override else definition.text_template

    subject_result = render_template_string(subject_source, context)
    html_result = render_template_string(html_source, context) if html_source else None
    text_result = render_template_string(text_source, context) if text_source else None

    missing = []
    used = []
    for result in [subject_result, html_result, text_result]:
        if not result:
            continue
        missing.extend(result.missing_variables)
        used.extend(result.used_variables)

    missing.extend(_required_variables_missing(definition.variables_schema, context))
    missing_variables = unique_values(missing)
    used_variables = unique_values(used)

    if mode == "execution" and missing_variables:
        raise EmailTemplateServiceError(
            "Template rendering failed due to missing variables.",
            errors={"missing_variables": missing_variables},
        )

    rendered_html = sanitize_html(str(html_result.value or "")) if html_result else ""
    rendered_text = str(text_result.value or "").strip() if text_result else ""
    if not rendered_text and rendered_html:
        rendered_text = strip_tags(rendered_html).strip()

    return {
        "subject": str(subject_result.value or "").strip(),
        "html": rendered_html,
        "text": rendered_text,
        "missing_variables": missing_variables,
        "used_variables": used_variables,
        "context": context,
    }


def render_template_instance(
    template: EmailTemplate,
    *,
    payload: dict[str, Any] | None = None,
    bindings: dict[str, Any] | None = None,
    subject_override: str = "",
    html_override: str = "",
    text_override: str = "",
    mode: str = "preview",
) -> dict[str, Any]:
    return render_definition(
        template_to_definition(template),
        payload=payload,
        bindings=bindings,
        subject_override=subject_override,
        html_override=html_override,
        text_override=text_override,
        mode=mode,
    )


def _generate_unique_slug(
    seed: str,
    *,
    template_id: int | None = None,
    tenant_id: int | None = None,
    workspace_id: int | None = None,
    include_system: bool = False,
) -> str:
    base_slug = slugify(seed) or "email-template"
    candidate = base_slug
    suffix = 2
    while True:
        queryset = EmailTemplate.objects.filter(slug=candidate)
        if template_id:
            queryset = queryset.exclude(id=template_id)
        if include_system:
            queryset = queryset.filter(
                is_system_template=True,
                tenant__isnull=True,
                workspace__isnull=True,
            )
        else:
            queryset = queryset.filter(
                is_system_template=False,
                tenant_id=tenant_id,
                workspace_id=workspace_id,
            )
        if not queryset.exists():
            return candidate
        candidate = f"{base_slug}-{suffix}"
        suffix += 1


def _write_version_snapshot(
    template: EmailTemplate,
    *,
    version: int,
    change_note: str = "",
) -> EmailTemplateVersion:
    return EmailTemplateVersion.objects.create(
        template=template,
        version=version,
        name=template.name,
        slug=template.slug,
        category=template.category,
        description=template.description,
        subject_template=template.subject_template,
        html_template=template.html_template,
        text_template=template.text_template,
        variables_schema=template.variables_schema,
        sample_payload=template.sample_payload,
        change_note=change_note,
        created_by=template.updated_by or template.created_by,
    )


@transaction.atomic
def create_template(
    *,
    payload: dict[str, Any],
    tenant_id: int | None = None,
    workspace_id: int | None = None,
    actor_email: str = "",
) -> EmailTemplate:
    definition = build_definition(payload)
    if not definition.name:
        raise EmailTemplateServiceError(
            "Template name is required.",
            errors={"name": ["name is required."]},
        )
    slug_seed = definition.slug or definition.name

    template = EmailTemplate.objects.create(
        name=definition.name,
        slug=_generate_unique_slug(
            slug_seed,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
        ),
        category=definition.category,
        description=definition.description,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        subject_template=definition.subject_template,
        html_template=definition.html_template,
        text_template=definition.text_template,
        variables_schema=definition.variables_schema,
        sample_payload=definition.sample_payload,
        is_system_template=False,
        current_version=1,
        created_by=actor_email or None,
        updated_by=actor_email or None,
    )
    _write_version_snapshot(template, version=1, change_note="Initial version")
    return template


@transaction.atomic
def update_template(
    template: EmailTemplate,
    *,
    payload: dict[str, Any],
    actor_email: str = "",
) -> EmailTemplate:
    if template.is_system_template:
        raise EmailTemplateServiceError(
            "System templates cannot be edited.",
            errors={"detail": ["Duplicate the system template before editing it."]},
        )

    merged_payload = {
        "name": payload.get("name", template.name),
        "slug": payload.get("slug", template.slug),
        "category": payload.get("category", template.category),
        "description": payload.get("description", template.description),
        "subject_template": payload.get("subject_template", template.subject_template),
        "html_template": payload.get("html_template", template.html_template),
        "text_template": payload.get("text_template", template.text_template),
        "variables_schema": payload.get("variables_schema", template.variables_schema),
        "sample_payload": payload.get("sample_payload", template.sample_payload),
    }
    definition = build_definition(merged_payload)
    next_slug = _generate_unique_slug(
        definition.slug or definition.name,
        template_id=template.id,
        tenant_id=template.tenant_id,
        workspace_id=template.workspace_id,
    )

    changed = any(
        [
            template.name != definition.name,
            template.slug != next_slug,
            template.category != definition.category,
            template.description != definition.description,
            template.subject_template != definition.subject_template,
            template.html_template != definition.html_template,
            template.text_template != definition.text_template,
            template.variables_schema != definition.variables_schema,
            template.sample_payload != definition.sample_payload,
        ]
    )
    if not changed:
        return template

    template.name = definition.name
    template.slug = next_slug
    template.category = definition.category
    template.description = definition.description
    template.subject_template = definition.subject_template
    template.html_template = definition.html_template
    template.text_template = definition.text_template
    template.variables_schema = definition.variables_schema
    template.sample_payload = definition.sample_payload
    template.current_version += 1
    template.updated_by = actor_email or template.updated_by
    template.save()
    _write_version_snapshot(
        template,
        version=template.current_version,
        change_note=str(payload.get("change_note") or "").strip(),
    )
    return template


@transaction.atomic
def duplicate_template(
    template: EmailTemplate,
    *,
    tenant_id: int | None = None,
    workspace_id: int | None = None,
    actor_email: str = "",
) -> EmailTemplate:
    duplicated = EmailTemplate.objects.create(
        name=f"{template.name} Copy",
        slug=_generate_unique_slug(
            f"{template.slug}-copy",
            tenant_id=tenant_id,
            workspace_id=workspace_id,
        ),
        category=template.category,
        description=template.description,
        tenant_id=tenant_id,
        workspace_id=workspace_id,
        subject_template=template.subject_template,
        html_template=template.html_template,
        text_template=template.text_template,
        variables_schema=template.variables_schema,
        sample_payload=template.sample_payload,
        is_system_template=False,
        current_version=1,
        created_by=actor_email or None,
        updated_by=actor_email or None,
    )
    _write_version_snapshot(duplicated, version=1, change_note=f"Duplicated from {template.slug}")
    return duplicated


def test_send_template(
    template: EmailTemplate,
    *,
    connection_payload: dict[str, Any],
    connection_auth_type: str,
    payload: dict[str, Any] | None = None,
    bindings: dict[str, Any] | None = None,
    to: list[str] | str | None = None,
    cc: list[str] | str | None = None,
    bcc: list[str] | str | None = None,
    reply_to: str = "",
) -> dict[str, Any]:
    rendered = render_template_instance(
        template,
        payload=payload,
        bindings=bindings,
        mode="execution",
    )
    adapter = EmailAdapter(connection_payload, auth_type=connection_auth_type)
    return adapter.send_email(
        {
            "to": to or [],
            "cc": cc or [],
            "bcc": bcc or [],
            "replyTo": reply_to,
            "subject": rendered["subject"],
            "bodyText": rendered["text"],
            "bodyHtml": rendered["html"],
        }
    )
