from django.contrib import admin
from django.urls import include, path

from app.views import health_check
from core import settings

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check),
    path(f"{settings.API_PREFIX}/", include("identity.urls")),
    path(f"{settings.SERVICE_BASE_PATH}/", include("app.urls")),
]
