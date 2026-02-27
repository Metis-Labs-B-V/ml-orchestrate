from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import (
    ActivityLog,
    ImpersonationLog,
    Customer,
    Permission,
    Role,
    RolePermission,
    Tenant,
    User,
    UserCustomer,
    UserRole,
    UserTenant,
)


class UserSerializer(serializers.ModelSerializer):
    tenants = serializers.SerializerMethodField()
    customers = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "phone",
            "avatar_url",
            "timezone",
            "locale",
            "is_staff",
            "is_superuser",
            "is_active",
            "is_verified",
            "mfa_enabled",
            "sso_enabled",
            "created_at",
            "updated_at",
            "tenants",
            "customers",
            "user_type",
            "job_title",
            "otp_enabled",
        ]

    def get_tenants(self, user):
        memberships = (
            UserTenant.objects.filter(user=user, is_active=True)
            .select_related("tenant")
            .order_by("tenant__name")
        )
        roles = (
            UserRole.objects.filter(user=user, tenant_id__isnull=False)
            .select_related("role", "tenant")
            .order_by("role__name")
        )
        role_map = {}
        for item in roles:
            role_map.setdefault(item.tenant_id, []).append(
                {"id": item.role_id, "name": item.role.name, "slug": item.role.slug}
            )
        role_ids = [item.role_id for item in roles if item.role_id]
        role_permissions = RolePermission.objects.filter(role_id__in=role_ids).select_related(
            "permission"
        )
        role_permission_map = {}
        for item in role_permissions:
            role_permission_map.setdefault(item.role_id, set()).add(item.permission.code)
        tenant_permission_map = {}
        for item in roles:
            permissions = role_permission_map.get(item.role_id, set())
            if permissions:
                tenant_permission_map.setdefault(item.tenant_id, set()).update(permissions)
        return [
            {
                "id": membership.tenant_id,
                "name": membership.tenant.name,
                "slug": membership.tenant.slug,
                "is_owner": membership.is_owner,
                "roles": role_map.get(membership.tenant_id, []),
                "permissions": sorted(tenant_permission_map.get(membership.tenant_id, [])),
            }
            for membership in memberships
        ]

    def get_customers(self, user):
        memberships = (
            UserCustomer.objects.filter(user=user, is_active=True)
            .select_related("customer")
            .order_by("customer__name")
        )
        roles = (
            UserRole.objects.filter(user=user, customer_id__isnull=False)
            .select_related("role", "customer")
            .order_by("role__name")
        )
        role_map = {}
        for item in roles:
            role_map.setdefault(item.customer_id, []).append(
                {"id": item.role_id, "name": item.role.name, "slug": item.role.slug}
            )
        role_ids = [item.role_id for item in roles if item.role_id]
        role_permissions = RolePermission.objects.filter(role_id__in=role_ids).select_related(
            "permission"
        )
        role_permission_map = {}
        for item in role_permissions:
            role_permission_map.setdefault(item.role_id, set()).add(item.permission.code)
        customer_permission_map = {}
        for item in roles:
            permissions = role_permission_map.get(item.role_id, set())
            if permissions:
                customer_permission_map.setdefault(item.customer_id, set()).update(permissions)
        return [
            {
                "id": membership.customer_id,
                "name": membership.customer.name,
                "slug": membership.customer.slug,
                "is_owner": membership.is_owner,
                "roles": role_map.get(membership.customer_id, []),
                "permissions": sorted(
                    customer_permission_map.get(membership.customer_id, [])
                ),
            }
            for membership in memberships
        ]


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, min_length=12)
    tenant_id = serializers.IntegerField(write_only=True, required=False)
    customer_id = serializers.IntegerField(write_only=True, required=False)
    role_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    class Meta:
        model = User
        fields = [
            "email",
            "password",
            "username",
            "first_name",
            "last_name",
            "phone",
            "avatar_url",
            "timezone",
            "locale",
            "tenant_id",
            "customer_id",
            "role_ids",
            "user_type",
            "job_title",
        ]

    def validate(self, attrs):
        tenant_id = attrs.get("tenant_id")
        customer_id = attrs.get("customer_id")
        role_ids = attrs.get("role_ids") or []

        if tenant_id and customer_id:
            raise serializers.ValidationError(
                "Provide either tenant_id or customer_id, not both."
            )

        if tenant_id and not Tenant.objects.filter(id=tenant_id).exists():
            raise serializers.ValidationError({"tenant_id": ["Tenant not found."]})

        if customer_id and not Customer.objects.filter(id=customer_id).exists():
            raise serializers.ValidationError({"customer_id": ["Customer not found."]})

        if tenant_id and role_ids:
            valid_role_ids = set(
                Role.objects.filter(id__in=role_ids, tenant_id=tenant_id).values_list("id", flat=True)
            )
            invalid_role_ids = [role_id for role_id in role_ids if role_id not in valid_role_ids]
            if invalid_role_ids:
                raise serializers.ValidationError(
                    {"role_ids": [f"Invalid role_ids for tenant {tenant_id}: {invalid_role_ids}"]}
                )

        if customer_id and role_ids:
            valid_role_ids = set(
                Role.objects.filter(id__in=role_ids, customer_id=customer_id).values_list(
                    "id", flat=True
                )
            )
            invalid_role_ids = [role_id for role_id in role_ids if role_id not in valid_role_ids]
            if invalid_role_ids:
                raise serializers.ValidationError(
                    {"role_ids": [f"Invalid role_ids for customer {customer_id}: {invalid_role_ids}"]}
                )

        return attrs

    def create(self, validated_data):
        tenant_id = validated_data.pop("tenant_id", None)
        customer_id = validated_data.pop("customer_id", None)
        role_ids = validated_data.pop("role_ids", [])
        password = validated_data.pop("password", None)
        user = User.objects.create_user(password=password, **validated_data)
        if tenant_id:
            tenant = Tenant.objects.get(id=tenant_id)
            UserTenant.objects.create(user=user, tenant=tenant, is_owner=False)
            for role_id in role_ids:
                role = Role.objects.get(id=role_id, tenant=tenant)
                UserRole.objects.create(user=user, role=role, tenant=tenant)
        if customer_id:
            customer = Customer.objects.get(id=customer_id)
            UserCustomer.objects.create(user=user, customer=customer, is_owner=False)
            for role_id in role_ids:
                role = Role.objects.get(id=role_id, customer=customer)
                UserRole.objects.create(user=user, role=role, customer=customer)
        return user


class UserInviteSerializer(UserCreateSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, allow_null=True)

    def validate_password(self, value):
        if not value:
            return value
        if len(value) < 12:
            raise serializers.ValidationError("Ensure password has at least 12 characters.")
        return value


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = [
            "id",
            "name",
            "slug",
            "parent",
            "owner",
            "status",
            "metadata",
            "created_at",
            "updated_at",
        ]


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "vat",
            "kvk",
            "phone",
            "email",
            "website",
            "address_line_1",
            "address_line_2",
            "city",
            "province",
            "country",
            "zip_code",
            "slug",
            "parent",
            "tenant",
            "owner",
            "status",
            "is_active",
            "metadata",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "tenant": {"read_only": True},
        }


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "tenant",
            "customer",
            "parent",
            "is_system",
            "is_default",
            "created_at",
            "updated_at",
        ]


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "code", "name", "description", "category"]


class UserListSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "is_active",
        ]


class TenantSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ["id", "name", "slug"]


class ImpersonationLogSerializer(serializers.ModelSerializer):
    impersonator = UserListSerializer(read_only=True)
    target_user = UserListSerializer(read_only=True)

    class Meta:
        model = ImpersonationLog
        fields = [
            "id",
            "impersonator",
            "target_user",
            "ip_address",
            "user_agent",
            "created_at",
        ]


class ActivityLogSerializer(serializers.ModelSerializer):
    actor = UserListSerializer(read_only=True)
    tenant = TenantSummarySerializer(read_only=True)

    class Meta:
        model = ActivityLog
        fields = [
            "id",
            "tenant",
            "actor",
            "module",
            "action",
            "entity_type",
            "entity_id",
            "description",
            "metadata",
            "ip_address",
            "user_agent",
            "created_at",
        ]


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            email=attrs.get("email"),
            password=attrs.get("password"),
        )
        if not user:
            raise serializers.ValidationError("Invalid credentials")
        if not user.is_active:
            raise serializers.ValidationError("User is inactive")
        attrs["user"] = user
        return attrs


class SignupSerializer(UserCreateSerializer):
    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already in use")
        return value


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=12)


class MfaSetupSerializer(serializers.Serializer):
    code = serializers.CharField(required=False)


class MfaVerifyLoginSerializer(serializers.Serializer):
    mfa_token = serializers.CharField()
    code = serializers.CharField()


class SsoExchangeSerializer(serializers.Serializer):
    token = serializers.CharField()


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "first_name",
            "last_name",
            "phone",
            "avatar_url",
            "timezone",
            "locale",
            "otp_enabled",
        ]


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "email",
            "first_name",
            "last_name",
            "phone",
            "avatar_url",
            "timezone",
            "locale",
            "is_active",
            "is_verified",
            "mfa_enabled",
            "sso_enabled",
        ]

    def validate_email(self, value):
        user_id = self.instance.id if self.instance else None
        if User.objects.filter(email=value).exclude(id=user_id).exists():
            raise serializers.ValidationError("Email already in use")
        return value


class TenantUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "email",
            "first_name",
            "last_name",
            "phone",
            "avatar_url",
            "timezone",
            "locale",
            "is_active",
            "job_title",
        ]

    def validate_email(self, value):
        user_id = self.instance.id if self.instance else None
        if User.objects.filter(email=value).exclude(id=user_id).exists():
            raise serializers.ValidationError("Email already in use")
        return value


class RolePermissionAssignSerializer(serializers.Serializer):
    permission_ids = serializers.ListField(
        child=serializers.IntegerField(), allow_empty=True
    )


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField(required=True)
