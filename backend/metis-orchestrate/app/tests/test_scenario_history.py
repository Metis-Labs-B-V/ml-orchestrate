from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from app.models import Run, RunStatus, RunStep, RunStepStatus, Scenario, ScenarioAuditEvent
from identity.models import User


class ScenarioHistoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="history-owner@example.com",
            password="StrongPass!1234",
            first_name="History",
            last_name="Owner",
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)
        self.scenario = Scenario.objects.create(
            name="History Scenario",
            graph_json={
                "nodes": [
                    {"id": "node_http", "type": "http.make_request"},
                    {"id": "node_json", "type": "json.create"},
                ],
                "edges": [],
            },
            created_by=self.user.email,
        )

    def test_history_summary_returns_aggregate_metrics(self):
        succeeded_run = Run.objects.create(
            scenario=self.scenario,
            scenario_version=1,
            trigger_type="manual",
            status=RunStatus.SUCCEEDED,
            queued_at=timezone.now(),
            started_at=timezone.now(),
            ended_at=timezone.now(),
            created_by=self.user.email,
        )
        failed_run = Run.objects.create(
            scenario=self.scenario,
            scenario_version=1,
            trigger_type="schedule",
            status=RunStatus.FAILED,
            queued_at=timezone.now(),
            started_at=timezone.now(),
            ended_at=timezone.now(),
            created_by=self.user.email,
        )
        RunStep.objects.create(
            run=succeeded_run,
            node_id="node_http",
            node_type="http.make_request",
            status=RunStepStatus.SUCCEEDED,
            created_by=self.user.email,
        )
        RunStep.objects.create(
            run=failed_run,
            node_id="node_json",
            node_type="json.create",
            status=RunStepStatus.FAILED,
            error_json={"message": "Mapping failed"},
            created_by=self.user.email,
        )

        response = self.client.get(
            f"/api/v1/metis-orchestrate/scenarios/{self.scenario.id}/history/summary/"
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["total_runs"], 2)
        self.assertEqual(payload["status_counts"]["succeeded"], 1)
        self.assertEqual(payload["status_counts"]["failed"], 1)
        self.assertIn("http", payload["providers_used"])
        self.assertIn("json", payload["providers_used"])

    def test_history_runs_supports_provider_and_search_filters(self):
        matched_run = Run.objects.create(
            scenario=self.scenario,
            scenario_version=1,
            trigger_type="manual",
            status=RunStatus.FAILED,
            metadata={"endpoint": "brandhub"},
            created_by=self.user.email,
        )
        other_run = Run.objects.create(
            scenario=self.scenario,
            scenario_version=1,
            trigger_type="manual",
            status=RunStatus.SUCCEEDED,
            created_by=self.user.email,
        )
        RunStep.objects.create(
            run=matched_run,
            node_id="node_http",
            node_type="http.make_request",
            status=RunStepStatus.FAILED,
            error_json={"message": "brandhub timeout"},
            created_by=self.user.email,
        )
        RunStep.objects.create(
            run=other_run,
            node_id="node_json",
            node_type="json.create",
            status=RunStepStatus.SUCCEEDED,
            created_by=self.user.email,
        )

        response = self.client.get(
            f"/api/v1/metis-orchestrate/scenarios/{self.scenario.id}/history/runs/",
            {"provider": "http", "search": "brandhub"},
        )

        self.assertEqual(response.status_code, 200)
        items = response.json()["data"]["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], matched_run.id)
        self.assertEqual(items[0]["first_error_message"], "brandhub timeout")
        self.assertEqual(items[0]["providers_used"], ["http"])

    def test_history_audit_returns_recorded_events(self):
        create_response = self.client.post(
            "/api/v1/metis-orchestrate/scenarios/",
            {"name": "Audit Source Scenario", "graph_json": {"nodes": [], "edges": []}},
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        created_scenario_id = create_response.json()["data"]["id"]

        publish_response = self.client.post(
            f"/api/v1/metis-orchestrate/scenarios/{created_scenario_id}/publish/",
            {"graph_json": {"nodes": [], "edges": []}},
            format="json",
        )
        self.assertEqual(publish_response.status_code, 200)

        self.assertTrue(
            ScenarioAuditEvent.objects.filter(
                scenario_id=created_scenario_id,
                event_type="scenario.published",
            ).exists()
        )

        response = self.client.get(
            f"/api/v1/metis-orchestrate/scenarios/{created_scenario_id}/history/audit/",
            {"search": "published"},
        )

        self.assertEqual(response.status_code, 200)
        items = response.json()["data"]["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertTrue(any(item["event_type"] == "scenario.published" for item in items))
