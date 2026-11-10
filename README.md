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
