"""Tenant and user management views."""

from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from common_utils.api.pagination import StandardPageNumberPagination
from common_utils.api.responses import error_response, success_response
from ..activity_log import collect_changes, log_activity

from ..models import (
    Role, 
    Tenant, 
    User, 
    UserRole, 
    UserTenant, 
    UserTypeChoices
)

from ..openapi_serializers import EmptySerializer, RoleIdsRequestSerializer
from ..permissions import (
    IsSuperAdmin,
    ROLE_READ_CODES,
    ROLE_WRITE_CODES,
    USER_READ_CODES,
    USER_WRITE_CODES,
    user_has_permissions,
)
from ..serializers import (
    RoleSerializer,
    TenantSerializer,
    TenantUserUpdateSerializer,
    UserInviteSerializer,
    UserSerializer,
)
from ..utils.prepare_and_send_emails import send_user_account_setup_email

from identity.utils import tenant_signup_email_validations


class TenantViewSet(viewsets.ModelViewSet):
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def perform_create(self, serializer):
        tenant = serializer.save()
        log_activity(
            actor=self.request.user,
            module="tenant",
            action="create",
            request=self.request,
            tenant=tenant,
            entity_type="tenant",
            entity_id=tenant.id,
            description=f"Created tenant {tenant.name}",
            metadata={"tenant_name": tenant.name},
        )

    def perform_update(self, serializer):
        changes = collect_changes(serializer.instance, serializer.validated_data)
        tenant = serializer.save()
        metadata = {"fields": list(self.request.data.keys())}
        if changes:
            metadata["changes"] = changes
        log_activity(
            actor=self.request.user,
            module="tenant",
            action="update",
            request=self.request,
            tenant=tenant,
            entity_type="tenant",
            entity_id=tenant.id,
            description=f"Updated tenant {tenant.name}",
            metadata=metadata,
        )

    def perform_destroy(self, instance):
        log_activity(
            actor=self.request.user,
            module="tenant",
            action="delete",
            request=self.request,
            tenant=instance,
            entity_type="tenant",
            entity_id=instance.id,
            description=f"Deleted tenant {instance.name}",
            metadata={"tenant_name": instance.name},
        )
        return super().perform_destroy(instance)


class TenantUserView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserInviteSerializer

    def _apply_user_search_filter(self, queryset, request):
        search = request.query_params.get("search", None)
        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search) |
                Q(phone__icontains=search) |
                Q(job_title__icontains=search) |
                Q(roles__role__name__icontains=search)
            )
        
        is_active = request.query_params.get("is_active", None)
        if is_active is not None:
            normalized = str(is_active).strip().lower()
            if normalized in {"1", "true", "yes"}:
                queryset = queryset.filter(is_active=True)
            elif normalized in {"0", "false", "no"}:
                queryset = queryset.filter(is_active=False)

        return queryset

    def get(self, request, tenant_id):
        if not user_has_permissions(request.user, USER_READ_CODES, tenant_id=tenant_id):
            return error_response(
                errors={"detail": "Insufficient permissions for this tenant."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        users = User.objects.filter(
            tenants__tenant_id=tenant_id, tenants__is_active=True
        )

        users = self._apply_user_search_filter(users, request)
        users = users.order_by("-created_at")
        paginator = StandardPageNumberPagination()
        page = paginator.paginate_queryset(users, request)
        if page is not None:
            payload = paginator.get_paginated_response(
                UserSerializer(page, many=True).data
            ).data
            return success_response(data=payload, request=request)
        return success_response(
            data={"items": UserSerializer(users, many=True).data, "count": users.count()},
            request=request,
        )

    @extend_schema(request=UserInviteSerializer)
    def post(self, request, tenant_id):
        if not user_has_permissions(request.user, USER_WRITE_CODES, tenant_id=tenant_id):
            return error_response(
                errors={"detail": "Insufficient permissions for this tenant."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        payload = request.data.copy()

        payload["email"], is_email_valid, email_error = tenant_signup_email_validations(payload.get("email"))
        if not is_email_valid:
            return error_response(
                errors={"email": [email_error]},
                message=email_error,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        send_invite = payload.pop("send_invite", None)
        payload["tenant_id"] = tenant_id
        payload["user_type"] = UserTypeChoices.TENANT.value
        payload["password"] = None
        
        serializer = UserInviteSerializer(data=payload)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        
        user = serializer.save()
        log_activity(
            actor=request.user,
            module="user",
            action="create",
            request=request,
            tenant_id=tenant_id,
            target_user=user,
            entity_type="user",
            entity_id=user.id,
            description=f"Created user {user.email}",
            metadata={"user_email": user.email},
        )
        should_invite = bool(send_invite) if send_invite is not None else not payload.get("password")
        if should_invite:
            send_user_account_setup_email(user)
            log_activity(
                actor=request.user,
                module="user",
                action="invite",
                request=request,
                tenant_id=tenant_id,
                target_user=user,
                entity_type="user",
                entity_id=user.id,
                description=f"Sent invite to {user.email}",
                metadata={"user_email": user.email},
            )
        return success_response(
            data=UserSerializer(user).data,
            message="User created",
            status=status.HTTP_201_CREATED,
            request=request,
        )


class TenantUserDetailView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TenantUserUpdateSerializer

    def get(self, request, tenant_id, user_id):
        if not user_has_permissions(request.user, USER_READ_CODES, tenant_id=tenant_id):
            return error_response(
                errors={"detail": "Insufficient permissions for this tenant."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        membership = UserTenant.objects.filter(
            user_id=user_id, tenant_id=tenant_id, is_active=True
        ).first()
        if not membership:
            return error_response(
                errors={"user_id": ["User not found for this tenant."]},
                message="User not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        user = User.objects.filter(id=user_id).first()
        if not user:
            return error_response(
                errors={"user_id": ["User not found."]},
                message="User not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        return success_response(data=UserSerializer(user).data, request=request)

    @extend_schema(request=TenantUserUpdateSerializer)
    def patch(self, request, tenant_id, user_id):
        if not user_has_permissions(request.user, USER_WRITE_CODES, tenant_id=tenant_id):
            return error_response(
                errors={"detail": "Insufficient permissions for this tenant."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        membership = UserTenant.objects.filter(
            user_id=user_id, tenant_id=tenant_id, is_active=True
        ).first()
        if not membership:
            return error_response(
                errors={"user_id": ["User not found for this tenant."]},
                message="User not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        user = User.objects.filter(id=user_id).first()
        if not user:
            return error_response(
                errors={"user_id": ["User not found."]},
                message="User not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        serializer = TenantUserUpdateSerializer(instance=user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changes = collect_changes(user, serializer.validated_data)
        serializer.save()
        metadata = {"fields": list(request.data.keys())}
        if changes:
            metadata["changes"] = changes
        log_activity(
            actor=request.user,
            module="user",
            action="update",
            request=request,
            tenant_id=tenant_id,
            target_user=user,
            entity_type="user",
            entity_id=user.id,
            description=f"Updated user {user.email}",
            metadata=metadata,
        )
        return success_response(
            data=UserSerializer(user).data,
            message="User updated",
            request=request,
        )

    def delete(self, request, tenant_id, user_id):
        if not user_has_permissions(request.user, USER_WRITE_CODES, tenant_id=tenant_id):
            return error_response(
                errors={"detail": "Insufficient permissions for this tenant."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        membership = UserTenant.objects.filter(
            user_id=user_id, tenant_id=tenant_id, is_active=True
        ).first()
        if not membership:
            return error_response(
                errors={"user_id": ["User not found for this tenant."]},
                message="User not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        user = User.objects.filter(id=user_id).first()
        if not user:
            return error_response(
                errors={"user_id": ["User not found."]},
                message="User not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        membership.is_active = False
        membership.save(update_fields=["is_active"])
        UserRole.objects.filter(user_id=user_id, tenant_id=tenant_id).delete()
        log_activity(
            actor=request.user,
            module="user",
            action="delete",
            request=request,
            tenant_id=tenant_id,
            target_user=user,
            entity_type="user",
            entity_id=user.id,
            description=f"Removed user {user.email} from tenant",
            metadata={"user_email": user.email},
        )
        return success_response(
            message="User removed",
            request=request,
        )


class TenantRoleListView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = EmptySerializer

    def get(self, request, tenant_id):
        if not user_has_permissions(request.user, ROLE_READ_CODES, tenant_id=tenant_id):
            return error_response(
                errors={"detail": "Insufficient permissions for this tenant."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        roles = Role.objects.filter(tenant_id=tenant_id).order_by("name")
        return success_response(
            data=RoleSerializer(roles, many=True).data,
            request=request,
        )


class UserRoleAssignView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = RoleIdsRequestSerializer

    @extend_schema(request=RoleIdsRequestSerializer)
    def post(self, request, tenant_id, user_id):
        if not user_has_permissions(request.user, ROLE_WRITE_CODES, tenant_id=tenant_id):
            return error_response(
                errors={"detail": "Insufficient permissions for this tenant."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        membership = UserTenant.objects.filter(user_id=user_id, tenant_id=tenant_id).first()
        if not membership:
            return error_response(
                errors={"user_id": ["User not found for this tenant."]},
                message="User not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        payload_serializer = RoleIdsRequestSerializer(data=request.data)
        if not payload_serializer.is_valid():
            return error_response(
                errors=payload_serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        role_ids = payload_serializer.validated_data["role_ids"]
        tenant = Tenant.objects.filter(id=tenant_id).first()
        if not tenant:
            return error_response(
                errors={"tenant_id": ["Tenant not found"]},
                message="Tenant not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        user = User.objects.filter(id=user_id).first()
        if not user:
            return error_response(
                errors={"user_id": ["User not found"]},
                message="User not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        previous_role_ids = list(
            UserRole.objects.filter(user=user, tenant=tenant).values_list("role_id", flat=True)
        )
        UserRole.objects.filter(user=user, tenant=tenant).delete()
        for role_id in role_ids:
            role = Role.objects.get(id=role_id, tenant=tenant)
            UserRole.objects.create(user=user, role=role, tenant=tenant)
        metadata = {"role_ids": role_ids}
        if sorted(previous_role_ids) != sorted(role_ids):
            metadata["changes"] = {
                "role_ids": {"from": previous_role_ids, "to": role_ids}
            }
        log_activity(
            actor=request.user,
            module="role",
            action="assign",
            request=request,
            tenant=tenant,
            entity_type="user",
            entity_id=user.id,
            description=f"Updated roles for {user.email}",
            metadata=metadata,
        )
        return success_response(
            data={"user_id": user.id, "role_ids": role_ids},
            message="Roles updated",
            request=request,
        )
