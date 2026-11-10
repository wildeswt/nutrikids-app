# NutriKids App

Monorepo para **NutriKids**, construido con **React Native (Expo) + TypeScript**, **Node.js (Express) + Prisma** y **PostgreSQL** en Docker.

## Stack tecnológico

- **Mobile (`apps/mobile`):** React Native · Expo · Expo Router · TypeScript
- **API (`apps/api`):** Node.js · Express 5 · TypeScript · Prisma 7 (`@prisma/adapter-pg`) · Vitest + Supertest
- **Shared (`packages/shared`):** `@nutrikids/shared` — esquemas Zod y tipos compartidos entre mobile y backend
- **Base de datos:** PostgreSQL 16 (`docker-compose.yml`, puerto host `5433` por defecto)
- **Tooling:** pnpm workspaces · ESLint (Flat Config) · Prettier · Husky + lint-staged · GitHub Actions (CI)

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

Al abrir la app verás **`API OK ✅`** junto con **`Base de datos: ok`** consumiendo `GET /health`.

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
