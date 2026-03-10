from datetime import timedelta
from pathlib import Path
import os
import sys
from urllib.parse import parse_qs, urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR.parent
sys.path.append(str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env")


def env_list(key, default=""):
    value = os.getenv(key, default)
    return [item.strip() for item in value.split(",") if item.strip()]


# def parse_database_url(database_url):
#     parsed = urlparse(database_url)
#     if parsed.scheme not in {"postgres", "postgresql"}:
#         return None
#     query = parse_qs(parsed.query)
#     options = {}
#     sslmode = query.get("sslmode", [None])[0]
#     if sslmode:
#         options["sslmode"] = sslmode
#     channel_binding = query.get("channel_binding", [None])[0]
#     if channel_binding:
#         options["channel_binding"] = channel_binding
#     config = {
#         "ENGINE": "django.db.backends.postgresql",
#         "NAME": parsed.path.lstrip("/"),
#         "USER": parsed.username or "",
#         "PASSWORD": parsed.password or "",
#         "HOST": parsed.hostname or "",
#         "PORT": str(parsed.port or ""),
#     }
#     if options:
#         config["OPTIONS"] = options
#     return config


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "unsafe-service1")
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "drf_spectacular",
    "rest_framework_simplejwt.token_blacklist",
    "app",
    "identity",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "common_utils.middleware.request_id.RequestIdMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "common_utils.middleware.threadlocal.ThreadLocalMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "core.wsgi.application"

#DATABASE_URL = os.getenv("DATABASE_URL", "")
# DATABASES = {
#     "default": parse_database_url(DATABASE_URL)
#     or {
#         "ENGINE": "django.db.backends.sqlite3",
#         "NAME": BASE_DIR / "db.sqlite3",
#     }
# }

# Database
# https://docs.djangoproject.com/en/4.2/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME'),
        'USER': os.getenv('DB_USER'),
        'PASSWORD': os.getenv('DB_PASSWORD'),
        'HOST': os.getenv('DB_HOST'),
        'PORT': os.getenv('DB_PORT'),
        'CONN_MAX_AGE' : 60
    }
}

db_options = {}
db_ssl_mode = os.getenv("DB_SSL_MODE")
db_channel_binding = os.getenv("DB_CHANNEL_BINDING")
if db_ssl_mode:
    db_options["sslmode"] = db_ssl_mode
if db_channel_binding:
    db_options["channel_binding"] = db_channel_binding
if db_options:
    DATABASES["default"]["OPTIONS"] = db_options

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

API_PREFIX = os.getenv("API_PREFIX", "api/v1")
SERVICE_BASE_PATH = os.getenv(
    "SERVICE1_BASE_PATH", f"{API_PREFIX}/metis-orchestrate"
)
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
AUTH_USER_MODEL = "identity.User"
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")
RESET_TOKEN_TTL_MINUTES = int(os.getenv("RESET_TOKEN_TTL_MINUTES", "60"))
MFA_TOKEN_TTL_MINUTES = int(os.getenv("MFA_TOKEN_TTL_MINUTES", "5"))
SSO_STATE_TTL_MINUTES = int(os.getenv("SSO_STATE_TTL_MINUTES", "10"))
SSO_LOGIN_TOKEN_TTL_MINUTES = int(os.getenv("SSO_LOGIN_TOKEN_TTL_MINUTES", "5"))


REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "identity.authentication.JWEJWTAuthentication",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "common_utils.api.renderers.StandardJSONRenderer",
    ],
    "DEFAULT_PAGINATION_CLASS": "common_utils.api.pagination.StandardPageNumberPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "common_utils.api.exceptions.standard_exception_handler",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Metis Orchestrate API",
    "DESCRIPTION": "OpenAPI schema for identity and orchestrate backend endpoints.",
    "VERSION": "1.0.0",
    "SCHEMA_PATH_PREFIX": rf"/{API_PREFIX}|/{SERVICE_BASE_PATH}",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=int(os.getenv("JWT_ACCESS_TTL_MINUTES", "30"))
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=int(os.getenv("JWT_REFRESH_TTL_DAYS", "7"))
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

JWE_ENABLED = os.getenv("JWE_ENABLED", "true").lower() in ("1", "true", "yes")
JWE_SECRET = os.getenv("JWE_SECRET", "")
ORCHESTRATE_DEFAULT_POLL_INTERVAL_MINUTES = int(
    os.getenv("ORCHESTRATE_DEFAULT_POLL_INTERVAL_MINUTES", "15")
)
ORCHESTRATE_RUN_RETENTION_DAYS = int(os.getenv("ORCHESTRATE_RUN_RETENTION_DAYS", "30"))
ORCHESTRATE_ALLOW_CYCLES = os.getenv("ORCHESTRATE_ALLOW_CYCLES", "false").lower() in (
    "1",
    "true",
    "yes",
)
JIRA_API_TIMEOUT_SECONDS = int(os.getenv("JIRA_API_TIMEOUT_SECONDS", "30"))
ORCHESTRATE_HTTP_TIMEOUT_SECONDS = int(os.getenv("ORCHESTRATE_HTTP_TIMEOUT_SECONDS", "30"))
ORCHESTRATE_EMAIL_TIMEOUT_SECONDS = int(
    os.getenv("ORCHESTRATE_EMAIL_TIMEOUT_SECONDS", str(ORCHESTRATE_HTTP_TIMEOUT_SECONDS))
)
ORCHESTRATE_SECRET_ENCRYPTION_ENABLED = os.getenv(
    "ORCHESTRATE_SECRET_ENCRYPTION_ENABLED", "false"
).lower() in ("1", "true", "yes")
ORCHESTRATE_SECRET_ENCRYPTION_KEY = os.getenv("ORCHESTRATE_SECRET_ENCRYPTION_KEY", "")
ORCHESTRATE_SCHEDULE_SCAN_INTERVAL_SECONDS = int(
    os.getenv("ORCHESTRATE_SCHEDULE_SCAN_INTERVAL_SECONDS", "60")
)
ORCHESTRATE_STALE_QUEUED_RUN_SECONDS = int(
    os.getenv("ORCHESTRATE_STALE_QUEUED_RUN_SECONDS", "1800")
)
ORCHESTRATE_STALE_RUNNING_RUN_SECONDS = int(
    os.getenv("ORCHESTRATE_STALE_RUNNING_RUN_SECONDS", "900")
)
JIRA_OAUTH_AUTHORIZE_URL = os.getenv(
    "JIRA_OAUTH_AUTHORIZE_URL", "https://auth.atlassian.com/authorize"
)
JIRA_OAUTH_TOKEN_URL = os.getenv(
    "JIRA_OAUTH_TOKEN_URL", "https://auth.atlassian.com/oauth/token"
)
JIRA_OAUTH_ACCESSIBLE_RESOURCES_URL = os.getenv(
    "JIRA_OAUTH_ACCESSIBLE_RESOURCES_URL",
    "https://api.atlassian.com/oauth/token/accessible-resources",
)
JIRA_OAUTH_CLIENT_ID = os.getenv("JIRA_OAUTH_CLIENT_ID", "")
JIRA_OAUTH_CLIENT_SECRET = os.getenv("JIRA_OAUTH_CLIENT_SECRET", "")
JIRA_OAUTH_REDIRECT_URI = os.getenv("JIRA_OAUTH_REDIRECT_URI", "")
JIRA_OAUTH_SCOPES = env_list(
    "JIRA_OAUTH_SCOPES",
    "read:jira-user,read:jira-work,write:jira-work,offline_access",
)
JENKINS_OAUTH_AUTHORIZE_URL = os.getenv("JENKINS_OAUTH_AUTHORIZE_URL", "")
JENKINS_OAUTH_TOKEN_URL = os.getenv("JENKINS_OAUTH_TOKEN_URL", "")
JENKINS_OAUTH_CLIENT_ID = os.getenv("JENKINS_OAUTH_CLIENT_ID", "")
JENKINS_OAUTH_CLIENT_SECRET = os.getenv("JENKINS_OAUTH_CLIENT_SECRET", "")
JENKINS_OAUTH_REDIRECT_URI = os.getenv("JENKINS_OAUTH_REDIRECT_URI", "")
JENKINS_OAUTH_SCOPES = env_list("JENKINS_OAUTH_SCOPES", "")

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/1")
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() in (
    "1",
    "true",
    "yes",
)
CELERY_WORKER_CONCURRENCY = int(os.getenv("CELERY_WORKER_CONCURRENCY", "2"))
CELERY_TASK_TIME_LIMIT = int(os.getenv("CELERY_TASK_TIME_LIMIT", "300"))
CELERY_TASK_SOFT_TIME_LIMIT = int(os.getenv("CELERY_TASK_SOFT_TIME_LIMIT", "270"))
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_ACKS_LATE = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
