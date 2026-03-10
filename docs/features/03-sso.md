# Feature: Single Sign-On (SSO)

## Overview
OAuth 2.0-based SSO supporting generic providers (Google, Microsoft). State tokens with TTL prevent CSRF. SSO can be enabled/disabled per user.

## What's Implemented
- SSO initiation endpoint: generates state token, returns authorization URL
- OAuth callback handler: exchanges code for tokens, issues JWE session
- `SsoState` and `SsoLoginToken` models for CSRF protection and token handoff
- SSO enable / disable per user
- Provider-agnostic implementation (configurable per provider)
- Support for Google and Microsoft flows

## File Locations
| Layer | Path |
|---|---|
| Backend views | `backend/metis-orchestrate/identity/views/sso.py` |
| Backend models | `backend/metis-orchestrate/identity/models.py` (SsoState, SsoLoginToken) |
| Frontend | Callback handled via Next.js pages (no dedicated SSO page visible; tied into login flow) |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Per-tenant SSO configuration UI** — admins cannot configure SSO provider credentials (client ID/secret, scopes) from the UI; requires env vars
- [ ] **SAML 2.0 support** — only OAuth 2.0 / OIDC; many enterprise customers require SAML
- [ ] **SSO-only enforcement** — no option to disable password login when SSO is active for a tenant
- [ ] **SSO domain matching** — no automatic SSO redirect when user's email domain matches a configured provider
- [ ] **Just-in-time (JIT) user provisioning** — SSO login for unknown user currently fails; should auto-create user

### P2 — Medium Priority
- [ ] **Multiple SSO providers per tenant** — currently one provider per user; tenants may need multiple IdPs
- [ ] **SCIM user provisioning** — no SCIM endpoint for IdP-driven user sync
- [ ] **SSO group/role mapping** — IdP groups not mapped to platform roles
- [ ] **SSO session expiry sync** — platform session doesn't terminate when IdP session ends

### P3 — Low Priority
- [ ] **Okta / Auth0 / Ping Identity dedicated adapters**
- [ ] **SSO audit log enrichment** (provider, claims received)
