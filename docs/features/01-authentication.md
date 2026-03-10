# Feature: Authentication & Session Management

## Overview
Email/password login with JWT (JWE-encrypted) tokens, token refresh, logout with blacklisting, password reset via email, and email verification for new signups.

## What's Implemented
- Email + password login → JWT access + refresh tokens (JWE encrypted)
- Token refresh endpoint
- Logout with token blacklisting
- Password reset flow: request email → token → set new password
- Email verification on signup
- Login OTP (one-time password) model exists

## File Locations
| Layer | Path |
|---|---|
| Backend views | `backend/metis-orchestrate/identity/views/auth.py` |
| Backend models | `backend/metis-orchestrate/identity/models.py` (User, PasswordResetToken, EmailVerificationToken, LoginOTP) |
| Frontend login | `frontend/pages/index.tsx` |
| Frontend signup | `frontend/pages/signup.tsx` |
| Frontend forgot-pw | `frontend/pages/forgot-password.tsx` |
| Frontend reset-pw | `frontend/pages/reset-password.tsx` |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Login rate limiting** — no brute-force protection on the login endpoint (lockout after N failed attempts)
- [ ] **Remember me / persistent sessions** — no long-lived session option; tokens expire on fixed schedule
- [ ] **Account lockout notification** — no email alert when account is locked or suspicious login detected
- [ ] **Device/session listing** — users cannot see or revoke active sessions from their profile

### P2 — Medium Priority
- [ ] **Passwordless login (magic link)** — email a one-click login link instead of password
- [ ] **Password strength enforcement** — backend validates only basic constraints; no configurable policy (min length, complexity, history)
- [ ] **Login audit enrichment** — currently logs IP/UA; add geolocation, device fingerprint

### P3 — Low Priority
- [ ] **OAuth social login** (Google/GitHub as first-party login, distinct from tenant SSO)
- [ ] **Passkey / WebAuthn support**
