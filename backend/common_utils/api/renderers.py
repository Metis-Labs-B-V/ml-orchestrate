from rest_framework.renderers import JSONRenderer

from .status import ApiStatus


class StandardJSONRenderer(JSONRenderer):
    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = renderer_context.get("response") if renderer_context else None
        request = renderer_context.get("request") if renderer_context else None
        status_code = getattr(response, "status_code", 200)
        if data is None:
            wrapped = {
                "status": ApiStatus.SUCCESS if status_code < 400 else ApiStatus.ERROR,
                "message": "Success" if status_code < 400 else "Error",
                "data": None,
                "errors": None if status_code < 400 else data,
                "request_id": getattr(request, "request_id", None)
                if request
                else None,
            }
            return super().render(wrapped, accepted_media_type, renderer_context)

        if isinstance(data, dict) and {"status", "message", "data", "errors"}.issubset(
            data.keys()
        ):
            return super().render(data, accepted_media_type, renderer_context)

        wrapped = {
            "status": ApiStatus.SUCCESS if status_code < 400 else ApiStatus.ERROR,
            "message": "Success" if status_code < 400 else "Error",
            "data": data if status_code < 400 else None,
            "errors": None if status_code < 400 else data,
            "request_id": getattr(request, "request_id", None) if request else None,
        }
        return super().render(wrapped, accepted_media_type, renderer_context)
