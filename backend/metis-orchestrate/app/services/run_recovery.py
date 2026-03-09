from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import connection as db_connection, transaction
from django.utils import timezone

from app.models import Run, RunStatus


@dataclass
class RecoveredRunResult:
    run_id: int
    previous_status: str
    recovery_reason: str


def _lock_queryset(queryset):
    if not db_connection.features.has_select_for_update:
        return queryset
    if db_connection.features.has_select_for_update_skip_locked:
        return queryset.select_for_update(skip_locked=True)
    return queryset.select_for_update()


def _append_recovery_event(run: Run, reason: str, now) -> None:
    metadata = run.metadata if isinstance(run.metadata, dict) else {}
    recovery_events = metadata.get("recovery_events")
    if not isinstance(recovery_events, list):
        recovery_events = []
    recovery_events.append(
        {
            "reason": reason,
            "at": now.isoformat(),
        }
    )
    metadata["recovery_events"] = recovery_events
    metadata["fatal_error"] = (
        "Run timed out in queue before dispatch."
        if reason == "stale_queued_timeout"
        else "Run timed out during execution."
    )
    run.metadata = metadata


def recover_stale_runs(
    *,
    now=None,
    queued_timeout_seconds: int | None = None,
    running_timeout_seconds: int | None = None,
) -> list[RecoveredRunResult]:
    current_time = now or timezone.now()
    queued_timeout = max(
        int(
            queued_timeout_seconds
            if queued_timeout_seconds is not None
            else getattr(settings, "ORCHESTRATE_STALE_QUEUED_RUN_SECONDS", 1800)
        ),
        1,
    )
    running_timeout = max(
        int(
            running_timeout_seconds
            if running_timeout_seconds is not None
            else getattr(settings, "ORCHESTRATE_STALE_RUNNING_RUN_SECONDS", 900)
        ),
        1,
    )

    recovered: list[RecoveredRunResult] = []
    queued_cutoff = current_time - timedelta(seconds=queued_timeout)
    running_cutoff = current_time - timedelta(seconds=running_timeout)

    with transaction.atomic():
        queued_runs = _lock_queryset(
            Run.objects.filter(
                status=RunStatus.QUEUED,
                queued_at__isnull=False,
                queued_at__lte=queued_cutoff,
                dispatched_at__isnull=True,
            ).order_by("id")
        )
        for run in queued_runs:
            _append_recovery_event(run, "stale_queued_timeout", current_time)
            run.status = RunStatus.FAILED
            run.ended_at = current_time
            run.save(update_fields=["status", "ended_at", "metadata", "updated_at"])
            recovered.append(
                RecoveredRunResult(
                    run_id=run.id,
                    previous_status=RunStatus.QUEUED,
                    recovery_reason="stale_queued_timeout",
                )
            )

        running_runs = _lock_queryset(
            Run.objects.filter(
                status=RunStatus.RUNNING,
                started_at__isnull=False,
                started_at__lte=running_cutoff,
                ended_at__isnull=True,
            ).order_by("id")
        )
        for run in running_runs:
            _append_recovery_event(run, "stale_running_timeout", current_time)
            run.status = RunStatus.FAILED
            run.ended_at = current_time
            run.save(update_fields=["status", "ended_at", "metadata", "updated_at"])
            recovered.append(
                RecoveredRunResult(
                    run_id=run.id,
                    previous_status=RunStatus.RUNNING,
                    recovery_reason="stale_running_timeout",
                )
            )

    return recovered
