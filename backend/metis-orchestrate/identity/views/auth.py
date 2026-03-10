"""Authentication and onboarding views."""

import base64
from datetime import timedelta
import json
import os
import token
import pyotp
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from common_utils.api.responses import error_response, success_response
from ..activity_log import collect_changes, log_activity
from common_utils.email import reset_password_email, send_email
from ..jwe import decrypt_token, encrypt_token
from ..openapi_serializers import (
    ChangePasswordRequestSerializer,
    LoginRequestSerializer,
    LogoutRequestSerializer,
    OnboardCustomerRequestSerializer,
    OnboardTenantRequestSerializer,
    RefreshRequestSerializer,
    TokenPayloadRequestSerializer,
    VerifyLoginOtpRequestSerializer,
)
from ..permissions import HasAdminAccess, IsSuperAdmin, user_can_manage_tenant
from identity.utils import create_roles_and_permissions_for_customer

from identity.utils.prepare_and_send_emails import (
    send_tenant_signup_verification_email, 
    send_one_time_password_email, 
    send_user_account_setup_email
)


from ..models import (
    LoginOTP, 
    PasswordResetToken, 
    Customer,
    Tenant, 
    User, 
    UserCustomer,
    UserTenant, 
    EmailVerificationToken, 
    UserTypeChoices
)

from ..serializers import (
    ForgotPasswordSerializer,
    LoginSerializer,
    ResetPasswordSerializer,
    SignupSerializer,
    CustomerSerializer,
    TenantSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
    VerifyEmailSerializer,
    UserInviteSerializer,
)

from identity.utils import (
    tenant_signup_email_validations, 
    tenant_signup_password_validations, 
    tenant_login_email_validations, 
    tenant_login_password_validations,
    create_roles_and_permissions_for_tenant,
    validate_email_address
)


class LoginView(APIView):
    permission_classes = [AllowAny]
    serializer_class = LoginRequestSerializer

    @extend_schema(request=LoginRequestSerializer)
    def post(self, request):
        payload_serializer = LoginRequestSerializer(data=request.data)
        if not payload_serializer.is_valid():
            return error_response(
                errors=payload_serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload = payload_serializer.validated_data

        email, is_email_valid, email_error = tenant_login_email_validations(payload.get("email"))
        print("is_email_valid ", is_email_valid)
        if not is_email_valid:
            return error_response(
                errors={"email": [email_error]},
                message=email_error,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        
        password, is_password_valid, password_error = tenant_login_password_validations(
            payload.get("email"),
            payload.get("password"),
            payload.get("password"),
        )
        if not is_password_valid:
            return error_response(
                errors={"password": [password_error]},
                message=password_error,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        user = User.objects.filter(email=email).first()

        if not user or not user.check_password(password):
            return error_response(
                errors={"password": ["Incorrect email or password."]},
                message="Incorrect email or password.",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        serializer = LoginSerializer(
            data={"email": email, "password": password},
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.last_login = timezone.now()
        user.last_login_ip = request.META.get("REMOTE_ADDR")
        user.save(update_fields=["last_login", "last_login_ip"])
        if user.mfa_enabled:
            token = AccessToken.for_user(user)
            token["email"] = user.email
            token.set_exp(
                from_time=timezone.now(),
                lifetime=timedelta(
                    minutes=int(os.getenv("MFA_TOKEN_TTL_MINUTES", "5"))
                ),
            )
            token["mfa_pending"] = True
            data = {
                "mfa_required": True,
                "mfa_token": encrypt_token(str(token)),
                "user": UserSerializer(user).data,
            }
            return success_response(data=data, message="MFA required", request=request)
        
        if user.otp_enabled:
            send_one_time_password_email(user)
            data = {"otp_required": True, "user": UserSerializer(user).data}
            return success_response(data=data, message="OTP sent to email", request=request)

        refresh = RefreshToken.for_user(user)
        refresh["email"] = user.email
        refresh["tenant_id"] = user.tenants.first().tenant_id if user.tenants.exists() else None
        log_activity(
            actor=user,
            module="auth",
            action="login",
            request=request,
            entity_type="user",
            entity_id=user.id,
            description=f"User logged in: {user.email}",
        )
        data = {
            "access": encrypt_token(str(refresh.access_token)),
            "refresh": encrypt_token(str(refresh)),
            "user": UserSerializer(user).data,
        }
        return success_response(data=data, message="Login successful", request=request)


class RefreshView(APIView):
    permission_classes = [AllowAny]
    serializer_class = RefreshRequestSerializer

    @extend_schema(request=RefreshRequestSerializer)
    def post(self, request):
        payload_serializer = RefreshRequestSerializer(data=request.data)
        if not payload_serializer.is_valid():
            return error_response(
                errors=payload_serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload = payload_serializer.validated_data.copy()
        payload["refresh"] = decrypt_token(payload["refresh"])
        serializer = TokenRefreshSerializer(data=payload)
        if not serializer.is_valid():
            return error_response(
                errors=serializer.errors,
                message="Invalid refresh token",
                status=status.HTTP_401_UNAUTHORIZED,
                request=request,
            )
        data = serializer.validated_data
        if data.get("access"):
            data["access"] = encrypt_token(data["access"])
        if data.get("refresh"):
            data["refresh"] = encrypt_token(data["refresh"])
        return success_response(data=data, message="Token refreshed", request=request)


class TokenPayloadView(APIView):
    permission_classes = [IsAuthenticated, HasAdminAccess]
    serializer_class = TokenPayloadRequestSerializer

    @extend_schema(request=TokenPayloadRequestSerializer)
    def post(self, request):
        payload_serializer = TokenPayloadRequestSerializer(data=request.data)
        if not payload_serializer.is_valid():
            return error_response(
                errors=payload_serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload_data = payload_serializer.validated_data
        token = payload_data.get("token") or payload_data.get("access") or payload_data.get(
            "refresh"
        )
        try:
            jwt = decrypt_token(token)
            payload_b64 = jwt.split(".")[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        except Exception:
            return error_response(
                errors={"token": ["Invalid token"]},
                message="Invalid token",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        return success_response(data=payload, request=request)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = LogoutRequestSerializer

    @extend_schema(request=LogoutRequestSerializer)
    def post(self, request):
        payload_serializer = LogoutRequestSerializer(data=request.data)
        if not payload_serializer.is_valid():
            return error_response(
                errors=payload_serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        refresh_token = payload_serializer.validated_data["refresh"]
        refresh_token = decrypt_token(refresh_token)
        try:
            refresh = RefreshToken(refresh_token)
            refresh.blacklist()
            log_activity(
                actor=request.user,
                module="auth",
                action="logout",
                request=request,
                entity_type="user",
                entity_id=request.user.id,
                description=f"User logged out: {request.user.email}",
            )
            return success_response(message="Logged out", request=request)
        except Exception:
            return error_response(
                errors={"refresh": ["Invalid refresh token"]},
                message="Invalid refresh token",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserUpdateSerializer

    def get(self, request):
        return success_response(data=UserSerializer(request.user).data, request=request)

    @extend_schema(request=UserUpdateSerializer)
    def patch(self, request):
        serializer = UserUpdateSerializer(
            instance=request.user, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        changes = collect_changes(request.user, serializer.validated_data)
        serializer.save()
        metadata = {"fields": list(request.data.keys())}
        if changes:
            metadata["changes"] = changes
        log_activity(
            actor=request.user,
            module="settings",
            action="update",
            request=request,
            entity_type="user",
            entity_id=request.user.id,
            description=f"Updated profile for {request.user.email}",
            metadata=metadata,
        )
        return success_response(
            data=UserSerializer(request.user).data,
            message="Profile updated",
            request=request,
        )


class OnboardTenantView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    serializer_class = OnboardTenantRequestSerializer

    @transaction.atomic
    @extend_schema(request=OnboardTenantRequestSerializer)
    def post(self, request):
        payload_serializer = OnboardTenantRequestSerializer(data=request.data)
        if not payload_serializer.is_valid():
            return error_response(
                errors=payload_serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload = payload_serializer.validated_data
        tenant_data = dict(payload.get("tenant") or {})
        owner_data = dict(payload.get("owner") or {})

        if not tenant_data or not owner_data:
            return error_response(
                errors={"detail": "tenant and owner data required"},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        owner_data["email"], is_email_valid, error = tenant_signup_email_validations(owner_data.get("email"))
        
        if not is_email_valid:
            return error_response(
                errors={"email": [error]},
                message=error,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        
        owner_data["password"], is_password_valid, error = tenant_signup_password_validations(owner_data["email"], owner_data.get("password"), owner_data.get("password"))
        
        if not is_password_valid:
            return error_response(
                errors={"password": [error]},
                message=error,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        owner_data["user_type"] = UserTypeChoices.TENANT.value
        owner_serializer = UserCreateSerializer(data=owner_data)
        owner_serializer.is_valid(raise_exception=True)
        owner = owner_serializer.save()
        tenant_serializer = TenantSerializer(data=tenant_data)
        tenant_serializer.is_valid(raise_exception=True)
        tenant = tenant_serializer.save(owner=owner)
        UserTenant.objects.create(user=owner, tenant=tenant, is_owner=True)
        
        # disabled
        create_roles_and_permissions_for_tenant(tenant, owner)
        
        send_tenant_signup_verification_email(user=owner)


        log_activity(
            actor=request.user,
            module="tenant",
            action="create",
            request=request,
            tenant=tenant,
            entity_type="tenant",
            entity_id=tenant.id,
            description=f"Onboarded tenant {tenant.name}",
            metadata={"tenant_name": tenant.name, "owner_email": owner.email},
        )
        log_activity(
            actor=request.user,
            module="user",
            action="create",
            request=request,
            tenant=tenant,
            target_user=owner,
            entity_type="user",
            entity_id=owner.id,
            description=f"Created tenant owner {owner.email}",
            metadata={"user_email": owner.email},
        )
        log_activity(
            actor=request.user,
            module="user",
            action="create",
            request=request,
            tenant=tenant,
            target_user=owner,
            entity_type="user",
            entity_id=owner.id,
            description=f"Sent verification email to {owner.email}",
            metadata={"user_email": owner.email},
        )
        log_activity(
            actor=request.user,
            module="user",
            action="create",
            request=request,
            tenant=tenant,
            target_user=owner,
            entity_type="user",
            entity_id=owner.id,
            description=f"Created roles and permissions for tenant {tenant.name}",
            metadata={"tenant_name": tenant.name},
        )
        log_activity(
            actor=request.user,
            module="user",
            action="create",
            request=request,
            tenant=tenant,
            target_user=owner,
            entity_type="user",
            entity_id=owner.id,
            description=f"Set role as owner to {owner.email}",
            metadata={"user_email": owner.email},
        )
        return success_response(
            data={"tenant": TenantSerializer(tenant).data, "owner": UserSerializer(owner).data},
            message="Tenant onboarded",
            request=request,
        )


class OnboardCustomerView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OnboardCustomerRequestSerializer

    @transaction.atomic
    @extend_schema(request=OnboardCustomerRequestSerializer)
    def post(self, request):
        payload_serializer = OnboardCustomerRequestSerializer(data=request.data)
        if not payload_serializer.is_valid():
            return error_response(
                errors=payload_serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload = payload_serializer.validated_data
        customer_data = dict(payload.get("customer") or {})
        owner_data = dict(payload.get("owner") or {})
        tenant_id = (
            payload.get("tenant_id")
            or (customer_data or {}).get("tenant_id")
            or (customer_data or {}).get("tenant")
        )

        if not tenant_id:
            if request.user.is_superuser:
                return error_response(
                    errors={"tenant_id": ["tenant_id is required to create a client."]},
                    message="Invalid payload",
                    status=status.HTTP_400_BAD_REQUEST,
                    request=request,
                )
            tenant_ids = list(
                UserTenant.objects.filter(user=request.user, is_active=True).values_list(
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

        if not user_can_manage_tenant(request.user, tenant_id):
            return error_response(
                errors={"detail": "Insufficient permissions for this tenant."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
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

        if not customer_data or not owner_data:
            return error_response(
                errors={"detail": "customer and owner data required"},
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        owner_data["email"], is_email_valid, error = tenant_signup_email_validations(owner_data.get("email"))
        if not is_email_valid:
            return error_response(
                errors={"email": [error]},
                message=error,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        owner_data["user_type"] = UserTypeChoices.CUSTOMER.value
        owner_data["password"] = None
        owner_serializer = UserInviteSerializer(data=owner_data)
        owner_serializer.is_valid(raise_exception=True)
        owner = owner_serializer.save()
        customer_serializer = CustomerSerializer(data=customer_data)
        customer_serializer.is_valid(raise_exception=True)
        customer = customer_serializer.save(owner=owner, tenant=tenant)
        UserCustomer.objects.create(user=owner, customer=customer, is_owner=True)

        #disabled
        create_roles_and_permissions_for_customer(customer, owner)

        send_user_account_setup_email(user=owner)

        log_activity(
            actor=request.user,
            module="customer",
            action="create",
            request=request,
            entity_type="customer",
            entity_id=customer.id,
            description=f"Onboarded customer {customer.name}",
                metadata={
                    "customer_name": customer.name,
                    "owner_email": owner.email,
                    "tenant_id": tenant_id,
                },
        )
        log_activity(
            actor=request.user,
            module="user",
            action="create",
            request=request,
            target_user=owner,
            entity_type="user",
            entity_id=owner.id,
            description=f"Created customer owner {owner.email}",
                metadata={
                    "user_email": owner.email,
                    "customer_id": customer.id,
                    "tenant_id": tenant_id,
                },
        )
        log_activity(
            actor=request.user,
            module="user",
            action="create",
            request=request,
            target_user=owner,
            entity_type="user",
            entity_id=owner.id,
            description=f"Sent verification email to {owner.email}",
                metadata={
                    "user_email": owner.email,
                    "customer_id": customer.id,
                    "tenant_id": tenant_id,
                },
        )
        return success_response(
            data={
                "customer": CustomerSerializer(customer).data,
                "owner": UserSerializer(owner).data,
            },
            message="Customer onboarded",
            request=request,
        )



class CreateCustomerView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerSerializer

    @transaction.atomic
    @extend_schema(request=CustomerSerializer)
    def post(self, request):
        customer_data = request.data


        if customer_data.get("email") and not validate_email_address(customer_data.get("email")):

            return error_response(
                errors={"email": ["Enter a valid email address."]},
                message="Enter a valid email address.",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        tenant_id = (
            request.data.get("tenant_id")
            or (customer_data or {}).get("tenant_id")
            or (customer_data or {}).get("tenant")
        )


        if not user_can_manage_tenant(request.user, tenant_id):
            return error_response(
                errors={"detail": "Insufficient permissions for this tenant."},
                message="Forbidden",
                status=status.HTTP_403_FORBIDDEN,
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
        
        customer_serializer = CustomerSerializer(data=customer_data)
        customer_serializer.is_valid(raise_exception=True)
        customer = customer_serializer.save(tenant=tenant)
        create_roles_and_permissions_for_customer(customer, None)

        log_activity(
            actor=request.user,
            module="customer",
            action="create",
            request=request,
            entity_type="customer",
            entity_id=customer.id,
            description=f"Onboarded customer {customer.name}",
                metadata={
                    "customer_name": customer.name,
                    "tenant_id": tenant_id,
                },
        )

        return success_response(
            data=CustomerSerializer(customer).data,
            message="Customer onboarded",
            request=request,
        )
        




class SignupView(APIView):
    permission_classes = [AllowAny]
    serializer_class = SignupSerializer

    @extend_schema(request=SignupSerializer)
    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        log_activity(
            actor=user,
            module="auth",
            action="signup",
            request=request,
            entity_type="user",
            entity_id=user.id,
            description=f"User signed up: {user.email}",
        )
        data = {
            "access": encrypt_token(str(refresh.access_token)),
            "refresh": encrypt_token(str(refresh)),
            "user": UserSerializer(user).data,
        }
        return success_response(
            data=data, message="Account created", status=status.HTTP_201_CREATED, request=request
        )


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    serializer_class = ForgotPasswordSerializer

    @extend_schema(request=ForgotPasswordSerializer)
    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        user = User.objects.filter(email=email).first()
        if user:
            expires_at = timezone.now() + timedelta(
                minutes=int(settings.RESET_TOKEN_TTL_MINUTES)
            )
            reset_token = PasswordResetToken.objects.create(
                user=user,
                token=str(uuid4()),
                expires_at=expires_at,
            )
            reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password?token={reset_token.token}"
            html = reset_password_email(user.first_name, reset_url)
            send_email(user.email, "Reset your password", html)
            log_activity(
                actor=user,
                module="auth",
                action="password_reset_request",
                request=request,
                entity_type="user",
                entity_id=user.id,
                description=f"Password reset requested for {user.email}",
            )
        else:
            return error_response(
                errors={"email": ["Email not found"]},
                message="User with this email does not exist.",
                status=status.HTTP_404_NOT_FOUND,
                request=request,
            )
        return success_response(
            message="Password reset link has been sent.",
            request=request,
        )


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    serializer_class = ResetPasswordSerializer

    @extend_schema(request=ResetPasswordSerializer)
    def post(self, request):
        payload_serializer = ResetPasswordSerializer(data=request.data)
        if not payload_serializer.is_valid():
            return error_response(
                errors=payload_serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload = payload_serializer.validated_data
        token = payload.get("token")
        reset_token = PasswordResetToken.objects.filter(token=token).first()

        if not reset_token :
            return error_response(
                errors={"token": ["Invalid link"]},
                message="Invalid link",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        if reset_token.is_used or reset_token.expires_at < timezone.now():
            return error_response(
                errors={"token": ["Expired link"], "email": reset_token.user.email},
                message="Expired link",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        user = reset_token.user
        password, is_valid, error = tenant_signup_password_validations(
            user.email,
            payload.get("password"),
            payload.get("password"),
        )
        
        if not is_valid:
            return error_response(
                errors={"password": [error]},
                message=error,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        user.set_password(password)
        user.is_verified = True
        user.otp_enabled = True
        user.save(update_fields=["password", "is_verified", "otp_enabled"])
        reset_token.used_at = timezone.now()
        reset_token.save(update_fields=["used_at"])
        log_activity(
            actor=user,
            module="auth",
            action="password_reset_complete",
            request=request,
            entity_type="user",
            entity_id=user.id,
            description=f"Password reset completed for {user.email}",
        )
        return success_response(message="Password updated", request=request)
    

class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ChangePasswordRequestSerializer

    @extend_schema(request=ChangePasswordRequestSerializer)
    def post(self, request):
        payload_serializer = ChangePasswordRequestSerializer(data=request.data)
        if not payload_serializer.is_valid():
            return error_response(
                errors=payload_serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload = payload_serializer.validated_data
        user = request.user
        current_password = payload.get("current_password")
        
        if not user.check_password(current_password):
            return error_response(
                errors={"current_password": ["Incorrect password."]},
                message="Please enter the correct current password.",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        
        new_password, is_valid, error = tenant_signup_password_validations(
            user.email,
            payload.get("new_password"),
            payload.get("new_password"),
        )
        if not is_valid:
            return error_response(
                errors={"new_password": [error]},
                message=error,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        user.set_password(new_password)
        user.save(update_fields=["password"])

        log_activity(
            actor=user,
            module="auth",
            action="password_reset_complete",
            request=request,
            entity_type="user",
            entity_id=user.id,
            description=f"Password reset completed for {user.email}",
        )

        return success_response(message="Password updated", request=request)
    

class VerifyTenantEmailView(APIView):
    permission_classes = [AllowAny]
    serializer_class = VerifyEmailSerializer


    def _validate_token(self, token):
        if token == None:
            return None, "Token is required."
        if token == "":
            return None, "Token cannot be empty."
        return token, None

    @extend_schema(request=VerifyEmailSerializer)
    def post(self, request):

        token, token_error = self._validate_token(request.data.get("token"))

        if token_error:
            return error_response(
                errors={"token": [token_error]},
                message=token_error,
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["token"]
        verification = EmailVerificationToken.objects.filter(token=token).first()

        if not verification :
            return error_response(
                errors={"token": ["Invalid link"]},
                message="Invalid link",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        if verification.is_used or verification.expires_at < timezone.now():
            return error_response(
                errors={"token": ["Expired link"], "email": verification.user.email},
                message="Expired link",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        
        user = verification.user
        user.is_verified = True
        user.otp_enabled = True
        user.last_login = timezone.now()
        user.last_login_ip = request.META.get("REMOTE_ADDR")
        user.save(update_fields=["is_verified", "otp_enabled", "last_login", "last_login_ip"])
        verification.used_at = timezone.now()
        verification.save(update_fields=["used_at"])

        refresh = RefreshToken.for_user(user)
        
        data = {
            "user": UserSerializer(user).data,
            "access": encrypt_token(str(refresh.access_token)),
            "refresh": encrypt_token(str(refresh)),
        }
        return success_response(
            data=data,
            message="Email verified and user logged in.",
            status=status.HTTP_200_OK,
            request=request,
        )


class VerifyLoginOTPView(APIView):
    permission_classes = [AllowAny]
    serializer_class = VerifyLoginOtpRequestSerializer

    @extend_schema(request=VerifyLoginOtpRequestSerializer)
    def post(self, request):
        payload_serializer = VerifyLoginOtpRequestSerializer(data=request.data)
        if not payload_serializer.is_valid():
            return error_response(
                errors=payload_serializer.errors,
                message="Invalid payload",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        payload = payload_serializer.validated_data

        email = payload.get("email", "")
        password = payload.get("password", "")
        otp = payload.get("otp", "")

        if not otp:
            return error_response(
                errors={"otp": "Invalid or expired OTP."},
                message="Invalid or expired OTP.",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        last_otp = LoginOTP.objects.filter(user__email=email).order_by("-created_at").first()
        
        if not last_otp or last_otp.expires_at < timezone.now() or last_otp.used_at is not None:
            return error_response(
                errors={"otp": ["Invalid or expired OTP."]},
                message="Invalid or expired OTP.",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        
        if last_otp.otp != otp and last_otp.retries >= 5:
            return error_response(
                errors={"otp": ["Too many incorrect attempts. Please request a new OTP."]},
                message="Too many incorrect attempts. Please request a new OTP.",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        elif last_otp.otp != otp:    
            last_otp.retries += 1
            last_otp.save(update_fields=["retries"])
            
            return error_response(
                errors={"otp": ["Incorrect OTP."]},
                message="Incorrect OTP.",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )

        user = last_otp.user
        if not user.check_password(password):
            return error_response(
                errors={"password": ["Incorrect password."]},
                message="Incorrect password.",
                status=status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        
        last_otp.used_at = timezone.now()
        last_otp.save(update_fields=["used_at"])
        

        refresh = RefreshToken.for_user(user)

        data = {
            "user": UserSerializer(user).data,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }

        return success_response(
            data=data,
            message="Logged in successfully.",
            status=status.HTTP_200_OK,
            request=request,
        )
