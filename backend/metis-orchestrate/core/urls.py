from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny

from app.views import health_check
from core import settings

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check),
    path(
        f"{settings.API_PREFIX}/schema/",
        SpectacularAPIView.as_view(permission_classes=[AllowAny]),
        name="api-schema",
    ),
    path(
        f"{settings.API_PREFIX}/swagger/",
        SpectacularSwaggerView.as_view(
            url_name="api-schema",
            permission_classes=[AllowAny],
        ),
        name="api-swagger-ui",
    ),
    path(f"{settings.API_PREFIX}/", include("identity.urls")),
    path(f"{settings.SERVICE_BASE_PATH}/", include("app.urls")),
]
