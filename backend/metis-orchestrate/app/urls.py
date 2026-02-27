from django.urls import include, path
from rest_framework.routers import DefaultRouter

from app.views import SampleItemViewSet

router = DefaultRouter()
router.register(r"items", SampleItemViewSet, basename="sample-item")

urlpatterns = [
    path("", include(router.urls)),
]
