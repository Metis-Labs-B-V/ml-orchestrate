import json
from collections import deque
from time import perf_counter
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from app.integrations.email import EmailAdapter, EmailExecutionError
from app.integrations.http import HttpAdapter, HttpExecutionError
from app.integrations.hubspot import HubspotAdapter, HubspotExecutionError
from app.integrations.jenkins import JenkinsAdapter, JenkinsExecutionError
from app.integrations.jira import JiraAdapter, JiraExecutionError
from app.models import (
    Connection,
    EmailTemplate,
    Run,
    RunStatus,
    RunStep,
    RunStepStatus,
    Scenario,
)
from app.services.connection_secrets import get_connection_secret_payload
from app.services.email_templates import EmailTemplateServiceError, render_template_instance
from app.services.template_runtime import render_payload


class ExecutionError(Exception):
    def __init__(self, message: str, details: Any = None):
        super().__init__(message)
        self.message = message
        self.details = details

    def as_dict(self) -> dict[str, Any]:
        return {"message": self.message, "details": self.details}


def _safe_json(data: Any) -> Any:
    if data is None:
        return {}
    if isinstance(data, (dict, list, str, int, float, bool)):
        return data
    return json.loads(json.dumps(data, default=str))


def _topological_node_order(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    node_map = {}
    indegree: dict[str, int] = {}
    graph: dict[str, list[str]] = {}
    insertion_order: list[str] = []

    for node in nodes:
        node_id = str(node.get("id") or "")
        if not node_id:
            continue
        node_map[node_id] = node
        indegree[node_id] = 0
        graph[node_id] = []
        insertion_order.append(node_id)

    for edge in edges:
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if source in graph and target in indegree:
            graph[source].append(target)
            indegree[target] += 1

    queue = deque([node_id for node_id in insertion_order if indegree[node_id] == 0])
    ordered_ids: list[str] = []
    while queue:
        current = queue.popleft()
        ordered_ids.append(current)
        for nxt in graph[current]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)

    if len(ordered_ids) < len(insertion_order):
        remaining = [node_id for node_id in insertion_order if node_id not in ordered_ids]
        ordered_ids.extend(remaining)

    return [node_map[node_id] for node_id in ordered_ids if node_id in node_map]


def _resolve_payload(payload: Any, context: dict[str, Any]) -> Any:
    return render_payload(payload, context).value


def _get_connection_for_run(run: Run, connection_id: Any) -> Connection:
    try:
        connection_id_int = int(connection_id)
    except (TypeError, ValueError):
        raise ExecutionError("Node is missing a valid connectionId.")

    queryset = Connection.objects.filter(id=connection_id_int, is_active=True)
    if (run.created_by or "").strip():
        queryset = queryset.filter(created_by=run.created_by)
    if run.workspace_id:
        queryset = queryset.filter(workspace_id=run.workspace_id)
    if run.tenant_id:
        queryset = queryset.filter(tenant_id=run.tenant_id)

    connection = queryset.first()
    if not connection:
        raise ExecutionError(f"Connection {connection_id} not found in run scope.")
    return connection


def _execute_jira_node(run: Run, node_type: str, config: dict[str, Any]) -> Any:
    connection = _get_connection_for_run(run, config.get("connectionId"))
    connection_payload = get_connection_secret_payload(connection).payload
    adapter = JiraAdapter(
        connection_payload,
        auth_type=connection.auth_type,
    )
    return adapter.execute(node_type, config)


def _execute_jenkins_node(run: Run, node_type: str, config: dict[str, Any]) -> Any:
    connection = _get_connection_for_run(run, config.get("connectionId"))
    connection_payload = get_connection_secret_payload(connection).payload
    adapter = JenkinsAdapter(connection_payload)

    if node_type == "jenkins.api.call":
        return adapter.api_call(config)
    raise ExecutionError(f"Unsupported Jenkins node type: {node_type}")


def _execute_hubspot_node(run: Run, node_type: str, config: dict[str, Any]) -> Any:
    connection = _get_connection_for_run(run, config.get("connectionId"))
    connection_payload = get_connection_secret_payload(connection).payload
    adapter = HubspotAdapter(
        connection_payload,
        auth_type=connection.auth_type,
    )
    return adapter.execute(node_type, config)


def _execute_http_node(node_type: str, config: dict[str, Any]) -> Any:
    adapter = HttpAdapter()
    if node_type == "http.make_request":
        return adapter.make_request(config)
    if node_type == "http.download_file":
        return adapter.download_file(config)
    if node_type == "http.resolve_url":
        return adapter.resolve_url(config)
    raise ExecutionError(f"Unsupported HTTP node type: {node_type}")


def _get_email_template_for_run(run: Run, template_id: Any) -> EmailTemplate:
    try:
        template_id_int = int(template_id)
    except (TypeError, ValueError):
        raise ExecutionError("Node is missing a valid templateId.")

    queryset = EmailTemplate.objects.filter(id=template_id_int, is_active=True)
    scope_filter = Q(
        is_system_template=True,
        tenant__isnull=True,
        workspace__isnull=True,
    )
    if (run.created_by or "").strip():
        scope_filter |= Q(created_by__iexact=run.created_by, is_system_template=False)
    if run.workspace_id:
        scope_filter &= Q(Q(workspace_id=run.workspace_id) | Q(workspace__isnull=True))
    if run.tenant_id:
        scope_filter &= Q(Q(tenant_id=run.tenant_id) | Q(tenant__isnull=True))
    queryset = queryset.filter(scope_filter)
    template = queryset.first()
    if not template:
        raise ExecutionError(f"Email template {template_id} not found in run scope.")
    return template


def _execute_email_node(run: Run, node_type: str, config: dict[str, Any]) -> Any:
    connection = _get_connection_for_run(run, config.get("connectionId"))
    connection_payload = get_connection_secret_payload(connection).payload
    resolved_config = dict(config)
    if node_type == "email.send" and str(config.get("composeMode") or "inline") == "template":
        template = _get_email_template_for_run(run, config.get("templateId"))
        try:
            rendered = render_template_instance(
                template,
                payload=config.get("templatePayload") if isinstance(config.get("templatePayload"), dict) else None,
                bindings=config.get("templateBindings") if isinstance(config.get("templateBindings"), dict) else None,
                subject_override=str(config.get("subjectOverride") or ""),
                html_override=str(config.get("htmlOverride") or ""),
                text_override=str(config.get("textOverride") or ""),
                mode="execution",
            )
        except EmailTemplateServiceError as exc:
            raise ExecutionError(exc.message, details=exc.errors)
        resolved_config.update(
            {
                "subject": rendered["subject"],
                "bodyHtml": rendered["html"],
                "bodyText": rendered["text"],
                "renderedTemplate": {
                    "templateId": template.id,
                    "templateSlug": template.slug,
                    "version": template.current_version,
                    "missingVariables": rendered["missing_variables"],
                    "usedVariables": rendered["used_variables"],
                },
            }
        )
    adapter = EmailAdapter(
        connection_payload,
        auth_type=connection.auth_type,
    )
    return adapter.execute(node_type, resolved_config)


def _execute_json_node(node_type: str, config: dict[str, Any]) -> Any:
    if node_type != "json.create":
        raise ExecutionError(f"Unsupported JSON node type: {node_type}")
    if "payload" in config:
        return config.get("payload")
    if "value" in config:
        return config.get("value")
    if "json" in config:
        return config.get("json")
    return config


def _execute_node(
    run: Run,
    node: dict[str, Any],
    context: dict[str, Any],
    resolved_config: dict[str, Any] | None = None,
) -> Any:
    node_type = str(node.get("type") or "")
    config = (
        resolved_config
        if resolved_config is not None
        else _resolve_payload(node.get("config") or {}, context)
    )

    if node_type.startswith("jira."):
        return _execute_jira_node(run, node_type, config)

    if node_type.startswith("jenkins."):
        return _execute_jenkins_node(run, node_type, config)

    if node_type.startswith("hubspot."):
        return _execute_hubspot_node(run, node_type, config)

    if node_type.startswith("http."):
        return _execute_http_node(node_type, config)

    if node_type.startswith("email."):
        return _execute_email_node(run, node_type, config)

    if node_type.startswith("json."):
        return _execute_json_node(node_type, config)

    if node_type.startswith("flow."):
        # Built-in flow nodes are pass-through in this MVP.
        return {"nodeType": node_type, "status": "ok"}

    raise ExecutionError(f"Unsupported node type: {node_type}")


@transaction.atomic
def execute_run(run: Run) -> Run:
    scenario: Scenario = run.scenario
    graph = scenario.graph_json or {}
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []
    if not isinstance(nodes, list) or not isinstance(edges, list):
        run.status = RunStatus.FAILED
        run.ended_at = timezone.now()
        run.metadata = {"error": "Scenario graph_json must contain nodes and edges arrays."}
        run.save(update_fields=["status", "ended_at", "metadata", "updated_at"])
        return run

    if run.status != RunStatus.RUNNING or not run.started_at:
        run.status = RunStatus.RUNNING
        run.started_at = run.started_at or timezone.now()
        run.ended_at = None
        if not isinstance(run.metadata, dict):
            run.metadata = {}
        run.save(
            update_fields=["status", "started_at", "ended_at", "metadata", "updated_at"]
        )

    execution_context: dict[str, Any] = {}
    ordered_nodes = _topological_node_order(nodes, edges)
    any_failure = False

    for node in ordered_nodes:
        node_id = str(node.get("id") or "")
        node_type = str(node.get("type") or "")
        if not node_id:
            continue
        resolved_config = _resolve_payload(node.get("config") or {}, execution_context)

        step = RunStep.objects.create(
            run=run,
            node_id=node_id,
            node_type=node_type,
            status=RunStepStatus.RUNNING,
            input_json=_safe_json(resolved_config),
            started_at=timezone.now(),
        )
        started = perf_counter()
        try:
            output = _execute_node(run, node, execution_context, resolved_config=resolved_config)
            execution_context[node_id] = output
            step.status = RunStepStatus.SUCCEEDED
            step.output_raw_json = _safe_json(output)
            step.output_normalized_json = _safe_json(output)
            step.error_json = {}
        except JiraExecutionError as exc:
            any_failure = True
            step.status = RunStepStatus.FAILED
            step.error_json = _safe_json(exc.as_dict())
            step.output_raw_json = {}
            step.output_normalized_json = {}
        except JenkinsExecutionError as exc:
            any_failure = True
            step.status = RunStepStatus.FAILED
            step.error_json = _safe_json(exc.as_dict())
            step.output_raw_json = {}
            step.output_normalized_json = {}
        except HubspotExecutionError as exc:
            any_failure = True
            step.status = RunStepStatus.FAILED
            step.error_json = _safe_json(exc.as_dict())
            step.output_raw_json = {}
            step.output_normalized_json = {}
        except HttpExecutionError as exc:
            any_failure = True
            step.status = RunStepStatus.FAILED
            step.error_json = _safe_json(exc.as_dict())
            step.output_raw_json = {}
            step.output_normalized_json = {}
        except EmailExecutionError as exc:
            any_failure = True
            step.status = RunStepStatus.FAILED
            step.error_json = _safe_json(exc.as_dict())
            step.output_raw_json = {}
            step.output_normalized_json = {}
        except ExecutionError as exc:
            any_failure = True
            step.status = RunStepStatus.FAILED
            step.error_json = _safe_json(exc.as_dict())
            step.output_raw_json = {}
            step.output_normalized_json = {}
        except Exception as exc:  # pragma: no cover
            any_failure = True
            step.status = RunStepStatus.FAILED
            step.error_json = {"message": str(exc)}
            step.output_raw_json = {}
            step.output_normalized_json = {}
        finally:
            step.duration_ms = int((perf_counter() - started) * 1000)
            step.ended_at = timezone.now()
            step.save(
                update_fields=[
                    "status",
                    "output_raw_json",
                    "output_normalized_json",
                    "error_json",
                    "duration_ms",
                    "ended_at",
                    "updated_at",
                ]
            )
        if any_failure:
            break

    run.status = RunStatus.FAILED if any_failure else RunStatus.SUCCEEDED
    run.ended_at = timezone.now()
    base_metadata = run.metadata if isinstance(run.metadata, dict) else {}
    run.metadata = {
        **base_metadata,
        "node_count": len(ordered_nodes),
        "executed_nodes": len(execution_context),
    }
    run.save(update_fields=["status", "ended_at", "metadata", "updated_at"])
    return run
