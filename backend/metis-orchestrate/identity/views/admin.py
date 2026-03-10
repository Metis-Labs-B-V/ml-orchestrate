"""Admin-only user management views."""

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from common_utils.api.responses import error_response, success_response
from ..models import User
from ..permissions import HasAdminAccess
from ..serializers import AdminUserUpdateSerializer, UserSerializer


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated, HasAdminAccess]
    serializer_class = AdminUserUpdateSerializer

    @extend_schema(request=AdminUserUpdateSerializer)
    def patch(self, request, user_id):
        user = User.objects.filter(id=user_id).first()
        if not user:
            return error_response(
                errors={"user_id": ["User not found"]},
                message="User not found",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        serializer = AdminUserUpdateSerializer(instance=user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(
            data=UserSerializer(user).data,
            message="User updated",
            request=request,
        )
