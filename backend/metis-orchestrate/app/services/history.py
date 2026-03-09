from __future__ import annotations

from typing import Any

from django.db.models import Count, Q, TextField
from django.db.models.functions import Cast

from app.models import Run, RunStatus, RunStep, Scenario, ScenarioAuditEvent


def record_scenario_audit_event(
    scenario: Scenario,
    *,
    event_type: str,
    event_label: str,
    payload: dict[str, Any] | None = None,
    run: Run | None = None,
    actor_email: str = "",
) -> ScenarioAuditEvent:
    event = ScenarioAuditEvent(
        scenario=scenario,
        run=run,
        event_type=str(event_type or "").strip(),
        event_label=str(event_label or "").strip(),
        payload_json=payload or {},
    )
    if actor_email:
        event.created_by = actor_email
        event.updated_by = actor_email
    event.save()
    return event


def filter_scenario_runs(
    queryset,
    *,
    status_value: str = "",
    trigger_type: str = "",
    provider: str = "",
    search: str = "",
):
    status_value = str(status_value or "").strip().lower()
    trigger_type = str(trigger_type or "").strip().lower()
    provider = str(provider or "").strip().lower()
    search = str(search or "").strip()

    if status_value:
        queryset = queryset.filter(status=status_value)
    if trigger_type:
        queryset = queryset.filter(trigger_type=trigger_type)
    if provider:
        queryset = queryset.filter(steps__node_type__istartswith=f"{provider}.").distinct()
    if not search:
        return queryset

    metadata_matches = queryset.annotate(
        metadata_text=Cast("metadata", output_field=TextField())
    ).filter(metadata_text__icontains=search)

    step_matches = RunStep.objects.filter(run__in=queryset).annotate(
        input_text=Cast("input_json", output_field=TextField()),
        output_raw_text=Cast("output_raw_json", output_field=TextField()),
        output_normalized_text=Cast("output_normalized_json", output_field=TextField()),
        error_text=Cast("error_json", output_field=TextField()),
    ).filter(
        Q(node_id__icontains=search)
        | Q(node_type__icontains=search)
        | Q(input_text__icontains=search)
        | Q(output_raw_text__icontains=search)
        | Q(output_normalized_text__icontains=search)
        | Q(error_text__icontains=search)
    )
    step_run_ids = list(step_matches.values_list("run_id", flat=True).distinct())

    run_filters = Q(metadata_text__icontains=search)
    if search.isdigit():
        run_filters |= Q(id=int(search))

    return queryset.annotate(
        metadata_text=Cast("metadata", output_field=TextField())
    ).filter(run_filters | Q(id__in=step_run_ids)).distinct()


def build_scenario_history_summary(scenario: Scenario) -> dict[str, Any]:
    runs = Run.objects.filter(scenario=scenario)
    total_runs = runs.count()
    succeeded = runs.filter(status=RunStatus.SUCCEEDED).count()
    failed = runs.filter(status=RunStatus.FAILED).count()
    queued = runs.filter(status=RunStatus.QUEUED).count()
    running = runs.filter(status=RunStatus.RUNNING).count()
    canceled = runs.filter(status=RunStatus.CANCELED).count()

    completed_runs = runs.exclude(started_at__isnull=True).exclude(ended_at__isnull=True)
    # Calculate in Python to stay portable with current codebase and DB usage.
    duration_values: list[float] = []
    for run in completed_runs.only("started_at", "ended_at"):
        if run.started_at and run.ended_at:
            duration_values.append(max((run.ended_at - run.started_at).total_seconds(), 0))

    average_duration_ms = (
        int((sum(duration_values) / len(duration_values)) * 1000) if duration_values else 0
    )
    last_run = runs.first()
    last_failed_run = runs.filter(status=RunStatus.FAILED).first()

    provider_counts = {}
    for row in (
        RunStep.objects.filter(run__scenario=scenario)
        .values("node_type")
        .annotate(count=Count("id"))
    ):
        node_type = str(row.get("node_type") or "")
        provider = node_type.split(".", 1)[0] if "." in node_type else node_type or "other"
        provider_counts[provider] = provider_counts.get(provider, 0) + int(row.get("count") or 0)

    success_rate = round((succeeded / total_runs) * 100, 1) if total_runs else 0.0

    return {
        "total_runs": total_runs,
        "status_counts": {
            "queued": queued,
            "running": running,
            "succeeded": succeeded,
            "failed": failed,
            "canceled": canceled,
        },
        "success_rate": success_rate,
        "average_duration_ms": average_duration_ms,
        "last_run": last_run.id if last_run else None,
        "last_failed_run": last_failed_run.id if last_failed_run else None,
        "providers_used": provider_counts,
    }


def filter_scenario_audit_events(queryset, *, event_type: str = "", search: str = ""):
    event_type = str(event_type or "").strip()
    search = str(search or "").strip()

    if event_type:
        queryset = queryset.filter(event_type=event_type)
    if not search:
        return queryset

    return queryset.annotate(
        payload_text=Cast("payload_json", output_field=TextField())
    ).filter(
        Q(event_type__icontains=search)
        | Q(event_label__icontains=search)
        | Q(created_by__icontains=search)
        | Q(payload_text__icontains=search)
    )
