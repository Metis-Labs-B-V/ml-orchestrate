from rest_framework.permissions import BasePermission

from .models import RolePermission, UserRole, UserTenant

ADMIN_ROLE_SLUGS = {
    "super-admin",
    "superadmin",
    "admin",
    "tenant-admin",
    "owner",
}

ADMIN_PERMISSION_CODES = {
    "tenant.write",
    "role.write",
    "user.read",
    "user.write",
    "audit.read",
}

USER_READ_CODES = {"user.read", "user.write"}
USER_WRITE_CODES = {"user.write"}
ROLE_READ_CODES = {"role.read", "role.write"}
ROLE_WRITE_CODES = {"role.write"}
AUDIT_READ_CODES = {"audit.read"}


def get_user_permission_codes(user, tenant_id=None, customer_id=None):
    permissions = set()
    if not user or not user.is_authenticated:
        return permissions
    qs = RolePermission.objects.filter(role__users__user=user)
    if tenant_id is not None:
        qs = qs.filter(role__users__tenant_id=tenant_id)
    if customer_id is not None:
        qs = qs.filter(role__users__customer_id=customer_id)
    for code in qs.values_list("permission__code", flat=True):
        permissions.add(code)
    return permissions


def user_has_permissions(user, codes, tenant_id=None, customer_id=None):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    permissions = get_user_permission_codes(user, tenant_id=tenant_id, customer_id=customer_id)
    return any(code in permissions for code in codes)


def user_has_admin_role(user, tenant_id=None, customer_id=None):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    roles = UserRole.objects.filter(user=user)
    if tenant_id is not None:
        roles = roles.filter(tenant_id=tenant_id)
    if customer_id is not None:
        roles = roles.filter(customer_id=customer_id)
    for item in roles.select_related("role"):
        slug = (item.role.slug or item.role.name or "").lower()
        if slug in ADMIN_ROLE_SLUGS:
            return True
    return False


def user_can_manage_tenant(user, tenant_id):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if user_has_permissions(user, ADMIN_PERMISSION_CODES, tenant_id=tenant_id):
        return True
    if user_has_admin_role(user, tenant_id=tenant_id):
        return True
    return UserTenant.objects.filter(
        user=user, tenant_id=tenant_id, is_active=True, is_owner=True
    ).exists()


def user_can_manage_customer(user, customer):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if customer.tenant_id and user_can_manage_tenant(user, customer.tenant_id):
        return True
    if user_has_permissions(user, ADMIN_PERMISSION_CODES, customer_id=customer.id):
        return True
    return user_has_admin_role(user, customer_id=customer.id)


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class HasAdminAccess(BasePermission):
    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        if user_has_permissions(user, ADMIN_PERMISSION_CODES):
            return True
        roles = UserRole.objects.filter(user=user).select_related("role")
        for item in roles:
            slug = (item.role.slug or item.role.name or "").lower()
            if slug in ADMIN_ROLE_SLUGS:
                return True
        return False


class HasAuditReadAccess(BasePermission):
    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return user_has_permissions(user, AUDIT_READ_CODES)
