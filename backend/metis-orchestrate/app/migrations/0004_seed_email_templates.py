from django.db import migrations


SYSTEM_TEMPLATE_SEEDS = [
    {
        "name": "Welcome Email",
        "slug": "welcome-email",
        "category": "transactional",
        "description": "Welcome a new user after signup or onboarding.",
        "subject_template": "Welcome to {{company_name | default:\"Orchestrate\"}}, {{customer_name | default:\"there\"}}",
        "html_template": """
<div>
  <h1>Welcome, {{customer_name | default:"Customer"}}.</h1>
  <p>Your account for <strong>{{company_name | default:"Orchestrate"}}</strong> is ready.</p>
  <p>Reference ID: {{account_id | default:"pending"}}</p>
  <p>{{footer_note | default:"Reply to this email if you need help."}}</p>
</div>
""".strip(),
        "text_template": "Welcome, {{customer_name | default:\"Customer\"}}.\nYour account for {{company_name | default:\"Orchestrate\"}} is ready.\nReference ID: {{account_id | default:\"pending\"}}\n{{footer_note | default:\"Reply to this email if you need help.\"}}",
        "variables_schema": [
            {"key": "customer_name", "label": "Customer name", "type": "string", "required": False, "default": "Customer"},
            {"key": "company_name", "label": "Company name", "type": "string", "required": False, "default": "Orchestrate"},
            {"key": "account_id", "label": "Account ID", "type": "string", "required": False, "default": "pending"},
            {"key": "footer_note", "label": "Footer note", "type": "string", "required": False, "default": "Reply to this email if you need help."},
        ],
        "sample_payload": {
            "customer_name": "Ava Patel",
            "company_name": "Metis Orchestrate",
            "account_id": "ACC-1001",
        },
    },
    {
        "name": "Support Ticket Update",
        "slug": "support-ticket-update",
        "category": "support",
        "description": "Notify a customer about ticket progress or resolution.",
        "subject_template": "Ticket {{ticket_id}} update: {{ticket_status | default:\"In progress\"}}",
        "html_template": """
<div>
  <p>Hello {{customer_name | default:"Customer"}},</p>
  <p>Your support ticket <strong>{{ticket_id}}</strong> is now <strong>{{ticket_status | default:"In progress"}}</strong>.</p>
  <p>{{ticket_message | default:"Our team is reviewing the latest update."}}</p>
  <p>Assigned agent: {{agent_name | default:"Support team"}}</p>
</div>
""".strip(),
        "text_template": "Hello {{customer_name | default:\"Customer\"}},\nYour support ticket {{ticket_id}} is now {{ticket_status | default:\"In progress\"}}.\n{{ticket_message | default:\"Our team is reviewing the latest update.\"}}\nAssigned agent: {{agent_name | default:\"Support team\"}}",
        "variables_schema": [
            {"key": "customer_name", "label": "Customer name", "type": "string", "required": False},
            {"key": "ticket_id", "label": "Ticket ID", "type": "string", "required": True},
            {"key": "ticket_status", "label": "Ticket status", "type": "string", "required": False, "default": "In progress"},
            {"key": "ticket_message", "label": "Ticket message", "type": "string", "required": False},
            {"key": "agent_name", "label": "Agent name", "type": "string", "required": False, "default": "Support team"},
        ],
        "sample_payload": {
            "customer_name": "Ava Patel",
            "ticket_id": "SUP-2048",
            "ticket_status": "Resolved",
            "ticket_message": "We have shipped the fix and verified the issue is resolved.",
            "agent_name": "Priya Nair",
        },
    },
    {
        "name": "Sales Follow-up",
        "slug": "sales-follow-up",
        "category": "sales",
        "description": "Follow up on an open deal or demo request.",
        "subject_template": "{{company_name | default:\"Your team\"}} follow-up on {{deal_name | default:\"your request\"}}",
        "html_template": """
<div>
  <p>Hi {{customer_name | default:"there"}},</p>
  <p>I wanted to follow up on <strong>{{deal_name | default:"your request"}}</strong>.</p>
  <p>{{sales_message | default:"Let us know if you want to schedule the next step."}}</p>
  <p>Owner: {{owner_name | default:"Sales team"}}</p>
</div>
""".strip(),
        "text_template": "Hi {{customer_name | default:\"there\"}},\nI wanted to follow up on {{deal_name | default:\"your request\"}}.\n{{sales_message | default:\"Let us know if you want to schedule the next step.\"}}\nOwner: {{owner_name | default:\"Sales team\"}}",
        "variables_schema": [
            {"key": "customer_name", "label": "Customer name", "type": "string", "required": False},
            {"key": "company_name", "label": "Company name", "type": "string", "required": False},
            {"key": "deal_name", "label": "Deal name", "type": "string", "required": False},
            {"key": "sales_message", "label": "Sales message", "type": "string", "required": False},
            {"key": "owner_name", "label": "Owner name", "type": "string", "required": False, "default": "Sales team"},
        ],
        "sample_payload": {
            "customer_name": "Alex Morgan",
            "company_name": "Metis Orchestrate",
            "deal_name": "Q2 Expansion",
            "sales_message": "We have reserved time on Thursday if you want to review pricing.",
            "owner_name": "Rahul Shah",
        },
    },
    {
        "name": "Reminder Notification",
        "slug": "reminder-notification",
        "category": "reminder",
        "description": "Send reminders for upcoming tasks, invoices, or deadlines.",
        "subject_template": "Reminder: {{reminder_title | default:\"Upcoming task\"}}",
        "html_template": """
<div>
  <p>Hello {{customer_name | default:"Customer"}},</p>
  <p>This is a reminder for <strong>{{reminder_title | default:"your upcoming task"}}</strong>.</p>
  <p>Due date: {{due_date | default:current_date}}</p>
  <p>{{reminder_message | default:"Please review and take action before the due date."}}</p>
</div>
""".strip(),
        "text_template": "Hello {{customer_name | default:\"Customer\"}},\nThis is a reminder for {{reminder_title | default:\"your upcoming task\"}}.\nDue date: {{due_date | default:current_date}}\n{{reminder_message | default:\"Please review and take action before the due date.\"}}",
        "variables_schema": [
            {"key": "customer_name", "label": "Customer name", "type": "string", "required": False},
            {"key": "reminder_title", "label": "Reminder title", "type": "string", "required": False},
            {"key": "due_date", "label": "Due date", "type": "string", "required": False},
            {"key": "reminder_message", "label": "Reminder message", "type": "string", "required": False},
        ],
        "sample_payload": {
            "customer_name": "Jordan Lee",
            "reminder_title": "Renewal review",
            "due_date": "2026-03-20",
            "reminder_message": "Please review the renewal before end of day.",
        },
    },
    {
        "name": "Internal Alert",
        "slug": "internal-alert",
        "category": "internal_notification",
        "description": "Send internal operational notifications to a team inbox.",
        "subject_template": "[{{severity | default:\"INFO\"}}] {{alert_title | default:\"Operational alert\"}}",
        "html_template": """
<div>
  <p><strong>Severity:</strong> {{severity | default:"INFO"}}</p>
  <p><strong>Alert:</strong> {{alert_title | default:"Operational alert"}}</p>
  <p><strong>Source:</strong> {{source_system | default:"Workflow"}}</p>
  <pre>{{alert_body | default:"No details provided."}}</pre>
</div>
""".strip(),
        "text_template": "Severity: {{severity | default:\"INFO\"}}\nAlert: {{alert_title | default:\"Operational alert\"}}\nSource: {{source_system | default:\"Workflow\"}}\n{{alert_body | default:\"No details provided.\"}}",
        "variables_schema": [
            {"key": "severity", "label": "Severity", "type": "string", "required": False, "default": "INFO"},
            {"key": "alert_title", "label": "Alert title", "type": "string", "required": False},
            {"key": "source_system", "label": "Source system", "type": "string", "required": False, "default": "Workflow"},
            {"key": "alert_body", "label": "Alert body", "type": "string", "required": False},
        ],
        "sample_payload": {
            "severity": "WARN",
            "alert_title": "Nightly sync delayed",
            "source_system": "Jira sync",
            "alert_body": "The scheduled job exceeded the expected runtime window.",
        },
    },
]


def seed_email_templates(apps, schema_editor):
    EmailTemplate = apps.get_model("app", "EmailTemplate")
    EmailTemplateVersion = apps.get_model("app", "EmailTemplateVersion")

    for seed in SYSTEM_TEMPLATE_SEEDS:
        template, _created = EmailTemplate.objects.update_or_create(
            slug=seed["slug"],
            is_system_template=True,
            tenant__isnull=True,
            workspace__isnull=True,
            defaults={
                "name": seed["name"],
                "category": seed["category"],
                "description": seed["description"],
                "subject_template": seed["subject_template"],
                "html_template": seed["html_template"],
                "text_template": seed["text_template"],
                "variables_schema": seed["variables_schema"],
                "sample_payload": seed["sample_payload"],
                "current_version": 1,
                "is_active": True,
                "created_by": "system",
                "updated_by": "system",
            },
        )
        EmailTemplateVersion.objects.update_or_create(
            template=template,
            version=1,
            defaults={
                "name": template.name,
                "slug": template.slug,
                "category": template.category,
                "description": template.description,
                "subject_template": template.subject_template,
                "html_template": template.html_template,
                "text_template": template.text_template,
                "variables_schema": template.variables_schema,
                "sample_payload": template.sample_payload,
                "change_note": "System seed template",
                "created_by": "system",
                "updated_by": "system",
                "is_active": True,
            },
        )


def unseed_email_templates(apps, schema_editor):
    EmailTemplate = apps.get_model("app", "EmailTemplate")
    EmailTemplate.objects.filter(
        slug__in=[seed["slug"] for seed in SYSTEM_TEMPLATE_SEEDS],
        is_system_template=True,
        tenant__isnull=True,
        workspace__isnull=True,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("app", "0003_emailtemplate_emailtemplateversion_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_email_templates, unseed_email_templates),
    ]
