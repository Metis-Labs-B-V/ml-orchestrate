from celery import shared_task
from django.db import connection as db_connection, transaction
from django.utils import timezone

from app.models import Run, RunStatus
from app.services.execution import execute_run
from app.services.run_recovery import recover_stale_runs
from app.services.schedule_dispatcher import scan_due_polling_schedules


def execute_run_job(run_id: int, *, task_id: str | None = None) -> dict:
    with transaction.atomic():
        queryset = Run.objects.select_related("scenario")
        if db_connection.features.has_select_for_update:
            if db_connection.features.has_select_for_update_skip_locked:
                queryset = queryset.select_for_update(skip_locked=True)
            else:
                queryset = queryset.select_for_update()
        run = queryset.filter(id=run_id).first()
        if not run:
            return {"ok": False, "reason": "run_not_found", "run_id": run_id}

        if run.status not in {RunStatus.QUEUED, RunStatus.RUNNING}:
            return {
                "ok": True,
                "reason": "already_terminal",
                "run_id": run.id,
                "status": run.status,
            }

        now = timezone.now()
        metadata = run.metadata if isinstance(run.metadata, dict) else {}
        if task_id:
            metadata["task_id"] = task_id
        run.metadata = metadata
        run.dispatched_at = now
        run.started_at = run.started_at or now
        run.status = RunStatus.RUNNING
        run.attempt_count = int(run.attempt_count or 0) + 1
        run.save(
            update_fields=[
                "metadata",
                "dispatched_at",
                "started_at",
                "status",
                "attempt_count",
                "updated_at",
            ]
        )

    try:
        run = execute_run(run)
    except Exception as exc:  # pragma: no cover
        run.status = RunStatus.FAILED
        run.ended_at = timezone.now()
        metadata = run.metadata if isinstance(run.metadata, dict) else {}
        metadata["fatal_error"] = str(exc)
        run.metadata = metadata
        run.save(update_fields=["status", "ended_at", "metadata", "updated_at"])
        return {"ok": False, "reason": "fatal_error", "run_id": run.id, "error": str(exc)}
    return {"ok": True, "run_id": run.id, "status": run.status}


@shared_task(bind=True, name="app.tasks.execute_run_task")
def execute_run_task(self, run_id: int) -> dict:
    return execute_run_job(run_id, task_id=self.request.id)


@shared_task(name="app.tasks.scan_due_schedules_task")
def scan_due_schedules_task() -> dict:
    results = scan_due_polling_schedules()
    return {"ok": True, "enqueued": len(results)}


@shared_task(name="app.tasks.recover_stale_runs_task")
def recover_stale_runs_task() -> dict:
    recovered = recover_stale_runs()
    return {
        "ok": True,
        "recovered": len(recovered),
        "runs": [
            {
                "run_id": item.run_id,
                "previous_status": item.previous_status,
                "recovery_reason": item.recovery_reason,
            }
            for item in recovered
        ],
    }
