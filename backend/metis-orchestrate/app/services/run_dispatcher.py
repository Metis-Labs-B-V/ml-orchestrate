from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from app.models import Run


@dataclass
class EnqueueResult:
    run_id: int
    task_id: str | None
    queued_at: datetime


def _enqueue_existing_run(
    run: Run,
    *,
    enqueue_source: str,
    extra_metadata: dict[str, Any] | None = None,
    use_on_commit: bool = True,
) -> EnqueueResult:
    from app.tasks import execute_run_job, execute_run_task

    if not run.queued_at:
        run.queued_at = timezone.now()
    metadata = run.metadata if isinstance(run.metadata, dict) else {}
    metadata["enqueue_source"] = enqueue_source
    if isinstance(extra_metadata, dict):
        metadata.update(extra_metadata)
    run.metadata = metadata
    run.save(update_fields=["queued_at", "metadata", "updated_at"])

    result: EnqueueResult = EnqueueResult(
        run_id=run.id,
        task_id=None,
        queued_at=run.queued_at,
    )

    def _enqueue():
        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            eager_task_id = f"eager-{uuid4()}"
            execute_run_job(run.id, task_id=eager_task_id)
            task_id = eager_task_id
        else:
            task_result = execute_run_task.delay(run.id)
            task_id = task_result.id
        current_metadata = Run.objects.filter(id=run.id).values_list("metadata", flat=True).first()
        if not isinstance(current_metadata, dict):
            current_metadata = {}
        refreshed_metadata = {
            **current_metadata,
            **metadata,
            "enqueue_source": enqueue_source,
            "task_id": task_id,
        }
        Run.objects.filter(id=run.id).update(
            metadata=refreshed_metadata,
            updated_at=timezone.now(),
        )
        result.task_id = task_id

    if use_on_commit:
        transaction.on_commit(_enqueue)
    else:
        _enqueue()
    return result


def enqueue_manual_run(run: Run) -> EnqueueResult:
    return _enqueue_existing_run(run, enqueue_source="manual", use_on_commit=False)


def enqueue_run(run: Run, *, enqueue_source: str, extra_metadata: dict[str, Any] | None = None) -> EnqueueResult:
    return _enqueue_existing_run(
        run,
        enqueue_source=enqueue_source,
        extra_metadata=extra_metadata,
        use_on_commit=True,
    )
