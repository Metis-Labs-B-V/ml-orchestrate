# Security Standards and Controls

This document defines the security standards for this repo and records the
controls that are currently implemented plus the planned hardening backlog.
It covers both the backend (Django/DRF) and the frontend (Next.js).

## 1) Scope and goals

- Protect identities, tokens, and tenant data.
- Prevent unauthorized access and privilege escalation.
- Minimize exposure of sensitive data in transit, at rest, and in logs.
- Keep security controls auditable and consistent across services.

## 2) Security principles (standards)

- Least privilege: access is denied by default and granted only as needed.
- Defense in depth: multiple, independent controls for auth, validation, and audit.
- Secure by default: no anonymous access unless explicitly allowed.
- Explicit allow lists: origins, tenants, and roles are allow-listed, not block-listed.
- Data minimization: collect and return only fields that are required.
- Auditability: sensitive actions are logged and traceable.
- Secrets never in code: secrets are supplied via environment variables or secret stores.

## 3) Backend controls in place

### 3.1 Authentication and session management

- JWT access and refresh tokens via SimpleJWT with rotation and blacklist on logout.
  - Configured in `backend/metis-orchestrate/core/settings.py`.
- JWE encryption of JWTs when `JWE_ENABLED=true` to protect token contents in transit.
  - Implemented in `backend/metis-orchestrate/identity/jwe.py`.
- MFA using TOTP, with short-lived `mfa_pending` access tokens during verification.
  - Implemented in `backend/metis-orchestrate/identity/views/mfa.py`.
- SSO (Google/Microsoft) with server-side code exchange and CSRF-resistant state tokens.
  - Implemented in `backend/metis-orchestrate/identity/views/sso.py`.
- Password reset tokens are one-time, time-bound, and do not reveal account existence.
  - Implemented in `backend/metis-orchestrate/identity/views/auth.py`.

### 3.2 Authorization

- Default API protection with `IsAuthenticated`.
- Elevated access enforced with `IsSuperAdmin` and `HasAdminAccess` role checks.
  - Implemented in `backend/metis-orchestrate/identity/permissions.py`.
- Tenant and role mapping managed in the identity data model.

### 3.3 Request and response protections

- Input validation via DRF serializers for all auth/admin endpoints.
- CSRF middleware enabled for any cookie-based endpoints.
- CORS allow list configured via `CORS_ALLOWED_ORIGINS`.
- Request correlation ID via `X-Request-Id` header.
  - Implemented in `backend/common_utils/middleware/request_id.py`.
- Consistent response envelope includes `request_id` for auditing.
  - Implemented in `backend/common_utils/api/renderers.py`.

### 3.4 Audit and monitoring

- Impersonation is restricted to admin roles and is always logged with IP and user agent.
  - Implemented in `backend/metis-orchestrate/identity/views/impersonation.py`.
- Logout blacklists refresh tokens to prevent reuse.

## 4) Frontend controls in place

- Access and refresh tokens stored in localStorage and attached as Bearer tokens.
  - Implemented in `frontend/lib/auth.ts` and `frontend/lib/api.ts`.
- Automatic access token refresh on `401 Unauthorized` responses.
- Protected routes verify the session with `/api/v1/auth/me/` and clear invalid sessions.
  - Implemented in `frontend/components/layout/ProtectedRoute.tsx`.
- MFA and SSO flows are integrated with backend endpoints.
- Impersonation mode is clearly indicated to the operator and exits by clearing tokens.
  - Implemented in `frontend/components/layout/ImpersonationBanner.tsx`.
- No `dangerouslySetInnerHTML` usage in the frontend codebase.

## 5) Operational and infrastructure requirements

- Enforce HTTPS/TLS at the ingress or load balancer in production.
- Enable DB TLS via `sslmode` in `DATABASE_URL`.
- Store secrets in a secret manager and rotate on compromise or policy.
- Restrict admin endpoints to trusted networks or VPN when possible.
- Centralized logging and alerting for auth failures and suspicious activity.

## 6) Planned hardening backlog

### 6.1 Backend

- Rate limiting and abuse protection (login, reset, SSO, impersonation).
- Idempotency keys for safe retries on write endpoints.
- Expanded audit logging for admin actions, role changes, and tenant edits.
- OpenAPI schema publication and continuous validation.
- Security headers hardening (HSTS, CSP, X-Content-Type-Options) via settings.

### 6.2 Frontend

- Migrate auth storage to HttpOnly secure cookies or in-memory with refresh rotation.
- Add CSP and security headers in Next.js config.
- Add UI-side brute force protections and suspicious login warnings.

## 7) Verification checklist

- Confirm `JWE_SECRET`, `JWT_ACCESS_TTL_MINUTES`, and `JWT_REFRESH_TTL_DAYS` are set.
- Confirm `CORS_ALLOWED_ORIGINS` contains only trusted domains.
- Confirm password reset, MFA, and SSO TTLs are set to policy values.
- Confirm refresh token blacklist is enabled and logout revokes refresh tokens.
- Confirm impersonation logs are retained and monitored.
