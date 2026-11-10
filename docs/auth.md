# Autenticación y Sesiones (`apps/api`)

Implementación de **NK-09** (**RF-01**, **RT-06**): registro, inicio de sesión, renovación rotativa de tokens, cierre de sesión, verificación de perfil profesional y recuperación de contraseña.

---

## 1. Endpoints

Todos los endpoints validan su entrada con `validateRequest` y los esquemas estrictos de `@nutrikids/shared`.

| Método y ruta                | Entrada (`@nutrikids/shared`) | Respuesta exitosa                         | Errores principales                                                                               |
| ---------------------------- | ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST /auth/register`        | `RegisterInputSchema`         | `201 Created` (`AuthResponse`)            | `400` validación, `403` código de invitación inválido, `409` correo o licencia duplicados         |
| `POST /auth/login`           | `LoginInputSchema`            | `200 OK` (`AuthResponse`)                 | `400` validación, `401` credenciales inválidas, `403` cuenta suspendida, `429` límite de intentos |
| `POST /auth/refresh`         | `RefreshInputSchema`          | `200 OK` (`AuthResponse`)                 | `400` validación, `401` token inválido, expirado o reutilizado, `403` cuenta suspendida           |
| `POST /auth/logout`          | `LogoutInputSchema`           | `204 No Content`                          | `400` validación                                                                                  |
| `POST /auth/forgot-password` | `ForgotPasswordInputSchema`   | `202 Accepted` (`ForgotPasswordResponse`) | `400` validación, `429` límite de intentos                                                        |
| `POST /auth/reset-password`  | `ResetPasswordInputSchema`    | `204 No Content`                          | `400` validación, `401` token inválido, expirado o ya utilizado                                   |

---

## 2. Seguridad de contraseñas y tokens

- **Hash de contraseñas (`src/lib/password.ts`):**
  - Algoritmo **Argon2id** (`@node-rs/argon2`, `memoryCost = 19456` KiB, `timeCost = 2`, `parallelism = 1`).
  - Nunca se almacena, devuelve ni registra en logs la contraseña en claro.
  - Cuando el correo no existe en `POST /auth/login`, se ejecuta `verifyDummyPassword` para igualar el tiempo de respuesta y evitar enumeración de cuentas.
- **Token de acceso (`src/services/token.service.ts`):**
  - JWT firmado con `HS256` (`jose`), emisor `nutrikids-api`, audiencia `nutrikids-app` y duración por defecto de **15 minutos** (`ACCESS_TOKEN_TTL_SECONDS = 900`).
  - Incluye `sub` (UUID del usuario), `roles` (`['CAREGIVER']`, `['PROFESSIONAL']` o ambos) y `specialty` (`'nursing' | 'nutrition' | 'pediatrics' | null`).
- **Token de renovación rotativo (`refresh_tokens`):**
  - Token opaco de 256 bits aleatorios con vigencia de **30 días** (`REFRESH_TOKEN_TTL_DAYS = 30`).
  - En la base de datos solo se almacena su hash **SHA-256** (`token_hash`).
  - Cada llamada a `POST /auth/refresh` revoca el token usado de forma atómica (`WHERE revoked_at IS NULL`) y emite un par nuevo.
  - **Detección de robo/reutilización:** si alguien intenta usar un `refreshToken` que ya fue revocado, se revocan inmediatamente **todas** las sesiones activas de ese usuario.
  - Al cerrar sesión (`POST /auth/logout`), el `refreshToken` queda revocado; el `accessToken` expira por sí mismo tras su ventana corta (15 min).

---

## 3. Verificación del perfil profesional al registrarse

El informe exige `specialty` y `license_number` único para los profesionales, pero no especifica cómo evitar que cualquier usuario se declare profesional.

- **Decisión implementada:** el registro con rol `PROFESSIONAL` exige `invitationCode` en `RegisterInputSchema`.
- El servidor compara el código en tiempo constante (`timingSafeEqual` sobre digest SHA-256) contra la lista configurada en la variable de entorno `PROFESSIONAL_INVITE_CODES`. Si no coincide, responde `403 Forbidden`.

---

## 4. Límite de intentos de inicio de sesión

- `src/middlewares/rateLimit.ts` limita `POST /auth/login` (y `POST /auth/forgot-password`) a **5 intentos fallidos cada 15 minutos** (`LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`) agrupados por `IP + sha256(email)`.
- Los inicios de sesión exitosos no descuentan intentos (`skipSuccessfulRequests: true`).
- En esta etapa el contador vive en memoria del proceso (adecuado para una instancia; si se despliegan múltiples réplicas se puede conectar un store externo como Redis).

---

## 5. Recuperación de contraseña

- `POST /auth/forgot-password` responde siempre `202 Accepted` con el mismo mensaje exista o no el correo.
- Emite un JWT de corta duración (15 min) con audiencia dedicada `nutrikids-password-reset` y una huella `pwdFingerprint = sha256(passwordHash)`.
- `POST /auth/reset-password` verifica esa huella, actualiza el `passwordHash` con Argon2id e invalida todos los `refresh_tokens` activos del usuario. Como el `passwordHash` cambia, el token de recuperación queda invalidado automáticamente tras su primer uso sin requerir una tabla adicional.

---

## 6. Variables de entorno (`apps/api`)

| Variable                    | Descripción                                                            | Valor por defecto (`dev` / `test`) |
| --------------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| `JWT_ACCESS_SECRET`         | Secreto de al menos 32 caracteres (obligatorio en `production`)        | Clave de desarrollo/pruebas        |
| `ACCESS_TOKEN_TTL_SECONDS`  | Duración del JWT de acceso en segundos                                 | `900` (15 min)                     |
| `REFRESH_TOKEN_TTL_DAYS`    | Duración del refresh token en días                                     | `30`                               |
| `LOGIN_MAX_ATTEMPTS`        | Intentos fallidos antes de responder `429`                             | `5`                                |
| `LOGIN_WINDOW_MINUTES`      | Ventana del límite de intentos en minutos                              | `15`                               |
| `PROFESSIONAL_INVITE_CODES` | Códigos de invitación separados por coma (obligatorio en `production`) | `NK-PROF-2026`                     |

---

## 7. Frontera con las siguientes issues

- **NK-10 (Verificación en dos pasos TOTP):** agregará la activación por QR, los códigos de recuperación y hará que `POST /auth/login` devuelva `{ requiresTwoFactor: true }` para profesionales antes de entregar tokens completos.
- **NK-11 (Control de acceso por rol y vínculo):** usará `verifyAccessToken` (`src/services/token.service.ts`) en los middlewares `requireRole` y `requireVinculo`.
