"""Activity log helpers."""

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Mapping, Optional

from django.db import models

from .models import ActivityLog, Tenant, User, UserTenant

SENSITIVE_FIELDS = {
    "password",
    "mfa_secret",
    "token",
    "tokens",
    "mfa_token",
    "access",
    "refresh",
}


def get_active_tenant_ids(user: Optional[User]) -> list[int]:
    if not user or not user.is_authenticated:
        return []
    return list(
        UserTenant.objects.filter(user=user, is_active=True).values_list("tenant_id", flat=True)
    )


def _resolve_tenant_id(
    *,
    actor: Optional[User] = None,
    tenant: Optional[Tenant] = None,
    tenant_id: Optional[int] = None,
    target_user: Optional[User] = None,
) -> Optional[int]:
    if tenant is not None:
        return tenant.id
    if tenant_id is not None:
        return tenant_id
    if target_user is not None:
        return (
            UserTenant.objects.filter(user=target_user, is_active=True)
            .values_list("tenant_id", flat=True)
            .first()
        )
    if actor is not None:
        return (
            UserTenant.objects.filter(user=actor, is_active=True)
            .values_list("tenant_id", flat=True)
            .first()
        )
    return None


def _normalize_value(value: Any):
    if value is None:
        return None
    if isinstance(value, models.Model):
        return value.pk
    if isinstance(value, (list, tuple, set)):
        return [_normalize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalize_value(val) for key, val in value.items()}
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def collect_changes(instance, updates: Mapping[str, Any], exclude_fields=None) -> dict:
    if not instance or not updates:
        return {}
    excluded = set(exclude_fields or [])
    changes = {}
    for field, new_value in updates.items():
        if field in excluded or field in SENSITIVE_FIELDS:
            continue
        if not hasattr(instance, field):
            continue
        old_value = getattr(instance, field)
        old_norm = _normalize_value(old_value)
        new_norm = _normalize_value(new_value)
        if old_norm != new_norm:
            changes[field] = {"from": old_norm, "to": new_norm}
    return changes


def log_activity(
    *,
    actor: Optional[User],
    module: str,
    action: str,
    request=None,
    tenant: Optional[Tenant] = None,
    tenant_id: Optional[int] = None,
    target_user: Optional[User] = None,
    entity_type: str = "",
    entity_id: Optional[Any] = None,
    description: str = "",
    metadata: Optional[Mapping[str, Any]] = None,
) -> Optional[ActivityLog]:
    resolved_tenant_id = _resolve_tenant_id(
        actor=actor, tenant=tenant, tenant_id=tenant_id, target_user=target_user
    )
    try:
        return ActivityLog.objects.create(
            tenant_id=resolved_tenant_id,
            actor=actor,
            module=(module or "").lower(),
            action=(action or "").lower(),
            entity_type=entity_type or "",
            entity_id="" if entity_id is None else str(entity_id),
            description=description or "",
            metadata=metadata or {},
            ip_address=request.META.get("REMOTE_ADDR") if request else None,
            user_agent=request.META.get("HTTP_USER_AGENT", "") if request else "",
        )
    except Exception:
        return None
