import os

from django.core.management.base import BaseCommand
from django.db import transaction

from identity.models import Permission, Role, RolePermission, Tenant, User, UserRole, UserTenant

# python manage.py seed_identity
class Command(BaseCommand):
    help = "Seed baseline tenants, roles, and permissions for identity."

    def handle(self, *args, **options):
        with transaction.atomic():
            tenant_name = os.getenv("DEFAULT_TENANT_NAME", "Metis Orchestrate")
            tenant, _ = Tenant.objects.get_or_create(name=tenant_name)

            superuser_email = os.getenv("SUPERUSER_EMAIL")
            if superuser_email:
                user = User.objects.filter(email=superuser_email).first()
                if user:
                    UserTenant.objects.get_or_create(user=user, tenant=tenant, is_owner=True)

            permissions = [
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

            permission_map = {}
            for code, name in permissions:
                perm, _ = Permission.objects.get_or_create(
                    code=code, defaults={"name": name, "category": "core"}
                )
                permission_map[code] = perm

            roles = {
                "Super Admin": ["tenant.write", "user.write", "role.write", "audit.read", "customer.write"],
                "Tenant Admin": ["tenant.write", "user.write", "role.read", "audit.read", "customer.write"],
                "Viewer": ["tenant.read", "user.read", "role.read", "customer.read"],
                "Customer Admin": ["customer.write", "customer.read", "user.write", "user.read"],
                "Customer Finance": ["customer.read"],
                "Customer Other": ["customer.read"],
            }

            for role_name, role_permissions in roles.items():
                role, _ = Role.objects.get_or_create(
                    name=role_name,
                    tenant=tenant,
                    defaults={"is_system": True, "is_default": role_name == "Viewer"},
                )
                for perm_code in role_permissions:
                    RolePermission.objects.get_or_create(
                        role=role, permission=permission_map[perm_code]
                    )

            if superuser_email:
                user = User.objects.filter(email=superuser_email).first()
                if user:
                    admin_role = Role.objects.get(name="Super Admin", tenant=tenant)
                    UserRole.objects.get_or_create(user=user, role=admin_role, tenant=tenant)

        self.stdout.write(self.style.SUCCESS("Identity seed complete."))
