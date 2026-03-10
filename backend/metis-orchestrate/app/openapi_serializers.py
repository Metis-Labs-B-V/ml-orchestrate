from rest_framework import serializers


class EmptySerializer(serializers.Serializer):
    pass


class JiraOAuthStartRequestSerializer(serializers.Serializer):
    service_url = serializers.CharField(required=False, allow_blank=True)
    workspace_id = serializers.IntegerField(required=False, allow_null=True)
    tenant_id = serializers.IntegerField(required=False, allow_null=True)
    display_name = serializers.CharField(required=False, allow_blank=True)


class JiraOAuthExchangeRequestSerializer(serializers.Serializer):
    code = serializers.CharField()
    state = serializers.CharField()


class JenkinsOAuthStartRequestSerializer(serializers.Serializer):
    base_url = serializers.CharField()
    workspace_id = serializers.IntegerField(required=False, allow_null=True)
    tenant_id = serializers.IntegerField(required=False, allow_null=True)
    display_name = serializers.CharField(required=False, allow_blank=True)


class JenkinsOAuthExchangeRequestSerializer(serializers.Serializer):
    code = serializers.CharField()
    state = serializers.CharField()


class ScenarioPublishRequestSerializer(serializers.Serializer):
    graph_json = serializers.JSONField(required=False)


class ScenarioScheduleRequestSerializer(serializers.Serializer):
    trigger_type = serializers.CharField(required=False)
    interval_minutes = serializers.IntegerField(required=False, min_value=1)
    is_active = serializers.BooleanField(required=False)
    next_run_at = serializers.DateTimeField(required=False, allow_null=True)
    last_run_at = serializers.DateTimeField(required=False, allow_null=True)
    last_enqueued_at = serializers.DateTimeField(required=False, allow_null=True)
    metadata = serializers.JSONField(required=False)


class EmailTemplateDuplicateRequestSerializer(serializers.Serializer):
    tenant_id = serializers.IntegerField(required=False, allow_null=True)
    workspace_id = serializers.IntegerField(required=False, allow_null=True)
