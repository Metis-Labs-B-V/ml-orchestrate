from django.db import models

from common_utils.base_model.models import BaseModel


class SampleItem(BaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")

    def __str__(self):
        return self.name


class ScenarioStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class Scenario(BaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    tenant = models.ForeignKey(
        "identity.Tenant",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orchestrate_scenarios",
    )
    workspace = models.ForeignKey(
        "identity.Customer",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orchestrate_scenarios",
    )
    status = models.CharField(
        max_length=20, choices=ScenarioStatus.choices, default=ScenarioStatus.DRAFT
    )
    graph_json = models.JSONField(blank=True, default=dict)
    current_version = models.PositiveIntegerField(default=1)
    activated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name


class ScenarioVersion(BaseModel):
    scenario = models.ForeignKey(
        Scenario, on_delete=models.CASCADE, related_name="versions"
    )
    version = models.PositiveIntegerField()
    graph_json = models.JSONField(blank=True, default=dict)
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-version"]
        constraints = [
            models.UniqueConstraint(
                fields=["scenario", "version"],
                name="unique_scenario_version",
            ),
        ]


class ScheduleTriggerType(models.TextChoices):
    POLLING = "polling", "Polling"
    WEBHOOK = "webhook", "Webhook"


class ScenarioSchedule(BaseModel):
    scenario = models.ForeignKey(
        Scenario, on_delete=models.CASCADE, related_name="schedules"
    )
    trigger_type = models.CharField(
        max_length=20,
        choices=ScheduleTriggerType.choices,
        default=ScheduleTriggerType.POLLING,
    )
    interval_minutes = models.PositiveIntegerField(default=15)
    is_active = models.BooleanField(default=True)
    next_run_at = models.DateTimeField(null=True, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(blank=True, default=dict)

    class Meta:
        ordering = ["-updated_at"]


class ConnectionAuthType(models.TextChoices):
    API_TOKEN = "apiToken", "API Token"
    OAUTH = "oauth", "OAuth"


class ConnectionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    ERROR = "error", "Error"


class Connection(BaseModel):
    provider = models.CharField(max_length=64)
    auth_type = models.CharField(
        max_length=20,
        choices=ConnectionAuthType.choices,
        default=ConnectionAuthType.API_TOKEN,
    )
    display_name = models.CharField(max_length=255)
    tenant = models.ForeignKey(
        "identity.Tenant",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orchestrate_connections",
    )
    workspace = models.ForeignKey(
        "identity.Customer",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orchestrate_connections",
    )
    metadata = models.JSONField(blank=True, default=dict)
    secret_ref = models.CharField(max_length=255, blank=True, default="")
    secret_payload = models.JSONField(blank=True, default=dict)
    status = models.CharField(
        max_length=20, choices=ConnectionStatus.choices, default=ConnectionStatus.ACTIVE
    )
    last_tested_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]


class RunStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    RUNNING = "running", "Running"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"
    CANCELED = "canceled", "Canceled"


class RunTriggerType(models.TextChoices):
    MANUAL = "manual", "Manual"
    SCHEDULE = "schedule", "Schedule"
    WEBHOOK = "webhook", "Webhook"


class Run(BaseModel):
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name="runs")
    scenario_version = models.PositiveIntegerField(default=1)
    trigger_type = models.CharField(
        max_length=20, choices=RunTriggerType.choices, default=RunTriggerType.MANUAL
    )
    status = models.CharField(
        max_length=20, choices=RunStatus.choices, default=RunStatus.QUEUED
    )
    tenant = models.ForeignKey(
        "identity.Tenant",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orchestrate_runs",
    )
    workspace = models.ForeignKey(
        "identity.Customer",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orchestrate_runs",
    )
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(blank=True, default=dict)

    class Meta:
        ordering = ["-created_at"]


class RunStepStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    RUNNING = "running", "Running"
    SUCCEEDED = "succeeded", "Succeeded"
    FAILED = "failed", "Failed"
    SKIPPED = "skipped", "Skipped"


class RunStep(BaseModel):
    run = models.ForeignKey(Run, on_delete=models.CASCADE, related_name="steps")
    node_id = models.CharField(max_length=100)
    node_type = models.CharField(max_length=100, blank=True, default="")
    status = models.CharField(
        max_length=20, choices=RunStepStatus.choices, default=RunStepStatus.QUEUED
    )
    input_json = models.JSONField(blank=True, default=dict)
    output_raw_json = models.JSONField(blank=True, default=dict)
    output_normalized_json = models.JSONField(blank=True, default=dict)
    error_json = models.JSONField(blank=True, default=dict)
    duration_ms = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]
