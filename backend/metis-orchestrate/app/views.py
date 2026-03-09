import base64
import hashlib
import secrets
from urllib.parse import urlencode, urlparse

import requests
from django.conf import settings
from django.core import signing
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from common_utils.api.responses import error_response, success_response

from app.catalog import get_integration_catalog
from app.integrations.email import EmailAdapter, EmailExecutionError
from app.integrations.hubspot import HubspotAdapter, HubspotExecutionError
from app.integrations.jira import JiraAdapter, JiraExecutionError
from app.models import (
    Connection,
    ConnectionAuthType,
    ConnectionStatus,
    EmailTemplate,
    Run,
    RunStatus,
    SampleItem,
    Scenario,
    ScenarioSchedule,
    ScheduleTriggerType,
    ScenarioStatus,
    ScenarioVersion,
)
from app.serializers import (
    ConnectionSerializer,
    EmailTemplatePreviewSerializer,
    EmailTemplateSerializer,
    EmailTemplateTestSendSerializer,
    EmailTemplateVersionSerializer,
    RunDetailSerializer,
    RunHistoryListSerializer,
    RunSerializer,
    SampleItemSerializer,
    ScenarioAuditEventSerializer,
    ScenarioScheduleSerializer,
    ScenarioSerializer,
    ScenarioVersionSerializer,
)
from app.services.connection_secrets import (
    ConnectionSecretError,
    get_connection_secret_payload,
)
from app.services.history import (
    build_scenario_history_summary,
    filter_scenario_audit_events,
    filter_scenario_runs,
    record_scenario_audit_event,
)
from app.services.email_templates import (
    EmailTemplateServiceError,
    build_definition,
    create_template,
    duplicate_template,
    render_definition,
    render_template_instance,
    template_to_definition,
    test_send_template,
    update_template,
)
from app.services.run_dispatcher import enqueue_manual_run


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return success_response(
        data={"service": "metis-orchestrate"},
        message="ok",
        request=request,
    )


class SampleItemViewSet(viewsets.ModelViewSet):
    queryset = SampleItem.objects.all()
    serializer_class = SampleItemSerializer


def _scope_queryset(queryset, user, *_args, **_kwargs):
    if user.is_superuser:
        return queryset
    user_email = (getattr(user, "email", "") or "").strip()
    if not user_email:
        return queryset.none()
    return queryset.filter(created_by__iexact=user_email)


def _apply_scope_query_params(
    queryset, request, tenant_lookup="tenant_id", workspace_lookup="workspace_id"
):
    tenant_id = request.query_params.get("tenant_id")
    workspace_id = request.query_params.get("workspace_id")
    if tenant_id:
        queryset = queryset.filter(**{tenant_lookup: tenant_id})
    if workspace_id:
        queryset = queryset.filter(**{workspace_lookup: workspace_id})
    return queryset


class IntegrationCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_response(data=get_integration_catalog(), request=request)


def _normalize_url_value(value):
    return str(value or "").strip().rstrip("/").lower()


def _coerce_optional_int(value):
    if value in (None, ""):
        return None
    return int(value)


def _select_jira_resource(resources, preferred_service_url=""):
    if not isinstance(resources, list) or not resources:
        return None

    normalized_preferred = _normalize_url_value(preferred_service_url)
    preferred_host = urlparse(normalized_preferred).netloc if normalized_preferred else ""
    if normalized_preferred:
        for resource in resources:
            if _normalize_url_value(resource.get("url")) == normalized_preferred:
                return resource
        if preferred_host:
            for resource in resources:
                resource_host = urlparse(_normalize_url_value(resource.get("url"))).netloc
                if resource_host == preferred_host:
                    return resource
    return resources[0]


def _pkce_challenge(verifier):
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


class JiraOAuthStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        authorize_url = getattr(settings, "JIRA_OAUTH_AUTHORIZE_URL", "")
        client_id = getattr(settings, "JIRA_OAUTH_CLIENT_ID", "")
        redirect_uri = getattr(settings, "JIRA_OAUTH_REDIRECT_URI", "")
        scopes = getattr(settings, "JIRA_OAUTH_SCOPES", [])
        if not authorize_url or not client_id or not redirect_uri:
            return error_response(
                errors={
                    "oauth": [
                        "Missing Jira OAuth settings. Set JIRA_OAUTH_AUTHORIZE_URL, JIRA_OAUTH_CLIENT_ID and JIRA_OAUTH_REDIRECT_URI."
                    ]
                },
                message="OAuth settings are incomplete",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        service_url = str(request.data.get("service_url") or "").strip()
        workspace_id = request.data.get("workspace_id")
        tenant_id = request.data.get("tenant_id")
        display_name = str(request.data.get("display_name") or "Jira OAuth").strip()

        try:
            workspace_id_value = _coerce_optional_int(workspace_id)
        except (TypeError, ValueError):
            return error_response(
                errors={"workspace_id": ["workspace_id must be a valid integer."]},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        try:
            tenant_id_value = _coerce_optional_int(tenant_id)
        except (TypeError, ValueError):
            return error_response(
                errors={"tenant_id": ["tenant_id must be a valid integer."]},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        state_token = signing.dumps(
            {
                "provider": "jira",
                "user_id": request.user.id,
                "service_url": service_url,
                "workspace_id": workspace_id_value,
                "tenant_id": tenant_id_value,
                "display_name": display_name,
                "code_verifier": secrets.token_urlsafe(64),
            },
            salt="metis-orchestrate-jira-oauth",
        )
        state_payload = signing.loads(
            state_token,
            salt="metis-orchestrate-jira-oauth",
            max_age=30,
        )
        code_verifier = str(state_payload.get("code_verifier") or "")
        code_challenge = _pkce_challenge(code_verifier)

        query = {
            "audience": "api.atlassian.com",
            "client_id": client_id,
            "scope": " ".join(scopes),
            "redirect_uri": redirect_uri,
            "state": state_token,
            "response_type": "code",
            "prompt": "consent",
            "response_mode": "query",
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }

        url = f"{authorize_url}?{urlencode(query)}"
        return success_response(data={"url": url, "state": state_token}, request=request)


class JiraOAuthExchangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token_url = getattr(settings, "JIRA_OAUTH_TOKEN_URL", "")
        resources_url = getattr(settings, "JIRA_OAUTH_ACCESSIBLE_RESOURCES_URL", "")
        client_id = getattr(settings, "JIRA_OAUTH_CLIENT_ID", "")
        client_secret = getattr(settings, "JIRA_OAUTH_CLIENT_SECRET", "")
        redirect_uri = getattr(settings, "JIRA_OAUTH_REDIRECT_URI", "")
        timeout = int(getattr(settings, "JIRA_API_TIMEOUT_SECONDS", 30))

        if not token_url or not client_id or not client_secret or not redirect_uri:
            return error_response(
                errors={
                    "oauth": [
                        "Missing Jira OAuth settings. Set JIRA_OAUTH_TOKEN_URL, JIRA_OAUTH_CLIENT_ID, JIRA_OAUTH_CLIENT_SECRET and JIRA_OAUTH_REDIRECT_URI."
                    ]
                },
                message="OAuth settings are incomplete",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        code = str(request.data.get("code") or "").strip()
        state_token = str(request.data.get("state") or "").strip()
        if not code or not state_token:
            return error_response(
                errors={"detail": ["Both code and state are required."]},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        try:
            state_payload = signing.loads(
                state_token,
                salt="metis-orchestrate-jira-oauth",
                max_age=600,
            )
        except signing.BadSignature:
            return error_response(
                errors={"state": ["Invalid or expired OAuth state."]},
                message="Invalid OAuth state",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        if int(state_payload.get("user_id") or 0) != request.user.id:
            return error_response(
                errors={"state": ["OAuth state does not belong to current user."]},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )

        try:
            code_verifier = str(state_payload.get("code_verifier") or "")
            token_response = requests.post(
                token_url,
                json={
                    "grant_type": "authorization_code",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "code_verifier": code_verifier,
                },
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                timeout=timeout,
            )
            token_payload = token_response.json()
        except requests.RequestException as exc:
            return error_response(
                errors={"oauth": [str(exc)]},
                message="Token exchange failed",
                status=status.HTTP_502_BAD_GATEWAY,
                request=request,
            )
        except ValueError:
            token_payload = {"raw": token_response.text}

        if token_response.status_code >= 400:
            return error_response(
                errors={"oauth": [token_payload]},
                message="Token exchange failed",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        access_token = token_payload.get("access_token")
        if not access_token:
            return error_response(
                errors={"oauth": ["No access_token returned by Atlassian."]},
                message="Token exchange failed",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        resources_payload = []
        try:
            resources_response = requests.get(
                resources_url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
                timeout=timeout,
            )
            resources_payload = resources_response.json()
        except requests.RequestException as exc:
            return error_response(
                errors={"oauth": [str(exc)]},
                message="Unable to fetch Jira cloud resources",
                status=status.HTTP_502_BAD_GATEWAY,
                request=request,
            )
        except ValueError:
            resources_payload = []

        if (
            not isinstance(resources_payload, list)
            or resources_response.status_code >= 400
            or not resources_payload
        ):
            return error_response(
                errors={"oauth": ["No Jira cloud resources available for this token."]},
                message="OAuth exchange failed",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        preferred_service_url = str(state_payload.get("service_url") or "").strip()
        selected_resource = _select_jira_resource(resources_payload, preferred_service_url)
        if not selected_resource:
            return error_response(
                errors={"oauth": ["Unable to select Jira cloud resource."]},
                message="OAuth exchange failed",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        cloud_id = str(selected_resource.get("id") or "").strip()
        resource_url = str(selected_resource.get("url") or "").strip()
        if not cloud_id or not resource_url:
            return error_response(
                errors={"oauth": ["Selected Jira cloud resource is missing id/url."]},
                message="OAuth exchange failed",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        serializer = ConnectionSerializer(
            data={
                "provider": "jira",
                "auth_type": "oauth",
                "display_name": state_payload.get("display_name") or "Jira OAuth",
                "tenant_id": state_payload.get("tenant_id"),
                "workspace_id": state_payload.get("workspace_id"),
                "secret_payload": {
                    "serviceUrl": resource_url,
                    "resourceUrl": resource_url,
                    "cloudId": cloud_id,
                    "resourceName": selected_resource.get("name"),
                    "accessToken": access_token,
                    "refreshToken": token_payload.get("refresh_token"),
                    "tokenType": token_payload.get("token_type"),
                    "expiresIn": token_payload.get("expires_in"),
                    "scope": token_payload.get("scope"),
                },
            },
            context={"request": request},
        )

        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        connection = serializer.save()
        return success_response(
            data=ConnectionSerializer(connection).data,
            message="Jira OAuth connection created",
            status=status.HTTP_201_CREATED,
            request=request,
        )


class JenkinsOAuthStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        authorize_url = getattr(settings, "JENKINS_OAUTH_AUTHORIZE_URL", "")
        client_id = getattr(settings, "JENKINS_OAUTH_CLIENT_ID", "")
        redirect_uri = getattr(settings, "JENKINS_OAUTH_REDIRECT_URI", "")
        scopes = getattr(settings, "JENKINS_OAUTH_SCOPES", [])
        if not authorize_url or not client_id or not redirect_uri:
            return error_response(
                errors={
                    "oauth": [
                        "Missing Jenkins OAuth settings. Set JENKINS_OAUTH_AUTHORIZE_URL, JENKINS_OAUTH_CLIENT_ID and JENKINS_OAUTH_REDIRECT_URI."
                    ]
                },
                message="OAuth settings are incomplete",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        base_url = str(request.data.get("base_url") or "").strip()
        workspace_id = request.data.get("workspace_id")
        tenant_id = request.data.get("tenant_id")
        display_name = str(request.data.get("display_name") or "Jenkins OAuth").strip()

        if not base_url:
            return error_response(
                errors={"base_url": ["base_url is required."]},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        try:
            workspace_id_value = int(workspace_id) if workspace_id not in (None, "") else None
        except (TypeError, ValueError):
            return error_response(
                errors={"workspace_id": ["workspace_id must be a valid integer."]},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        try:
            tenant_id_value = int(tenant_id) if tenant_id not in (None, "") else None
        except (TypeError, ValueError):
            return error_response(
                errors={"tenant_id": ["tenant_id must be a valid integer."]},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        state_token = signing.dumps(
            {
                "provider": "jenkins",
                "user_id": request.user.id,
                "base_url": base_url,
                "workspace_id": workspace_id_value,
                "tenant_id": tenant_id_value,
                "display_name": display_name,
            },
            salt="metis-orchestrate-jenkins-oauth",
        )

        query = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state_token,
        }
        if scopes:
            query["scope"] = " ".join(scopes)

        url = f"{authorize_url}?{urlencode(query)}"
        return success_response(data={"url": url, "state": state_token}, request=request)


class JenkinsOAuthExchangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token_url = getattr(settings, "JENKINS_OAUTH_TOKEN_URL", "")
        client_id = getattr(settings, "JENKINS_OAUTH_CLIENT_ID", "")
        client_secret = getattr(settings, "JENKINS_OAUTH_CLIENT_SECRET", "")
        redirect_uri = getattr(settings, "JENKINS_OAUTH_REDIRECT_URI", "")
        timeout = int(getattr(settings, "JIRA_API_TIMEOUT_SECONDS", 30))

        if not token_url or not client_id or not client_secret or not redirect_uri:
            return error_response(
                errors={
                    "oauth": [
                        "Missing Jenkins OAuth settings. Set JENKINS_OAUTH_TOKEN_URL, JENKINS_OAUTH_CLIENT_ID, JENKINS_OAUTH_CLIENT_SECRET and JENKINS_OAUTH_REDIRECT_URI."
                    ]
                },
                message="OAuth settings are incomplete",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        code = str(request.data.get("code") or "").strip()
        state_token = str(request.data.get("state") or "").strip()
        if not code or not state_token:
            return error_response(
                errors={"detail": ["Both code and state are required."]},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        try:
            state_payload = signing.loads(
                state_token,
                salt="metis-orchestrate-jenkins-oauth",
                max_age=600,
            )
        except signing.BadSignature:
            return error_response(
                errors={"state": ["Invalid or expired OAuth state."]},
                message="Invalid OAuth state",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        if int(state_payload.get("user_id") or 0) != request.user.id:
            return error_response(
                errors={"state": ["OAuth state does not belong to current user."]},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )

        try:
            token_response = requests.post(
                token_url,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                },
                headers={"Accept": "application/json"},
                timeout=timeout,
            )
            token_payload = token_response.json()
        except requests.RequestException as exc:
            return error_response(
                errors={"oauth": [str(exc)]},
                message="Token exchange failed",
                status=status.HTTP_502_BAD_GATEWAY,
                request=request,
            )
        except ValueError:
            token_payload = {"raw": token_response.text}

        if token_response.status_code >= 400:
            return error_response(
                errors={"oauth": [token_payload]},
                message="Token exchange failed",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        access_token = token_payload.get("access_token")
        if not access_token:
            return error_response(
                errors={"oauth": ["No access_token returned by provider."]},
                message="Token exchange failed",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        serializer = ConnectionSerializer(
            data={
                "provider": "jenkins",
                "auth_type": "oauth",
                "display_name": state_payload.get("display_name") or "Jenkins OAuth",
                "tenant_id": state_payload.get("tenant_id"),
                "workspace_id": state_payload.get("workspace_id"),
                "secret_payload": {
                    "baseUrl": state_payload.get("base_url"),
                    "accessToken": access_token,
                    "refreshToken": token_payload.get("refresh_token"),
                    "tokenType": token_payload.get("token_type"),
                    "expiresIn": token_payload.get("expires_in"),
                    "scope": token_payload.get("scope"),
                },
            },
            context={"request": request},
        )

        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        connection = serializer.save()
        return success_response(
            data=ConnectionSerializer(connection).data,
            message="Jenkins OAuth connection created",
            status=status.HTTP_201_CREATED,
            request=request,
        )


class ScenarioViewSet(viewsets.ModelViewSet):
    serializer_class = ScenarioSerializer
    permission_classes = [IsAuthenticated]
    queryset = Scenario.objects.select_related("tenant", "workspace").all()

    def get_queryset(self):
        queryset = _scope_queryset(self.queryset, self.request.user)
        queryset = _apply_scope_query_params(queryset, self.request)
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            payload = self.get_paginated_response(serializer.data).data
            return success_response(data=payload, request=request)
        serializer = self.get_serializer(queryset, many=True)
        return success_response(
            data={"items": serializer.data, "count": len(serializer.data)},
            request=request,
        )

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, request=request)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        scenario = serializer.save()
        record_scenario_audit_event(
            scenario,
            event_type="scenario.created",
            event_label="Scenario created",
            payload={
                "name": scenario.name,
                "status": scenario.status,
                "tenant_id": scenario.tenant_id,
                "workspace_id": scenario.workspace_id,
            },
            actor_email=(getattr(request.user, "email", "") or "").strip(),
        )
        return success_response(
            data=self.get_serializer(scenario).data,
            message="Scenario created",
            status=status.HTTP_201_CREATED,
            request=request,
        )

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        scenario = serializer.save()
        changed_fields = sorted(set(request.data.keys()))
        record_scenario_audit_event(
            scenario,
            event_type="scenario.updated",
            event_label="Scenario updated",
            payload={"changed_fields": changed_fields},
            actor_email=(getattr(request.user, "email", "") or "").strip(),
        )
        return success_response(
            data=self.get_serializer(scenario).data,
            message="Scenario updated",
            request=request,
        )

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        scenario = self.get_object()
        graph_json = request.data.get("graph_json", scenario.graph_json)
        if not isinstance(graph_json, dict):
            return error_response(
                errors={"graph_json": ["graph_json must be an object."]},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        latest_version = scenario.versions.order_by("-version").first()
        next_version = 1 if latest_version is None else latest_version.version + 1
        ScenarioVersion.objects.filter(scenario=scenario, is_published=True).update(
            is_published=False
        )
        version = ScenarioVersion.objects.create(
            scenario=scenario,
            version=next_version,
            graph_json=graph_json,
            is_published=True,
            published_at=timezone.now(),
        )
        scenario.graph_json = graph_json
        scenario.current_version = next_version
        scenario.status = ScenarioStatus.PUBLISHED
        scenario.save(
            update_fields=[
                "graph_json",
                "current_version",
                "status",
                "updated_at",
            ]
        )
        record_scenario_audit_event(
            scenario,
            event_type="scenario.published",
            event_label=f"Scenario published as version {next_version}",
            payload={
                "version": next_version,
                "node_count": len(graph_json.get("nodes", [])),
                "edge_count": len(graph_json.get("edges", [])),
            },
            actor_email=(getattr(request.user, "email", "") or "").strip(),
        )
        return success_response(
            data={
                "scenario": self.get_serializer(scenario).data,
                "version": ScenarioVersionSerializer(version).data,
            },
            message="Scenario published",
            request=request,
        )

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        scenario = self.get_object()
        scenario.status = ScenarioStatus.ACTIVE
        scenario.activated_at = timezone.now()
        scenario.save(update_fields=["status", "activated_at", "updated_at"])
        record_scenario_audit_event(
            scenario,
            event_type="scenario.activated",
            event_label="Scenario activated",
            payload={"status": scenario.status},
            actor_email=(getattr(request.user, "email", "") or "").strip(),
        )
        return success_response(
            data=self.get_serializer(scenario).data,
            message="Scenario activated",
            request=request,
        )

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        scenario = self.get_object()
        scenario.status = ScenarioStatus.INACTIVE
        scenario.save(update_fields=["status", "updated_at"])
        record_scenario_audit_event(
            scenario,
            event_type="scenario.deactivated",
            event_label="Scenario deactivated",
            payload={"status": scenario.status},
            actor_email=(getattr(request.user, "email", "") or "").strip(),
        )
        return success_response(
            data=self.get_serializer(scenario).data,
            message="Scenario deactivated",
            request=request,
        )

    @action(detail=True, methods=["get"], url_path="history/summary")
    def history_summary(self, request, pk=None):
        scenario = self.get_object()
        summary = build_scenario_history_summary(scenario)
        return success_response(data=summary, request=request)

    @action(detail=True, methods=["get"], url_path="history/runs")
    def history_runs(self, request, pk=None):
        scenario = self.get_object()
        queryset = (
            scenario.runs.select_related("tenant", "workspace")
            .prefetch_related("steps")
            .all()
        )
        queryset = filter_scenario_runs(
            queryset,
            status_value=request.query_params.get("status"),
            trigger_type=request.query_params.get("trigger_type"),
            provider=request.query_params.get("provider"),
            search=request.query_params.get("search"),
        )
        page = self.paginate_queryset(queryset)
        serializer_class = RunHistoryListSerializer
        if page is not None:
            serializer = serializer_class(page, many=True)
            payload = self.get_paginated_response(serializer.data).data
            return success_response(data=payload, request=request)
        serializer = serializer_class(queryset, many=True)
        return success_response(
            data={"items": serializer.data, "count": len(serializer.data)},
            request=request,
        )

    @action(detail=True, methods=["get"], url_path="history/audit")
    def history_audit(self, request, pk=None):
        scenario = self.get_object()
        queryset = scenario.audit_events.select_related("run").all()
        queryset = filter_scenario_audit_events(
            queryset,
            event_type=request.query_params.get("event_type"),
            search=request.query_params.get("search"),
        )
        page = self.paginate_queryset(queryset)
        serializer_class = ScenarioAuditEventSerializer
        if page is not None:
            serializer = serializer_class(page, many=True)
            payload = self.get_paginated_response(serializer.data).data
            return success_response(data=payload, request=request)
        serializer = serializer_class(queryset, many=True)
        return success_response(
            data={"items": serializer.data, "count": len(serializer.data)},
            request=request,
        )


class ScenarioScheduleListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_scenario(self, request, scenario_id):
        queryset = _scope_queryset(
            Scenario.objects.select_related("tenant", "workspace"),
            request.user,
        )
        scenario = queryset.filter(id=scenario_id).first()
        if scenario:
            return scenario
        return None

    def post(self, request, scenario_id):
        scenario = self._get_scenario(request, scenario_id)
        if not scenario:
            return error_response(
                errors={"scenario_id": ["Scenario not found."]},
                message="Scenario not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        payload = request.data.copy()
        payload.setdefault(
            "interval_minutes",
            int(
                getattr(
                    settings,
                    "ORCHESTRATE_DEFAULT_POLL_INTERVAL_MINUTES",
                    15,
                )
            ),
        )
        serializer = ScenarioScheduleSerializer(data=payload)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        schedule = serializer.save(scenario=scenario)
        if (
            schedule.trigger_type == ScheduleTriggerType.POLLING
            and schedule.is_active
            and schedule.next_run_at is None
        ):
            schedule.next_run_at = timezone.now()
            schedule.save(update_fields=["next_run_at", "updated_at"])
        record_scenario_audit_event(
            scenario,
            event_type="scenario.schedule.created",
            event_label="Schedule created",
            payload={
                "schedule_id": schedule.id,
                "trigger_type": schedule.trigger_type,
                "interval_minutes": schedule.interval_minutes,
                "is_active": schedule.is_active,
            },
            actor_email=(getattr(request.user, "email", "") or "").strip(),
        )
        return success_response(
            data=ScenarioScheduleSerializer(schedule).data,
            message="Scenario schedule created",
            status=status.HTTP_201_CREATED,
            request=request,
        )


class ScenarioScheduleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, scenario_id, schedule_id):
        scenario_queryset = _scope_queryset(
            Scenario.objects.select_related("tenant", "workspace"),
            request.user,
        )
        scenario = scenario_queryset.filter(id=scenario_id).first()
        if not scenario:
            return error_response(
                errors={"scenario_id": ["Scenario not found."]},
                message="Scenario not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )

        schedule = ScenarioSchedule.objects.filter(
            id=schedule_id, scenario_id=scenario.id
        ).first()
        if not schedule:
            return error_response(
                errors={"schedule_id": ["Schedule not found for scenario."]},
                message="Schedule not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )

        serializer = ScenarioScheduleSerializer(schedule, data=request.data, partial=True)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        schedule = serializer.save()
        if (
            schedule.trigger_type == ScheduleTriggerType.POLLING
            and schedule.is_active
            and schedule.next_run_at is None
        ):
            schedule.next_run_at = timezone.now()
            schedule.save(update_fields=["next_run_at", "updated_at"])
        record_scenario_audit_event(
            scenario,
            event_type="scenario.schedule.updated",
            event_label="Schedule updated",
            payload={
                "schedule_id": schedule.id,
                "trigger_type": schedule.trigger_type,
                "interval_minutes": schedule.interval_minutes,
                "is_active": schedule.is_active,
                "next_run_at": schedule.next_run_at.isoformat() if schedule.next_run_at else None,
            },
            actor_email=(getattr(request.user, "email", "") or "").strip(),
        )
        return success_response(
            data=ScenarioScheduleSerializer(schedule).data,
            message="Scenario schedule updated",
            request=request,
        )


class ConnectionViewSet(viewsets.ModelViewSet):
    serializer_class = ConnectionSerializer
    permission_classes = [IsAuthenticated]
    queryset = Connection.objects.select_related("tenant", "workspace").all()
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        queryset = _scope_queryset(self.queryset, self.request.user)
        queryset = _apply_scope_query_params(queryset, self.request)
        provider = self.request.query_params.get("provider")
        if provider:
            queryset = queryset.filter(provider=provider)
        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            payload = self.get_paginated_response(serializer.data).data
            return success_response(data=payload, request=request)
        serializer = self.get_serializer(queryset, many=True)
        return success_response(
            data={"items": serializer.data, "count": len(serializer.data)},
            request=request,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        connection = serializer.save()
        return success_response(
            data=self.get_serializer(connection).data,
            message="Connection created",
            status=status.HTTP_201_CREATED,
            request=request,
        )

    @action(detail=True, methods=["post"], url_path="test")
    def test_connection(self, request, pk=None):
        connection = self.get_object()
        try:
            secret_payload = get_connection_secret_payload(connection).payload
        except ConnectionSecretError as exc:
            connection.status = ConnectionStatus.ERROR
            connection.save(update_fields=["status", "updated_at"])
            return error_response(
                errors={"secret_payload": [exc.message]},
                message="Connection test failed",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        provider = str(connection.provider or "").lower()
        if provider == "jira":
            try:
                adapter = JiraAdapter(
                    secret_payload,
                    auth_type=connection.auth_type,
                )
                adapter.api_call(
                    {
                        "method": "GET",
                        "path": "/rest/api/3/myself",
                    }
                )
            except JiraExecutionError as exc:
                connection.status = ConnectionStatus.ERROR
                connection.save(update_fields=["status", "updated_at"])
                return error_response(
                    errors={"secret_payload": [exc.message], "details": exc.details},
                    message="Connection test failed",
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )
        elif provider == "hubspot":
            try:
                adapter = HubspotAdapter(
                    secret_payload,
                    auth_type=connection.auth_type,
                )
                adapter.list_owners({"limit": 1})
            except HubspotExecutionError as exc:
                connection.status = ConnectionStatus.ERROR
                connection.save(update_fields=["status", "updated_at"])
                return error_response(
                    errors={"secret_payload": [exc.message], "details": exc.details},
                    message="Connection test failed",
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )
        elif provider == "email":
            try:
                adapter = EmailAdapter(
                    secret_payload,
                    auth_type=connection.auth_type,
                )
                adapter.test_connection()
            except EmailExecutionError as exc:
                connection.status = ConnectionStatus.ERROR
                connection.save(update_fields=["status", "updated_at"])
                return error_response(
                    errors={"secret_payload": [exc.message], "details": exc.details},
                    message="Connection test failed",
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )
        elif (
            connection.auth_type == ConnectionAuthType.OAUTH
            and provider == "jenkins"
        ):
            required_fields = ["baseUrl", "accessToken"]
            missing = [key for key in required_fields if not secret_payload.get(key)]
            if missing:
                connection.status = ConnectionStatus.ERROR
                connection.save(update_fields=["status", "updated_at"])
                return error_response(
                    errors={
                        "secret_payload": [
                            f"Missing required Jenkins OAuth fields: {', '.join(missing)}"
                        ]
                    },
                    message="Connection test failed",
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )

        connection.last_tested_at = timezone.now()
        connection.status = ConnectionStatus.ACTIVE
        connection.save(update_fields=["last_tested_at", "status", "updated_at"])
        return success_response(
            data={"ok": True, "connection_id": connection.id},
            message="Connection test passed",
            request=request,
        )


def _scope_email_template_queryset(queryset, request):
    user = request.user
    system_filter = Q(
        is_system_template=True,
        tenant__isnull=True,
        workspace__isnull=True,
    )
    if user.is_superuser:
        scoped = queryset
    else:
        user_email = (getattr(user, "email", "") or "").strip()
        if not user_email:
            return queryset.none()
        scoped = queryset.filter(system_filter | Q(created_by__iexact=user_email))

    tenant_id = request.query_params.get("tenant_id")
    workspace_id = request.query_params.get("workspace_id")
    category = str(request.query_params.get("category") or "").strip()
    search = str(request.query_params.get("search") or "").strip()
    if tenant_id:
        scoped = scoped.filter(Q(tenant_id=tenant_id) | system_filter)
    if workspace_id:
        scoped = scoped.filter(Q(workspace_id=workspace_id) | system_filter)
    if category:
        scoped = scoped.filter(category=category)
    if search:
        scoped = scoped.filter(Q(name__icontains=search) | Q(description__icontains=search))
    return scoped


def _get_scoped_connection_queryset(request):
    queryset = _scope_queryset(
        Connection.objects.select_related("tenant", "workspace"),
        request.user,
    )
    tenant_id = request.data.get("tenant_id") or request.query_params.get("tenant_id")
    workspace_id = request.data.get("workspace_id") or request.query_params.get("workspace_id")
    if tenant_id:
        queryset = queryset.filter(tenant_id=tenant_id)
    if workspace_id:
        queryset = queryset.filter(workspace_id=workspace_id)
    return queryset


class EmailTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = EmailTemplateSerializer
    permission_classes = [IsAuthenticated]
    queryset = EmailTemplate.objects.select_related("tenant", "workspace").all()
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return _scope_email_template_queryset(self.queryset.filter(is_active=True), self.request)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            payload = self.get_paginated_response(serializer.data).data
            return success_response(data=payload, request=request)
        serializer = self.get_serializer(queryset, many=True)
        return success_response(
            data={"items": serializer.data, "count": len(serializer.data)},
            request=request,
        )

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, request=request)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        validated = serializer.validated_data
        try:
            template = create_template(
                payload=validated,
                tenant_id=getattr(validated.get("tenant"), "id", None),
                workspace_id=getattr(validated.get("workspace"), "id", None),
                actor_email=(getattr(request.user, "email", "") or "").strip(),
            )
        except EmailTemplateServiceError as exc:
            return error_response(
                errors=exc.errors or {"detail": [exc.message]},
                message=exc.message,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        return success_response(
            data=self.get_serializer(template).data,
            message="Email template created",
            status=status.HTTP_201_CREATED,
            request=request,
        )

    def partial_update(self, request, *args, **kwargs):
        template = self.get_object()
        serializer = self.get_serializer(template, data=request.data, partial=True)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        try:
            updated = update_template(
                template,
                payload=serializer.validated_data,
                actor_email=(getattr(request.user, "email", "") or "").strip(),
            )
        except EmailTemplateServiceError as exc:
            return error_response(
                errors=exc.errors or {"detail": [exc.message]},
                message=exc.message,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        return success_response(
            data=self.get_serializer(updated).data,
            message="Email template updated",
            request=request,
        )

    def destroy(self, request, *args, **kwargs):
        template = self.get_object()
        if template.is_system_template:
            return error_response(
                errors={"detail": ["System templates cannot be deleted."]},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        template.is_active = False
        template.updated_by = (getattr(request.user, "email", "") or "").strip() or template.updated_by
        template.save(update_fields=["is_active", "updated_by", "updated_at"])
        return success_response(
            data={"ok": True, "template_id": template.id},
            message="Email template deleted",
            request=request,
        )

    @action(detail=True, methods=["post"], url_path="duplicate")
    def duplicate(self, request, pk=None):
        template = self.get_object()
        tenant_id = request.data.get("tenant_id") or template.tenant_id
        workspace_id = request.data.get("workspace_id") or template.workspace_id
        duplicated = duplicate_template(
            template,
            tenant_id=int(tenant_id) if tenant_id not in (None, "") else None,
            workspace_id=int(workspace_id) if workspace_id not in (None, "") else None,
            actor_email=(getattr(request.user, "email", "") or "").strip(),
        )
        return success_response(
            data=self.get_serializer(duplicated).data,
            message="Email template duplicated",
            status=status.HTTP_201_CREATED,
            request=request,
        )

    @action(detail=True, methods=["get"], url_path="versions")
    def versions(self, request, pk=None):
        template = self.get_object()
        serializer = EmailTemplateVersionSerializer(template.versions.all(), many=True)
        return success_response(
            data={"items": serializer.data, "count": len(serializer.data)},
            request=request,
        )

    @action(detail=True, methods=["post"], url_path="preview")
    def preview(self, request, pk=None):
        template = self.get_object()
        payload_data = request.data.copy()
        payload_data["template_id"] = template.id
        serializer = EmailTemplatePreviewSerializer(data=payload_data)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload = serializer.validated_data
        try:
            preview = render_template_instance(
                template,
                payload=payload.get("payload"),
                bindings=payload.get("bindings"),
                subject_override=payload.get("subject_override", ""),
                html_override=payload.get("html_override", ""),
                text_override=payload.get("text_override", ""),
                mode="preview",
            )
        except EmailTemplateServiceError as exc:
            return error_response(
                errors=exc.errors or {"detail": [exc.message]},
                message=exc.message,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        return success_response(data=preview, request=request)

    @action(detail=True, methods=["post"], url_path="test-send")
    def test_send(self, request, pk=None):
        template = self.get_object()
        payload_data = request.data.copy()
        payload_data["template_id"] = template.id
        serializer = EmailTemplateTestSendSerializer(data=payload_data)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload = serializer.validated_data
        connection = _get_scoped_connection_queryset(request).filter(
            id=payload["connection_id"],
            is_active=True,
            provider="email",
        ).first()
        if not connection:
            return error_response(
                errors={"connection_id": ["Connection not found."]},
                message="Connection not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        try:
            connection_payload = get_connection_secret_payload(connection).payload
            result = test_send_template(
                template,
                connection_payload=connection_payload,
                connection_auth_type=connection.auth_type,
                payload=payload.get("payload"),
                bindings=payload.get("bindings"),
                to=payload.get("to"),
                cc=payload.get("cc"),
                bcc=payload.get("bcc"),
                reply_to=str(payload.get("reply_to") or ""),
            )
        except (EmailTemplateServiceError, EmailExecutionError, ConnectionSecretError) as exc:
            errors = getattr(exc, "errors", None) or getattr(exc, "as_dict", lambda: {})()
            return error_response(
                errors=errors or {"detail": [str(exc)]},
                message=str(getattr(exc, "message", exc)),
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        return success_response(
            data=result,
            message="Test email sent",
            request=request,
        )

    @action(detail=False, methods=["post"], url_path="preview")
    def preview_inline(self, request):
        serializer = EmailTemplatePreviewSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload = serializer.validated_data
        if payload.get("template_id"):
            template = self.get_queryset().filter(id=payload["template_id"]).first()
            if not template:
                return error_response(
                    errors={"template_id": ["Template not found."]},
                    message="Template not found",
                    status=status.HTTP_404_NOT_FOUND,
                    request=request,
                )
            try:
                preview = render_template_instance(
                    template,
                    payload=payload.get("payload"),
                    bindings=payload.get("bindings"),
                    subject_override=payload.get("subject_override", ""),
                    html_override=payload.get("html_override", ""),
                    text_override=payload.get("text_override", ""),
                    mode="preview",
                )
            except EmailTemplateServiceError as exc:
                return error_response(
                    errors=exc.errors or {"detail": [exc.message]},
                    message=exc.message,
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )
        else:
            try:
                definition = build_definition(payload)
                preview = render_definition(
                    definition,
                    payload=payload.get("payload"),
                    bindings=payload.get("bindings"),
                    subject_override=payload.get("subject_override", ""),
                    html_override=payload.get("html_override", ""),
                    text_override=payload.get("text_override", ""),
                    mode="preview",
                )
            except EmailTemplateServiceError as exc:
                return error_response(
                    errors=exc.errors or {"detail": [exc.message]},
                    message=exc.message,
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )
        return success_response(data=preview, request=request)


class RunViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = RunSerializer
    permission_classes = [IsAuthenticated]
    queryset = Run.objects.select_related(
        "scenario", "tenant", "workspace"
    ).prefetch_related("steps")

    def get_queryset(self):
        queryset = _scope_queryset(self.queryset, self.request.user)
        queryset = _apply_scope_query_params(queryset, self.request)
        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return RunDetailSerializer
        return RunSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        run = serializer.save(status=RunStatus.QUEUED, queued_at=timezone.now())
        enqueue_manual_run(run)
        record_scenario_audit_event(
            run.scenario,
            event_type="scenario.run.queued",
            event_label=f"Manual run #{run.id} queued",
            payload={
                "run_id": run.id,
                "trigger_type": run.trigger_type,
                "scenario_version": run.scenario_version,
                "status": run.status,
            },
            run=run,
            actor_email=(getattr(request.user, "email", "") or "").strip(),
        )
        payload = RunSerializer(run).data
        return success_response(
            data=payload,
            message="Run queued",
            status=status.HTTP_201_CREATED,
            request=request,
        )

    def retrieve(self, request, *args, **kwargs):
        run = self.get_object()
        serializer = self.get_serializer(run)
        return success_response(data=serializer.data, request=request)
