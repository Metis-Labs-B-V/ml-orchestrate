from django.test import TestCase
from django.test.utils import override_settings

from app.models import Connection
from app.services.connection_secrets import (
    get_connection_secret_payload,
    set_connection_secret_payload,
)
from identity.models import Customer, Tenant


@override_settings(
    ORCHESTRATE_SECRET_ENCRYPTION_ENABLED=True,
    ORCHESTRATE_SECRET_ENCRYPTION_KEY="test-secret-encryption-key",
)
class ConnectionSecretServiceTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Tenant")
        self.workspace = Customer.objects.create(name="Workspace", tenant=self.tenant)

    def test_lazy_migrates_legacy_secret_payload(self):
        connection = Connection.objects.create(
            provider="jira",
            display_name="Jira",
            tenant=self.tenant,
            workspace=self.workspace,
            secret_payload={
                "serviceUrl": "https://example.atlassian.net",
                "username": "runner@example.com",
                "apiToken": "token",
            },
        )

        result = get_connection_secret_payload(connection, persist_migration=True)
        self.assertTrue(result.migrated)
        self.assertEqual(result.payload.get("username"), "runner@example.com")

        connection.refresh_from_db()
        self.assertTrue(connection.encrypted_secret_payload)
        self.assertEqual(connection.secret_payload, {})
        self.assertIsNotNone(connection.secret_payload_migrated_at)

    def test_set_and_get_encrypted_payload(self):
        connection = Connection.objects.create(
            provider="email",
            display_name="Email",
            tenant=self.tenant,
            workspace=self.workspace,
        )

        payload = {
            "username": "sender@example.com",
            "smtpHost": "smtp.example.com",
            "smtpPassword": "secret",
        }
        set_connection_secret_payload(connection, payload)
        connection.save(
            update_fields=[
                "encrypted_secret_payload",
                "secret_payload",
                "secret_payload_migrated_at",
                "updated_at",
            ]
        )

        connection.refresh_from_db()
        result = get_connection_secret_payload(connection)
        self.assertFalse(result.migrated)
        self.assertEqual(result.payload, payload)


@override_settings(ORCHESTRATE_SECRET_ENCRYPTION_ENABLED=False)
class ConnectionSecretServiceDisabledTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Tenant")
        self.workspace = Customer.objects.create(name="Workspace", tenant=self.tenant)

    def test_disabled_mode_uses_plain_payload(self):
        connection = Connection.objects.create(
            provider="hubspot",
            display_name="HubSpot",
            tenant=self.tenant,
            workspace=self.workspace,
        )
        payload = {"accessToken": "token"}
        set_connection_secret_payload(connection, payload)
        connection.save(update_fields=["secret_payload", "updated_at"])

        result = get_connection_secret_payload(connection)
        self.assertEqual(result.payload, payload)
