# Feature: Multi-Factor Authentication (MFA / TOTP)

## Overview
Time-based OTP (TOTP) support using pyotp. Users set up an authenticator app via QR code and must enter the code on login. Admins can toggle MFA for users.

## What's Implemented
- MFA setup endpoint: generates TOTP secret + QR code URI
- MFA verification endpoint during login flow
- MFA enable / disable toggle per user
- Admin can force-enable or disable MFA for any user
- `mfa_enabled` and `mfa_secret` stored on User model

## File Locations
| Layer | Path |
|---|---|
| Backend views | `backend/metis-orchestrate/identity/views/mfa.py` |
| Backend models | `backend/metis-orchestrate/identity/models.py` (User.mfa_secret, mfa_enabled) |
| Frontend setup | `frontend/pages/setup-2fa.tsx` |
| Frontend verify | `frontend/pages/verify-otp.tsx` |

## Pending / To Be Implemented

### P1 — High Priority
- [ ] **Backup / recovery codes** — no single-use recovery codes generated at setup; user locked out if authenticator is lost
- [ ] **MFA enforcement policy per tenant** — tenants cannot require MFA for all their users (only individual toggle)
- [ ] **Re-verify before sensitive actions** — no step-up auth for operations like changing email, deleting account, viewing secrets

### P2 — Medium Priority
- [ ] **SMS / email OTP as fallback** — only TOTP supported; no SMS or email-OTP alternative
- [ ] **MFA reset by admin with audit trail** — admin can disable MFA but no dedicated "reset MFA" flow with logged reason
- [ ] **Trusted devices** — no option to trust a device for N days after MFA

### P3 — Low Priority
- [ ] **Hardware key (FIDO2/WebAuthn) support**
- [ ] **Push notification MFA (Duo-style)**
