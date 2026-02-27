"""Anonymous endpoint to run identity seed command."""

import os
from io import StringIO

from django.conf import settings
from django.core.management import call_command
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from common_utils.api.responses import error_response, success_response


def _seed_endpoint_enabled():
    if settings.DEBUG:
        return True
    return os.getenv("IDENTITY_SEED_ENDPOINT_ENABLED", "false").lower() == "true"


class SeedIdentityView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        if not _seed_endpoint_enabled():
            return error_response(
                errors={"detail": ["Seed endpoint disabled"]},
                message="Seed endpoint disabled",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        buffer = StringIO()
        try:
            call_command("seed_identity", stdout=buffer)
        except Exception as exc:
            return error_response(
                errors={"detail": [str(exc)]},
                message="Seed failed",
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                request=request,
            )
        output = buffer.getvalue().strip() or "Identity seed complete."
        return success_response(
            data={"output": output},
            message="Identity seed complete",
            request=request,
        )
