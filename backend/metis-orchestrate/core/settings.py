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
