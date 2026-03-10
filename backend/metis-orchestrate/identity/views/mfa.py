"""TOTP-based MFA setup and verification."""

import pyotp

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from common_utils.api.responses import error_response, success_response
from ..activity_log import log_activity
from ..jwe import decrypt_token, encrypt_token
from ..models import User
from ..openapi_serializers import EmptySerializer, ToggleEnabledRequestSerializer
from ..serializers import MfaSetupSerializer, MfaVerifyLoginSerializer, UserSerializer


class MfaToggleView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ToggleEnabledRequestSerializer

    @extend_schema(request=ToggleEnabledRequestSerializer)
    def post(self, request):
        serializer = ToggleEnabledRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enabled = serializer.validated_data["enabled"]
        previous = bool(request.user.mfa_enabled)
        request.user.mfa_enabled = enabled
        request.user.save(update_fields=["mfa_enabled"])
        metadata = {"enabled": enabled}
        if previous != enabled:
            metadata["changes"] = {"mfa_enabled": {"from": previous, "to": enabled}}
        log_activity(
            actor=request.user,
            module="mfa",
            action="toggle",
            request=request,
            entity_type="user",
            entity_id=request.user.id,
            description=f"MFA {'enabled' if enabled else 'disabled'} for {request.user.email}",
            metadata=metadata,
        )
        return success_response(
            data={"mfa_enabled": request.user.mfa_enabled},
            message="MFA updated",
            request=request,
        )


class MfaSetupView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = EmptySerializer

    def post(self, request):
        secret = pyotp.random_base32()
        request.user.mfa_secret = secret
        request.user.save(update_fields=["mfa_secret"])
        totp = pyotp.TOTP(secret)
        otpauth_url = totp.provisioning_uri(
            name=request.user.email, issuer_name="Metis Orchestrate"
        )
        log_activity(
            actor=request.user,
            module="mfa",
            action="setup",
            request=request,
            entity_type="user",
            entity_id=request.user.id,
            description=f"MFA setup initiated for {request.user.email}",
        )
        return success_response(
            data={"secret": secret, "otpauth_url": otpauth_url},
            message="MFA setup initiated",
            request=request,
        )


class MfaConfirmView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MfaSetupSerializer

    @extend_schema(request=MfaSetupSerializer)
    def post(self, request):
        serializer = MfaSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data.get("code")
        previous = bool(request.user.mfa_enabled)
        if not request.user.mfa_secret:
            return error_response(
                errors={"mfa": ["MFA is not configured"]},
                message="MFA is not configured",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        totp = pyotp.TOTP(request.user.mfa_secret)
        if not totp.verify(code, valid_window=1):
            return error_response(
                errors={"code": ["Invalid code"]},
                message="Invalid code",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        request.user.mfa_enabled = True
        request.user.save(update_fields=["mfa_enabled"])
        metadata = {}
        if previous is not True:
            metadata["changes"] = {"mfa_enabled": {"from": previous, "to": True}}
        log_activity(
            actor=request.user,
            module="mfa",
            action="enable",
            request=request,
            entity_type="user",
            entity_id=request.user.id,
            description=f"MFA enabled for {request.user.email}",
            metadata=metadata if metadata else None,
        )
        return success_response(
            data={"mfa_enabled": True},
            message="MFA enabled",
            request=request,
        )


class MfaDisableView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MfaSetupSerializer

    @extend_schema(request=MfaSetupSerializer)
    def post(self, request):
        serializer = MfaSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data.get("code")
        previous = bool(request.user.mfa_enabled)
        if not request.user.mfa_secret or not request.user.mfa_enabled:
            return error_response(
                errors={"mfa": ["MFA is not enabled"]},
                message="MFA is not enabled",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        totp = pyotp.TOTP(request.user.mfa_secret)
        if not totp.verify(code, valid_window=1):
            return error_response(
                errors={"code": ["Invalid code"]},
                message="Invalid code",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        request.user.mfa_enabled = False
        request.user.mfa_secret = ""
        request.user.save(update_fields=["mfa_enabled", "mfa_secret"])
        metadata = {}
        if previous is not False:
            metadata["changes"] = {"mfa_enabled": {"from": previous, "to": False}}
        log_activity(
            actor=request.user,
            module="mfa",
            action="disable",
            request=request,
            entity_type="user",
            entity_id=request.user.id,
            description=f"MFA disabled for {request.user.email}",
            metadata=metadata if metadata else None,
        )
        return success_response(
            data={"mfa_enabled": False},
            message="MFA disabled",
            request=request,
        )


class MfaVerifyLoginView(APIView):
    permission_classes = [AllowAny]
    serializer_class = MfaVerifyLoginSerializer

    @extend_schema(request=MfaVerifyLoginSerializer)
    def post(self, request):
        serializer = MfaVerifyLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mfa_token = decrypt_token(serializer.validated_data["mfa_token"])
        code = serializer.validated_data["code"]
        try:
            token = AccessToken(mfa_token)
        except Exception:
            return error_response(
                errors={"mfa_token": ["Invalid token"]},
                message="Invalid token",
                status=status.HTTP_401_UNAUTHORIZED,
                request=request,
            )
        if not token.get("mfa_pending"):
            return error_response(
                errors={"mfa_token": ["Invalid token"]},
                message="Invalid token",
                status=status.HTTP_401_UNAUTHORIZED,
                request=request,
            )
        user = User.objects.filter(id=token.get("user_id")).first()
        if not user or not user.mfa_enabled or not user.mfa_secret:
            return error_response(
                errors={"mfa": ["MFA not enabled"]},
                message="MFA not enabled",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(code, valid_window=1):
            return error_response(
                errors={"code": ["Invalid code"]},
                message="Invalid code",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        refresh = RefreshToken.for_user(user)
        log_activity(
            actor=user,
            module="mfa",
            action="login",
            request=request,
            entity_type="user",
            entity_id=user.id,
            description=f"MFA login for {user.email}",
        )
        data = {
            "access": encrypt_token(str(refresh.access_token)),
            "refresh": encrypt_token(str(refresh)),
            "user": UserSerializer(user).data,
        }
        return success_response(
            data=data,
            message="Login successful",
            request=request,
        )
