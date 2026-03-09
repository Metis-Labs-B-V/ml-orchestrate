from collections import deque

from django.conf import settings
from django.db import transaction
from rest_framework import serializers

from app.models import (
    Connection,
    ConnectionAuthType,
    EmailTemplate,
    EmailTemplateCategory,
    EmailTemplateVersion,
    Run,
    RunTriggerType,
    RunStep,
    SampleItem,
    Scenario,
    ScenarioSchedule,
    ScenarioVersion,
)
from app.services.email_templates import (
    EmailTemplateServiceError,
    normalize_sample_payload,
    normalize_variables_schema,
)
from app.services.connection_secrets import (
    ConnectionSecretError,
    get_connection_secret_payload,
    set_connection_secret_payload,
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
            "last_enqueued_at",
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
        if "secret_payload" in attrs:
            secret_payload = attrs.get("secret_payload") or {}
        elif self.instance:
            try:
                secret_payload = get_connection_secret_payload(
                    self.instance,
                    persist_migration=False,
                ).payload
            except ConnectionSecretError as exc:
                raise serializers.ValidationError({"secret_payload": [exc.message]})
        else:
            secret_payload = {}
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
        elif provider == "email":
            username = str(
                secret_payload.get("username")
                or secret_payload.get("email")
                or ""
            ).strip()
            smtp_host = str(secret_payload.get("smtpHost") or secret_payload.get("host") or "").strip()
            imap_host = str(secret_payload.get("imapHost") or secret_payload.get("inboxHost") or "").strip()
            smtp_password = str(
                secret_payload.get("smtpPassword")
                or secret_payload.get("password")
                or ""
            )
            imap_password = str(
                secret_payload.get("imapPassword")
                or smtp_password
                or ""
            )
            smtp_access_token = str(
                secret_payload.get("smtpAccessToken")
                or secret_payload.get("accessToken")
                or ""
            )
            imap_access_token = str(
                secret_payload.get("imapAccessToken")
                or smtp_access_token
                or ""
            )

            if not username:
                raise serializers.ValidationError(
                    {"secret_payload": ["Missing required Email field: username."]}
                )

            if not smtp_host and not imap_host:
                raise serializers.ValidationError(
                    {
                        "secret_payload": [
                            "Email connection requires at least one host: smtpHost or imapHost."
                        ]
                    }
                )

            if auth_type == ConnectionAuthType.OAUTH:
                missing = []
                if smtp_host and not smtp_access_token:
                    missing.append("smtpAccessToken")
                if imap_host and not imap_access_token:
                    missing.append("imapAccessToken")
                if missing:
                    raise serializers.ValidationError(
                        {
                            "secret_payload": [
                                f"Missing required Email OAuth fields: {', '.join(missing)}"
                            ]
                        }
                    )
            else:
                missing = []
                if smtp_host and not smtp_password:
                    missing.append("smtpPassword")
                if imap_host and not imap_password:
                    missing.append("imapPassword")
                if missing:
                    raise serializers.ValidationError(
                        {
                            "secret_payload": [
                                f"Missing required Email password fields: {', '.join(missing)}"
                            ]
                        }
                    )

        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            secret_payload = validated_data.pop("secret_payload", None)
            connection = super().create(validated_data)
            if secret_payload is not None:
                try:
                    set_connection_secret_payload(connection, secret_payload)
                except ConnectionSecretError as exc:
                    raise serializers.ValidationError({"secret_payload": [exc.message]})
                connection.save(
                    update_fields=[
                        "encrypted_secret_payload",
                        "secret_payload",
                        "secret_payload_migrated_at",
                        "updated_at",
                    ]
                )
            return connection

    def update(self, instance, validated_data):
        with transaction.atomic():
            secret_payload = validated_data.pop("secret_payload", None)
            connection = super().update(instance, validated_data)
            if secret_payload is not None:
                try:
                    set_connection_secret_payload(connection, secret_payload)
                except ConnectionSecretError as exc:
                    raise serializers.ValidationError({"secret_payload": [exc.message]})
                connection.save(
                    update_fields=[
                        "encrypted_secret_payload",
                        "secret_payload",
                        "secret_payload_migrated_at",
                        "updated_at",
                    ]
                )
            return connection


class EmailTemplateSerializer(serializers.ModelSerializer):
    tenant_id = serializers.PrimaryKeyRelatedField(
        source="tenant", queryset=Tenant.objects.all(), required=False, allow_null=True
    )
    workspace_id = serializers.PrimaryKeyRelatedField(
        source="workspace", queryset=Customer.objects.all(), required=False, allow_null=True
    )
    tenant_name = serializers.CharField(source="tenant.name", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    version = serializers.IntegerField(source="current_version", read_only=True)

    class Meta:
        model = EmailTemplate
        fields = [
            "id",
            "name",
            "slug",
            "category",
            "description",
            "subject_template",
            "html_template",
            "text_template",
            "variables_schema",
            "sample_payload",
            "is_system_template",
            "is_active",
            "version",
            "current_version",
            "tenant_id",
            "tenant_name",
            "workspace_id",
            "workspace_name",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "is_system_template",
            "version",
            "current_version",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]

    def validate_variables_schema(self, value):
        try:
            return normalize_variables_schema(value)
        except EmailTemplateServiceError as exc:
            raise serializers.ValidationError(exc.errors.get("variables_schema") or [exc.message])

    def validate_sample_payload(self, value):
        try:
            return normalize_sample_payload(value)
        except EmailTemplateServiceError as exc:
            raise serializers.ValidationError(exc.errors.get("sample_payload") or [exc.message])

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

        subject_template = attrs.get(
            "subject_template",
            getattr(self.instance, "subject_template", ""),
        )
        html_template = attrs.get(
            "html_template",
            getattr(self.instance, "html_template", ""),
        )
        text_template = attrs.get(
            "text_template",
            getattr(self.instance, "text_template", ""),
        )
        if not html_template and not text_template:
            raise serializers.ValidationError(
                {
                    "html_template": ["Provide html_template or text_template."],
                    "text_template": ["Provide text_template or html_template."],
                }
            )
        if not attrs.get("name", getattr(self.instance, "name", "")):
            raise serializers.ValidationError({"name": ["name is required."]})
        category = attrs.get("category", getattr(self.instance, "category", ""))
        valid_categories = {choice[0] for choice in EmailTemplateCategory.choices}
        if category not in valid_categories:
            raise serializers.ValidationError(
                {"category": [f"category must be one of: {', '.join(sorted(valid_categories))}."]}
            )
        return attrs


class EmailTemplateVersionSerializer(serializers.ModelSerializer):
    template_id = serializers.IntegerField(source="template.id", read_only=True)

    class Meta:
        model = EmailTemplateVersion
        fields = [
            "id",
            "template_id",
            "version",
            "name",
            "slug",
            "category",
            "description",
            "subject_template",
            "html_template",
            "text_template",
            "variables_schema",
            "sample_payload",
            "change_note",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class EmailTemplatePreviewSerializer(serializers.Serializer):
    template_id = serializers.IntegerField(required=False)
    name = serializers.CharField(required=False, allow_blank=True)
    slug = serializers.CharField(required=False, allow_blank=True)
    category = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    subject_template = serializers.CharField(required=False, allow_blank=True)
    html_template = serializers.CharField(required=False, allow_blank=True)
    text_template = serializers.CharField(required=False, allow_blank=True)
    variables_schema = serializers.JSONField(required=False)
    sample_payload = serializers.JSONField(required=False)
    payload = serializers.JSONField(required=False)
    bindings = serializers.JSONField(required=False)
    subject_override = serializers.CharField(required=False, allow_blank=True)
    html_override = serializers.CharField(required=False, allow_blank=True)
    text_override = serializers.CharField(required=False, allow_blank=True)

    def validate_variables_schema(self, value):
        try:
            return normalize_variables_schema(value)
        except EmailTemplateServiceError as exc:
            raise serializers.ValidationError(exc.errors.get("variables_schema") or [exc.message])

    def validate_sample_payload(self, value):
        try:
            return normalize_sample_payload(value)
        except EmailTemplateServiceError as exc:
            raise serializers.ValidationError(exc.errors.get("sample_payload") or [exc.message])

    def validate_payload(self, value):
        return normalize_sample_payload(value)

    def validate_bindings(self, value):
        return normalize_sample_payload(value)

    def validate(self, attrs):
        if not attrs.get("template_id") and not (
            attrs.get("subject_template")
            or attrs.get("html_template")
            or attrs.get("text_template")
        ):
            raise serializers.ValidationError(
                {
                    "template_id": [
                        "Provide template_id or inline template fields for preview."
                    ]
                }
            )
        return attrs


class EmailTemplateTestSendSerializer(EmailTemplatePreviewSerializer):
    connection_id = serializers.IntegerField()
    to = serializers.JSONField(required=False)
    cc = serializers.JSONField(required=False)
    bcc = serializers.JSONField(required=False)
    reply_to = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("to") in (None, "", []):
            raise serializers.ValidationError({"to": ["At least one recipient is required."]})
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
            "queued_at",
            "dispatched_at",
            "attempt_count",
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
            "queued_at",
            "dispatched_at",
            "attempt_count",
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
