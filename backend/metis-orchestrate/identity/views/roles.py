"""Role and permission CRUD."""

from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from ..activity_log import collect_changes, log_activity
from ..models import Permission, Role, RolePermission
from ..permissions import IsSuperAdmin
from ..serializers import (
    PermissionSerializer,
    RolePermissionAssignSerializer,
    RoleSerializer,
)


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def perform_create(self, serializer):
        role = serializer.save()
        log_activity(
            actor=self.request.user,
            module="role",
            action="create",
            request=self.request,
            tenant=role.tenant,
            entity_type="role",
            entity_id=role.id,
            description=f"Created role {role.name}",
            metadata={"role_name": role.name},
        )

    def perform_update(self, serializer):
        changes = collect_changes(serializer.instance, serializer.validated_data)
        role = serializer.save()
        metadata = {"fields": list(self.request.data.keys())}
        if changes:
            metadata["changes"] = changes
        log_activity(
            actor=self.request.user,
            module="role",
            action="update",
            request=self.request,
            tenant=role.tenant,
            entity_type="role",
            entity_id=role.id,
            description=f"Updated role {role.name}",
            metadata=metadata,
        )

    def perform_destroy(self, instance):
        log_activity(
            actor=self.request.user,
            module="role",
            action="delete",
            request=self.request,
            tenant=instance.tenant,
            entity_type="role",
            entity_id=instance.id,
            description=f"Deleted role {instance.name}",
            metadata={"role_name": instance.name},
        )
        return super().perform_destroy(instance)

    @action(detail=True, methods=["get", "post"])
    @extend_schema(request=RolePermissionAssignSerializer)
    def permissions(self, request, pk=None):
        role = self.get_object()
        if request.method == "GET":
            permission_ids = list(
                RolePermission.objects.filter(role=role).values_list(
                    "permission_id", flat=True
                )
            )
            return Response({"permission_ids": permission_ids})

        serializer = RolePermissionAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        permission_ids = serializer.validated_data["permission_ids"]
        previous_permission_ids = list(
            RolePermission.objects.filter(role=role).values_list("permission_id", flat=True)
        )
        permissions = list(Permission.objects.filter(id__in=permission_ids))
        found_ids = {permission.id for permission in permissions}
        missing_ids = sorted(set(permission_ids) - found_ids)
        if missing_ids:
            return Response(
                {"permission_ids": [f"Unknown permission ids: {missing_ids}"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        RolePermission.objects.filter(role=role).delete()
        for permission in permissions:
            RolePermission.objects.create(role=role, permission=permission)
        metadata = {"permission_ids": [permission.id for permission in permissions]}
        if sorted(previous_permission_ids) != sorted(metadata["permission_ids"]):
            metadata["changes"] = {
                "permission_ids": {
                    "from": previous_permission_ids,
                    "to": metadata["permission_ids"],
                }
            }
        log_activity(
            actor=request.user,
            module="permission",
            action="assign",
            request=request,
            tenant=role.tenant,
            entity_type="role",
            entity_id=role.id,
            description=f"Updated permissions for role {role.name}",
            metadata=metadata,
        )
        return Response({"permission_ids": [permission.id for permission in permissions]})


class PermissionViewSet(viewsets.ModelViewSet):
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def perform_create(self, serializer):
        permission = serializer.save()
        log_activity(
            actor=self.request.user,
            module="permission",
            action="create",
            request=self.request,
            entity_type="permission",
            entity_id=permission.id,
            description=f"Created permission {permission.code}",
            metadata={"permission_code": permission.code},
        )

    def perform_update(self, serializer):
        changes = collect_changes(serializer.instance, serializer.validated_data)
        permission = serializer.save()
        metadata = {"fields": list(self.request.data.keys())}
        if changes:
            metadata["changes"] = changes
        log_activity(
            actor=self.request.user,
            module="permission",
            action="update",
            request=self.request,
            entity_type="permission",
            entity_id=permission.id,
            description=f"Updated permission {permission.code}",
            metadata=metadata,
        )

    def perform_destroy(self, instance):
        log_activity(
            actor=self.request.user,
            module="permission",
            action="delete",
            request=self.request,
            entity_type="permission",
            entity_id=instance.id,
            description=f"Deleted permission {instance.code}",
            metadata={"permission_code": instance.code},
        )
        return super().perform_destroy(instance)
