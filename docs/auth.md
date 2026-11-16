# Authentication and Sessions (`apps/api`)

Implementation of **NK-09** (**RF-01**, **RT-06**): registration, login, rotating token refresh, logout, professional profile verification, and password recovery. **NK-10** adds the mandatory TOTP second factor for professionals ([section 6](#6-two-factor-authentication-for-professionals-nk-10)).

---

## 1. Endpoints

All endpoints validate their input using `validateRequest` and strict schemas from `@nutrikids/shared`.

| Method and Route                | Input (`@nutrikids/shared`)                                   | Successful Response                       | Primary Errors                                                                                        |
| ------------------------------- | ------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /auth/register`           | `RegisterInputSchema`                                         | `201 Created` (`AuthResponse`)            | `400` validation, `403` invalid invitation code, `409` duplicate email or license                     |
| `POST /auth/login`              | `LoginInputSchema`                                            | `200 OK` (`AuthResponse`)                 | `400` validation, `401` invalid credentials, `403` suspended account, `429` rate limit exceeded       |
| `POST /auth/refresh`            | `RefreshInputSchema`                                          | `200 OK` (`AuthResponse`)                 | `400` validation, `401` invalid, expired, or reused token, `403` suspended account                    |
| `POST /auth/logout`             | `LogoutInputSchema`                                           | `204 No Content`                          | `400` validation                                                                                      |
| `POST /auth/forgot-password`    | `ForgotPasswordInputSchema`                                   | `202 Accepted` (`ForgotPasswordResponse`) | `400` validation, `429` rate limit exceeded                                                           |
| `POST /auth/reset-password`     | `ResetPasswordInputSchema`                                    | `204 No Content`                          | `400` validation, `401` invalid, expired, or already used token                                       |
| `GET /auth/2fa/status`          | - (Bearer, `PROFESSIONAL`)                                    | `200 OK` (`TwoFactorStatus`)              | `401` no token, `403` not a professional                                                              |
| `POST /auth/2fa/recovery-codes` | `RegenerateRecoveryCodesInputSchema` (Bearer, `PROFESSIONAL`) | `200 OK` (`RecoveryCodesResponse`)        | `400` validation, `401` wrong or reused TOTP code, `403` not a professional, `409` not enabled, `429` |

---

## 2. Password and Token Security

- **Password Hashing (`src/lib/password.ts`):**
  - **Argon2id** algorithm (`@node-rs/argon2`, `memoryCost = 19456` KiB, `timeCost = 2`, `parallelism = 1`).
  - Plaintext passwords are never stored, returned, or logged.
  - When an email does not exist during `POST /auth/login`, `verifyDummyPassword` is executed to maintain constant response timing and prevent user enumeration.
- **Access Token (`src/services/token.service.ts`):**
  - JWT signed with `HS256` (`jose`), issuer `nutrikids-api`, audience `nutrikids-app`, default lifetime of **15 minutes** (`ACCESS_TOKEN_TTL_SECONDS = 900`).
  - Contains `sub` (user UUID), `roles` (`['CAREGIVER']`, `['PROFESSIONAL']`, or both), and `specialty` (`'nursing' | 'nutrition' | 'pediatrics' | null`).
- **Rotating Refresh Token (`refresh_tokens`):**
  - Opaque 256-bit cryptographically random token valid for **30 days** (`REFRESH_TOKEN_TTL_DAYS = 30`).
  - Only its **SHA-256** hash (`token_hash`) is stored in the database.
  - Each `POST /auth/refresh` call atomically revokes the used token (`WHERE revoked_at IS NULL`) and issues a fresh pair.
  - **Theft/Reuse Detection:** if a client attempts to use an already revoked `refreshToken`, **all** active sessions for that user are immediately revoked.
  - On logout (`POST /auth/logout`), the `refreshToken` is revoked; the short-lived `accessToken` naturally expires (15 min).

---

## 3. Professional Profile Verification on Registration

The specification requires `specialty` and unique `license_number` for professionals, but does not specify how to prevent arbitrary users from declaring themselves professionals.

- **Implemented Decision:** registration with the `PROFESSIONAL` role requires `invitationCode` in `RegisterInputSchema`.
- The server performs constant-time comparison (`timingSafeEqual` over SHA-256 digest) against the list configured in the `PROFESSIONAL_INVITE_CODES` environment variable. If it does not match, responds with `403 Forbidden`.

---

## 4. Rate Limiting for Authentication

- `src/middlewares/rateLimit.ts` limits `POST /auth/login` (and `POST /auth/forgot-password`) to **5 failed attempts per 15 minutes** (`LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`) keyed by `IP + sha256(email)`.
- Successful logins do not decrement the attempt allowance (`skipSuccessfulRequests: true`).
- In this phase the counter lives in process memory (appropriate for a single instance; an external store like Redis can be attached for multi-replica setups).

---

## 5. Password Recovery

- `POST /auth/forgot-password` always returns `202 Accepted` with the same generic message regardless of whether the email exists.
- Issues a short-lived JWT (15 min) with dedicated audience `nutrikids-password-reset` and a fingerprint `pwdFingerprint = sha256(passwordHash)`.
- `POST /auth/reset-password` verifies that fingerprint, updates `passwordHash` using Argon2id, and invalidates all active `refresh_tokens` for the user. Because the `passwordHash` changes, the recovery token is invalidated automatically after its first use without requiring an additional table.

---

## 6. Two-Factor Authentication for Professionals (NK-10)

Every account with a professional profile (including dual caregiver + professional accounts) must use a TOTP authenticator app (Google Authenticator, Microsoft Authenticator, Authy...). Caregiver-only accounts are not affected.

### 6.1 Flow

The flow is stateless: the client re-sends `POST /auth/login` with the same body plus `totpCode` (6 digits) **or** `recoveryCode`.

| Situation (password already valid) | Request extra                            | Response                                                                                   |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Not enrolled yet                   | none                                     | `200 { requiresTwoFactor: true, setup: { secret, otpauthUri, qrCodeDataUrl } }`, no tokens |
| Not enrolled yet                   | valid `totpCode`                         | `200` tokens + `recoveryCodes` (10 codes, shown **only once**); two-factor is now enabled  |
| Enrolled                           | none                                     | `200 { requiresTwoFactor: true }`, no tokens                                               |
| Enrolled                           | valid `totpCode` / unused `recoveryCode` | `200` tokens                                                                               |
| Any                                | wrong, reused or expired code            | `401 Código de verificación inválido` (counts toward the login rate limit)                 |

- **Registration** with the `PROFESSIONAL` role does not issue tokens: it answers `201 { requiresTwoFactor: true }` and enrollment happens on the first login.
- **Refresh:** `POST /auth/refresh` answers `401` for a professional who has not enabled two-factor, so sessions issued before NK-10 must log in again.
- The access token claims are unchanged.

### 6.2 Implementation

- **TOTP (`src/lib/totp.ts`):** RFC 6238 with HMAC-SHA1, 6 digits, 30-second steps, ±1 step tolerance, 160-bit base32 secret, constant-time comparison. Implemented with `node:crypto` (no extra dependency); tested against the RFC 6238 vectors.
- **QR:** `qrcode` turns the `otpauth://totp/NutriKids:<email>?secret=…&issuer=NutriKids` URI into a PNG data URL, so the app needs no QR library. The app also shows the key in blocks of four and offers to open the `otpauth://` link directly, because the professional usually installs the authenticator on the same phone.
- **Secret storage (`src/lib/secretBox.ts`):** `professionals.totp_secret_enc` holds the secret encrypted with **AES-256-GCM** (`v1.<iv>.<tag>.<ciphertext>`), key derived from `TOTP_ENCRYPTION_KEY`. While `totp_enabled_at` is `NULL` the secret is _pending_: repeating the first login step returns the same secret so a scanned QR stays valid.
- **Replay protection:** `professionals.totp_last_used_step` stores the last accepted step. It is updated with a conditional `updateMany` (`NULL` or lower step), so a code cannot be used twice, even by two concurrent requests.
- **Recovery codes:** 10 codes `XXXX-XXXX` from an unambiguous alphabet (no `0/O/1/I/L`), stored only as SHA-256 of the normalized code (uppercase, no spaces or dashes) in `recovery_code_hashes`. Each one is consumed with a compare-and-swap update on the whole array, so it works only once. `POST /auth/2fa/recovery-codes` (needs a current TOTP code) replaces them all.
- **Audit:** `UPDATE` on `users` with `details.twoFactor` = `enabled`, `recovery_code_used` or `recovery_codes_regenerated` (never the codes themselves).
- **Service:** `src/services/twoFactor.service.ts` (`checkLoginSecondFactor`, `getTwoFactorStatus`, `regenerateRecoveryCodes`).
- **Tests:** `src/__tests__/totp.test.ts` (primitives) and `src/__tests__/auth.two-factor.test.ts` (full flow: QR, activation, replay, recovery codes, concurrency, dual accounts, management endpoints, rate limit, refresh).

---

## 7. Environment Variables (`apps/api`)

| Variable                    | Description                                                                                                                                                                               | Default Value (`dev` / `test`) |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `JWT_ACCESS_SECRET`         | Secret of at least 32 characters (required in `production`)                                                                                                                               | Development / test key         |
| `ACCESS_TOKEN_TTL_SECONDS`  | Access JWT lifetime in seconds                                                                                                                                                            | `900` (15 min)                 |
| `REFRESH_TOKEN_TTL_DAYS`    | Refresh token lifetime in days                                                                                                                                                            | `30`                           |
| `LOGIN_MAX_ATTEMPTS`        | Failed attempts allowed before `429`                                                                                                                                                      | `5`                            |
| `LOGIN_WINDOW_MINUTES`      | Rate limiting window in minutes                                                                                                                                                           | `15`                           |
| `PROFESSIONAL_INVITE_CODES` | Comma-separated invitation codes (required in `production`)                                                                                                                               | `NK-PROF-2026`                 |
| `TOTP_ENCRYPTION_KEY`       | Key (≥ 32 chars) that encrypts the professionals' TOTP secrets (required in `production`; do not change it after professionals enroll, their stored secrets could no longer be decrypted) | Development / test key         |

---

## 8. Relation to Subsequent Issues

- **NK-11 (Role and link access control):** uses `verifyAccessToken` (`src/services/token.service.ts`) across `requireRole` and `requireLink` middlewares.
