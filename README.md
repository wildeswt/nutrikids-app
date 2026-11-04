# NutriKids App

Monorepo para **NutriKids**, construido con **React Native (Expo) + TypeScript**, **Node.js (Express) + Prisma** y **PostgreSQL** en Docker.

## Stack tecnológico

- **Mobile (`apps/mobile`):** React Native · Expo · Expo Router · TypeScript
- **API (`apps/api`):** Node.js · Express 5 · TypeScript · Prisma 7 (`@prisma/adapter-pg`) · Vitest + Supertest
- **Shared (`packages/shared`):** `@nutrikids/shared` — esquemas Zod y tipos compartidos entre mobile y backend
- **Base de datos:** PostgreSQL 16 (`docker-compose.yml`, puerto host `5433` por defecto)
- **Tooling:** pnpm workspaces · ESLint (Flat Config) · Prettier · Husky + lint-staged

## Estructura del monorepo

```text
nutrikids-app/
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
| `pnpm db:generate`                  | Regenera el cliente tipado de Prisma                                     |
| `pnpm db:studio`                    | Abre Prisma Studio para explorar la base de datos en el navegador        |
