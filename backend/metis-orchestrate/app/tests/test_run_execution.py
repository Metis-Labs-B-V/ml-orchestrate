from unittest.mock import patch
import base64
import json

from django.test import TestCase
from rest_framework.test import APIClient

from app.models import Connection, RunStatus, RunStepStatus, Scenario
from identity.models import Customer, Tenant, User, UserCustomer, UserTenant


class _MockResponse:
    def __init__(
        self,
        status_code=200,
        payload=None,
        text="",
        headers=None,
        url="https://example.test/resource",
        content=None,
        reason="OK",
    ):
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.headers = headers or {}
        self.url = url
        self.reason = reason
        if content is not None:
            self.content = content
        elif payload is not None:
            self.content = json.dumps(payload).encode("utf-8")
        else:
            self.content = text.encode("utf-8")
        self.history = []

    @property
    def ok(self):
        return self.status_code < 400

    def json(self):
        if self._payload is None:
            raise ValueError("No JSON payload")
        return self._payload


class RunExecutionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="runner@example.com",
            password="StrongPass!1234",
            first_name="Run",
            last_name="Owner",
            is_active=True,
        )
        self.tenant = Tenant.objects.create(name="Acme Tenant")
        self.workspace = Customer.objects.create(name="Acme Workspace", tenant=self.tenant)
        UserTenant.objects.create(user=self.user, tenant=self.tenant, is_active=True)
        UserCustomer.objects.create(user=self.user, customer=self.workspace, is_active=True)
        self.connection = Connection.objects.create(
            provider="jira",
            display_name="Jira Test",
            auth_type="apiToken",
            tenant=self.tenant,
            workspace=self.workspace,
            created_by=self.user.email,
            secret_payload={
                "serviceUrl": "https://example.atlassian.net",
                "username": "jira-user@example.com",
                "apiToken": "test-token",
            },
        )
        self.client.force_authenticate(user=self.user)

    def _create_scenario(self, graph_json):
        return Scenario.objects.create(
            name="Run Scenario",
            tenant=self.tenant,
            workspace=self.workspace,
            created_by=self.user.email,
            graph_json=graph_json,
        )

    @patch("app.integrations.jira.requests.Session.request")
    def test_run_executes_jira_api_call_node(self, request_mock):
        request_mock.return_value = _MockResponse(payload={"accountId": "abc123"})

        scenario = self._create_scenario(
            {
                "nodes": [
                    {
                        "id": "jira_1",
                        "type": "jira.api.call",
                        "config": {
                            "connectionId": self.connection.id,
                            "method": "GET",
                            "path": "/rest/api/3/myself",
                        },
                    }
                ],
                "edges": [],
            }
        )

        response = self.client.post(
            "/api/v1/metis-orchestrate/runs/",
            {"scenario_id": scenario.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json().get("data", {})
        self.assertEqual(payload.get("status"), RunStatus.SUCCEEDED)
        steps = payload.get("steps", [])
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0].get("status"), RunStepStatus.SUCCEEDED)
        self.assertEqual(steps[0].get("output_raw_json", {}).get("accountId"), "abc123")

    def test_run_fails_when_connection_missing(self):
        scenario = self._create_scenario(
            {
                "nodes": [
                    {
                        "id": "jira_1",
                        "type": "jira.issue.get",
                        "config": {"issueIdOrKey": "ABC-1"},
                    }
                ],
                "edges": [],
            }
        )

        response = self.client.post(
            "/api/v1/metis-orchestrate/runs/",
            {"scenario_id": scenario.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json().get("data", {})
        self.assertEqual(payload.get("status"), RunStatus.FAILED)
        steps = payload.get("steps", [])
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0].get("status"), RunStepStatus.FAILED)
        self.assertIn("connectionId", str(steps[0].get("error_json", {})))

    @patch("app.integrations.jenkins.requests.Session.request")
    def test_run_executes_jenkins_api_call_node(self, request_mock):
        request_mock.return_value = _MockResponse(payload={"ok": True, "name": "job-build"})
        jenkins_connection = Connection.objects.create(
            provider="jenkins",
            display_name="Jenkins OAuth",
            auth_type="oauth",
            tenant=self.tenant,
            workspace=self.workspace,
            created_by=self.user.email,
            secret_payload={
                "baseUrl": "https://jenkins.example.com",
                "accessToken": "oauth-token",
            },
        )

        scenario = self._create_scenario(
            {
                "nodes": [
                    {
                        "id": "jenkins_1",
                        "type": "jenkins.api.call",
                        "config": {
                            "connectionId": jenkins_connection.id,
                            "method": "GET",
                            "path": "/api/json",
                        },
                    }
                ],
                "edges": [],
            }
        )

        response = self.client.post(
            "/api/v1/metis-orchestrate/runs/",
            {"scenario_id": scenario.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json().get("data", {})
        self.assertEqual(payload.get("status"), RunStatus.SUCCEEDED)
        steps = payload.get("steps", [])
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0].get("status"), RunStepStatus.SUCCEEDED)
        self.assertTrue(steps[0].get("output_raw_json", {}).get("ok"))

    @patch("app.integrations.jira.requests.Session.request")
    def test_run_resolves_mapping_tokens_for_downstream_node(self, request_mock):
        calls = []

        def _side_effect(*args, **kwargs):
            calls.append(kwargs)
            url = kwargs.get("url", "")
            if url.endswith("/rest/api/3/users/search"):
                return _MockResponse(payload=[{"emailAddress": "USER@EXAMPLE.COM"}])
            if url.endswith("/rest/api/3/search"):
                return _MockResponse(payload={"issues": []})
            return _MockResponse(payload={})

        request_mock.side_effect = _side_effect

        scenario = self._create_scenario(
            {
                "nodes": [
                    {
                        "id": "jira_users",
                        "type": "jira.users.list",
                        "config": {"connectionId": self.connection.id, "query": "all"},
                    },
                    {
                        "id": "jira_search",
                        "type": "jira.issue.search",
                        "config": {
                            "connectionId": self.connection.id,
                            "jql": 'reporter="{{jira_users[0].emailAddress | lower}}"',
                        },
                    },
                ],
                "edges": [{"id": "edge-1", "source": "jira_users", "target": "jira_search"}],
            }
        )

        response = self.client.post(
            "/api/v1/metis-orchestrate/runs/",
            {"scenario_id": scenario.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json().get("data", {})
        self.assertEqual(payload.get("status"), RunStatus.SUCCEEDED)

        self.assertGreaterEqual(len(calls), 2)
        second_call_body = calls[1].get("json", {})
        self.assertEqual(second_call_body.get("jql"), 'reporter="user@example.com"')

    @patch("app.integrations.jira.requests.Session.request")
    def test_run_executes_jira_status_update_node(self, request_mock):
        request_mock.return_value = _MockResponse(status_code=204, payload=None, text="")
        scenario = self._create_scenario(
            {
                "nodes": [
                    {
                        "id": "jira_transition",
                        "type": "jira.issue.status.update",
                        "config": {
                            "connectionId": self.connection.id,
                            "issueIdOrKey": "ABC-12",
                            "transitionId": "31",
                        },
                    }
                ],
                "edges": [],
            }
        )

        response = self.client.post(
            "/api/v1/metis-orchestrate/runs/",
            {"scenario_id": scenario.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json().get("data", {})
        self.assertEqual(payload.get("status"), RunStatus.SUCCEEDED)
        self.assertEqual(request_mock.call_count, 1)
        kwargs = request_mock.call_args.kwargs
        self.assertEqual(kwargs.get("method"), "POST")
        self.assertIn("/rest/api/3/issue/ABC-12/transitions", kwargs.get("url", ""))
        self.assertEqual(kwargs.get("json", {}).get("transition", {}).get("id"), "31")

    @patch("app.integrations.jira.requests.Session.request")
    def test_run_executes_jira_attachment_add_node(self, request_mock):
        request_mock.return_value = _MockResponse(payload={"id": "10001"})
        encoded = base64.b64encode(b"hello world").decode("utf-8")
        scenario = self._create_scenario(
            {
                "nodes": [
                    {
                        "id": "jira_attachment",
                        "type": "jira.issue.attachment.add",
                        "config": {
                            "connectionId": self.connection.id,
                            "issueIdOrKey": "ABC-77",
                            "fileName": "hello.txt",
                            "fileContentBase64": encoded,
                            "contentType": "text/plain",
                        },
                    }
                ],
                "edges": [],
            }
        )

        response = self.client.post(
            "/api/v1/metis-orchestrate/runs/",
            {"scenario_id": scenario.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json().get("data", {})
        self.assertEqual(payload.get("status"), RunStatus.SUCCEEDED)
        kwargs = request_mock.call_args.kwargs
        self.assertEqual(kwargs.get("method"), "POST")
        self.assertIn("/rest/api/3/issue/ABC-77/attachments", kwargs.get("url", ""))
        self.assertIn("file", kwargs.get("files", {}))
        self.assertEqual(
            kwargs.get("headers", {}).get("X-Atlassian-Token"),
            "no-check",
        )

    @patch("app.integrations.http.requests.Session.request")
    def test_run_executes_http_make_request_and_maps_to_json_node(self, request_mock):
        request_mock.return_value = _MockResponse(
            payload={"hello": "world"},
            headers={"Content-Type": "application/json"},
            url="https://api.example.com/hello",
        )

        scenario = self._create_scenario(
            {
                "nodes": [
                    {
                        "id": "http_1",
                        "type": "http.make_request",
                        "config": {
                            "method": "GET",
                            "url": "https://api.example.com/hello",
                            "parseResponse": True,
                            "failOnHttpError": True,
                        },
                    },
                    {
                        "id": "json_1",
                        "type": "json.create",
                        "config": {
                            "payload": {
                                "fromHttp": "{{http_1.body.hello}}",
                                "statusCode": "{{http_1.statusCode}}",
                            }
                        },
                    },
                ],
                "edges": [{"id": "edge-1", "source": "http_1", "target": "json_1"}],
            }
        )

        response = self.client.post(
            "/api/v1/metis-orchestrate/runs/",
            {"scenario_id": scenario.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json().get("data", {})
        self.assertEqual(payload.get("status"), RunStatus.SUCCEEDED)

        steps = payload.get("steps", [])
        self.assertEqual(len(steps), 2)
        self.assertEqual(steps[0].get("output_raw_json", {}).get("body", {}).get("hello"), "world")
        self.assertEqual(steps[1].get("output_raw_json", {}).get("fromHttp"), "world")
        self.assertEqual(steps[1].get("output_raw_json", {}).get("statusCode"), 200)

    @patch("app.integrations.http.requests.Session.request")
    def test_http_make_request_can_skip_http_error_failure(self, request_mock):
        request_mock.return_value = _MockResponse(
            status_code=500,
            payload={"message": "upstream error"},
            headers={"Content-Type": "application/json"},
            url="https://api.example.com/fail",
            reason="Internal Server Error",
        )

        scenario = self._create_scenario(
            {
                "nodes": [
                    {
                        "id": "http_1",
                        "type": "http.make_request",
                        "config": {
                            "method": "GET",
                            "url": "https://api.example.com/fail",
                            "failOnHttpError": False,
                        },
                    }
                ],
                "edges": [],
            }
        )

        response = self.client.post(
            "/api/v1/metis-orchestrate/runs/",
            {"scenario_id": scenario.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json().get("data", {})
        self.assertEqual(payload.get("status"), RunStatus.SUCCEEDED)
        steps = payload.get("steps", [])
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0].get("output_raw_json", {}).get("statusCode"), 500)
