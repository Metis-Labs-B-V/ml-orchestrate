def tenant_signup_password_validations(email, password, confirm_password):
    if not password:
        return password, False, "Password is required."
    if not confirm_password:
        return password, False, "Confirm password is required."
    if password != confirm_password:
        return password, False, "Passwords do not match."
    if len(password) < 12:
        return password, False, "Password must be at least 12 characters long."
    if len(password) > 64:
        return password, False, "Password cannot exceed 64 characters."
    if password == email:
        return password, False, "Password cannot be the same as email."
    if not any(char.isdigit() for char in password):
        return password, False, "Password must contain at least one number."
    if not any(char.isupper() for char in password):
        return password, False, "Password must contain at least one uppercase letter."
    if not any(char.islower() for char in password):
        return password, False, "Password must contain at least one lowercase letter."
    if not any(char in "!@#$%^&*()_+-=[]{}|;':\",.<>/?`~" for char in password):
        return password, False, "Password must contain at least one special character."
    return password, True, None


def tenant_login_password_validations(email, password, confirm_password):
    if not password:
        return password, False, "Password is required."
    if not confirm_password:
        return password, False, "Confirm password is required."
    if password != confirm_password:
        return password, False, "Passwords do not match."
    if len(password) < 12:
        return password, False, "Password must be at least 12 characters long."
    if len(password) > 64:
        return password, False, "Password cannot exceed 64 characters."
    if password == email:
        return password, False, "Password cannot be the same as email."
    if not any(char.isdigit() for char in password):
        return password, False, "Password must contain at least one number."
    if not any(char.isupper() for char in password):
        return password, False, "Password must contain at least one uppercase letter."
    if not any(char.islower() for char in password):
        return password, False, "Password must contain at least one lowercase letter."
    if not any(char in "!@#$%^&*()_+-=[]{}|;':\",.<>/?`~" for char in password):
        return password, False, "Password must contain at least one special character."
    return password, True, None