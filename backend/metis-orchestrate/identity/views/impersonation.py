"""Impersonation and audit trail views."""

from django.db.models import Q
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from common_utils.api.responses import error_response, success_response
from ..activity_log import get_active_tenant_ids, log_activity
from ..jwe import encrypt_token
from ..models import ImpersonationLog, User, UserTenant
from ..permissions import HasAuditReadAccess
from ..serializers import ImpersonationLogSerializer, UserListSerializer, UserSerializer


class ImpersonationUserListView(APIView):
    permission_classes = [IsAuthenticated, HasAuditReadAccess]

    def get(self, request):
        if request.user.is_superuser:
            users = User.objects.filter(is_active=True)
        else:
            tenant_ids = get_active_tenant_ids(request.user)
            if not tenant_ids:
                users = User.objects.none()
            else:
                users = User.objects.filter(
                    is_active=True,
                    tenants__tenant_id__in=tenant_ids,
                    tenants__is_active=True,
                ).distinct()
        users = users.order_by("email")
        return success_response(
            data=UserListSerializer(users, many=True).data,
            request=request,
        )


class ImpersonateUserView(APIView):
    permission_classes = [IsAuthenticated, HasAuditReadAccess]

    def post(self, request):
        user_id = request.data.get("user_id")
        if not user_id:
            return error_response(
                errors={"user_id": ["user_id is required"]},
                message="Invalid payload",
                request=request,
                status=400,
            )
        target_user = User.objects.filter(id=user_id, is_active=True).first()
        if not target_user:
            return error_response(
                errors={"user_id": ["User not found"]},
                message="User not found",
                status=404,
                request=request,
            )
        if not request.user.is_superuser:
            tenant_ids = get_active_tenant_ids(request.user)
            if not tenant_ids:
                return error_response(
                    errors={"user_id": ["User not found"]},
                    message="User not found",
                    status=404,
                    request=request,
                )
            allowed = UserTenant.objects.filter(
                user=target_user, tenant_id__in=tenant_ids, is_active=True
            ).exists()
            if not allowed:
                return error_response(
                    errors={"user_id": ["User not found"]},
                    message="User not found",
                    status=404,
                    request=request,
                )
        ImpersonationLog.objects.create(
            impersonator=request.user,
            target_user=target_user,
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        log_activity(
            actor=request.user,
            module="impersonation",
            action="start",
            request=request,
            target_user=target_user,
            entity_type="user",
            entity_id=target_user.id,
            description=f"Impersonated {target_user.email}",
            metadata={"target_user_id": target_user.id, "target_user_email": target_user.email},
        )
        refresh = RefreshToken.for_user(target_user)
        refresh["impersonator_id"] = request.user.id
        refresh["impersonator_email"] = request.user.email
        data = {
            "access": encrypt_token(str(refresh.access_token)),
            "refresh": encrypt_token(str(refresh)),
            "user": UserSerializer(target_user).data,
            "impersonator": UserSerializer(request.user).data,
        }
        return success_response(
            data=data,
            message="Impersonation successful",
            request=request,
        )


class ImpersonationLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ImpersonationLog.objects.select_related("impersonator", "target_user").order_by(
        "-created_at"
    )
    serializer_class = ImpersonationLogSerializer
    permission_classes = [IsAuthenticated, HasAuditReadAccess]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = getattr(self.request, "user", None)
        if not user or not user.is_authenticated:
            return queryset.none()
        if user.is_superuser:
            return queryset
        tenant_ids = get_active_tenant_ids(user)
        if not tenant_ids:
            return queryset.none()
        return (
            queryset.filter(
                Q(
                    impersonator__tenants__tenant_id__in=tenant_ids,
                    impersonator__tenants__is_active=True,
                )
                | Q(
                    target_user__tenants__tenant_id__in=tenant_ids,
                    target_user__tenants__is_active=True,
                )
            )
            .distinct()
            .order_by("-created_at")
        )
