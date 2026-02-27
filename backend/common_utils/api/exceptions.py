from rest_framework.views import exception_handler

from .responses import error_response


def standard_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return response
    request = context.get("request") if context else None
    detail = response.data
    return error_response(errors=detail, message="Error", status=response.status_code, request=request)
