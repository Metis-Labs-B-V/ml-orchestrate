from identity.models import User
from django.core.validators import validate_email

def validate_email_address(email):
    try:
        validate_email(email)
        print("valid email ", email)
        return True
    except Exception:
        print("invalid email ", email)
        return False

def disposable_email_check(email):
    disposable_domains = {
        # "mailinator.com",
        "10minutemail.com",
        "tempmail.com"
    }
    domain = email.split('@')[-1]
    if domain in disposable_domains:
        return False
    return True


def tenant_signup_email_validations(email):
    email = (email or "").strip().lower()
    if not email:
        return email, False, "Email is required."
    if not validate_email_address(email):
        return email, False, "Enter a valid email address."
    if not disposable_email_check(email):
        return email, False, "Disposable emails not allowed."
    if User.objects.filter(email=email).exists():
        return email, False, "Email already registered."
    return email, True, None


def tenant_login_email_validations(email):
    email = (email or "").strip().lower()
    if not email:
        return email, False, "Email is required."
    if not validate_email_address(email):
        return email, False, "Enter a valid email address."
    if not disposable_email_check(email):
        return email, False, "Disposable emails not allowed."
    if not User.objects.filter(email=email).exists():
        return email, False, "Email not registered."
    if User.objects.filter(email=email, is_active=False).exists():
        return email, False, "Account is inactive."
    if User.objects.filter(email=email, is_verified=False).exists():
        return email, False, "Email not verified."
    return email, True, None