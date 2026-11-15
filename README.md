# NutriKids App

Monorepo for **NutriKids**, built with **React Native (Expo) + TypeScript**, **Node.js (Express) + Prisma**, and **PostgreSQL** in Docker.

## Tech Stack

- **Mobile (`apps/mobile`):** React Native, Expo, Expo Router, TypeScript
- **API (`apps/api`):** Node.js, Express 5, TypeScript, Prisma 7 (`@prisma/adapter-pg`), Vitest + Supertest
- **Shared (`packages/shared`):** `@nutrikids/shared` - Zod schemas and shared TypeScript types between mobile and backend
- **WHO Growth (`packages/who-growth`):** `@nutrikids/who-growth` - Pure TypeScript implementation of WHO LMS z-score calculations and classification
- **Database:** PostgreSQL 16 (`docker-compose.yml`, default host port `5433`)
- **Tooling:** pnpm workspaces, ESLint (Flat Config), Prettier, Husky + lint-staged, GitHub Actions (CI)

## Monorepo Structure

```text
nutrikids-app/
├── .github/
│   └── workflows/
│       └── ci.yml           # CI pipeline (lint, format, types, tests with Postgres)
├── apps/
│   ├── api/                 # Express API server + Prisma + tests
│   └── mobile/              # React Native app (Expo + Expo Router)
├── packages/
│   ├── shared/              # Shared Zod schemas and TypeScript types
│   └── who-growth/          # WHO Child Growth Standards (LMS calculation)
├── docs/                    # Architecture, API index and per-feature documentation
├── scripts/
│   └── backup/              # Encrypted PostgreSQL backup and restore (NK-44)
├── docker-compose.yml       # PostgreSQL 16 with persistent volume
├── .env.example             # Environment variable template
├── eslint.config.mjs        # Global ESLint configuration
├── pnpm-workspace.yaml      # Workspace definitions
├── tsconfig.base.json       # Base strict TypeScript configuration
└── package.json             # Root monorepo scripts
```

## Architecture

```mermaid
flowchart LR
  APP["apps/mobile\nExpo + React Native"] -->|"REST / JSON, bearer token"| API["apps/api\nExpress 5 + Prisma"]
  API -->|"role nutrikids_app + RLS"| DB[("PostgreSQL 16")]
  API -->|"push"| PUSH["Expo push service"]
  PUSH --> APP
  SH["packages/shared\nZod schemas"] -.-> APP
  SH -.-> API
  WG["packages/who-growth\nWHO LMS z-scores"] -.-> API
```

- The app is a **native mobile app** (React Native with Expo; Android and iOS, plus Expo's web target for development). It only talks to the API.
- The API validates every request with the Zod schemas of `@nutrikids/shared`, checks role, permission, child link and informed consent, and runs every query inside `withUser(userId, ...)` so PostgreSQL Row Level Security applies as a second barrier.
- The API computes the WHO indicators with `@nutrikids/who-growth` when a checkup is stored and raises alerts in the same transaction.
- Three background jobs run inside the API process: overdue alerts, due reminders and execution of erasure requests.

More diagrams (request flow, alert states, data model) and a list of what is not implemented yet: [docs/architecture.md](docs/architecture.md). Every endpoint: [docs/api.md](docs/api.md).

## Prerequisites

- **Node.js** `>= 22.12.0`
- **pnpm** `>= 10.0.0`
- **Docker Desktop** (running, to spin up PostgreSQL)
- **Expo Go** on your physical device (optional)

## Getting Started

1. **Create environment variables file:**

   ```bash
   cp .env.example .env
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Start PostgreSQL in Docker:**

   ```bash
   pnpm db:up
   ```

4. **Apply migrations and generate Prisma client:**

   ```bash
   pnpm db:migrate
   ```

5. **Start development environment:**

   - **Recommended (2 separate terminals, preserves Expo interactive menu and QR):**
     ```bash
     # Terminal 1 - Backend (http://localhost:3000)
     pnpm dev:api

     # Terminal 2 - Expo Mobile App
     pnpm dev:mobile
     ```
   - **Single terminal (combined logs):**
     ```bash
     pnpm dev
     ```

## Connecting Mobile App to API

Configure `EXPO_PUBLIC_API_URL` (in `.env` or `apps/mobile/.env`) based on target runtime:

| Target                    | `EXPO_PUBLIC_API_URL` Value                                       |
| ------------------------- | ----------------------------------------------------------------- |
| Web / iOS Simulator       | `http://localhost:3000`                                           |
| Android Emulator          | `http://10.0.2.2:3000` _(also auto-rewritten from `localhost`)_   |
| Physical Device (Expo Go) | `http://<YOUR_LOCAL_IP>:3000` _(e.g. `http://192.168.1.50:3000`)_ |

Opening the app displays **`API OK`** alongside **`Base de datos: ok`** by querying `GET /health`.

## Running Each Module

All commands run from the repository root. `pnpm install` and `pnpm db:up` come first (see Getting Started).

| Module                                   | Run                                                              | Check                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| PostgreSQL (Docker)                      | `pnpm db:up` / `pnpm db:down`                                    | `pnpm db:logs`; the container is `nutrikids-postgres` on port `5433`               |
| Migrations and Prisma client             | `pnpm db:migrate` (dev), `pnpm db:migrate:deploy` (unattended)   | `pnpm db:studio`                                                                   |
| WHO reference + dev seed                 | `pnpm db:seed`                                                   | See "Development Seed"                                                             |
| API (`apps/api`)                         | `pnpm dev:api` (http://localhost:3000)                           | `GET /health` answers `{ "status": "ok", "db": "ok" }`                             |
| Mobile (`apps/mobile`)                   | `pnpm dev:mobile` (Expo; `a` Android, `i` iOS, `w` web)          | Home shows the API status; see "Connecting Mobile App to API"                      |
| `packages/shared`, `packages/who-growth` | Built automatically by the API scripts (`pnpm build` builds all) | `pnpm --filter @nutrikids/shared test`, `pnpm --filter @nutrikids/who-growth test` |
| Backups                                  | `scripts/backup/backup.sh`, `scripts/backup/restore.sh`          | [docs/backups.md](docs/backups.md)                                                 |
| All tests                                | `pnpm test` (API tests need the migrated database)               | `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` is what CI runs    |

Single API test file: `pnpm --filter api exec vitest run src/__tests__/<file>.test.ts`.

## Environment Variables

Copy `.env.example` to `.env` at the repository root (the API also reads `apps/api/.env`). Every variable has a default for local development unless marked required. Invalid values stop the API at startup.

### Database

| Variable                                                             | Default                      | Meaning                                                                                              |
| -------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | `nutrikids` x3, `5433`       | Used by `docker-compose.yml` only.                                                                   |
| `DATABASE_URL`                                                       | local `nutrikids` database   | API runtime connection. Use the restricted role `nutrikids_app` so RLS applies (pooled URL on Neon). |
| `DIRECT_URL`                                                         | falls back to `DATABASE_URL` | Owner connection for Prisma migrations, the seed, CI and backups.                                    |

### API

| Variable                                       | Default              | Meaning                                                                                                               |
| ---------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                     | `development`        | `development`, `test` or `production`. Production makes the next two required and blocks the seed.                    |
| `PORT`                                         | `3000`               | HTTP port.                                                                                                            |
| `CORS_ORIGIN`                                  | `*`                  | `*` or a comma-separated list of allowed origins.                                                                     |
| `JWT_ACCESS_SECRET`                            | dev value            | Signing secret, at least 32 characters. **Required in production.**                                                   |
| `PROFESSIONAL_INVITE_CODES`                    | `NK-PROF-2026` (dev) | Comma-separated invitation codes to register as a professional. **Required in production.**                           |
| `ACCESS_TOKEN_TTL_SECONDS`                     | `900`                | Access token lifetime.                                                                                                |
| `REFRESH_TOKEN_TTL_DAYS`                       | `30`                 | Refresh token lifetime.                                                                                               |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`   | `5`, `15`            | Failed sign-in attempts allowed per IP + email in the window; then `429`.                                             |
| `LOOKUP_MAX_ATTEMPTS`, `LOOKUP_WINDOW_MINUTES` | `10`, `15`           | Professional lookups (`GET /professionals/lookup`) allowed per user in the window, hits and misses alike; then `429`. |
| `ALERT_REVIEW_DEADLINE_HOURS`                  | `72`                 | Hours an alert may stay unreviewed before it is overdue.                                                              |
| `ALERT_REVIEW_DEADLINE_SEVERE_HOURS`           | `24`                 | Same for severe alerts; must be at most the previous one.                                                             |
| `OVERDUE_ALERTS_INTERVAL_MINUTES`              | `60`                 | How often the overdue-alerts and reminders jobs run.                                                                  |
| `OVERDUE_ALERT_RENOTIFY_HOURS`                 | `24`                 | Minimum hours before notifying the same professional again about the same overdue alert.                              |
| `REMINDER_LEAD_HOURS`                          | `24`                 | Hours before a reminder's date at which caregivers are notified ([docs/reminders.md](docs/reminders.md)).             |
| `ERASURE_GRACE_DAYS`                           | `7`                  | Days between an erasure request and its execution, 0 to 14 ([docs/data-rights.md](docs/data-rights.md)).              |
| `CUTOFF_*`, `OVERWEIGHT_CRITERION`             | WHO defaults         | Optional classification cutoffs (z-scores) and overweight criterion (`WFLH`, `BFA`, `both`); see `.env.example`.      |

### Mobile and backups

| Variable                | Default                 | Meaning                                                                                           |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`   | `http://localhost:3000` | API base URL seen from the app (see "Connecting Mobile App to API").                              |
| `BACKUP_PASSPHRASE`     | none, **required**      | Passphrase that encrypts backups (`scripts/backup`). Keep it outside the backup directory.        |
| `BACKUP_DIR`            | `./backups`             | Where `backup.sh` writes.                                                                         |
| `BACKUP_RETENTION_DAYS` | `30`                    | Backups older than this are deleted.                                                              |
| `DOCKER_CONTAINER`      | none                    | Run `pg_dump`/`psql` inside this container (`nutrikids-postgres` locally) instead of local tools. |
| `RESTORE_CLEAN`         | unset                   | `1` makes `restore.sh` drop and recreate the target database first.                               |

## Documentation

| Document                                                       | Topic                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                   | Components, request flow, alert states, data model, what is not implemented yet. |
| [docs/api.md](docs/api.md)                                     | Index of every endpoint with its guards.                                         |
| [docs/auth.md](docs/auth.md)                                   | Registration, login, tokens, password recovery, rate limit.                      |
| [docs/permissions.md](docs/permissions.md)                     | Roles, specialties, child link and permission matrix.                            |
| [docs/alerts.md](docs/alerts.md)                               | Alert generation, state machine and review deadline.                             |
| [docs/follow-ups.md](docs/follow-ups.md)                       | Clinical follow-ups and the next-checkup reminder.                               |
| [docs/sync.md](docs/sync.md)                                   | Offline checkup sync endpoint.                                                   |
| [docs/notifications.md](docs/notifications.md)                 | Internal notifications and push delivery.                                        |
| [docs/reminders.md](docs/reminders.md)                         | Reminders and their scheduled dispatch.                                          |
| [docs/feeding-and-education.md](docs/feeding-and-education.md) | Feeding logs and educational content.                                            |
| [docs/data-rights.md](docs/data-rights.md)                     | Rectify, export and delete the child's data.                                     |
| [docs/backups.md](docs/backups.md)                             | Encrypted backups, restore and retention policy.                                 |
| [docs/i18n.md](docs/i18n.md)                                   | Spanish and Kichwa translations in the app.                                      |
| [docs/informe-cambios.md](docs/informe-cambios.md)             | Changes the analysis report needs (Spanish), checked against this code.          |

## Root Scripts

| Command                             | Description                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`                          | Runs `api` and `mobile` concurrently                                           |
| `pnpm dev:api`                      | Starts Express API server in watch mode (`tsx`)                                |
| `pnpm dev:mobile`                   | Starts Expo dev server with interactive terminal and QR code                   |
| `pnpm dev:phone`                    | Expo Go on a phone in the same Wi-Fi (`expo start --lan --go`)                 |
| `pnpm dev:phone:tunnel`             | Same over an Expo tunnel, for other networks (slow on low upload bandwidth)    |
| `pnpm build`                        | Builds all workspace packages                                                  |
| `pnpm typecheck`                    | Verifies TypeScript types across `shared`, `who-growth`, `api`, and `mobile`   |
| `pnpm test`                         | Runs test suite across all packages (Vitest + Supertest)                       |
| `pnpm lint` / `pnpm lint:fix`       | Runs ESLint across all packages                                                |
| `pnpm format` / `pnpm format:check` | Formats or verifies format with Prettier                                       |
| `pnpm db:up` / `pnpm db:down`       | Starts or stops PostgreSQL Docker container                                    |
| `pnpm db:logs`                      | Tails PostgreSQL Docker container logs                                         |
| `pnpm db:migrate`                   | Creates/applies Prisma migrations in development                               |
| `pnpm db:migrate:deploy`            | Applies pending migrations unattended (CI / production)                        |
| `pnpm db:seed`                      | Seeds WHO LMS tables and synthetic development data (disallowed in production) |
| `pnpm db:generate`                  | Regenerates typed Prisma client                                                |
| `pnpm db:studio`                    | Opens Prisma Studio web UI                                                     |

## Development Seed (Synthetic Data)

`pnpm db:seed` (requires running and migrated DB) is idempotent and creates **purely synthetic** development data:

- WHO 2006 LMS reference tables (`lms_references`).
- Specification example child: Mateo Jose Rodriguez (born May 12, 2023), with 4 checkups in 2026 and 16 indicator results calculated using `@nutrikids/who-growth`.
- Checkup on Oct 18, 2026 (12.2 kg, 97.0 cm): W/LH z-score approx -2.24, triggering a wasting alert in `PENDING_REVIEW` with its audit history (`GENERATED` -> `PENDING_REVIEW`).
- Synthetic accounts (dev password: `NutriKids-Dev-2026`): `ana.rodriguez@example.test` (caregiver), `enfermera.dev@example.test`, and `pediatra.dev@example.test`.

Uses `DIRECT_URL` (database owner) and **aborts if `NODE_ENV=production`**.

## Continuous Integration (GitHub Actions CI)

Every Pull Request targeting `main` or `develop` (and every push to them) runs the validation pipeline in [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

1. **Install:** `pnpm install --frozen-lockfile` (enforces `pnpm-lock.yaml` integrity).
2. **Format:** `pnpm format:check` (Prettier).
3. **Lint:** `pnpm lint` (ESLint on all packages).
4. **Types:** `pnpm typecheck` (`tsc --noEmit` across all workspaces).
5. **PostgreSQL Service:** Spins up `postgres:16-alpine` service container and tests availability with `pg_isready`.
6. **Migrations:** `pnpm db:migrate:deploy` applies Prisma migrations on the CI database.
7. **Tests:** `pnpm test` runs Vitest and Supertest suites.

## Branch Convention

All new contributions must be made on a feature/topic branch derived from `develop` or `main`:

| Prefix            | Purpose                                               | Example                      |
| ----------------- | ----------------------------------------------------- | ---------------------------- |
| `feature/<name>`  | New features or screens                               | `feature/user-auth`          |
| `fix/<name>`      | Bug fixes                                             | `fix/api-connection-timeout` |
| `chore/<name>`    | Maintenance tasks, dependencies, or configuration     | `chore/english-naming`       |
| `docs/<name>`     | Documentation changes only                            | `docs/update-readme`         |
| `refactor/<name>` | Code refactoring without behavioral or visible change | `refactor/api-routes`        |
| `test/<name>`     | Addition or adjustment of automated tests             | `test/child-endpoints`       |

## Commit Convention (Conventional Commits)

Commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```text
<type>(<optional scope>): <concise description in imperative lowercase>
```

- **Primary Types:**
  - `feat`: New feature (`feat(api): add auth endpoint`).
  - `fix`: Bug fix (`fix(mobile): resolve shared import in metro`).
  - `chore`: Build tasks, dependencies, or configuration (`chore(who-growth): rename files to english naming`).
  - `docs`: Documentation updates (`docs: translate documentation and test titles to english`).
  - `test`: Unit or integration test additions/fixes (`test(api): add tests for checkups`).
  - `refactor`: Code changes that neither fix a bug nor add a feature (`refactor(shared): split health schema`).
  - `ci`: CI pipeline updates (`ci: add postgres service to pr workflow`).

## Language and Code Naming Convention

The codebase enforces a clear language separation:

- **In English:**
  - All code identifiers (variables, functions, types, interfaces, classes, enums).
  - All filenames and directory names (e.g. `age.ts`, `length-height.ts`, `classification.ts`).
  - Code comments and JSDoc annotations.
  - Test suite titles and descriptions (`describe(...)`, `it(...)`).
  - Documentation files (`docs/`, `README.md`).
- **In Spanish:**
  - System logs (`console.log`, `console.error`).
  - User-facing error strings (API error responses, Zod validation issue messages, mobile client UI copy).
  - External domain-specific constants (such as `'WHO 2006'` for `referenceVersion`).
- **Database Values:**
  - Values stored in PostgreSQL are in English, uppercase with underscore (e.g., `SEVERE_WASTING`, `WASTING`, `NORMAL`, `CAREGIVER`, `PROFESSIONAL`).
- **Emoji Rule:**
  - Zero emojis in code, comments, documentation, and commit messages.

## Main Branch Protection in GitHub

To ensure stability on the `main` branch:

1. Open your GitHub repository and go to **Settings** > **Branches**.
2. Click **Add branch protection rule** for branch pattern `main`.
3. Enable:
   - **Require a pull request before merging**
   - **Require status checks to pass before merging** (select `Validate PR (Install, Lint, Format, Types, Tests)`)
   - **Require branches to be up to date before merging**
   - **Do not allow bypassing the above settings**
4. Save changes.

## Data Model and Name Equivalence

The relational model originates from the project specification (Table 4). To maintain consistency with TypeScript and Node.js standards, the following naming conventions apply:

- **TypeScript / Prisma Code:** Singular `PascalCase` models (e.g. `Checkup`, `Child`) and `camelCase` attributes (e.g. `weightKg`, `measuredAt`).
- **PostgreSQL Database:** Plural `snake_case` tables (e.g. `checkups`, `children`), mapped with `@@map("checkups")`. Column names in `snake_case` (e.g. `weight_kg`), mapped with `@map("weight_kg")`.
- **Specification Report:** Retains the original conceptual domain names in Spanish.

### Equivalence Table (19 Specification Tables + 3 Infrastructure Tables = 22 Tables)

| Report Entity (Table 4)         | Prisma Model (TS)    | PostgreSQL Table        | Purpose / Area                                                        |
| ------------------------------- | -------------------- | ----------------------- | --------------------------------------------------------------------- |
| `usuario`                       | `User`               | `users`                 | Shared identity supertype                                             |
| `cuidador`                      | `Caregiver`          | `caregivers`            | User subtype with caregiver role (1:1 with `User`)                    |
| `profesional`                   | `Professional`       | `professionals`         | User subtype with health professional role (1:1 with `User`)          |
| `nino`                          | `Child`              | `children`              | Central pediatric patient entity (1 to 5 years old)                   |
| `cuida`                         | `CaregiverChild`     | `caregiver_children`    | N:M link between child and caregiver (composite PK)                   |
| `atiende`                       | `ProfessionalChild`  | `professional_children` | N:M clinical assignment between professional and child with validity  |
| `consentimiento`                | `Consent`            | `consents`              | Legal authorization and personal data processing consent              |
| `control`                       | `Checkup`            | `checkups`              | Immutable anthropometric record (weight, height, position)            |
| `referencia_lms`                | `LmsReference`       | `lms_references`        | WHO reference tables (L, M, S parameters by sex, age, length/height)  |
| `resultado_indicador`           | `IndicatorResult`    | `indicator_results`     | Persisted z-score, percentile, and nutritional classification         |
| `registro_alimentacion`         | `FeedingLog`         | `feeding_logs`          | Feeding and meal frequency logs                                       |
| `alerta`                        | `Alert`              | `alerts`                | Nutritional risk detection (wasting, stunting, overweight, etc.)      |
| `alerta_historial`              | `AlertHistory`       | `alert_history`         | Immutable audit trail of alert state transitions                      |
| `seguimiento`                   | `FollowUp`           | `follow_ups`            | Clinical action plans (observation, recommendation, referral)         |
| `mensaje`                       | `Message`            | `messages`              | Bidirectional user communication                                      |
| `recordatorio`                  | `Reminder`           | `reminders`             | Scheduling of upcoming checkups and activities                        |
| `notificacion`                  | `Notification`       | `notifications`         | In-app notifications for alerts and events                            |
| `contenido_educativo`           | `EducationalContent` | `educational_contents`  | Nutritional guidelines filtered by child age                          |
| `auditoria`                     | `AuditLog`           | `audit_logs`            | Immutable system audit trail                                          |
| _(Infrastructure NK-13, NK-14)_ | `RefreshToken`       | `refresh_tokens`        | Active sessions, rotation, and revocation of JWTs                     |
| _(Infrastructure NK-36)_        | `PushDevice`         | `push_devices`          | Device push notification tokens                                       |
| _(Infrastructure NK-41)_        | `ErasureRequest`     | `erasure_requests`      | Legal representative deletion requests with grace period and due date |

## Database Configuration and Neon

The project supports local PostgreSQL (via Docker) and serverless databases on **Neon**:

### Connection URLs (Pooled vs Direct)

Neon provides two distinct connection strings:

- **Pooled (`DATABASE_URL`, host with `-pooler`):** Uses PgBouncer in transaction mode to pool API runtime connections under high concurrency.
- **Direct (`DIRECT_URL`, host without `-pooler`):** Direct connection to PostgreSQL without connection pooling, required by Prisma CLI for migrations (`prisma migrate dev`, `prisma migrate deploy`) to avoid DDL locking conflicts.

Both URLs require `?sslmode=require`.

In `apps/api/prisma.config.ts`, Prisma CLI prioritizes direct connections automatically:

```ts
datasource: {
  url:
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    'postgresql://nutrikids:nutrikids@localhost:5433/nutrikids?schema=public',
}
```

## Immutability and Row-Level Security (RLS)

### 1. Database Immutability

Clinical fact and audit tables are immutable at database level to guarantee historical integrity (RF-09 and RF-21):

- `checkups`: Disallows `UPDATE` and `DELETE`. Corrections are recorded as new checkups referencing original via `corrected_checkup_id`.
- `alert_history`: Disallows `UPDATE` and `DELETE`. Append-only state transition history.
- `audit_logs`: Disallows `UPDATE` and `DELETE`. Append-only audit trail.

Any mutation or deletion attempt is aborted by the `forbid_mutation()` trigger with SQLSTATE `integrity_constraint_violation`.

### 2. Application Role (`nutrikids_app`) and Connection Separation

- **`DIRECT_URL` (DB Owner):** Full DDL privileges, used by Prisma CLI (`prisma migrate`), test fixtures, seeds, and CI pipelines.
- **`DATABASE_URL` (`nutrikids_app` Role):** Restricted connection used by Express API runtime:
  - Grants only `SELECT`, `INSERT`, `UPDATE`, `DELETE` on business tables.
  - Explicitly `REVOKED` `UPDATE` and `DELETE` on immutable tables (`checkups`, `alert_history`, `audit_logs`).
  - Enforces Row Level Security (RLS) policies.

### 3. Request-Scoped User Context (`withUser`)

To enable RLS identification compatible with transaction poolers like PgBouncer, the `withUser` helper (`apps/api/src/lib/prisma.ts`) is used:

```ts
import { withUser } from './lib/prisma.js';

const checkups = await withUser(req.auth.userId, async (tx) => {
  return tx.checkup.findMany({ where: { childId } });
});
```

`withUser` executes an isolated transaction running `set_config('app.user_id', <id>, true)`. The third parameter (`true`) scopes the configuration locally to the active transaction (`SET LOCAL`). Queries executed outside `withUser` fail-closed by returning zero rows under RLS.

## Session and Role-based Navigation (Mobile)

### 1. Secure Session Storage

Credentials and tokens are stored encrypted via `expo-secure-store` (`apps/mobile/src/lib/session-storage.ts`):

- Access and refresh tokens are never stored in unencrypted storage (`AsyncStorage` / `localStorage`).
- Uses `keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY` on iOS and Android.
- Data is strictly validated upon reading and writing using `StoredSessionSchema`.

### 2. Automatic Token Refresh and Single-Flight Mutex

HTTP client (`apps/mobile/src/lib/api.ts`) implements:

- **Proactive Refresh:** If the access token expires in less than 30 seconds, it is refreshed prior to dispatching the request.
- **Single-Flight Mutex:** A single in-flight refresh promise (`refreshInFlight`) shared across concurrent requests prevents duplicate refresh requests.
- **Transparent Retry:** `401 Unauthorized` triggers token refresh and automatically retries the initial request.
- **Automatic Logout:** If refresh fails (expired or revoked token), session storage is purged and the app redirects to login.

### 3. Role-Protected Navigation (Expo Router)

The navigation guard in `apps/mobile/src/app/_layout.tsx` inspects auth status and `activeRole`:

- **Caregiver (`CAREGIVER`):** Bottom tab navigation with 5 actions (`apps/mobile/src/app/(caregiver)/_layout.tsx`):
  1. `index`: Home ("Mis niños").
  2. `evolution`: Evolution (WHO curves and anthropometric history).
  3. `add-checkup`: Central elevated button for recording checkups.
  4. `messages`: Messages and reminders.
  5. `profile`: Profile and role switcher.
     Linking a professional (`link-professional`): from the child card in «Mis niños» and Inicio (button «+ Vincular profesional», or the linked professional row that opens `child-professionals` to list and unlink), from the «¡Niño registrado!» screen (`child-registered`) shown after registering a child.
- **Professional (`PROFESSIONAL`):** Drawer navigation with alerts inbox as home (`apps/mobile/src/app/(professional)/_layout.tsx`):
  1. `index`: Nutritional alerts inbox.
  2. `children`: Children categorized by risk.
  3. `messages`: Messages and care follow-ups.
  4. `profile`: Professional profile.
- **Dual-Role Accounts:** Users holding both roles can toggle between Caregiver and Professional interfaces seamlessly.

## Registration and Login (Mobile NK-19)

### 1. Authentication Screens

- **Login (`apps/mobile/src/app/(auth)/login.tsx`):**
  - Email and password fields with toggleable visibility.
  - Password recovery and account creation links.
  - Second-step prompt (6-digit TOTP or recovery code) shown when the API answers `requiresTwoFactor: true`. The API does not enable two-factor authentication yet (it always answers `false`), so the prompt is not reachable today.
- **Registration (`apps/mobile/src/app/(auth)/register.tsx`):**
  - Profile selector chips (`Cuidador` and `Profesional de Salud`, supporting dual registration).
  - Demographics: first name, last name, email, optional phone.
  - Conditional fields for professionals: specialty (`pediatrics`, `nutrition`, `nursing`), license number, and invitation code.
  - Password confirmation validated on client with visibility toggles.
- **Password Recovery (`apps/mobile/src/app/(auth)/forgot-password.tsx` and `reset-password.tsx`):**
  - Request form taking email (`POST /auth/forgot-password`).
  - Reset form taking reset token and new password (`POST /auth/reset-password`).

## Database Backups (NK-44)

`scripts/backup/backup.sh` creates a PostgreSQL backup encrypted with AES-256 and deletes the ones older than `BACKUP_RETENTION_DAYS` (30 by default); `scripts/backup/restore.sh` restores one into a new database. Usage, the tested restore procedure, key management and the retention policy are in [docs/backups.md](docs/backups.md).

## Push Notifications (Android / FCM / EAS — NK-36)

The application supports real-time push alerts and in-app notifications for health professionals upon risk detection or overdue reviews (RF-13, RT-09). Detailed architecture is available in [docs/notifications.md](docs/notifications.md).

### 1. Requirements for Real Android Push (Expo Go Limitations)

Starting with Expo SDK 53+, remote push notifications on Android via Firebase Cloud Messaging (FCM) are **not supported in standard Expo Go**. To test and receive remote push notifications on physical devices:

- A **Development Build** (`expo-dev-client`) or production APK/AAB is required.
- Emulators and simulators cannot receive native remote push notifications (`Device.isDevice === false`).
- Web runtime safely bypasses push registration (`Platform.OS === 'web'`).

### 2. Generating Android Development Build

```bash
# 1. Install EAS CLI globally
pnpm add -g eas-cli

# 2. Log in with your Expo account
eas login

# 3. Ensure dependencies are installed (expo-dev-client is included in apps/mobile/package.json)
pnpm install

# 4. Initialize EAS project (sets expo.extra.eas.projectId in app.json)
cd apps/mobile
eas init

# 5. Configure build profiles (generates eas.json)
eas build:configure

# 6. Verify that eas.json contains "developmentClient": true and "distribution": "internal"
#    under the "development" build profile:
#    "development": {
#      "developmentClient": true,
#      "distribution": "internal"
#    }

# 7. Create development build
eas build --profile development --platform android
```

### 3. Firebase Cloud Messaging (FCM v1) Setup

1. **Firebase Console:** Create a Firebase project and add an Android application with package name `com.nutrikids.app`.
2. **Configuration File:** Download `google-services.json` and place it in `apps/mobile/google-services.json`.
3. **App Manifest:** In `apps/mobile/app.json`, enable the Google Services configuration under `"android"`:
   ```json
   "android": {
     "package": "com.nutrikids.app",
     "googleServicesFile": "./google-services.json"
   }
   ```
   > Note: Do not add `googleServicesFile` to `app.json` before placing the physical file in `apps/mobile/`, otherwise builds will fail.
4. **Service Account Credentials:** In Google Cloud Console, generate a service account private key (JSON) with the **Firebase Cloud Messaging API (V1)** role.
5. **Upload to EAS:** Run `eas credentials` and configure the Google Service Account Key for FCM v1 under Android build credentials.
