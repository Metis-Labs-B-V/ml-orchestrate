from django.contrib import admin

from .models import ActivityLog, ImpersonationLog, PasswordResetToken, Permission, Role, Tenant, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("email", "first_name", "last_name", "is_active", "is_superuser")
    search_fields = ("email", "first_name", "last_name")
    list_filter = ("is_active", "is_superuser")


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "owner")
    search_fields = ("name", "slug")
    list_filter = ("status",)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "tenant", "is_system", "is_default")
    list_filter = ("tenant", "is_system")


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "category")
    search_fields = ("code", "name")


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "expires_at", "used_at")
    search_fields = ("user__email",)
    list_filter = ("used_at",)


@admin.register(ImpersonationLog)
class ImpersonationLogAdmin(admin.ModelAdmin):
    list_display = ("impersonator", "target_user", "ip_address", "created_at")
    search_fields = ("impersonator__email", "target_user__email")


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("module", "action", "tenant", "actor", "created_at")
    search_fields = ("module", "action", "actor__email", "tenant__name")
    list_filter = ("module", "action")
