def get_user_email_fr_request(request):
    if request is None:
        return None
    user = getattr(request, "user", None)
    if user and getattr(user, "is_authenticated", False):
        return getattr(user, "email", None) or getattr(user, "username", None)
    return request.headers.get("X-User-Email") if hasattr(request, "headers") else None
