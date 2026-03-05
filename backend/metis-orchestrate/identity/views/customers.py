"""Customer and user management views."""

from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from common_utils.api.pagination import StandardPageNumberPagination
from common_utils.api.responses import error_response, success_response
from ..activity_log import collect_changes, log_activity

from ..models import (
    Customer,
    Role,
    Tenant,
    User,
    UserRole,
    UserCustomer,
    UserTenant,
    UserTypeChoices,
)

from ..permissions import user_can_manage_customer, user_can_manage_tenant
from ..serializers import (
    CustomerSerializer,
    RoleSerializer,
    TenantUserUpdateSerializer,
    UserInviteSerializer,
    UserSerializer,
)
from ..utils.prepare_and_send_emails import send_password_reset_link
from identity.utils.role_management import create_roles_and_permissions_for_customer

class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            queryset = Customer.objects.all()
        else:
            tenant_ids = list(
                UserTenant.objects.filter(user=user, is_active=True).values_list(
                    "tenant_id", flat=True
                )
            )
            if not tenant_ids:
                return Customer.objects.none()
            allowed_tenant_ids = [
                tenant_id
                for tenant_id in tenant_ids
                if user_can_manage_tenant(user, tenant_id)
            ]
            if not allowed_tenant_ids:
                return Customer.objects.none()
            queryset = Customer.objects.filter(tenant_id__in=allowed_tenant_ids)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            normalized = str(is_active).strip().lower()
            if normalized in {"1", "true", "yes"}:
                queryset = queryset.filter(is_active=True)
            elif normalized in {"0", "false", "no"}:
                queryset = queryset.filter(is_active=False)
        search = self.request.query_params.get("search")
        if search:
            search_value = search.strip()
            if search_value:
                queryset = queryset.filter(
                    Q(name__icontains=search_value)
                    | Q(slug__icontains=search_value)
                    | Q(metadata__owner_email__icontains=search_value)
                )
        return queryset

    def create(self, request, *args, **kwargs):
        user = request.user
        tenant_id = request.data.get("tenant_id") or request.data.get("tenant")
        if not tenant_id:
            if user.is_superuser:
                return error_response(
                    errors={"tenant_id": ["tenant_id is required to create a client."]},
                    message="Invalid payload",
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )
            tenant_ids = list(
                UserTenant.objects.filter(user=user, is_active=True).values_list(
                    "tenant_id", flat=True
                )
            )
            if len(tenant_ids) == 1:
                tenant_id = tenant_ids[0]
            else:
                return error_response(
                    errors={"tenant_id": ["tenant_id is required to create a client."]},
                    message="Invalid payload",
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )
        tenant = Tenant.objects.filter(id=tenant_id).first()
        if not tenant:
            return error_response(
                errors={"tenant_id": ["Tenant not found."]},
                message="Tenant not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        if not user_can_manage_tenant(user, tenant_id):
            return error_response(
                errors={"detail": "Insufficient permissions for this tenant."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = serializer.save(tenant_id=tenant_id)
        create_roles_and_permissions_for_customer(customer, None)
        log_activity(
            actor=request.user,
            module="customer",
            action="create",
            request=request,
            entity_type="customer",
            entity_id=customer.id,
            description=f"Created customer {customer.name}",
            metadata={"customer_name": customer.name, "tenant_id": tenant_id},
        )
        return success_response(
            data=CustomerSerializer(customer).data,
            message="Customer created",
            status=status.HTTP_201_CREATED,
            request=request,
        )

    def perform_update(self, serializer):
        changes = collect_changes(serializer.instance, serializer.validated_data)
        customer = serializer.save()
        metadata = {"fields": list(self.request.data.keys())}
        if changes:
            metadata["changes"] = changes
        log_activity(
            actor=self.request.user,
            module="customer",
            action="update",
            request=self.request,
            entity_type="customer",
            entity_id=customer.id,
            description=f"Updated customer {customer.name}",
            metadata=metadata,
        )

    def perform_destroy(self, instance):
        log_activity(
            actor=self.request.user,
            module="customer",
            action="delete",
            request=self.request,
            entity_type="customer",
            entity_id=instance.id,
            description=f"Deleted customer {instance.name}",
            metadata={"customer_name": instance.name},
        )
        return super().perform_destroy(instance)


class CustomerUserView(APIView):
    permission_classes = [IsAuthenticated]

    def _apply_user_search_filter(self, queryset, request, customer_id):
        search = request.query_params.get("search", None)
        if search:
            search_value = search.strip()
            if search_value:
                queryset = queryset.filter(
                    Q(first_name__icontains=search_value)
                    | Q(last_name__icontains=search_value)
                    | Q(email__icontains=search_value)
                    | Q(phone__icontains=search_value)
                    | Q(job_title__icontains=search_value)
                    | Q(
                        roles__customer_id=customer_id,
                        roles__role__name__icontains=search_value,
                    )
                ).distinct()

        is_active = request.query_params.get("is_active", None)
        if is_active is not None:
            normalized = str(is_active).strip().lower()
            if normalized in {"1", "true", "yes"}:
                queryset = queryset.filter(is_active=True)
            elif normalized in {"0", "false", "no"}:
                queryset = queryset.filter(is_active=False)

        return queryset

    def get(self, request, customer_id):
        customer = Customer.objects.filter(id=customer_id).first()
        if not customer:
            return error_response(
                errors={"customer_id": ["Customer not found."]},
                message="Customer not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        if not user_can_manage_customer(request.user, customer):
            return error_response(
                errors={"detail": "Insufficient permissions for this customer."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        users = User.objects.filter(
            customers__customer_id=customer_id, customers__is_active=True
        )
        users = self._apply_user_search_filter(users, request, customer_id)
        users = users.order_by("email")
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

    def post(self, request, customer_id):
        customer = Customer.objects.filter(id=customer_id).first()
        if not customer:
            return error_response(
                errors={"customer_id": ["Customer not found."]},
                message="Customer not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        if not user_can_manage_customer(request.user, customer):
            return error_response(
                errors={"detail": "Insufficient permissions for this customer."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        payload = request.data.copy()
        send_invite = payload.pop("send_invite", None)
        payload["customer_id"] = customer_id
        payload["user_type"] = UserTypeChoices.CUSTOMER.value
        serializer = UserInviteSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_activity(
            actor=request.user,
            module="user",
            action="create",
            request=request,
            entity_type="user",
            entity_id=user.id,
            description=f"Created user {user.email}",
            metadata={"user_email": user.email, "customer_id": customer_id},
        )
        should_invite = bool(send_invite) if send_invite is not None else not payload.get("password")
        if should_invite:
            send_password_reset_link(user, subject="Set your Orchestrate password")
            log_activity(
                actor=request.user,
                module="user",
                action="invite",
                request=request,
                entity_type="user",
                entity_id=user.id,
                description=f"Sent invite to {user.email}",
                metadata={"user_email": user.email, "customer_id": customer_id},
            )
        return success_response(
            data=UserSerializer(user).data,
            message="User created",
            status=status.HTTP_201_CREATED,
            request=request,
        )


class CustomerUserDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id, user_id):
        customer = Customer.objects.filter(id=customer_id).first()
        if not customer:
            return error_response(
                errors={"customer_id": ["Customer not found."]},
                message="Customer not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        if not user_can_manage_customer(request.user, customer):
            return error_response(
                errors={"detail": "Insufficient permissions for this customer."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        membership = UserCustomer.objects.filter(
            user_id=user_id, customer_id=customer_id, is_active=True
        ).first()
        if not membership:
            return error_response(
                errors={"user_id": ["User not found for this customer."]},
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

    def patch(self, request, customer_id, user_id):
        customer = Customer.objects.filter(id=customer_id).first()
        if not customer:
            return error_response(
                errors={"customer_id": ["Customer not found."]},
                message="Customer not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        if not user_can_manage_customer(request.user, customer):
            return error_response(
                errors={"detail": "Insufficient permissions for this customer."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        membership = UserCustomer.objects.filter(
            user_id=user_id, customer_id=customer_id, is_active=True
        ).first()
        if not membership:
            return error_response(
                errors={"user_id": ["User not found for this customer."]},
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

    def delete(self, request, customer_id, user_id):
        customer = Customer.objects.filter(id=customer_id).first()
        if not customer:
            return error_response(
                errors={"customer_id": ["Customer not found."]},
                message="Customer not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        if not user_can_manage_customer(request.user, customer):
            return error_response(
                errors={"detail": "Insufficient permissions for this customer."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        membership = UserCustomer.objects.filter(
            user_id=user_id, customer_id=customer_id, is_active=True
        ).first()
        if not membership:
            return error_response(
                errors={"user_id": ["User not found for this customer."]},
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
        UserRole.objects.filter(user_id=user_id, customer_id=customer_id).delete()
        log_activity(
            actor=request.user,
            module="user",
            action="delete",
            request=request,
            target_user=user,
            entity_type="user",
            entity_id=user.id,
            description=f"Removed user {user.email} from customer",
            metadata={"user_email": user.email, "customer_id": customer_id},
        )
        return success_response(
            message="User removed",
            request=request,
        )


class CustomerRoleListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id):
        customer = Customer.objects.filter(id=customer_id).first()
        if not customer:
            return error_response(
                errors={"customer_id": ["Customer not found."]},
                message="Customer not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        if not user_can_manage_customer(request.user, customer):
            return error_response(
                errors={"detail": "Insufficient permissions for this customer."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        roles = Role.objects.filter(customer_id=customer_id).order_by("name")
        return success_response(
            data=RoleSerializer(roles, many=True).data,
            request=request,
        )


class CustomerUserRoleAssignView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, customer_id, user_id):
        customer = Customer.objects.filter(id=customer_id).first()
        if not customer:
            return error_response(
                errors={"customer_id": ["Customer not found."]},
                message="Customer not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        if not user_can_manage_customer(request.user, customer):
            return error_response(
                errors={"detail": "Insufficient permissions for this customer."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
                request=request,
            )
        membership = UserCustomer.objects.filter(
            user_id=user_id, customer_id=customer_id, is_active=True
        ).first()
        if not membership:
            return error_response(
                errors={"user_id": ["User not found for this customer."]},
                message="User not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        role_ids = request.data.get("role_ids", None)
        if role_ids is None:
            return error_response(
                errors={"role_ids": ["role_ids is required"]},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        if not isinstance(role_ids, list):
            return error_response(
                errors={"role_ids": ["role_ids must be a list"]},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
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
            UserRole.objects.filter(user=user, customer=customer).values_list(
                "role_id", flat=True
            )
        )
        UserRole.objects.filter(user=user, customer=customer).delete()
        for role_id in role_ids:
            role = Role.objects.get(id=role_id, customer=customer)
            UserRole.objects.create(user=user, role=role, customer=customer)
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
