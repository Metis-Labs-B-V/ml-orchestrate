import ast
import json
import re
from collections import deque
from time import perf_counter
from typing import Any

from django.db import transaction
from django.utils import timezone

from app.integrations.http import HttpAdapter, HttpExecutionError
from app.integrations.hubspot import HubspotAdapter, HubspotExecutionError
from app.integrations.jenkins import JenkinsAdapter, JenkinsExecutionError
from app.integrations.jira import JiraAdapter, JiraExecutionError
from app.models import (
    Connection,
    Run,
    RunStatus,
    RunStep,
    RunStepStatus,
    Scenario,
)

TOKEN_RE = re.compile(r"\{\{\s*(.*?)\s*\}\}")
FULL_TOKEN_RE = re.compile(r"^\s*\{\{\s*(.*?)\s*\}\}\s*$")
HELPER_RE = re.compile(r"^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\((.*)\))?$")


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


def _split_pipeline(expression: str) -> list[str]:
    return [part.strip() for part in expression.split("|") if part.strip()]


def _parse_reference(value: str) -> tuple[str, list[Any]]:
    value = value.strip()
    if not value:
        return "", []

    idx = 0
    while idx < len(value) and value[idx] not in ".[":
        idx += 1
    node_id = value[:idx]
    remainder = value[idx:]
    tokens: list[Any] = []
    i = 0
    while i < len(remainder):
        char = remainder[i]
        if char == ".":
            i += 1
            start = i
            while i < len(remainder) and remainder[i] not in ".[":
                i += 1
            key = remainder[start:i]
            if key:
                tokens.append(key)
            continue
        if char == "[":
            end = remainder.find("]", i)
            if end == -1:
                raise ExecutionError(f"Invalid token reference: {value}")
            raw = remainder[i + 1 : end].strip()
            if (raw.startswith('"') and raw.endswith('"')) or (
                raw.startswith("'") and raw.endswith("'")
            ):
                tokens.append(raw[1:-1])
            elif raw.isdigit():
                tokens.append(int(raw))
            else:
                tokens.append(raw)
            i = end + 1
            continue
        start = i
        while i < len(remainder) and remainder[i] not in ".[":
            i += 1
        key = remainder[start:i]
        if key:
            tokens.append(key)
    return node_id, tokens


def _lookup_reference(expression: str, context: dict[str, Any]) -> Any:
    node_id, tokens = _parse_reference(expression)
    if not node_id:
        return None
    if node_id not in context:
        return None
    value = context.get(node_id)
    for token in tokens:
        if isinstance(token, int):
            if isinstance(value, list) and 0 <= token < len(value):
                value = value[token]
            else:
                return None
            continue
        if isinstance(value, dict):
            value = value.get(token)
        else:
            return None
    return value


def _parse_helper_args(raw_args: str, context: dict[str, Any]) -> list[Any]:
    if not raw_args:
        return []
    try:
        parsed = ast.literal_eval(f"[{raw_args}]")
    except Exception:
        parsed = [raw_args]
    resolved: list[Any] = []
    for arg in parsed:
        if isinstance(arg, str):
            token_match = FULL_TOKEN_RE.match(arg)
            if token_match:
                resolved.append(_evaluate_expression(token_match.group(1), context))
            else:
                resolved.append(arg)
        else:
            resolved.append(arg)
    return resolved


def _apply_helper(name: str, value: Any, args: list[Any]) -> Any:
    helper = name.lower()
    if helper == "default":
        if value in (None, "", [], {}):
            return args[0] if args else value
        return value
    if helper == "concat":
        pieces = ["" if value is None else str(value)] + [str(arg) for arg in args]
        return "".join(pieces)
    if helper == "upper":
        return str(value or "").upper()
    if helper == "lower":
        return str(value or "").lower()
    if helper == "trim":
        return str(value or "").strip()
    return value


def _evaluate_expression(expression: str, context: dict[str, Any]) -> Any:
    pipeline = _split_pipeline(expression)
    if not pipeline:
        return None
    value = _lookup_reference(pipeline[0], context)

    for part in pipeline[1:]:
        match = HELPER_RE.match(part)
        if not match:
            continue
        helper_name = match.group(1)
        helper_args = _parse_helper_args(match.group(2) or "", context)
        value = _apply_helper(helper_name, value, helper_args)
    return value


def _resolve_template_string(value: str, context: dict[str, Any]) -> Any:
    full = FULL_TOKEN_RE.match(value)
    if full:
        return _evaluate_expression(full.group(1), context)

    def _replace(match: re.Match[str]) -> str:
        evaluated = _evaluate_expression(match.group(1), context)
        if evaluated is None:
            return ""
        if isinstance(evaluated, (dict, list)):
            return json.dumps(evaluated)
        return str(evaluated)

    return TOKEN_RE.sub(_replace, value)


def _resolve_payload(payload: Any, context: dict[str, Any]) -> Any:
    if isinstance(payload, dict):
        return {key: _resolve_payload(val, context) for key, val in payload.items()}
    if isinstance(payload, list):
        return [_resolve_payload(item, context) for item in payload]
    if isinstance(payload, str):
        return _resolve_template_string(payload, context)
    return payload


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
    adapter = JiraAdapter(
        connection.secret_payload or {},
        auth_type=connection.auth_type,
    )
    return adapter.execute(node_type, config)


def _execute_jenkins_node(run: Run, node_type: str, config: dict[str, Any]) -> Any:
    connection = _get_connection_for_run(run, config.get("connectionId"))
    adapter = JenkinsAdapter(connection.secret_payload or {})

    if node_type == "jenkins.api.call":
        return adapter.api_call(config)
    raise ExecutionError(f"Unsupported Jenkins node type: {node_type}")


def _execute_hubspot_node(run: Run, node_type: str, config: dict[str, Any]) -> Any:
    connection = _get_connection_for_run(run, config.get("connectionId"))
    adapter = HubspotAdapter(
        connection.secret_payload or {},
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

    run.status = RunStatus.RUNNING
    run.started_at = run.started_at or timezone.now()
    run.ended_at = None
    run.metadata = {}
    run.save(update_fields=["status", "started_at", "ended_at", "metadata", "updated_at"])

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
    run.metadata = {
        "node_count": len(ordered_nodes),
        "executed_nodes": len(execution_context),
    }
    run.save(update_fields=["status", "ended_at", "metadata", "updated_at"])
    return run
