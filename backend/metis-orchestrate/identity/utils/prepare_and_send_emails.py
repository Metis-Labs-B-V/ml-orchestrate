from common_utils.email.templates import tenant_verification_email, login_otp_email, user_account_setup_email_template
from common_utils.email import send_email, reset_password_email
import os
import random
from uuid import uuid4
from datetime import timedelta
from django.utils import timezone
from core import settings
from identity.models import EmailVerificationToken, LoginOTP, PasswordResetToken, UserTypeChoices

def send_tenant_signup_verification_email(user):
    token = f"{user.email.split('@')[0]}_VERIFICATION_LINK" if settings.DEBUG and user.email.startswith("test__") else str(uuid4())
    ttl_hours = int(os.getenv("EMAIL_VERIFICATION_TOKEN_TTL_HOURS", "24"))
    expires_at = timezone.now() + timedelta(hours=ttl_hours)
    EmailVerificationToken.objects.create(
        user_id=user.id,
        token=token,
        expires_at=expires_at,
    )

    frontend_url = settings.FRONTEND_BASE_URL
    verify_url = f"{frontend_url}/tenant/verify-email?token={token}"
    support_email = os.getenv("SUPPORT_EMAIL", "support@bolify.com")
    html = tenant_verification_email(user.first_name, verify_url, support_email)
    res = send_email(user.email, "Verify your email to activate your Bolify account", html)
    print(f"Sent verification email, result: {res}")
    return res


def send_one_time_password_email(user):
    otp = 999999 if settings.DEBUG and user.email.startswith("test__") else str(random.randint(100000, 999999))
    LoginOTP.objects.create(user=user, otp=otp, expires_at=timezone.now() + timedelta(minutes=10))
    html = login_otp_email(user.first_name, otp)
    send_email(user.email, "Your one-time password for Bolify", html)


def send_password_reset_link(user, subject="Set your password"):
    expires_at = timezone.now() + timedelta(
        minutes=int(getattr(settings, "RESET_TOKEN_TTL_MINUTES", 60))
    )
    token = PasswordResetToken.objects.create(
        user=user,
        token=str(uuid4()),
        expires_at=expires_at,
    )
    reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password?token={token.token}"
    html = reset_password_email(user.first_name, reset_url)
    send_email(user.email, subject, html)
    return token


def send_user_account_setup_email(user):
    expires_at = timezone.now() + timedelta(
        minutes=int(getattr(settings, "ACCOUNT_SETUP_TOKEN_TTL_MINUTES", 1440))
    )
    token = PasswordResetToken.objects.create(
        user=user,
        token=str(uuid4()),
        expires_at=expires_at,
    )
    setup_url = f"{settings.FRONTEND_BASE_URL}/reset-password?token={token.token}"
    
    
    if user.user_type == UserTypeChoices.TENANT.value:
        user_tenant = user.tenants.first()
        client_name = user_tenant.tenant.name if user_tenant else "Bolify"
    elif user.user_type == UserTypeChoices.CUSTOMER.value:
        user_customer = user.customers.first()
        client_name = user_customer.customer.name if user_customer else "Bolify"
    else:
        client_name = "Bolify"

    support_email = os.getenv("SUPPORT_EMAIL", "support@bolify.com")
    html = user_account_setup_email_template(user.first_name, setup_url, client_name, support_email)
    send_email(user.email, "Welcome to Bolify - Set up your account", html)
    return token
