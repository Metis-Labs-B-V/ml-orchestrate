from django.test import TestCase
from rest_framework.test import APIClient

from app.models import Connection, Scenario
from identity.models import User


class ScenarioContractsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="scenario-owner@example.com",
            password="StrongPass!1234",
            first_name="Scenario",
            last_name="Owner",
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)

    def test_integration_catalog_contract(self):
        response = self.client.get("/api/v1/metis-orchestrate/integrations/catalog/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("status"), "success")
        self.assertIn("apps", payload.get("data", {}))
        apps = payload.get("data", {}).get("apps", [])
        http_app = next((app for app in apps if app.get("key") == "http"), None)
        self.assertIsNotNone(http_app)
        module_types = [module.get("type") for module in http_app.get("modules", [])]
        self.assertIn("http.make_request", module_types)

    def test_scenario_create_and_list(self):
        create_response = self.client.post(
            "/api/v1/metis-orchestrate/scenarios/",
            {
                "name": "MVP Jira Sync",
                "graph_json": {"nodes": [], "edges": []},
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        created = create_response.json().get("data", {})
        self.assertEqual(created.get("name"), "MVP Jira Sync")

        list_response = self.client.get("/api/v1/metis-orchestrate/scenarios/")
        self.assertEqual(list_response.status_code, 200)
        payload = list_response.json().get("data", {})
        self.assertGreaterEqual(payload.get("count", 0), 1)

    def test_scenario_create_without_workspace(self):
        response = self.client.post(
            "/api/v1/metis-orchestrate/scenarios/",
            {
                "name": "No Workspace Scenario",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json().get("status"), "success")

    def test_scenario_rejects_cycle(self):
        response = self.client.post(
            "/api/v1/metis-orchestrate/scenarios/",
            {
                "name": "Cycle Scenario",
                "graph_json": {
                    "nodes": [
                        {"id": "n1", "type": "jira.users.list"},
                        {"id": "n2", "type": "jira.issue.search"},
                    ],
                    "edges": [
                        {"id": "e1", "source": "n1", "target": "n2"},
                        {"id": "e2", "source": "n2", "target": "n1"},
                    ],
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get("status"), "error")
        self.assertIn("Cycle detected", str(response.json().get("errors", {})))

    def test_scenario_rejects_inbound_to_trigger_node(self):
        response = self.client.post(
            "/api/v1/metis-orchestrate/scenarios/",
            {
                "name": "Invalid Inbound Trigger",
                "graph_json": {
                    "nodes": [
                        {
                            "id": "t1",
                            "type": "jira.watch.issues",
                            "kind": "trigger",
                            "acceptsInput": False,
                            "outputPortType": "event",
                        },
                        {
                            "id": "a1",
                            "type": "jira.issue.search",
                            "kind": "action",
                            "acceptsInput": True,
                            "inputPortType": "event",
                            "outputPortType": "event",
                        },
                    ],
                    "edges": [{"id": "e1", "source": "a1", "target": "t1"}],
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json().get("status"), "error")
        self.assertIn("cannot accept inbound", str(response.json().get("errors", {})))

    def test_user_only_sees_own_scenarios(self):
        Scenario.objects.create(
            name="Mine",
            graph_json={"nodes": [], "edges": []},
            created_by=self.user.email,
        )
        Scenario.objects.create(
            name="Other User Scenario",
            graph_json={"nodes": [], "edges": []},
            created_by="other@example.com",
        )

        response = self.client.get("/api/v1/metis-orchestrate/scenarios/")
        self.assertEqual(response.status_code, 200)
        items = response.json().get("data", {}).get("items", [])
        names = [item.get("name") for item in items]
        self.assertIn("Mine", names)
        self.assertNotIn("Other User Scenario", names)

    def test_connection_create_without_workspace(self):
        response = self.client.post(
            "/api/v1/metis-orchestrate/connections/",
            {
                "provider": "jira",
                "auth_type": "apiToken",
                "display_name": "My Jira Connection",
                "secret_payload": {
                    "serviceUrl": "https://example.atlassian.net",
                    "username": "owner@example.com",
                    "apiToken": "test-token",
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        connection_id = response.json().get("data", {}).get("id")
        self.assertTrue(
            Connection.objects.filter(id=connection_id, created_by=self.user.email).exists()
        )
