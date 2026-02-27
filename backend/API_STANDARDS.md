# Backend API Standards

This document defines the baseline API contract for all backend services in this repo.
It is aligned to the current Django + DRF implementation in `backend/metis-orchestrate`
and should be treated as the team standard going forward.

## 1) Protocols and Transport

- Protocol: REST over HTTPS only.
- Media type: `application/json` for requests and responses.
- Encoding: UTF-8.
- Authentication: JWT Bearer tokens (SimpleJWT).
- SSO: OAuth2 (Google/Microsoft) with a server-side exchange to JWT.

## 2) Versioning and Base Paths

- API version prefix is configured by `API_PREFIX` in `backend/.env`.
  - Default: `api/v1`.
- Service base path is configured by `SERVICE1_BASE_PATH` (defaults to
  `${API_PREFIX}/metis-orchestrate`).
- Identity endpoints live under the API prefix:
  - `/api/v1/auth/...`
  - `/api/v1/tenants/...`
  - `/api/v1/roles/...`
  - `/api/v1/permissions/...`
- Service resources live under the service base path:
  - `/api/v1/metis-orchestrate/...`
- Health checks are **not** versioned:
  - `/health/`
- Django admin is **not** versioned:
  - `/admin/`

## 3) Authentication and Authorization

### 3.1 JWT Access + Refresh

- Access token TTL: `JWT_ACCESS_TTL_MINUTES` (default 30 minutes).
- Refresh token TTL: `JWT_REFRESH_TTL_DAYS` (default 7 days).
- Refresh rotation: enabled.
- Refresh blacklist: enabled.

**Headers**

```
Authorization: Bearer <access_token>
```

**Refresh**

- Endpoint: `POST /api/v1/auth/refresh/`
- Request body: `{ "refresh": "<refresh_token>" }`
- Response: `{ "access": "<new_access>", "refresh": "<new_refresh>" }`

**Logout**

- Endpoint: `POST /api/v1/auth/logout/`
- Request body: `{ "refresh": "<refresh_token>" }`
- Behavior: refresh token is blacklisted server-side.

### 3.2 MFA (TOTP)

- If MFA is enabled, `POST /api/v1/auth/login/` returns `mfa_required: true` and
  an `mfa_token` (short-lived access token with `mfa_pending: true`).
- The client must verify using:
  - `POST /api/v1/auth/mfa/verify-login/`
  - Body: `{ "mfa_token": "...", "code": "123456" }`

### 3.3 SSO (Google/Microsoft)

- Start flow:
  - `POST /api/v1/auth/sso/<provider>/start/` returns `{ url }`.
- Provider callback:
  - `GET /api/v1/auth/sso/<provider>/callback/` validates state and exchanges code.
- Exchange:
  - `POST /api/v1/auth/sso/exchange/` with `{ "token": "..." }` returns JWTs.

### 3.4 Authorization

- Default: `IsAuthenticated`.
- Elevated access:
  - `IsSuperAdmin` for role/permission/tenant CRUD.
  - `HasAdminAccess` for admin user management and impersonation.
- Impersonation adds claims to refresh token:
  - `impersonator_id`, `impersonator_email`.

## 4) Request and Response Security Layers

The following layers are mandatory unless an endpoint explicitly allows anonymous access:

- TLS (HTTPS) required in production.
- JWT signature verification on every request.
- MFA enforced for accounts with MFA enabled.
- SSO state token validation to prevent CSRF.
- Token revocation via refresh token blacklisting on logout.
- `X-Request-Id` correlation header for tracing.
- Input validation via DRF serializers.
- Principle of least privilege via permission classes.
- CORS allowlist via `CORS_ALLOWED_ORIGINS`.
- CSRF protection for any session or cookie-based endpoints.

Recommended additions (not fully enforced yet):

- Rate limiting per IP/user (e.g., login, password reset, SSO).
- Idempotency keys for POST endpoints that can be retried safely.
- Structured audit logging for all admin actions and auth flows.
- OpenAPI schema published for each service and kept in sync with code.

## 5) Standard Headers

**Required**

- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer <access_token>` (except anonymous endpoints)

**Optional**

- `X-Request-Id: <uuid>` for client-generated request IDs.
- `X-User-Email: <email>` for service-to-service calls where a user context is required.

## 6) Response Envelope

All responses are wrapped by the standard renderer (or explicitly returned by helpers).
Every response must match this shape:

```json
{
  "status": "success",
  "message": "Human readable message",
  "data": { "...": "..." },
  "errors": null,
  "request_id": "<uuid>"
}
```

- `status`: `success` or `error`.
- `data`: payload on success; `null` on error.
- `errors`: DRF validation or error details; `null` on success.
- `request_id`: correlation ID (always included).

## 7) HTTP Status Codes

Use standard HTTP semantics with the response envelope:

- `200 OK` for successful reads/updates and most writes.
- `201 Created` for successful resource creation.
- `400 Bad Request` for validation and malformed payloads.
- `401 Unauthorized` for missing/invalid auth.
- `403 Forbidden` for insufficient permissions.
- `404 Not Found` for missing resources.
- `409 Conflict` for unique or state conflicts.
- `422 Unprocessable Entity` for semantic validation failures (if used).
- `429 Too Many Requests` for rate limiting (when enabled).
- `500`/`503` for server errors.

## 8) Pagination

- Pagination style: page-number.
- Query params:
  - `page` (default 1)
  - `page_size` (default 20, max 100)

Paginated responses appear under `data`:

```json
{
  "status": "success",
  "message": "Success",
  "data": {
    "items": [ ... ],
    "count": 120,
    "next": "http://.../page=2",
    "previous": null
  },
  "errors": null,
  "request_id": "..."
}
```

## 9) Resource Conventions

- Use nouns, plural for collections (e.g., `/items/`, `/tenants/`).
- Use kebab-case in paths (`forgot-password`, `verify-login`).
- Use snake_case for JSON keys and query parameters.
- Use integer `id` fields for primary keys.
- Timestamps are ISO 8601, UTC.
- Use `PATCH` for partial updates.
- Base models include:
  - `created_at`, `updated_at`, `created_by`, `updated_by`, `is_active`.

## 10) Endpoint Examples

### Health

Request:

```
GET /health/
```

Response:

```json
{
  "status": "success",
  "message": "ok",
  "data": { "service": "metis-orchestrate" },
  "errors": null,
  "request_id": "b1a2..."
}
```

### Login (no MFA)

Request:

```json
POST /api/v1/auth/login/
{
  "email": "user@acme.com",
  "password": "p@ssword123"
}
```

Response:

```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "access": "<jwt_access>",
    "refresh": "<jwt_refresh>",
    "user": { "id": 1, "email": "user@acme.com", "mfa_enabled": false }
  },
  "errors": null,
  "request_id": "..."
}
```

### Login (MFA required)

Response:

```json
{
  "status": "success",
  "message": "MFA required",
  "data": {
    "mfa_required": true,
    "mfa_token": "<short_lived_token>",
    "user": { "id": 1, "email": "user@acme.com", "mfa_enabled": true }
  },
  "errors": null,
  "request_id": "..."
}
```

### Verify MFA

Request:

```json
POST /api/v1/auth/mfa/verify-login/
{
  "mfa_token": "<short_lived_token>",
  "code": "123456"
}
```

Response:

```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "access": "<jwt_access>",
    "refresh": "<jwt_refresh>",
    "user": { "id": 1, "email": "user@acme.com" }
  },
  "errors": null,
  "request_id": "..."
}
```

### Refresh

Request:

```json
POST /api/v1/auth/refresh/
{ "refresh": "<jwt_refresh>" }
```

Response:

```json
{
  "status": "success",
  "message": "Token refreshed",
  "data": { "access": "<new_access>", "refresh": "<new_refresh>" },
  "errors": null,
  "request_id": "..."
}
```

### Forgot Password

Request:

```json
POST /api/v1/auth/forgot-password/
{ "email": "user@acme.com" }
```

Response:

```json
{
  "status": "success",
  "message": "If the email exists, a reset link has been sent.",
  "data": null,
  "errors": null,
  "request_id": "..."
}
```

### Reset Password

Request:

```json
POST /api/v1/auth/reset-password/
{ "token": "<reset_token>", "password": "newpass123" }
```

Response:

```json
{
  "status": "success",
  "message": "Password updated",
  "data": null,
  "errors": null,
  "request_id": "..."
}
```

### SSO Start

Request:

```json
POST /api/v1/auth/sso/google/start/
{}
```

Response:

```json
{
  "status": "success",
  "message": "SSO URL generated",
  "data": { "url": "https://accounts.google.com/o/oauth2/v2/auth?..." },
  "errors": null,
  "request_id": "..."
}
```

### SSO Exchange

Request:

```json
POST /api/v1/auth/sso/exchange/
{ "token": "<sso_login_token>" }
```

Response:

```json
{
  "status": "success",
  "message": "SSO login successful",
  "data": {
    "access": "<jwt_access>",
    "refresh": "<jwt_refresh>",
    "user": { "id": 1, "email": "user@acme.com" }
  },
  "errors": null,
  "request_id": "..."
}
```

### Sample Resource (Items)

Request:

```
GET /api/v1/metis-orchestrate/items/?page=1&page_size=20
```

Response:

```json
{
  "status": "success",
  "message": "Success",
  "data": {
    "items": [
      { "id": 1, "name": "Item A", "description": "...", "is_active": true }
    ],
    "count": 1,
    "next": null,
    "previous": null
  },
  "errors": null,
  "request_id": "..."
}
```

### Validation Error

```json
{
  "status": "error",
  "message": "Error",
  "data": null,
  "errors": { "email": ["This field is required."] },
  "request_id": "..."
}
```

## 11) Base API Structure Reference

- `/health/` (public)
- `/admin/` (staff only)
- `/api/v1/auth/login/` (public)
- `/api/v1/auth/signup/` (public)
- `/api/v1/auth/refresh/` (public)
- `/api/v1/auth/logout/` (auth required)
- `/api/v1/auth/me/` (auth required)
- `/api/v1/auth/forgot-password/` (public)
- `/api/v1/auth/reset-password/` (public)
- `/api/v1/auth/onboard/` (public)
- `/api/v1/auth/impersonation/users/` (admin)
- `/api/v1/auth/impersonate/` (admin)
- `/api/v1/auth/users/<id>/` (admin)
- `/api/v1/auth/mfa/` (auth required)
- `/api/v1/auth/mfa/setup/` (auth required)
- `/api/v1/auth/mfa/confirm/` (auth required)
- `/api/v1/auth/mfa/disable/` (auth required)
- `/api/v1/auth/mfa/verify-login/` (public)
- `/api/v1/auth/sso/<provider>/start/` (public)
- `/api/v1/auth/sso/<provider>/callback/` (public)
- `/api/v1/auth/sso/exchange/` (public)
- `/api/v1/auth/sso/` (auth required)
- `/api/v1/tenants/` (super admin CRUD)
- `/api/v1/tenants/<tenant_id>/users/` (admin)
- `/api/v1/tenants/<tenant_id>/users/<user_id>/roles/` (super admin)
- `/api/v1/roles/` (super admin CRUD)
- `/api/v1/permissions/` (super admin CRUD)
- `/api/v1/impersonation/logs/` (admin)
- `/api/v1/metis-orchestrate/items/` (service resources)

## 12) Checklist for New Endpoints

- Define serializer validation for all inputs.
- Use permission classes explicitly.
- Return responses using the standard envelope.
- Include pagination for list endpoints.
- Use request IDs for observability.
- Add tests for auth + permissions + error cases.
