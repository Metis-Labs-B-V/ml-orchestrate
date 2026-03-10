"""SSO providers (Google/Microsoft) and token exchange."""

from datetime import timedelta
import os
from urllib.parse import urlencode
from uuid import uuid4

from django.conf import settings
from django.shortcuts import redirect
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
import requests

from common_utils.api.responses import error_response, success_response
from ..activity_log import log_activity
from ..jwe import encrypt_token
from ..models import SsoLoginToken, SsoState, User
from ..openapi_serializers import EmptySerializer, ToggleEnabledRequestSerializer
from ..serializers import SsoExchangeSerializer, UserSerializer


class SsoToggleView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ToggleEnabledRequestSerializer

    @extend_schema(request=ToggleEnabledRequestSerializer)
    def post(self, request):
        serializer = ToggleEnabledRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enabled = serializer.validated_data["enabled"]
        previous = bool(request.user.sso_enabled)
        request.user.sso_enabled = enabled
        request.user.save(update_fields=["sso_enabled"])
        metadata = {"enabled": enabled}
        if previous != enabled:
            metadata["changes"] = {"sso_enabled": {"from": previous, "to": enabled}}
        log_activity(
            actor=request.user,
            module="sso",
            action="toggle",
            request=request,
            entity_type="user",
            entity_id=request.user.id,
            description=f"SSO {'enabled' if enabled else 'disabled'} for {request.user.email}",
            metadata=metadata,
        )
        return success_response(
            data={"sso_enabled": request.user.sso_enabled},
            message="SSO updated",
            request=request,
        )


class SsoStartView(APIView):
    permission_classes = [AllowAny]
    serializer_class = EmptySerializer

    def post(self, request, provider):
        state = str(uuid4())
        expires_at = timezone.now() + timedelta(
            minutes=int(os.getenv("SSO_STATE_TTL_MINUTES", "10"))
        )
        SsoState.objects.create(token=state, provider=provider, expires_at=expires_at)
        if provider == "google":
            params = {
                "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                "redirect_uri": os.getenv("GOOGLE_REDIRECT_URI", ""),
                "response_type": "code",
                "scope": "openid email profile",
                "access_type": "offline",
                "prompt": "consent",
                "state": state,
            }
            url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
        elif provider == "microsoft":
            tenant = os.getenv("MICROSOFT_TENANT_ID", "common")
            params = {
                "client_id": os.getenv("MICROSOFT_CLIENT_ID", ""),
                "redirect_uri": os.getenv("MICROSOFT_REDIRECT_URI", ""),
                "response_type": "code",
                "scope": "openid email profile User.Read",
                "response_mode": "query",
                "state": state,
            }
            url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{urlencode(params)}"
        else:
            return error_response(
                errors={"provider": ["Unsupported provider"]},
                message="Unsupported provider",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        return success_response(data={"url": url}, message="SSO URL generated", request=request)


class SsoCallbackView(APIView):
    permission_classes = [AllowAny]
    serializer_class = EmptySerializer

    def get(self, request, provider):
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        if not code or not state:
            return error_response(
                errors={"detail": ["Missing code or state"]},
                message="Invalid callback",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        state_record = SsoState.objects.filter(token=state, provider=provider).first()
        if (
            not state_record
            or state_record.used_at
            or state_record.expires_at < timezone.now()
        ):
            return error_response(
                errors={"state": ["Invalid state"]},
                message="Invalid state",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        state_record.used_at = timezone.now()
        state_record.save(update_fields=["used_at"])

        if provider == "google":
            token_response = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                    "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
                    "code": code,
                    "redirect_uri": os.getenv("GOOGLE_REDIRECT_URI", ""),
                    "grant_type": "authorization_code",
                },
                timeout=10,
            )
            if not token_response.ok:
                return error_response(
                    errors={"sso": ["Token exchange failed"]},
                    message="Token exchange failed",
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )
            access_token = token_response.json().get("access_token")
            userinfo = requests.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            ).json()
            email = userinfo.get("email")
            first_name = userinfo.get("given_name", "")
            last_name = userinfo.get("family_name", "")
            avatar_url = userinfo.get("picture", "")
        elif provider == "microsoft":
            tenant = os.getenv("MICROSOFT_TENANT_ID", "common")
            token_response = requests.post(
                f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
                data={
                    "client_id": os.getenv("MICROSOFT_CLIENT_ID", ""),
                    "client_secret": os.getenv("MICROSOFT_CLIENT_SECRET", ""),
                    "code": code,
                    "redirect_uri": os.getenv("MICROSOFT_REDIRECT_URI", ""),
                    "grant_type": "authorization_code",
                    "scope": "openid email profile User.Read",
                },
                timeout=10,
            )
            if not token_response.ok:
                return error_response(
                    errors={"sso": ["Token exchange failed"]},
                    message="Token exchange failed",
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )
            access_token = token_response.json().get("access_token")
            userinfo = requests.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            ).json()
            email = userinfo.get("mail") or userinfo.get("userPrincipalName")
            first_name = userinfo.get("givenName", "")
            last_name = userinfo.get("surname", "")
            avatar_url = ""
        else:
            return error_response(
                errors={"provider": ["Unsupported provider"]},
                message="Unsupported provider",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        if not email:
            return error_response(
                errors={"email": ["Email not found"]},
                message="Email not found",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "avatar_url": avatar_url,
                "is_verified": True,
                "sso_enabled": True,
            },
        )
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
            user.save(update_fields=["avatar_url"])
        token = str(uuid4())
        expires_at = timezone.now() + timedelta(
            minutes=int(os.getenv("SSO_LOGIN_TOKEN_TTL_MINUTES", "5"))
        )
        SsoLoginToken.objects.create(
            user=user, token=token, provider=provider, expires_at=expires_at
        )
        redirect_url = f"{settings.FRONTEND_BASE_URL}/sso/callback?token={token}&provider={provider}"
        return redirect(redirect_url)


class SsoExchangeView(APIView):
    permission_classes = [AllowAny]
    serializer_class = SsoExchangeSerializer

    @extend_schema(request=SsoExchangeSerializer)
    def post(self, request):
        serializer = SsoExchangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["token"]
        record = SsoLoginToken.objects.filter(token=token).first()
        if not record or record.used_at or record.expires_at < timezone.now():
            return error_response(
                errors={"token": ["Invalid token"]},
                message="Invalid token",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        record.used_at = timezone.now()
        record.save(update_fields=["used_at"])
        refresh = RefreshToken.for_user(record.user)
        log_activity(
            actor=record.user,
            module="sso",
            action="login",
            request=request,
            entity_type="user",
            entity_id=record.user.id,
            description=f"SSO login for {record.user.email}",
        )
        data = {
            "access": encrypt_token(str(refresh.access_token)),
            "refresh": encrypt_token(str(refresh)),
            "user": UserSerializer(record.user).data,
        }
        return success_response(
            data=data,
            message="SSO login successful",
            request=request,
        )
