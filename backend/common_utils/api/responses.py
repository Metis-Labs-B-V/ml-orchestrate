from rest_framework.response import Response

from .status import ApiStatus


def _request_id_from(request):
    if request is None:
        return None
    return getattr(request, "request_id", None) or request.headers.get(
        "X-Request-Id", None
    )


def success_response(data=None, message="Success", status=200, request=None):
    return Response(
        {
            "status": ApiStatus.SUCCESS,
            "message": message,
            "data": data,
            "errors": None,
            "request_id": _request_id_from(request),
        },
        status=status,
    )


def error_response(errors=None, message="Error", status=400, request=None):
    return Response(
        {
            "status": ApiStatus.ERROR,
            "message": message,
            "data": None,
            "errors": errors,
            "request_id": _request_id_from(request),
        },
        status=status,
    )
