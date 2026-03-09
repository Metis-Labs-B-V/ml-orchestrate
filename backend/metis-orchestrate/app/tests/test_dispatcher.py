from unittest.mock import patch
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from app.models import Run, RunStatus, Scenario, ScenarioSchedule, ScenarioStatus
from app.services.run_recovery import recover_stale_runs
from app.services.run_dispatcher import enqueue_manual_run
from app.services.schedule_dispatcher import scan_due_polling_schedules
from identity.models import Customer, Tenant, User


class DispatcherTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="dispatcher@example.com",
            password="StrongPass!1234",
            first_name="Dispatch",
            last_name="Owner",
            is_active=True,
        )
        self.tenant = Tenant.objects.create(name="Dispatch Tenant")
        self.workspace = Customer.objects.create(name="Dispatch Workspace", tenant=self.tenant)
        self.scenario = Scenario.objects.create(
            name="Dispatch Scenario",
            tenant=self.tenant,
            workspace=self.workspace,
            created_by=self.user.email,
            status=ScenarioStatus.ACTIVE,
            graph_json={"nodes": [], "edges": []},
        )

    @patch("app.tasks.execute_run_task.delay")
    def test_enqueue_manual_run_sets_metadata_and_task_id(self, delay_mock):
        delay_mock.return_value.id = "task-123"
        run = Run.objects.create(
            scenario=self.scenario,
            scenario_version=1,
            trigger_type="manual",
            status=RunStatus.QUEUED,
            tenant=self.tenant,
            workspace=self.workspace,
            created_by=self.user.email,
        )

        with self.captureOnCommitCallbacks(execute=True):
            result = enqueue_manual_run(run)
        self.assertEqual(result.run_id, run.id)
        self.assertEqual(result.task_id, "task-123")
        delay_mock.assert_called_once_with(run.id)

        run.refresh_from_db()
        self.assertEqual(run.metadata.get("enqueue_source"), "manual")
        self.assertEqual(run.metadata.get("task_id"), "task-123")
        self.assertIsNotNone(run.queued_at)

    @patch("app.tasks.execute_run_task.delay")
    def test_scan_due_polling_schedules_enqueues_due_records(self, delay_mock):
        delay_mock.return_value.id = "task-456"
        schedule = ScenarioSchedule.objects.create(
            scenario=self.scenario,
            trigger_type="polling",
            interval_minutes=15,
            is_active=True,
            next_run_at=timezone.now() - timedelta(minutes=1),
            created_by=self.user.email,
        )

        with self.captureOnCommitCallbacks(execute=True):
            results = scan_due_polling_schedules()
        self.assertEqual(len(results), 1)
        schedule.refresh_from_db()
        self.assertIsNotNone(schedule.last_enqueued_at)
        self.assertIsNotNone(schedule.next_run_at)

        run = Run.objects.filter(
            scenario=self.scenario,
            trigger_type="schedule",
        ).latest("id")
        self.assertEqual(run.status, RunStatus.QUEUED)
        self.assertEqual(run.metadata.get("enqueue_source"), "schedule")
        self.assertEqual(run.metadata.get("schedule_id"), schedule.id)

    def test_recover_stale_queued_runs_marks_run_failed(self):
        run = Run.objects.create(
            scenario=self.scenario,
            scenario_version=1,
            trigger_type="manual",
            status=RunStatus.QUEUED,
            tenant=self.tenant,
            workspace=self.workspace,
            created_by=self.user.email,
            queued_at=timezone.now() - timedelta(hours=2),
            metadata={"enqueue_source": "manual"},
        )

        recovered = recover_stale_runs(
            now=timezone.now(),
            queued_timeout_seconds=300,
            running_timeout_seconds=300,
        )

        run.refresh_from_db()
        self.assertEqual(len(recovered), 1)
        self.assertEqual(recovered[0].run_id, run.id)
        self.assertEqual(recovered[0].recovery_reason, "stale_queued_timeout")
        self.assertEqual(run.status, RunStatus.FAILED)
        self.assertIsNotNone(run.ended_at)
        self.assertEqual(run.metadata.get("fatal_error"), "Run timed out in queue before dispatch.")
        self.assertEqual(run.metadata.get("recovery_events")[0]["reason"], "stale_queued_timeout")

    def test_recover_stale_running_runs_marks_run_failed(self):
        run = Run.objects.create(
            scenario=self.scenario,
            scenario_version=1,
            trigger_type="manual",
            status=RunStatus.RUNNING,
            tenant=self.tenant,
            workspace=self.workspace,
            created_by=self.user.email,
            queued_at=timezone.now() - timedelta(hours=2),
            dispatched_at=timezone.now() - timedelta(hours=2),
            started_at=timezone.now() - timedelta(hours=2),
            metadata={"task_id": "worker-123"},
        )

        recovered = recover_stale_runs(
            now=timezone.now(),
            queued_timeout_seconds=300,
            running_timeout_seconds=300,
        )

        run.refresh_from_db()
        self.assertEqual(len(recovered), 1)
        self.assertEqual(recovered[0].run_id, run.id)
        self.assertEqual(recovered[0].recovery_reason, "stale_running_timeout")
        self.assertEqual(run.status, RunStatus.FAILED)
        self.assertIsNotNone(run.ended_at)
        self.assertEqual(run.metadata.get("fatal_error"), "Run timed out during execution.")
        self.assertEqual(run.metadata.get("recovery_events")[0]["reason"], "stale_running_timeout")

    def test_recover_stale_runs_leaves_fresh_run_unchanged(self):
        run = Run.objects.create(
            scenario=self.scenario,
            scenario_version=1,
            trigger_type="manual",
            status=RunStatus.QUEUED,
            tenant=self.tenant,
            workspace=self.workspace,
            created_by=self.user.email,
            queued_at=timezone.now(),
        )

        recovered = recover_stale_runs(
            now=timezone.now(),
            queued_timeout_seconds=300,
            running_timeout_seconds=300,
        )

        run.refresh_from_db()
        self.assertEqual(recovered, [])
        self.assertEqual(run.status, RunStatus.QUEUED)
