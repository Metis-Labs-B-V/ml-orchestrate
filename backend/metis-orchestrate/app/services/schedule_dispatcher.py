from dataclasses import dataclass
from datetime import datetime
from datetime import timedelta

from django.db import connection as db_connection, transaction
from django.utils import timezone

from app.models import (
    Run,
    RunStatus,
    RunTriggerType,
    ScenarioSchedule,
    ScenarioStatus,
    ScheduleTriggerType,
)
from app.services.run_dispatcher import enqueue_run


@dataclass
class ScheduleDispatchResult:
    schedule_id: int
    run_id: int
    next_run_at: datetime


def _next_run_for_schedule(schedule: ScenarioSchedule, now):
    interval = max(int(schedule.interval_minutes or 15), 1)
    return now + timedelta(minutes=interval)


def enqueue_schedule_run(schedule: ScenarioSchedule, *, now=None) -> ScheduleDispatchResult:
    now = now or timezone.now()
    scenario = schedule.scenario
    run = Run.objects.create(
        scenario=scenario,
        scenario_version=scenario.current_version,
        trigger_type=RunTriggerType.SCHEDULE,
        status=RunStatus.QUEUED,
        tenant=scenario.tenant,
        workspace=scenario.workspace,
        queued_at=now,
        metadata={
            "enqueue_source": "schedule",
            "schedule_id": schedule.id,
        },
    )

    schedule.last_enqueued_at = now
    schedule.last_run_at = now
    schedule.next_run_at = _next_run_for_schedule(schedule, now)
    schedule.save(
        update_fields=[
            "last_enqueued_at",
            "last_run_at",
            "next_run_at",
            "updated_at",
        ]
    )

    enqueue_run(
        run,
        enqueue_source="schedule",
        extra_metadata={"schedule_id": schedule.id},
    )

    return ScheduleDispatchResult(
        schedule_id=schedule.id,
        run_id=run.id,
        next_run_at=schedule.next_run_at,
    )


def scan_due_polling_schedules(*, limit: int = 100) -> list[ScheduleDispatchResult]:
    now = timezone.now()
    results: list[ScheduleDispatchResult] = []
    with transaction.atomic():
        queryset = ScenarioSchedule.objects.select_related("scenario")
        if db_connection.features.has_select_for_update:
            if db_connection.features.has_select_for_update_skip_locked:
                queryset = queryset.select_for_update(skip_locked=True)
            else:
                queryset = queryset.select_for_update()
        schedules = (
            queryset
            .filter(
                is_active=True,
                trigger_type=ScheduleTriggerType.POLLING,
                next_run_at__isnull=False,
                next_run_at__lte=now,
                scenario__is_active=True,
                scenario__status=ScenarioStatus.ACTIVE,
            )
            .order_by("next_run_at", "id")[:limit]
        )
        for schedule in schedules:
            results.append(enqueue_schedule_run(schedule, now=now))
    return results
