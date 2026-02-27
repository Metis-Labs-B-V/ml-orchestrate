from rest_framework.test import APIClient
from django.test import TestCase


class HealthCheckTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_check_ok(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("status"), "ok")
        self.assertEqual(payload.get("service"), "metis-orchestrate")
