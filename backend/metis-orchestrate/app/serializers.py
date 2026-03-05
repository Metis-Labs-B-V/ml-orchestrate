from collections import deque

from django.conf import settings
from rest_framework import serializers

from app.models import (
    Connection,
    ConnectionAuthType,
    Run,
    RunTriggerType,
    RunStep,
    SampleItem,
    Scenario,
    ScenarioSchedule,
    ScenarioVersion,
)
from identity.models import Customer, Tenant


def _normalize_port_type(port_type):
    value = str(port_type or "").strip().lower()
    return value or "any"


def _ports_are_compatible(source_port_type, target_port_type):
    source = _normalize_port_type(source_port_type)
    target = _normalize_port_type(target_port_type)
    if source in {"any", "unknown"} or target in {"any", "unknown"}:
        return True
    if source == target:
        return True
    # Allow event streams to feed generic data/event input ports.
    if source == "event" and target in {"data", "event"}:
        return True
    return False


def _graph_has_cycle(node_ids, edges):
    adjacency = {node_id: [] for node_id in node_ids}
    indegree = {node_id: 0 for node_id in node_ids}

    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source in adjacency and target in indegree:
            adjacency[source].append(target)
            indegree[target] += 1

    queue = deque([node_id for node_id, degree in indegree.items() if degree == 0])
    visited = 0
    while queue:
        node_id = queue.popleft()
        visited += 1
        for nxt in adjacency[node_id]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)

    return visited != len(node_ids)


class SampleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SampleItem
        fields = [
            "id",
            "name",
            "description",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "is_active",
        ]


class ScenarioSerializer(serializers.ModelSerializer):
    tenant_id = serializers.PrimaryKeyRelatedField(
        source="tenant", queryset=Tenant.objects.all(), required=False, allow_null=True
    )
    workspace_id = serializers.PrimaryKeyRelatedField(
        source="workspace", queryset=Customer.objects.all(), required=False, allow_null=True
    )
    tenant_name = serializers.CharField(source="tenant.name", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    class Meta:
        model = Scenario
        fields = [
            "id",
            "name",
            "description",
            "status",
            "graph_json",
            "current_version",
            "activated_at",
            "tenant_id",
            "tenant_name",
            "workspace_id",
            "workspace_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["current_version", "activated_at", "created_at", "updated_at"]

    def validate_graph_json(self, value):
        if value in (None, ""):
            return {"nodes": [], "edges": []}
        if not isinstance(value, dict):
            raise serializers.ValidationError("graph_json must be an object.")
        nodes = value.get("nodes", [])
        edges = value.get("edges", [])
        if not isinstance(nodes, list) or not isinstance(edges, list):
            raise serializers.ValidationError("graph_json must contain nodes and edges arrays.")

        node_ids = set()
        node_port_map = {}
        for index, node in enumerate(nodes):
            if not isinstance(node, dict):
                raise serializers.ValidationError(
                    {"nodes": [f"Node at index {index} must be an object."]}
                )
            node_id = str(node.get("id") or "").strip()
            if not node_id:
                raise serializers.ValidationError(
                    {"nodes": [f"Node at index {index} is missing id."]}
                )
            if node_id in node_ids:
                raise serializers.ValidationError(
                    {"nodes": [f"Duplicate node id '{node_id}' in graph."]}
                )
            node_ids.add(node_id)

            kind = str(node.get("kind") or "").strip().lower()
            accepts_input = node.get("acceptsInput")
            if accepts_input is None:
                accepts_input = kind != "trigger"

            node_port_map[node_id] = {
                "accepts_input": bool(accepts_input),
                "input_port_type": _normalize_port_type(node.get("inputPortType")),
                "output_port_type": _normalize_port_type(node.get("outputPortType")),
            }

        edge_ids = set()
        seen_pairs = set()
        for index, edge in enumerate(edges):
            if not isinstance(edge, dict):
                raise serializers.ValidationError(
                    {"edges": [f"Edge at index {index} must be an object."]}
                )
            edge_id = str(edge.get("id") or "").strip()
            if edge_id:
                if edge_id in edge_ids:
                    raise serializers.ValidationError(
                        {"edges": [f"Duplicate edge id '{edge_id}' in graph."]}
                    )
                edge_ids.add(edge_id)

            source = str(edge.get("source") or "").strip()
            target = str(edge.get("target") or "").strip()
            if not source or not target:
                raise serializers.ValidationError(
                    {"edges": [f"Edge at index {index} must include source and target."]}
                )
            if source not in node_ids or target not in node_ids:
                raise serializers.ValidationError(
                    {
                        "edges": [
                            f"Edge at index {index} references missing source/target node."
                        ]
                    }
                )
            if source == target:
                raise serializers.ValidationError(
                    {"edges": [f"Self-loop is not allowed for node '{source}'."]}
                )

            pair = (source, target)
            if pair in seen_pairs:
                raise serializers.ValidationError(
                    {"edges": [f"Duplicate edge between '{source}' and '{target}'."]}
                )
            seen_pairs.add(pair)

            source_ports = node_port_map.get(source) or {}
            target_ports = node_port_map.get(target) or {}
            if not target_ports.get("accepts_input", True):
                raise serializers.ValidationError(
                    {
                        "edges": [
                            f"Node '{target}' cannot accept inbound connections."
                        ]
                    }
                )

            if not _ports_are_compatible(
                edge.get("sourcePortType") or source_ports.get("output_port_type"),
                edge.get("targetPortType") or target_ports.get("input_port_type"),
            ):
                raise serializers.ValidationError(
                    {
                        "edges": [
                            f"Incompatible port types between '{source}' and '{target}'."
                        ]
                    }
                )

        allow_cycles = bool(getattr(settings, "ORCHESTRATE_ALLOW_CYCLES", False))
        if not allow_cycles and _graph_has_cycle(node_ids, edges):
            raise serializers.ValidationError(
                {"edges": ["Cycle detected in graph. Set ORCHESTRATE_ALLOW_CYCLES=true to allow."]}
            )
        return value

    def validate(self, attrs):
        tenant = attrs.get("tenant", getattr(self.instance, "tenant", None))
        workspace = attrs.get("workspace", getattr(self.instance, "workspace", None))

        if workspace and not tenant and workspace.tenant_id:
            attrs["tenant"] = workspace.tenant
            tenant = attrs["tenant"]

        if workspace and tenant and workspace.tenant_id and workspace.tenant_id != tenant.id:
            raise serializers.ValidationError(
                {"workspace_id": ["Selected workspace does not belong to tenant_id."]}
            )

        if "graph_json" not in attrs and not self.instance:
            attrs["graph_json"] = {"nodes": [], "edges": []}
        return attrs


class ScenarioVersionSerializer(serializers.ModelSerializer):
    scenario_id = serializers.IntegerField(source="scenario.id", read_only=True)

    class Meta:
        model = ScenarioVersion
        fields = [
            "id",
            "scenario_id",
            "version",
            "graph_json",
            "is_published",
            "published_at",
            "created_at",
            "updated_at",
        ]


class ScenarioScheduleSerializer(serializers.ModelSerializer):
    scenario_id = serializers.IntegerField(source="scenario.id", read_only=True)

    class Meta:
        model = ScenarioSchedule
        fields = [
            "id",
            "scenario_id",
            "trigger_type",
            "interval_minutes",
            "is_active",
            "next_run_at",
            "last_run_at",
            "metadata",
            "created_at",
            "updated_at",
        ]

    def validate_interval_minutes(self, value):
        if value < 1:
            raise serializers.ValidationError("interval_minutes must be at least 1.")
        return value


class ConnectionSerializer(serializers.ModelSerializer):
    tenant_id = serializers.PrimaryKeyRelatedField(
        source="tenant", queryset=Tenant.objects.all(), required=False, allow_null=True
    )
    workspace_id = serializers.PrimaryKeyRelatedField(
        source="workspace", queryset=Customer.objects.all(), required=False, allow_null=True
    )
    tenant_name = serializers.CharField(source="tenant.name", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    secret_payload = serializers.JSONField(write_only=True, required=False)

    class Meta:
        model = Connection
        fields = [
            "id",
            "provider",
            "auth_type",
            "display_name",
            "tenant_id",
            "tenant_name",
            "workspace_id",
            "workspace_name",
            "metadata",
            "secret_ref",
            "secret_payload",
            "status",
            "last_tested_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["last_tested_at", "created_at", "updated_at"]

    def validate(self, attrs):
        tenant = attrs.get("tenant", getattr(self.instance, "tenant", None))
        workspace = attrs.get("workspace", getattr(self.instance, "workspace", None))

        if workspace and not tenant and workspace.tenant_id:
            attrs["tenant"] = workspace.tenant
            tenant = attrs["tenant"]

        if workspace and tenant and workspace.tenant_id and workspace.tenant_id != tenant.id:
            raise serializers.ValidationError(
                {"workspace_id": ["Selected workspace does not belong to tenant_id."]}
            )

        auth_type = attrs.get("auth_type", getattr(self.instance, "auth_type", None))
        provider = str(
            attrs.get("provider", getattr(self.instance, "provider", ""))
        ).strip().lower()
        secret_payload = attrs.get(
            "secret_payload",
            getattr(self.instance, "secret_payload", {}),
        ) or {}
        if provider == "jira":
            if auth_type == ConnectionAuthType.API_TOKEN:
                required_fields = ["serviceUrl", "username", "apiToken"]
                missing = [key for key in required_fields if not secret_payload.get(key)]
                if missing:
                    raise serializers.ValidationError(
                        {
                            "secret_payload": [
                                f"Missing required Jira API token fields: {', '.join(missing)}"
                            ]
                        }
                    )
            elif auth_type == ConnectionAuthType.OAUTH:
                required_fields = ["accessToken", "cloudId"]
                missing = [key for key in required_fields if not secret_payload.get(key)]
                if missing:
                    raise serializers.ValidationError(
                        {
                            "secret_payload": [
                                f"Missing required Jira OAuth fields: {', '.join(missing)}"
                            ]
                        }
                    )
        elif provider == "jenkins":
            if auth_type == ConnectionAuthType.OAUTH:
                required_fields = ["baseUrl", "accessToken"]
                missing = [key for key in required_fields if not secret_payload.get(key)]
                if missing:
                    raise serializers.ValidationError(
                        {
                            "secret_payload": [
                                f"Missing required Jenkins OAuth fields: {', '.join(missing)}"
                            ]
                        }
                    )
        elif provider == "hubspot":
            token = (
                secret_payload.get("accessToken")
                or secret_payload.get("privateAppToken")
                or secret_payload.get("apiToken")
            )
            if not token:
                raise serializers.ValidationError(
                    {
                        "secret_payload": [
                            "Missing required HubSpot token field: accessToken (or privateAppToken/apiToken)."
                        ]
                    }
                )
            if not secret_payload.get("serviceUrl"):
                secret_payload["serviceUrl"] = "https://api.hubapi.com"
            attrs["secret_payload"] = secret_payload

        return attrs


class RunStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = RunStep
        fields = [
            "id",
            "node_id",
            "node_type",
            "status",
            "input_json",
            "output_raw_json",
            "output_normalized_json",
            "error_json",
            "duration_ms",
            "started_at",
            "ended_at",
        ]


class RunSerializer(serializers.ModelSerializer):
    scenario_id = serializers.PrimaryKeyRelatedField(
        source="scenario", queryset=Scenario.objects.all()
    )
    tenant_id = serializers.IntegerField(source="tenant.id", read_only=True)
    workspace_id = serializers.IntegerField(source="workspace.id", read_only=True)
    status = serializers.CharField(read_only=True)

    class Meta:
        model = Run
        fields = [
            "id",
            "scenario_id",
            "scenario_version",
            "trigger_type",
            "status",
            "tenant_id",
            "workspace_id",
            "started_at",
            "ended_at",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "scenario_version",
            "status",
            "tenant_id",
            "workspace_id",
            "started_at",
            "ended_at",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        scenario = attrs.get("scenario")

        if user and user.is_authenticated and not user.is_superuser:
            if (scenario.created_by or "").strip().lower() != (user.email or "").strip().lower():
                raise serializers.ValidationError(
                    {"scenario_id": ["You do not have access to this scenario."]}
                )

        return attrs

    def create(self, validated_data):
        scenario = validated_data["scenario"]
        validated_data["scenario_version"] = scenario.current_version
        validated_data["tenant"] = scenario.tenant
        validated_data["workspace"] = scenario.workspace
        validated_data.setdefault("trigger_type", RunTriggerType.MANUAL)
        return super().create(validated_data)


class RunDetailSerializer(RunSerializer):
    steps = RunStepSerializer(many=True, read_only=True)

    class Meta(RunSerializer.Meta):
        fields = RunSerializer.Meta.fields + ["steps"]
