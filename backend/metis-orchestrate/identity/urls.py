from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ForgotPasswordView,
    ActivityLogViewSet,
    CustomerRoleListView,
    CustomerUserDetailView,
    CustomerUserRoleAssignView,
    CustomerUserView,
    CustomerViewSet,
    ImpersonateUserView,
    ImpersonationLogViewSet,
    ImpersonationUserListView,
    LoginView,
    LogoutView,
    MeView,
    OnboardCustomerView,
    MfaConfirmView,
    MfaDisableView,
    MfaSetupView,
    MfaToggleView,
    MfaVerifyLoginView,
    OnboardTenantView,
    PermissionViewSet,
    RefreshView,
    ResetPasswordView,
    RoleViewSet,
    SeedIdentityView,
    SignupView,
    SsoCallbackView,
    SsoExchangeView,
    SsoStartView,
    SsoToggleView,
    TokenPayloadView,
    TenantUserView,
    TenantUserDetailView,
    TenantRoleListView,
    TenantViewSet,
    UserRoleAssignView,
    VerifyTenantEmailView,
    VerifyLoginOTPView,
    CreateCustomerView,
    ChangePasswordView
)

router = DefaultRouter()
router.register(r"tenants", TenantViewSet, basename="tenant")
router.register(r"customers", CustomerViewSet, basename="customer")
router.register(r"roles", RoleViewSet, basename="role")
router.register(r"permissions", PermissionViewSet, basename="permission")
router.register(r"impersonation/logs", ImpersonationLogViewSet, basename="impersonation-log")
router.register(r"activity/logs", ActivityLogViewSet, basename="activity-log")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/signup/", SignupView.as_view(), name="auth-signup"),
    path("auth/refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/forgot-password/", ForgotPasswordView.as_view(), name="auth-forgot-password"),
    path("auth/reset-password/", ResetPasswordView.as_view(), name="auth-reset-password"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("auth/onboard/", OnboardTenantView.as_view(), name="auth-onboard"),
    path("auth/onboard-customer/", OnboardCustomerView.as_view(), name="auth-onboard-customer"),
    path("auth/create-customer/", CreateCustomerView.as_view(), name="create-customer"),
    path("auth/seed-identity/", SeedIdentityView.as_view(), name="auth-seed-identity"),
    path("auth/impersonation/users/", ImpersonationUserListView.as_view(), name="auth-impersonation-users"),
    path("auth/impersonate/", ImpersonateUserView.as_view(), name="auth-impersonate"),
    path("auth/mfa/setup/", MfaSetupView.as_view(), name="auth-mfa-setup"),
    path("auth/mfa/confirm/", MfaConfirmView.as_view(), name="auth-mfa-confirm"),
    path("auth/mfa/disable/", MfaDisableView.as_view(), name="auth-mfa-disable"),
    path("auth/mfa/verify-login/", MfaVerifyLoginView.as_view(), name="auth-mfa-verify-login"),
    path("auth/mfa/", MfaToggleView.as_view(), name="auth-mfa"),
    path("auth/sso/<str:provider>/start/", SsoStartView.as_view(), name="auth-sso-start"),
    path("auth/sso/<str:provider>/callback/", SsoCallbackView.as_view(), name="auth-sso-callback"),
    path("auth/sso/exchange/", SsoExchangeView.as_view(), name="auth-sso-exchange"),
    path("auth/sso/", SsoToggleView.as_view(), name="auth-sso"),
    path("auth/token/payload/", TokenPayloadView.as_view(), name="auth-token-payload"),
    path("auth/verify-login-otp/", VerifyLoginOTPView.as_view(), name="auth-verify-login-otp"),
    path("tenants/<int:tenant_id>/users/", TenantUserView.as_view(), name="tenant-users"),
    path("customers/<int:customer_id>/users/", CustomerUserView.as_view(), name="customer-users"),
    path("tenant/verify-email/", VerifyTenantEmailView.as_view(), name="tenant-verify-email"),

    path(
        "tenants/<int:tenant_id>/users/<int:user_id>/",
        TenantUserDetailView.as_view(),
        name="tenant-user-detail",
    ),
    path(
        "customers/<int:customer_id>/users/<int:user_id>/",
        CustomerUserDetailView.as_view(),
        name="customer-user-detail",
    ),
    path(
        "tenants/<int:tenant_id>/users/<int:user_id>/roles/",
        UserRoleAssignView.as_view(),
        name="tenant-user-roles",
    ),
    path(
        "customers/<int:customer_id>/users/<int:user_id>/roles/",
        CustomerUserRoleAssignView.as_view(),
        name="customer-user-roles",
    ),
    path("tenants/<int:tenant_id>/roles/", TenantRoleListView.as_view(), name="tenant-roles"),
    path("customers/<int:customer_id>/roles/", CustomerRoleListView.as_view(), name="customer-roles"),
    path("", include(router.urls)),
]
