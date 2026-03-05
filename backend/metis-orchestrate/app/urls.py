from django.urls import include, path
from rest_framework.routers import DefaultRouter

from app.views import (
    ConnectionViewSet,
    IntegrationCatalogView,
    JiraOAuthExchangeView,
    JiraOAuthStartView,
    JenkinsOAuthExchangeView,
    JenkinsOAuthStartView,
    RunViewSet,
    SampleItemViewSet,
    ScenarioScheduleDetailView,
    ScenarioScheduleListCreateView,
    ScenarioViewSet,
)

router = DefaultRouter()
router.register(r"items", SampleItemViewSet, basename="sample-item")
router.register(r"scenarios", ScenarioViewSet, basename="scenario")
router.register(r"connections", ConnectionViewSet, basename="connection")
router.register(r"runs", RunViewSet, basename="run")

urlpatterns = [
    path("integrations/catalog/", IntegrationCatalogView.as_view(), name="integration-catalog"),
    path(
        "integrations/jira/oauth/start/",
        JiraOAuthStartView.as_view(),
        name="integration-jira-oauth-start",
    ),
    path(
        "integrations/jira/oauth/exchange/",
        JiraOAuthExchangeView.as_view(),
        name="integration-jira-oauth-exchange",
    ),
    path(
        "integrations/jenkins/oauth/start/",
        JenkinsOAuthStartView.as_view(),
        name="integration-jenkins-oauth-start",
    ),
    path(
        "integrations/jenkins/oauth/exchange/",
        JenkinsOAuthExchangeView.as_view(),
        name="integration-jenkins-oauth-exchange",
    ),
    path(
        "scenarios/<int:scenario_id>/schedules/",
        ScenarioScheduleListCreateView.as_view(),
        name="scenario-schedule-list-create",
    ),
    path(
        "scenarios/<int:scenario_id>/schedules/<int:schedule_id>/",
        ScenarioScheduleDetailView.as_view(),
        name="scenario-schedule-detail",
    ),
    path("", include(router.urls)),
]
