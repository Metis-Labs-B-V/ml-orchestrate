"""Activity logs views."""

from datetime import datetime, time

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from ..activity_log import get_active_tenant_ids
from ..models import ActivityLog
from ..permissions import HasAuditReadAccess
from ..serializers import ActivityLogSerializer


def _parse_datetime(value: str, is_end: bool = False):
    if not value:
        return None
    parsed_date = parse_date(value)
    if parsed_date:
        base_time = time.max if is_end else time.min
        dt = datetime.combine(parsed_date, base_time)
    else:
        dt = parse_datetime(value)
    if not dt:
        return None
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ActivityLog.objects.select_related("actor", "tenant").order_by("-created_at")
    serializer_class = ActivityLogSerializer
    permission_classes = [IsAuthenticated, HasAuditReadAccess]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return queryset.none()

        if user.is_superuser:
            queryset = queryset.filter(actor=user)
        else:
            tenant_ids = get_active_tenant_ids(user)
            if not tenant_ids:
                return queryset.none()
            queryset = queryset.filter(tenant_id__in=tenant_ids)

        params = self.request.query_params
        module = params.get("module")
        if module:
            queryset = queryset.filter(module=module.lower())

        action = params.get("action")
        if action:
            queryset = queryset.filter(action=action.lower())

        actor = params.get("actor")
        if actor:
            queryset = queryset.filter(actor__email__icontains=actor.strip())

        tenant_id = params.get("tenant_id")
        if tenant_id:
            try:
                queryset = queryset.filter(tenant_id=int(tenant_id))
            except (TypeError, ValueError):
                pass

        start_date = params.get("start_date")
        if start_date:
            start_dt = _parse_datetime(start_date, is_end=False)
            if start_dt:
                queryset = queryset.filter(created_at__gte=start_dt)

        end_date = params.get("end_date")
        if end_date:
            end_dt = _parse_datetime(end_date, is_end=True)
            if end_dt:
                queryset = queryset.filter(created_at__lte=end_dt)

        return queryset
