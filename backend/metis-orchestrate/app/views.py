from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from common_utils.api.responses import success_response

from app.models import SampleItem
from app.serializers import SampleItemSerializer


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return success_response(
        data={"service": "metis-orchestrate"},
        message="ok",
        request=request,
    )


class SampleItemViewSet(viewsets.ModelViewSet):
    queryset = SampleItem.objects.all()
    serializer_class = SampleItemSerializer
