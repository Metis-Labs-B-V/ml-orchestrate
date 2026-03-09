import os

from celery import Celery
from django.conf import settings


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

app = Celery("metis_orchestrate")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "scan-due-orchestrate-schedules": {
        "task": "app.tasks.scan_due_schedules_task",
        "schedule": max(getattr(settings, "ORCHESTRATE_SCHEDULE_SCAN_INTERVAL_SECONDS", 60), 1),
    },
    "recover-stale-orchestrate-runs": {
        "task": "app.tasks.recover_stale_runs_task",
        "schedule": max(getattr(settings, "ORCHESTRATE_SCHEDULE_SCAN_INTERVAL_SECONDS", 60), 1),
    }
}
