from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from identity.models import (
    Customer,
    Permission,
    Role,
    RolePermission,
    Tenant,
    User,
    UserCustomer,
    UserRole,
    UserTenant,
    UserTypeChoices,
)
from identity.utils.password_validations import tenant_signup_password_validations


DEFAULT_EMAIL = "deepak.kushwaha@metislabs.eu"
DEFAULT_PASSWORD = "Admin@123456"
DEFAULT_TENANT_NAME = "Metis Orchestrate"
DEFAULT_WORKSPACE_NAME = "Metis Orchestrate Workspace"


PERMISSIONS = [
    ("tenant.read", "Read tenants"),
    ("tenant.write", "Manage tenants"),
    ("user.read", "Read users"),
    ("user.write", "Manage users"),
    ("role.read", "Read roles"),
    ("role.write", "Manage roles"),
    ("audit.read", "Read audit logs"),
    ("customer.read", "Read customers"),
    ("customer.write", "Manage customers"),
]


TENANT_ROLE_MATRIX = {
    "Super Admin": ["tenant.write", "user.write", "role.write", "audit.read", "customer.write"],
    "Tenant Admin": ["tenant.write", "user.write", "role.read", "audit.read", "customer.write"],
    "Viewer": ["tenant.read", "user.read", "role.read", "customer.read"],
}


WORKSPACE_ROLE_MATRIX = {
    "Admin": ["customer.write", "customer.read", "user.write", "user.read"],
    "Finance": ["customer.read"],
    "Other": ["customer.read"],
}


class Command(BaseCommand):
    help = (
        "Create/update a login user and seed required tenant/workspace/role data "
        "for the Metis Orchestrate MVP."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", default=DEFAULT_EMAIL)
        parser.add_argument("--password", default=DEFAULT_PASSWORD)
        parser.add_argument("--tenant-name", default=DEFAULT_TENANT_NAME)
        parser.add_argument("--workspace-name", default=DEFAULT_WORKSPACE_NAME)

    def _ensure_permissions(self):
        permission_map: dict[str, Permission] = {}
        for code, name in PERMISSIONS:
            permission, _ = Permission.objects.get_or_create(
                code=code,
                defaults={"name": name, "category": "core"},
            )
            permission_map[code] = permission
        return permission_map

    def _ensure_tenant_roles(self, tenant: Tenant, permission_map: dict[str, Permission]):
        role_map: dict[str, Role] = {}
        for role_name, permission_codes in TENANT_ROLE_MATRIX.items():
            role, _ = Role.objects.get_or_create(
                name=role_name,
                tenant=tenant,
                defaults={
                    "slug": slugify(role_name),
                    "is_system": True,
                    "is_default": role_name == "Viewer",
                },
            )
            dirty = False
            if not role.slug:
                role.slug = slugify(role_name)
                dirty = True
            if not role.is_system:
                role.is_system = True
                dirty = True
            if role_name == "Viewer" and not role.is_default:
                role.is_default = True
                dirty = True
            if dirty:
                role.save(update_fields=["slug", "is_system", "is_default", "updated_at"])
            for permission_code in permission_codes:
                RolePermission.objects.get_or_create(
                    role=role,
                    permission=permission_map[permission_code],
                )
            role_map[role_name] = role
        return role_map

    def _ensure_workspace_roles(self, workspace: Customer, permission_map: dict[str, Permission]):
        role_map: dict[str, Role] = {}
        for role_name, permission_codes in WORKSPACE_ROLE_MATRIX.items():
            role, _ = Role.objects.get_or_create(
                name=role_name,
                customer=workspace,
                defaults={
                    "slug": f"workspace-{slugify(role_name)}",
                    "is_system": True,
                    "is_default": role_name == "Other",
                },
            )
            dirty = False
            if not role.slug:
                role.slug = f"workspace-{slugify(role_name)}"
                dirty = True
            if not role.is_system:
                role.is_system = True
                dirty = True
            if role_name == "Other" and not role.is_default:
                role.is_default = True
                dirty = True
            if dirty:
                role.save(update_fields=["slug", "is_system", "is_default", "updated_at"])
            for permission_code in permission_codes:
                RolePermission.objects.get_or_create(
                    role=role,
                    permission=permission_map[permission_code],
                )
            role_map[role_name] = role
        return role_map

    @transaction.atomic
    def handle(self, *args, **options):
        email = (options["email"] or "").strip().lower()
        password = options["password"] or ""
        tenant_name = (options["tenant_name"] or "").strip() or DEFAULT_TENANT_NAME
        workspace_name = (options["workspace_name"] or "").strip() or DEFAULT_WORKSPACE_NAME

        if not email:
            raise CommandError("--email is required")
        _, is_password_valid, password_error = tenant_signup_password_validations(
            email,
            password,
            password,
        )
        if not is_password_valid:
            raise CommandError(password_error)

        user, user_created = User.objects.get_or_create(
            email=email,
            defaults={
                "username": email.split("@")[0],
                "first_name": "Deepak",
                "last_name": "Kushwaha",
                "user_type": UserTypeChoices.ADMIN.value,
                "is_staff": True,
                "is_verified": True,
                "is_active": True,
                "otp_enabled": False,
                "mfa_enabled": False,
            },
        )
        user.set_password(password)
        user.is_active = True
        user.is_verified = True
        user.otp_enabled = False
        user.mfa_enabled = False
        if not user.user_type:
            user.user_type = UserTypeChoices.ADMIN.value
        user.save(update_fields=["password", "is_active", "is_verified", "otp_enabled", "mfa_enabled", "user_type", "updated_at"])

        tenant, tenant_created = Tenant.objects.get_or_create(
            name=tenant_name,
            defaults={"owner": user},
        )
        tenant_dirty = False
        if tenant.owner_id != user.id:
            tenant.owner = user
            tenant_dirty = True
        if tenant_dirty:
            tenant.save(update_fields=["owner", "updated_at"])

        workspace, workspace_created = Customer.objects.get_or_create(
            name=workspace_name,
            tenant=tenant,
            defaults={"owner": user, "email": email},
        )
        workspace_dirty = False
        if workspace.owner_id != user.id:
            workspace.owner = user
            workspace_dirty = True
        if workspace.email != email:
            workspace.email = email
            workspace_dirty = True
        if workspace_dirty:
            workspace.save(update_fields=["owner", "email", "updated_at"])

        tenant_membership, _ = UserTenant.objects.get_or_create(
            user=user,
            tenant=tenant,
            defaults={"is_owner": True, "is_active": True},
        )
        if not tenant_membership.is_owner or not tenant_membership.is_active:
            tenant_membership.is_owner = True
            tenant_membership.is_active = True
            tenant_membership.save(update_fields=["is_owner", "is_active", "updated_at"])

        workspace_membership, _ = UserCustomer.objects.get_or_create(
            user=user,
            customer=workspace,
            defaults={"is_owner": True, "is_active": True},
        )
        if not workspace_membership.is_owner or not workspace_membership.is_active:
            workspace_membership.is_owner = True
            workspace_membership.is_active = True
            workspace_membership.save(update_fields=["is_owner", "is_active", "updated_at"])

        permission_map = self._ensure_permissions()
        tenant_roles = self._ensure_tenant_roles(tenant=tenant, permission_map=permission_map)
        workspace_roles = self._ensure_workspace_roles(
            workspace=workspace,
            permission_map=permission_map,
        )

        super_admin_role = tenant_roles["Super Admin"]
        UserRole.objects.get_or_create(
            user=user,
            role=super_admin_role,
            tenant=tenant,
            defaults={"customer": None},
        )

        workspace_admin_role = workspace_roles["Admin"]
        UserRole.objects.get_or_create(
            user=user,
            role=workspace_admin_role,
            customer=workspace,
            defaults={"tenant": None},
        )

        self.stdout.write(self.style.SUCCESS("MVP bootstrap complete."))
        self.stdout.write(f"User: {user.email} ({'created' if user_created else 'updated'})")
        self.stdout.write(f"Tenant: {tenant.name} ({'created' if tenant_created else 'existing'})")
        self.stdout.write(
            f"Workspace: {workspace.name} ({'created' if workspace_created else 'existing'})"
        )
