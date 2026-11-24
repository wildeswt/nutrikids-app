# Despliegue Web móvil en Vercel (`apps/mobile`)

Guía para publicar la versión Web (enfocada a navegadores móviles) de NutriKids en Vercel conectada a la API desplegada en Railway (`railway.json`).

## 1. Configuración del proyecto en Vercel

Al importar el repositorio en Vercel:

- **Framework Preset:** `Other`
- **Root Directory:** `apps/mobile` (Vercel leerá automáticamente [`apps/mobile/vercel.json`](../apps/mobile/vercel.json) y detectará `pnpm` en la raíz del monorepo)
- **Build Command:** `pnpm --filter @nutrikids/shared build && pnpm --filter @nutrikids/who-growth build && pnpm --filter mobile build:web` (definido en `vercel.json`)
- **Output Directory:** `dist` (definido en `vercel.json`)

### Variable de entorno en Vercel

Configura la siguiente variable antes de ejecutar el build (Metro la incrusta en tiempo de compilación):

| Variable              | Valor ejemplo                          | Notas                                               |
| --------------------- | -------------------------------------- | --------------------------------------------------- |
| `EXPO_PUBLIC_API_URL` | `https://nutrikids-api.up.railway.app` | Sin barra final (`/`). Obligatorio usar `https://`. |

> Nota: Si cambias `EXPO_PUBLIC_API_URL`, debes lanzar un nuevo deploy en Vercel para que quede reflejada en el bundle estático.

## 2. Configuración de CORS en Railway (`apps/api`)

En el servicio de la API en Railway, configura `CORS_ORIGIN` con la URL exacta del frontend en Vercel (sin `*` en producción):

```env
CORS_ORIGIN=https://tu-app.vercel.app
```

Si usas dominio propio o varios orígenes (por ejemplo preview + producción), sepáralos por coma sin espacios:

```env
CORS_ORIGIN=https://nutrikids.tudominio.com,https://tu-app.vercel.app
```

## 3. Comportamiento de la versión Web

- **Solo en línea (sin SQLCipher):** en navegador web no existe SQLite cifrado ni almacenamiento seguro de hardware (`encrypted-db.web.ts`), por lo que la app opera conectada a la API.
- **Sesión y borradores:** en web se almacenan en `sessionStorage` (aislados a la pestaña y eliminados al cerrar el navegador o al cerrar sesión), evitando persistir tokens o datos clínicos en `localStorage`.
- **Rutas SPA:** `apps/mobile/vercel.json` reescribe cualquier ruta de la aplicación hacia `/index.html` excluyendo `/_expo/`, `/assets/`, `/favicon.ico` y `/metadata.json` para que las recargas directas (p. ej. `/login`, `/evolution`) no devuelvan 404.

## 4. Verificación local del build exportado

```bash
# Desde la raíz del monorepo
EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm build:web

# Servir el directorio exportado con soporte SPA para probar recargas
npx serve -s apps/mobile/dist
```
