from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from app.models import Connection, EmailTemplate
from identity.models import Customer, Tenant, User, UserCustomer, UserTenant


class EmailTemplateApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="templates@example.com",
            password="StrongPass!1234",
            first_name="Template",
            last_name="Owner",
            is_active=True,
        )
        self.tenant = Tenant.objects.create(name="Acme Tenant")
        self.workspace = Customer.objects.create(name="Acme Workspace", tenant=self.tenant)
        UserTenant.objects.create(user=self.user, tenant=self.tenant, is_active=True)
        UserCustomer.objects.create(user=self.user, customer=self.workspace, is_active=True)
        self.client.force_authenticate(user=self.user)
        self.email_connection = Connection.objects.create(
            provider="email",
            auth_type="apiToken",
            display_name="SMTP Test",
            tenant=self.tenant,
            workspace=self.workspace,
            created_by=self.user.email,
            updated_by=self.user.email,
            secret_payload={
                "username": "sender@example.com",
                "smtpHost": "smtp.example.com",
                "smtpPort": 587,
                "smtpPassword": "password",
                "smtpUseStarttls": True,
            },
        )

    def test_list_includes_seeded_system_templates(self):
        response = self.client.get(
            "/api/v1/metis-orchestrate/email-templates/",
            {"tenant_id": self.tenant.id, "workspace_id": self.workspace.id},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json().get("data", {})
        names = {item["slug"] for item in payload.get("items", [])}
        self.assertIn("welcome-email", names)
        self.assertIn("support-ticket-update", names)

    def test_create_update_duplicate_and_versions(self):
        create_response = self.client.post(
            "/api/v1/metis-orchestrate/email-templates/",
            {
                "name": "Custom Follow-up",
                "slug": "custom-follow-up",
                "category": "sales",
                "description": "Used for sales follow-ups",
                "subject_template": "Deal {{deal_name}} update",
                "html_template": "<p>Hello {{customer_name | default:\"Customer\"}}</p>",
                "text_template": "Hello {{customer_name | default:\"Customer\"}}",
                "variables_schema": [
                    {"key": "deal_name", "required": True},
                    {"key": "customer_name", "required": False, "default": "Customer"},
                ],
                "sample_payload": {"deal_name": "Expansion"},
                "tenant_id": self.tenant.id,
                "workspace_id": self.workspace.id,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        created = create_response.json()["data"]
        self.assertEqual(created["created_by"], self.user.email)
        self.assertEqual(created["version"], 1)

        template_id = created["id"]
        patch_response = self.client.patch(
            f"/api/v1/metis-orchestrate/email-templates/{template_id}/",
            {
                "description": "Updated description",
                "text_template": "Hello {{customer_name | default:\"Customer\"}}, deal {{deal_name}} is active.",
            },
            format="json",
        )
        self.assertEqual(patch_response.status_code, 200)
        patched = patch_response.json()["data"]
        self.assertEqual(patched["current_version"], 2)
        self.assertEqual(patched["updated_by"], self.user.email)

        versions_response = self.client.get(
            f"/api/v1/metis-orchestrate/email-templates/{template_id}/versions/"
        )
        self.assertEqual(versions_response.status_code, 200)
        versions = versions_response.json()["data"]["items"]
        self.assertEqual(len(versions), 2)
        self.assertEqual(versions[0]["version"], 2)

        system_template = EmailTemplate.objects.get(slug="welcome-email", is_system_template=True)
        duplicate_response = self.client.post(
            f"/api/v1/metis-orchestrate/email-templates/{system_template.id}/duplicate/",
            {
                "tenant_id": self.tenant.id,
                "workspace_id": self.workspace.id,
            },
            format="json",
        )
        self.assertEqual(duplicate_response.status_code, 201)
        duplicated = duplicate_response.json()["data"]
        self.assertFalse(duplicated["is_system_template"])
        self.assertEqual(duplicated["created_by"], self.user.email)
        self.assertTrue(duplicated["slug"].startswith("welcome-email-copy"))

    def test_preview_reports_missing_variables(self):
        template = EmailTemplate.objects.create(
            name="Missing Variable Template",
            slug="missing-variable-template",
            category="support",
            tenant=self.tenant,
            workspace=self.workspace,
            subject_template="Ticket {{ticket_id}} update",
            html_template="<p>Hello {{customer_name}}</p>",
            text_template="Hello {{customer_name}}",
            variables_schema=[
                {"key": "ticket_id", "required": True},
                {"key": "customer_name", "required": False},
            ],
            sample_payload={},
            created_by=self.user.email,
            updated_by=self.user.email,
        )
        response = self.client.post(
            f"/api/v1/metis-orchestrate/email-templates/{template.id}/preview/",
            {
                "payload": {"customer_name": "Ava"},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        preview = response.json()["data"]
        self.assertIn("ticket_id", preview["missing_variables"])
        self.assertIn("customer_name", preview["context"])

    def test_preview_inline_accepts_inline_template_payload(self):
        response = self.client.post(
            "/api/v1/metis-orchestrate/email-templates/preview/",
            {
                "subject_template": "Hello {{customer_name}}",
                "html_template": "<p>Account {{account_id}}</p>",
                "text_template": "Hello {{customer_name}}",
                "variables_schema": [
                    {"key": "customer_name", "required": True},
                    {"key": "account_id", "required": True},
                ],
                "payload": {
                    "customer_name": "Ava",
                    "account_id": "ACC-100",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        preview = response.json()["data"]
        self.assertEqual(preview["subject"], "Hello Ava")
        self.assertIn("ACC-100", preview["html"])
        self.assertEqual(preview["missing_variables"], [])

    def test_preview_inline_rejects_payload_without_template_input(self):
        response = self.client.post(
            "/api/v1/metis-orchestrate/email-templates/preview/",
            {
                "payload": {
                    "customer_name": "Ava",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("template_id", str(response.json().get("errors", {})))

    @patch("app.integrations.email.EmailAdapter.send_email")
    def test_test_send_renders_template_before_transport(self, send_email_mock):
        send_email_mock.return_value = {"ok": True, "messageId": "msg-1"}
        template = EmailTemplate.objects.get(slug="welcome-email", is_system_template=True)

        response = self.client.post(
            f"/api/v1/metis-orchestrate/email-templates/{template.id}/test-send/",
            {
                "connection_id": self.email_connection.id,
                "to": ["recipient@example.com"],
                "payload": {
                    "customer_name": "Ava",
                    "company_name": "Metis Orchestrate",
                    "account_id": "ACC-999",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["data"]["ok"])
        send_email_mock.assert_called_once()
        send_payload = send_email_mock.call_args.args[0]
        self.assertEqual(send_payload["to"], ["recipient@example.com"])
        self.assertIn("Ava", send_payload["subject"])
        self.assertIn("ACC-999", send_payload["bodyText"])

    def test_test_send_requires_recipient_list(self):
        template = EmailTemplate.objects.get(slug="welcome-email", is_system_template=True)
        response = self.client.post(
            f"/api/v1/metis-orchestrate/email-templates/{template.id}/test-send/",
            {
                "connection_id": self.email_connection.id,
                "payload": {
                    "customer_name": "Ava",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("to", str(response.json().get("errors", {})))

    def test_test_send_rejects_non_email_connection(self):
        template = EmailTemplate.objects.get(slug="welcome-email", is_system_template=True)
        jira_connection = Connection.objects.create(
            provider="jira",
            auth_type="apiToken",
            display_name="Jira connection",
            tenant=self.tenant,
            workspace=self.workspace,
            created_by=self.user.email,
            updated_by=self.user.email,
            secret_payload={"serviceUrl": "https://jira.example.com"},
        )
        response = self.client.post(
            f"/api/v1/metis-orchestrate/email-templates/{template.id}/test-send/",
            {
                "connection_id": jira_connection.id,
                "to": ["recipient@example.com"],
                "payload": {
                    "customer_name": "Ava",
                    "company_name": "Metis Orchestrate",
                    "account_id": "ACC-999",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn("Connection not found", response.json().get("message", ""))
