# NutriKids App

Monorepo para **NutriKids**, construido con **React Native (Expo) + TypeScript**, **Node.js (Express) + Prisma** y **PostgreSQL** en Docker.

## Stack tecnológico

- **Mobile (`apps/mobile`):** React Native · Expo · Expo Router · TypeScript
- **API (`apps/api`):** Node.js · Express 5 · TypeScript · Prisma 7 (`@prisma/adapter-pg`) · Vitest + Supertest
- **Shared (`packages/shared`):** `@nutrikids/shared` — esquemas Zod y tipos compartidos entre mobile y backend
- **Base de datos:** PostgreSQL 16 (`docker-compose.yml`, puerto host `5433` por defecto)
- **Tooling:** pnpm workspaces · ESLint (Flat Config) · Prettier · Husky + lint-staged · GitHub Act ions (CI)

## Estructura del monorepo

```text
nutrikids-app/
├── .github/
│   └── workflows/
│       └── ci.yml           # Pipeline de CI (lint, format, types, tests con Postgres)
├── apps/
│   ├── api/                 # Servidor Express + Prisma + tests
│   └── mobile/              # App React Native (Expo + Expo Router)
├── packages/
│   └── shared/              # Esquemas Zod y tipos TypeScript compartidos
├── docker-compose.yml       # PostgreSQL 16 con volumen persistente
├── .env.example             # Plantilla de variables de entorno
├── eslint.config.mjs        # Configuración global de ESLint
├── pnpm-workspace.yaml      # Definición de workspaces
├── tsconfig.base.json       # Configuración base estricta de TypeScript
└── package.json             # Scripts globales del monorepo
```

## Requisitos previos

- **Node.js** `>= 22.0.0`
- **pnpm** `>= 10.0.0`
- **Docker Desktop** (en ejecución para levantar PostgreSQL)
- **Expo Go** en tu teléfono (opcional, para probar en dispositivo físico)

## Puesta en marcha desde cero

1. **Crear archivo de variables de entorno:**

   ```bash
   cp .env.example .env
   ```

2. **Instalar dependencias:**

   ```bash
   pnpm install
   ```

3. **Levantar PostgreSQL en Docker:**

   ```bash
   pnpm db:up
   ```

4. **Aplicar migraciones y generar el cliente de Prisma:**

   ```bash
   pnpm db:migrate
   ```

5. **Iniciar el entorno de desarrollo:**

   - **Recomendado (2 terminales, conserva el menú interactivo y QR de Expo):**
     ```bash
     # Terminal 1 — Backend (http://localhost:3000)
     pnpm dev:api

     # Terminal 2 — App Expo
     pnpm dev:mobile
     ```
   - **En una sola terminal (logs combinados):**
     ```bash
     pnpm dev
     ```

## Conexión desde la app móvil a la API

Ajusta `EXPO_PUBLIC_API_URL` (en `.env` o `apps/mobile/.env`) según dónde abras la app:

| Destino                   | Valor de `EXPO_PUBLIC_API_URL`                                                        |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Web / iOS Simulator       | `http://localhost:3000`                                                               |
| Android Emulator          | `http://10.0.2.2:3000` _(también se adapta automáticamente desde `localhost`)_        |
| Teléfono físico (Expo Go) | `http://<TU_IP_LOCAL>:3000` _(ej. `http://192.168.1.50:3000`, en la misma red Wi-Fi)_ |

Al abrir la app verás **`API OK`** junto con **`Base de datos: ok`** consumiendo `GET /health`.

## Scripts disponibles en la raíz

| Comando                             | Descripción                                                              |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                          | Ejecuta `api` y `mobile` en paralelo                                     |
| `pnpm dev:api`                      | Inicia solo el servidor Express en modo watch (`tsx`)                    |
| `pnpm dev:mobile`                   | Inicia el servidor de desarrollo de Expo (con QR e interfaz interactiva) |
| `pnpm build`                        | Compila todos los paquetes del monorepo                                  |
| `pnpm typecheck`                    | Verifica tipos TypeScript en `shared`, `api` y `mobile`                  |
| `pnpm test`                         | Ejecuta la suite de tests (Vitest + Supertest)                           |
| `pnpm lint` / `pnpm lint:fix`       | Ejecuta ESLint en todo el repositorio                                    |
| `pnpm format` / `pnpm format:check` | Formatea o verifica formato con Prettier                                 |
| `pnpm db:up` / `pnpm db:down`       | Levanta o detiene el contenedor de PostgreSQL                            |
| `pnpm db:logs`                      | Muestra logs en vivo de PostgreSQL                                       |
| `pnpm db:migrate`                   | Crea/aplica migraciones de Prisma en desarrollo                          |
| `pnpm db:migrate:deploy`            | Aplica migraciones pendientes de forma desatendida (CI / producción)     |
| `pnpm db:generate`                  | Regenera el cliente tipado de Prisma                                     |
| `pnpm db:studio`                    | Abre Prisma Studio para explorar la base de datos en el navegador        |

## Integración Continua (CI con GitHub Actions)

Cada Pull Request hacia la rama `main` ejecuta automáticamente el pipeline de validación en [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

1. **Instalación:** `pnpm install --frozen-lockfile` (asegura integridad del `pnpm-lock.yaml`).
2. **Formato:** `pnpm format:check` (Prettier).
3. **Linting:** `pnpm lint` (ESLint en todos los paquetes).
4. **Tipos:** `pnpm typecheck` (`tsc --noEmit` en `shared`, `api` y `mobile`).
5. **Servicio PostgreSQL:** Levanta un contenedor de servicio `postgres:16-alpine` y verifica disponibilidad con `pg_isready`.
6. **Migraciones:** `pnpm db:migrate:deploy` aplica las migraciones de Prisma en la base de datos de CI.
7. **Pruebas:** `pnpm test` ejecuta los tests con Vitest y Supertest.

## Convención de Ramas

Toda nueva contribución debe realizarse a través de una rama temática derivada de `main`:

| Prefijo             | Propósito                                                | Ejemplo                      |
| ------------------- | -------------------------------------------------------- | ---------------------------- |
| `feature/<nombre>`  | Nuevas funcionalidades o pantallas                       | `feature/user-auth`          |
| `fix/<nombre>`      | Corrección de errores o bugs                             | `fix/api-connection-timeout` |
| `chore/<nombre>`    | Tareas de mantenimiento, dependencias o configuración    | `chore/upgrade-deps`         |
| `docs/<nombre>`     | Cambios exclusivamente en documentación                  | `docs/update-readme`         |
| `refactor/<nombre>` | Refactorizaciones de código sin cambio funcional visible | `refactor/api-routes`        |
| `test/<nombre>`     | Incorporación o ajuste de pruebas automatizadas          | `test/child-endpoints`       |

## Convención de Commits (Conventional Commits)

Los commits deben seguir la especificación [Conventional Commits](https://www.conventionalcommits.org/):

```text
<tipo>(<alcance opcional>): <descripción concisa en imperativo y minúscula>
```

- **Tipos principales:**
  - `feat`: Nueva característica (`feat(api): add auth endpoint`).
  - `fix`: Corrección de bug (`fix(mobile): resolve shared import in metro`).
  - `chore`: Tareas de build, dependencias o configuración (`chore(db): add migration deploy script`).
  - `docs`: Documentación (`docs: update setup instructions`).
  - `test`: Pruebas unitarias o de integración (`test(api): add vitest for health endpoint`).
  - `refactor`: Cambios en código que no corrigen bugs ni agregan features (`refactor(shared): split health schema`).
  - `ci`: Cambios en flujos de integración continua (`ci: add postgres service to pr workflow`).

## Protección de la Rama `main` en GitHub

Para garantizar que ningún cambio roto ingrese a `main`, se debe configurar una regla de protección en GitHub:

1. Ve a tu repositorio en GitHub y abre **Settings** > **Branches**.
2. En la sección **Branch protection rules**, haz clic en **Add rule** (o **Add branch ruleset**).
3. En **Branch name pattern**, escribe `main`.
4. Activa las siguientes opciones:
   - **Require a pull request before merging:**
     - _(Opcional)_ Requerir al menos 1 aprobación de revisión de código.
   - **Require status checks to pass before merging:**
     - Marca **Require branches to be up to date before merging**.
     - En el buscador de checks, selecciona:
       `Validate PR (Install, Lint, Format, Types, Tests)`
   - **Do not allow bypassing the above settings:**
     - Evita que administradores o propietarios fusionen PRs con checks en rojo.
5. Haz clic en **Create** (o **Save changes**).

> Con esta configuración, el botón **Merge pull request** permanecerá bloqueado hasta que el flujo de CI complete todas las validaciones con éxito (verde).

## Modelo de Datos y Equivalencia de Nombres

El modelo de datos relacional de NutriKids parte del informe de especificación (Tabla 4). Para mantener consistencia con los estándares del ecosistema TypeScript y Node.js, se adoptó la siguiente convención de nombres:

- **Código TypeScript / Prisma:** Modelos en `PascalCase` singular (ej. `Checkup`, `Child`) y atributos en `camelCase` (ej. `weightKg`, `measuredAt`).
- **Base de datos (PostgreSQL):** Tablas en inglés `snake_case` plural (ej. `checkups`, `children`), mapeadas con `@@map("checkups")`. Columnas en inglés `snake_case` (ej. `weight_kg`), mapeadas con `@map("weight_kg")`.
- **Informe del proyecto:** Mantiene los nombres conceptuales originales en español (Tabla 4).

### Tabla de Equivalencias (19 tablas de informe + 2 de infraestructura = 21 tablas)

| Entidad Informe (Tabla 4)        | Modelo Prisma (TS)   | Tabla PostgreSQL        | Propósito / Área                                                       |
| -------------------------------- | -------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `usuario`                        | `User`               | `users`                 | Identidad central compartida (supertipo solapado)                      |
| `cuidador`                       | `Caregiver`          | `caregivers`            | Subtipo de usuario con rol cuidador (1:1 con `User`)                   |
| `profesional`                    | `Professional`       | `professionals`         | Subtipo de usuario profesional de la salud (1:1 con `User`)            |
| `nino`                           | `Child`              | `children`              | Entidad central del paciente pediátrico (1 a 5 años)                   |
| `cuida`                          | `CaregiverChild`     | `caregiver_children`    | Relación N:M entre niño y cuidador (PK compuesta)                      |
| `atiende`                        | `ProfessionalChild`  | `professional_children` | Asignación clínica N:M entre profesional y niño con vigencia           |
| `consentimiento`                 | `Consent`            | `consents`              | Autorización legal y tratamiento de datos personales                   |
| `control`                        | `Checkup`            | `checkups`              | Registro antropométrico inmutable capturado (peso, talla, posición)    |
| `referencia_lms`                 | `LmsReference`       | `lms_references`        | Tablas de referencia OMS (parámetros L, M, S por sexo/edad/talla)      |
| `resultado_indicador`            | `IndicatorResult`    | `indicator_results`     | Z-score, percentil y clasificación nutricional persistidos             |
| `registro_alimentacion`          | `FeedingLog`         | `feeding_logs`          | Bitácora de frecuencia de comidas y alimentación                       |
| `alerta`                         | `Alert`              | `alerts`                | Detección de riesgo nutricional (emaciación, retraso, sobrepeso, etc.) |
| `alerta_historial`               | `AlertHistory`       | `alert_history`         | Trazabilidad inmutable de transiciones de estado de alertas            |
| `seguimiento`                    | `FollowUp`           | `follow_ups`            | Plan de acción clínico (observación, recomendación, derivación)        |
| `mensaje`                        | `Message`            | `messages`              | Comunicación bidireccional entre usuarios                              |
| `recordatorio`                   | `Reminder`           | `reminders`             | Agendamiento de próximos controles y actividades                       |
| `notificacion`                   | `Notification`       | `notifications`         | Notificaciones en la app para eventos y avisos                         |
| `contenido_educativo`            | `EducationalContent` | `educational_contents`  | Guías y pautas nutricionales filtradas por edad del niño               |
| `auditoria`                      | `AuditLog`           | `audit_logs`            | Registro inmutable de acciones críticas del sistema                    |
| _(Infraestructura NK-13, NK-14)_ | `RefreshToken`       | `refresh_tokens`        | Sesiones activas, rotación y revocación segura de JWTs                 |
| _(Infraestructura NK-36)_        | `PushDevice`         | `push_devices`          | Registro de tokens push por dispositivo para alertas y avisos          |

> **Nota sobre infraestructura:** Las tablas `refresh_tokens` y `push_devices` no provienen de la lógica clínica de la Tabla 4, sino de los requerimientos técnicos de autenticación multidispositivo (NK-13, NK-14) y notificaciones push móviles (NK-36). Junto a las 19 tablas del informe, totalizan **21 tablas de negocio e infraestructura**.

### Autenticación y Seguridad Profesional (NK-13, NK-14)

- **Refresh Tokens:** Se almacenan exclusivamente con su hash SHA-256 en `refresh_tokens` (`token_hash`), admitiendo múltiples sesiones concurrentes por usuario con expiración y revocación individual.
- **2FA TOTP:** Solo los profesionales de la salud utilizan doble factor de autenticación. El secreto se almacena cifrado bidireccionalmente con AES-256-GCM en `professionals.totp_secret_enc` junto a su fecha de activación en `professionals.totp_enabled_at`.
- **Códigos de recuperación:** Se almacenan como hashes en `professionals.recovery_code_hashes` y se consumen uno a uno al ser utilizados.

## Configuración de Base de Datos y Neon

El proyecto soporta PostgreSQL local (vía Docker) y bases de datos serverless en **Neon**:

### URLs de Conexión (Pooled vs Direct)

Neon proporciona dos cadenas de conexión distintas:

- **Pooled (`DATABASE_URL`, host con `-pooler`):** Utiliza PgBouncer en modo transacción para reutilizar conexiones de la API en runtime bajo alta concurrencia.
- **Direct (`DIRECT_URL`, host sin `-pooler`):** Conexión directa a PostgreSQL sin pooling intermedio, requerida por el CLI de Prisma para ejecutar migraciones (`prisma migrate dev`, `prisma migrate deploy`) y evitar bloqueos de locks DDL.

Ambas URLs deben incluir el parámetro `?sslmode=require`.

En `apps/api/prisma.config.ts`, Prisma CLI prioriza la conexión directa automáticamente:

```ts
datasource: {
  url:
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    'postgresql://nutrikids:nutrikids@localhost:5433/nutrikids?schema=public',
}
```

### Recomendaciones de Entorno

1. **Desarrollo Local:** Se recomienda utilizar el contenedor Docker (`pnpm db:up` y `pnpm db:migrate`). Es más rápido y no genera ruido en ramas remotas de Neon.
2. **Neon (Integración y Staging):** Utiliza una rama dedicada de Neon (ej. `dev`) y aplica migraciones de forma desatendida mediante `pnpm db:migrate:deploy`.
3. **Migrate dev contra Neon:** Requiere permisos para crear una shadow database. Si Neon limita la creación de bases secundarias, configura `shadowDatabaseUrl` en la configuración apuntando a otra base o rama auxiliar.
4. **Reseteo en ramas remotas:** Si una migración previa obsoleta ya fue aplicada en una rama de Neon, utiliza `pnpm --filter api exec prisma migrate reset` confirmándolo previamente con el equipo de desarrollo.

## Inmutabilidad y Seguridad por Filas (RLS)

### 1. Inmutabilidad en Base de Datos

Las tablas de hechos clínicos y auditoría son inmutables a nivel de base de datos para garantizar la integridad histórica (RF-09 y RF-21):

- `checkups`: No admite `UPDATE` ni `DELETE`. Correcciones clínicas se registran como nuevos controles vinculados mediante `corrected_checkup_id`.
- `alert_history`: No admite `UPDATE` ni `DELETE`. Solo admite inserciones secuenciales de transiciones de estado.
- `audit_logs`: No admite `UPDATE` ni `DELETE`. Bitácora de solo adición.

Cualquier intento de modificación o eliminación es rechazado por el trigger `forbid_mutation()` con código SQLSTATE `integrity_constraint_violation` (incluso para el owner de la base de datos).

### 2. Rol de la Aplicación (`nutrikids_app`) y Separación de Cadenas

Se implementa el principio de mínimo privilegio separando dos roles y cadenas de conexión:

- **`DIRECT_URL` (Owner de la BD):** Conexión con privilegios DDL completos, utilizada por el CLI de Prisma (`prisma migrate`), fixtures, seeds y pipelines de CI.
- **`DATABASE_URL` (Rol `nutrikids_app`):** Conexión restringida utilizada por la API Express en runtime:
  - Solo tiene permisos `SELECT`, `INSERT`, `UPDATE`, `DELETE` en tablas de negocio.
  - Tiene `REVOKED` explícitamente `UPDATE` y `DELETE` en las tablas inmutables (`checkups`, `alert_history`, `audit_logs`).
  - No tiene acceso a `_prisma_migrations`.
  - Está sujeta a las políticas de Row Level Security (RLS).

#### Fijar contraseña del rol `nutrikids_app` en local

Tras levantar el contenedor de Docker por primera vez y aplicar las migraciones, fija la contraseña del rol con:

```bash
docker exec nutrikids-postgres psql -U nutrikids -c "ALTER ROLE nutrikids_app PASSWORD 'nutrikids_app'"
```

### 3. Contexto de Usuario por Solicitud (`withUser`)

Para que las políticas de RLS identifiquen al usuario autenticado sin romper la compatibilidad con poolers de conexiones como PgBouncer, se utiliza el helper `withUser` (`apps/api/src/lib/prisma.ts`):

```ts
import { withUser } from './lib/prisma.js';

// En controladores o servicios:
const checkups = await withUser(req.user.id, async (tx) => {
  return tx.checkup.findMany({ where: { childId } });
});
```

`withUser` ejecuta una transacción aislada invocando `set_config('app.user_id', <id>, true)`. El tercer parámetro (`true`) delimita la variable localmente a la transacción actual (`SET LOCAL`). Si la consulta se ejecuta fuera de `withUser` o sin `app.user_id`, las políticas de RLS fallan en modo cerrado devolviendo cero filas.

### 4. Tablas con RLS y Exclusiones Justificadas

| Tabla                                                             | Estado RLS               | Política / Justificación                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `children`                                                        | **Activado**             | Acceso permitido solo a cuidadores o profesionales con asignación vigente.                                                                                                     |
| `consents`, `checkups`, `feeding_logs`, `follow_ups`, `reminders` | **Activado**             | Valida acceso al niño asociado mediante `app_has_child_access(child_id)`.                                                                                                      |
| `caregiver_children`                                              | **Activado**             | Visible si el usuario es el cuidador vinculado o tiene acceso al niño.                                                                                                         |
| `professional_children`                                           | **Activado**             | Visible si el usuario es el profesional asignado o tiene acceso al niño.                                                                                                       |
| `notifications`                                                   | **Activado**             | Filtro estricto por `user_id = app_user_id()`.                                                                                                                                 |
| `messages`                                                        | **Activado**             | Filtro estricto: `sender_id = app_user_id() OR recipient_id = app_user_id()`.                                                                                                  |
| `indicator_results`                                               | **Activado**             | Acceso encadenado vía `checkups` (`EXISTS`).                                                                                                                                   |
| `alerts`                                                          | **Activado**             | Acceso encadenado vía `indicator_results` (`EXISTS`).                                                                                                                          |
| `alert_history`                                                   | **Activado**             | Acceso encadenado vía `alerts` (`EXISTS`).                                                                                                                                     |
| `users`, `refresh_tokens`, `push_devices`                         | **Excluido**             | El flujo de autenticación e inicio de sesión ocurre antes de determinar la identidad del usuario en sesión; RLS bloquearía el login.                                           |
| `lms_references`, `educational_contents`                          | **Excluido**             | Catálogos y tablas de referencia pública accesibles por todos los usuarios del sistema.                                                                                        |
| `audit_logs`                                                      | **Excluido (por ahora)** | Protegida por trigger inmutable y `REVOKE` en `nutrikids_app`. Las consultas `INSERT ... RETURNING` de Prisma requerirían una política de `SELECT` que será definida en NK-42. |

## Sesión y Navegación por Rol (Mobile)

### 1. Almacenamiento Seguro de Sesión

Las credenciales y tokens se almacenan cifrados mediante `expo-secure-store` (`apps/mobile/src/lib/session-storage.ts`):

- Los tokens de acceso y renovación nunca se guardan en almacenamiento no seguro (`AsyncStorage` / `localStorage`).
- En dispositivos iOS y Android se utiliza la opción `keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- Los datos se validan en lectura y escritura mediante el esquema Zod `StoredSessionSchema`. Si los datos están corruptos, se purgan de forma automática (fail-safe).
- Los nombres de roles y rutas están centralizados en constantes (`USER_ROLES` de `@nutrikids/shared` y `APP_ROUTES` en `apps/mobile/src/constants/routes.ts`) para evitar strings hardcodeados.

### 2. Renovación Automática y Single-Flight Mutex

Dado que la API (`NK-13`) implementa rotación estricta de refresh tokens y revoca sesiones ante reutilizaciones concurrentes, el cliente HTTP (`apps/mobile/src/lib/api.ts`) cuenta con:

- **Renovación preventiva:** Si el token de acceso vence en menos de 30 segundos, se renueva antes de disparar la petición.
- **Single-Flight Mutex:** Una única promesa en curso (`refreshInFlight`) compartida entre solicitudes concurrentes para evitar enviar múltiples peticiones de renovación simultáneas con el mismo refresh token.
- **Reintento transparente:** Respuestas `401 Unauthorized` detonan la renovación y reintentan la petición original con el nuevo token.
- **Cierre de sesión automático:** Si la renovación falla (token expirado o revocado), se purga el almacenamiento seguro y se redirige automáticamente al flujo de login.

### 3. Navegación Protegida por Rol (Expo Router)

El guard de navegación en `apps/mobile/src/app/_layout.tsx` inspecciona reactivamente el estado de autenticación y el rol activo (`activeRole`):

- **Cuidador (`CAREGIVER`):** Carga la barra inferior de 5 accesos (`apps/mobile/src/app/(caregiver)/_layout.tsx`):
  1. `index`: Inicio («Mis niños», base para NK-21).
  2. `evolution`: Evolución (curvas OMS e historial antropométrico).
  3. `add-checkup`: Botón central circular destacado para registrar controles antropométricos.
  4. `messages`: Mensajes y recordatorios.
  5. `profile`: Mi perfil (datos del usuario, cambio de rol si aplica y cierre de sesión).
- **Profesional (`PROFESSIONAL`):** Carga el menú lateral (`Drawer`) con la bandeja de alertas como pantalla inicial (`apps/mobile/src/app/(professional)/_layout.tsx`):
  1. `index`: Bandeja de alertas nutricionales (base para NK-32).
  2. `children`: Niños clasificados por riesgo.
  3. `messages`: Mensajes y seguimientos asistenciales.
  4. `profile`: Mi perfil profesional.
- **Cuentas con Doble Rol:** Si el usuario tiene ambos perfiles (`roles.includes(USER_ROLES.CAREGIVER)` y `roles.includes(USER_ROLES.PROFESSIONAL)`), la pantalla de perfil y el menú lateral ofrecen una acción para alternar instantáneamente entre la vista de cuidador y la de profesional, persistiendo la selección en el almacenamiento seguro.

### 4. Resoluciones de Alcance de la Issue

- **Tema visual común:** Desacoplado en su propia issue independiente; se utilizaron estilos locales limpios con la paleta institucional (`#16A34A` / `#059669` / `#F0FDF4`) para no bloquear el desarrollo de las pantallas.
- **Pantalla de Perfil:** En esta issue se construyó el contenedor funcional de sesión, datos básicos y cambio de rol. La gestión completa de datos personales y derechos del representante se absorberá en **NK-41**, y la acción de revocación de consentimientos por niño se incorporará en **NK-20**.

## Registro e Inicio de Sesión (Mobile NK-19)

### 1. Pantallas de Autenticación

El módulo de autenticación implementa las interfaces descritas en la Figura 5 del informe del proyecto:

- **Inicio de sesión (`apps/mobile/src/app/(auth)/login.tsx`):**
  - Campos de correo electrónico y contraseña con botón para alternar visibilidad (mostrar/ocultar).
  - Enlace directo a recuperación de contraseña y a creación de cuenta.
  - Soporte para segundo factor (2FA): si las credenciales corresponden a un profesional con 2FA habilitado (`requiresTwoFactor: true`), la interfaz pasa al segundo paso solicitando el código TOTP de 6 dígitos o un código de recuperación.
- **Creación de cuenta (`apps/mobile/src/app/(auth)/register.tsx`):**
  - Selector de perfil mediante chips (`Cuidador` y `Profesional de Salud`, permitiendo perfiles individuales o combinados).
  - Datos personales: nombre, apellido, correo electrónico, teléfono opcional.
  - Campos condicionales para profesionales: especialidad (`pediatrics`, `nutrition`, `nursing`), número de licencia / matrícula y código de invitación.
  - Contraseña con confirmación validada en el cliente y visibilidad alternable.
- **Recuperación de contraseña (`apps/mobile/src/app/(auth)/forgot-password.tsx` y `reset-password.tsx`):**
  - Formulario de solicitud ingresando el correo electrónico (`POST /auth/forgot-password`).
  - Formulario de restablecimiento con token único y nueva contraseña (`POST /auth/reset-password`).

### 2. Validación y Manejo de Errores

- **Validación con Zod:** Se utilizan los esquemas estrictos de `@nutrikids/shared` (`LoginInputSchema`, `RegisterInputSchema`, `ForgotPasswordInputSchema`, `ResetPasswordInputSchema`).
- **Mensajes de error en español:** Errores de campo se mapean e inlinean automáticamente bajo cada input (`extractZodFieldErrors`). Errores de servidor (401 credenciales incorrectas, 403 cuenta inactiva, 409 correo duplicado, 429 límite de intentos excedido, errores de red) se traducen a mensajes amigables y precisos (`apps/mobile/src/lib/auth-errors.ts`).
- **Ausencia de strings mágicos:** Todas las rutas de autenticación se gestionan mediante la constante centralizada `APP_ROUTES.AUTH`.

### 3. Resoluciones de Criterios de Aceptación (NK-19)

1. **Segundo paso con código:** Se clarifica que el segundo paso del login corresponde al token TOTP o código de recuperación de 2FA (vinculado a **NK-14**). El código de invitación profesional (`invitationCode`) es exclusivo del registro de cuentas profesionales.
2. **Recuperación de contraseña:** Las pantallas de solicitud y restablecimiento quedan operativas contra los endpoints de la API (`NK-13`). El envío de correos electrónicos transaccionales y el manejo de enlaces universales (deep links) dependerán de la infraestructura de correo del backend.
3. **Activación de 2FA con código QR:** Dado que **NK-14** se centra en la lógica de backend, la pantalla móvil para enrolar y escanear el código QR se desarrollará en una issue de interfaz dedicada tras completar NK-14.
