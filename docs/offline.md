# Base local cifrada y modo sin conexión (`apps/mobile`, NK-58 / RT-02)

Este documento registra la decisión técnica, el manejo de claves, la arquitectura propuesta para la cola de sincronización y las pruebas pendientes en dispositivo físico para el modo sin conexión de NutriKids.

## 1. Dependencias instaladas

Instaladas mediante `pnpm --filter mobile exec expo install expo-sqlite @react-native-community/netinfo` (compatibles con Expo SDK 58):

- `expo-sqlite`: `58.0.17` (`~58.0.17` en `apps/mobile/package.json`)
- `@react-native-community/netinfo`: `12.0.1` (`12.0.1` en `apps/mobile/package.json`)

## 2. Decisión sobre cifrado local: SQLCipher habilitado

**Decisión:** usar **SQLCipher nativo** integrado en `expo-sqlite` (`useSQLCipher: true`).

### Evidencia en la versión instalada (`expo-sqlite@58.0.17`)

Verificado directamente en `apps/mobile/node_modules/expo-sqlite`:

1. **Config plugin (`plugin/src/withSQLite.ts` y `plugin/build/withSQLite.js`):** acepta la propiedad booleana `useSQLCipher` (global o por plataforma `android.useSQLCipher` / `ios.useSQLCipher`) y escribe `expo.sqlite.useSQLCipher` en `gradle.properties` (Android) y `Podfile.properties.json` (iOS).
2. **Android (`android/build.gradle` y `android/CMakeLists.txt`):** cuando `expo.sqlite.useSQLCipher == 'true'`, compila los fuentes incluidos en `vendor/sqlcipher` con las banderas `-DSQLITE_HAS_CODEC=1 -DSQLCIPHER_CRYPTO_OPENSSL -DSQLITE_EXTRA_INIT=sqlcipher_extra_init -DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown` y enlaza `io.github.ronickg:openssl:3.3.2-1`.
3. **iOS (`ios/ExpoSQLite.podspec`):** cuando `expo.sqlite.useSQLCipher == 'true'`, copia `vendor/sqlcipher/{sqlite3.c,sqlite3.h}` y compila con `-DSQLITE_HAS_CODEC=1 -DSQLCIPHER_CRYPTO_CC ... -DNDEBUG`.
4. **Versión vendoreada (`README.md`):** incluye soporte nativo para SQLCipher (el script documentado referencia SQLCipher `4.6.0`).
5. **Apertura y clave (`src/NativeDatabase.ts` y `src/SQLiteDatabase.ts`):** `SQLiteOpenOptions` no recibe clave de cifrado por parámetro; la clave se aplica inmediatamente después de `openDatabaseAsync(name)` ejecutando `PRAGMA key = ...` antes de cualquier lectura o escritura.

### Configuración aplicada

En `apps/mobile/app.json`, dentro de `expo.plugins`:

```json
[
  "expo-sqlite",
  {
    "useSQLCipher": true
  }
]
```

> Nota: SQLCipher requiere compilar los módulos nativos mediante **Development Build** (`expo prebuild` / `eas build --profile development`). En Expo Go y en la web (`Platform.OS === 'web'`) no está disponible el binario compilado con SQLCipher; por ello `openEncryptedDatabase` se degrada lanzando un error explícito en web o entornos sin módulo nativo.

## 3. Gestión de la clave de cifrado

Implementado en `apps/mobile/src/lib/local-db/encrypted-db.ts`:

- **Generación única (`getDatabaseKey()`):**
  - Verifica disponibilidad de `expo-secure-store` (`SecureStore.isAvailableAsync()`). Si no está disponible, falla de forma explícita (nunca hace fallback a `localStorage` ni memoria en claro).
  - Si no existe una clave bajo `nutrikids.localDb.encryptionKey`, genera **32 bytes aleatorios (256 bits)** usando `crypto.getRandomValues` (disponible nativamente en Hermes/Expo; `expo-crypto` no está instalado en el proyecto) y los codifica como **64 caracteres hexadecimales**.
  - Guarda la clave con `{ keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }`, manteniendo el mismo nivel de aislamiento local que `apps/mobile/src/lib/session-storage.ts` (solo cuando el dispositivo está desbloqueado y sin migración a respaldos ni otros dispositivos).
  - Utiliza una promesa compartida en vuelo para evitar condiciones de carrera si `getDatabaseKey()` se invoca concurrentemente antes de persistir la primera clave.
- **Apertura verificada (`openEncryptedDatabase(name)`):**
  - Valida que el entorno tenga SQLite nativo disponible (bloquea ejecución en web).
  - Abre la base con `SQLite.openDatabaseAsync(name)`.
  - Ejecuta `PRAGMA key = "x'<64-hex>'"` (clave cruda de 256 bits) antes de cualquier consulta.
  - Ejecuta `SELECT count(*) AS count FROM sqlite_master;` para forzar la lectura de la página raíz y confirmar que SQLCipher descifra correctamente con esa clave. Si falla, cierra la conexión y propaga el error.

## 4. Detección de conectividad

Implementado en `apps/mobile/src/lib/connectivity.ts` sobre `@react-native-community/netinfo`:

- `resolveConnectivityStatus(state)` mapea el `NetInfoState` a `'online' | 'offline'`:
  - `'online'` únicamente cuando `state.isConnected === true && state.isInternetReachable !== false` (permite `isInternetReachable === null` mientras el sistema termina de sondear, y marca `'offline'` ante redes sin salida a internet como portales cautivos o modo avión).
- `getConnectivity()`: consulta el estado actual mediante `NetInfo.fetch()`.
- `subscribeToConnectivity(listener)`: envuelve `NetInfo.addEventListener` emitiendo `'online' | 'offline'` y retorna la función de desuscripción.
- `ConnectionProvider` y `useConnection()` (`apps/mobile/src/context/connection-context.tsx`): exponen `{ status: 'online' | 'offline', isOnline }` en la interfaz de usuario; si se invoca `useConnection()` sin proveedor (p. ej. en pruebas aisladas), devuelve `{ status: 'online', isOnline: true }` por defecto.

## 5. Base de datos local: esquema, aislamiento, migraciones y borrado seguro (NK-59)

Implementado bajo `apps/mobile/src/lib/local-db/` sobre la interfaz mínima `LocalDb` (`types.ts`), compatible con `SQLiteDatabase` de `expo-sqlite` y desacoplada para pruebas reales sobre `node:sqlite`.

### Esquema local (versión 1)

Las columnas sueltas se usan únicamente para filtrar y ordenar consultas; el campo `payload` almacena JSON serializado en formato `TEXT` y se valida tanto al escribir como al leer contra los esquemas de `@nutrikids/shared`. Todas las marcas temporales (`updated_at`, `created_at`, `measured_at`, `fetched_at`, `next_attempt_at`) se guardan en **ISO 8601 UTC**.

- **`children`** (aislamiento por `user_id`): `user_id TEXT`, `id TEXT`, `payload TEXT`, `updated_at TEXT` — `PRIMARY KEY (user_id, id)`. Caché local de niños accesibles por el usuario.
- **`checkups`** (aislamiento por `user_id`): `user_id TEXT`, `id TEXT`, `child_id TEXT`, `measured_at TEXT`, `payload TEXT`, `sync_state TEXT CHECK IN ('LOCAL', 'SENT')`, `created_at TEXT` — `PRIMARY KEY (user_id, id)` e índice `(user_id, child_id, measured_at DESC)`. Controles sincronizados del servidor (`SENT`) y controles locales sin enviar (`LOCAL`).
- **`indicator_results`** (aislamiento por `user_id`): `user_id TEXT`, `checkup_id TEXT`, `indicator TEXT`, `payload TEXT` — `PRIMARY KEY (user_id, checkup_id, indicator)`. Resultados OMS por indicador (vista profesional o cuidador).
- **`reference_curves`** (datos públicos de la OMS, sin `user_id`): `indicator TEXT`, `sex TEXT`, `position TEXT`, `payload TEXT`, `fetched_at TEXT` — `PRIMARY KEY (indicator, sex, position)`. Curvas OMS 2006 en caché.
- **`sync_queue`** (aislamiento por `user_id`): `id TEXT PRIMARY KEY`, `user_id TEXT`, `kind TEXT CHECK IN ('checkup', 'follow-up', 'feeding')`, `payload TEXT`, `status TEXT CHECK IN ('LOCAL', 'SENDING', 'SENT', 'ERROR')`, `attempts INTEGER`, `next_attempt_at TEXT`, `last_error TEXT`, `created_at TEXT`, `updated_at TEXT` — índice `(user_id, status, next_attempt_at)`. Cola persistente de operaciones pendientes de sincronización.
- **`meta`** (global de la app): `key TEXT PRIMARY KEY`, `value TEXT`. Metadatos clave/valor persistidos localmente.

### Aislamiento por usuario y validación de `payload`

- Todas las consultas de `childrenRepository`, `checkupsRepository`, `indicatorResultsRepository` y `syncQueueRepository` reciben `userId` explícito, filtran por `user_id = ?` y usan exclusivamente parámetros enlazados (nunca concatenación de SQL).
- Varios usuarios que inicien sesión en el mismo teléfono nunca comparten ni ven filas de otro `user_id`; `reference_curves` carece de `user_id` por contener datos públicos de la OMS.
- Si un `payload` almacenado está corrupto o falla la validación con `@nutrikids/shared`, el repositorio omite el registro y registra una advertencia en consola indicando **únicamente el nombre de la tabla**, sin exponer nombres, fechas de nacimiento, medidas ni notas clínicas.

### Migraciones versionadas y apertura única

- `runMigrations(db)` (`migrations.ts`) lee `PRAGMA user_version;`, aplica dentro de `db.withTransactionAsync` únicamente las migraciones con `version > user_version` y actualiza `PRAGMA user_version` al final de cada paso.
- La ejecución es idempotente y rechaza de forma explícita bases cuya `user_version` sea superior a `LATEST_SCHEMA_VERSION`.
- `getLocalDatabase()` (`database.ts`) comparte una única promesa en vuelo al abrir `openEncryptedDatabase('nutrikids.db')` y correr `runMigrations`, devolviendo siempre la misma instancia hasta que se llame a `closeLocalDatabase()`.

### Borrado seguro al cerrar sesión

- `wipeLocalData()` (`wipe.ts`, usada en NK-63) realiza en orden:
  1. `closeLocalDatabase()` para cerrar la conexión activa y reiniciar el singleton.
  2. `SQLite.deleteDatabaseAsync('nutrikids.db')` para eliminar el archivo cifrado del disco.
  3. `deleteDatabaseKey()` (`encrypted-db.ts`) para borrar `nutrikids.localDb.encryptionKey` de `expo-secure-store` y limpiar la promesa en memoria.
- Tolera que ni la base ni la clave existan todavía en el dispositivo.

## 6. Diseño propuesto de la cola de sincronización (NK-59 a NK-63)

La base cifrada alojará las tablas locales (niños, controles, resultados OMS, curvas y cola de sincronización) siguiendo estos lineamientos para los controles registrados sin internet:

- **Estados de cada elemento en cola:**
  - `LOCAL`: creado y almacenado localmente en espera de conectividad o turno de envío.
  - `SENDING`: incluido en un lote actualmente en vuelo hacia la API (evita envíos duplicados concurrentes).
  - `SENT`: confirmado por el servidor (`CREATED` o `DUPLICATE` en la respuesta del lote) y conciliado con el registro oficial del servidor.
  - `ERROR`: rechazado de forma definitiva por validación o permisos (`status: "ERROR"` del servidor, p. ej. `400`/`403`/`404`/`409`), conservando el motivo para mostrarlo al usuario o permitir corrección sin bloquear el resto de la cola.
- **Política de reintentos (fallos transitorios de red / 5xx):**
  - Retroceso exponencial (_exponential backoff_) partiendo en **1 s**: `1 s`, `2 s`, `4 s`, `8 s`, `16 s`, `32 s`, `64 s`, `128 s`, `256 s`, con **tope máximo de 5 min (`300 s`)**.
  - Al recuperar conectividad (`'offline'` -> `'online'`), el motor reinicia el temporizador de espera y procesa los elementos `LOCAL` elegibles.
- **Envío en lotes hacia `POST /sync/checkups`:**
  - Cada petición agrupa **lotes de hasta 100 controles** (`SYNC_MAX_BATCH_SIZE = 100`, contrato definido en `docs/sync.md` y `packages/shared`).
  - La operación es idempotente mediante el `id` UUID generado en el cliente, por lo que un reintento tras corte de red responde `DUPLICATE` sin duplicar controles ni alertas en PostgreSQL.
  - Cuando el servidor devuelve `checkup`, la app reemplaza la copia local con los resultados recalculados por el servidor (RF-07 / RF-14).

## 7. Verificación pendiente en dispositivo

Las pruebas automatizadas en Node/Vitest validan los módulos contra mocks de `expo-sqlite`, `expo-secure-store` y `@react-native-community/netinfo`. Queda pendiente validar en un **Development Build de Android** (dispositivo físico o emulador con Play/Dev Client):

### A. Comprobar que el archivo SQLite está cifrado en disco

1. Generar el proyecto nativo y el development build de Android con el plugin configurado:

   ```bash
   cd apps/mobile
   npx expo prebuild --platform android
   npx expo run:android
   ```

   (o mediante EAS: `eas build --profile development --platform android`).

2. En la app en ejecución, invocar `openEncryptedDatabase('nutrikids.db')` y escribir un registro de prueba en una tabla temporal (o ejecutar un `CREATE TABLE` de prueba durante la verificación).

3. Extraer el archivo de la base de datos desde el almacenamiento interno de la app usando `adb`:

   ```bash
   adb exec-out run-as com.nutrikids.app cat files/SQLite/nutrikids.db > nutrikids-check.db
   ```

4. Verificar que el archivo **no está en texto claro**:
   - Inspeccionar los primeros bytes (`head -c 16 nutrikids-check.db` o editor hexadecimal): una base SQLite sin cifrar comienza con `SQLite format 3\0`; con SQLCipher debe mostrar bytes aleatorios ilegibles.
   - Intentar abrirlo con el CLI estándar de `sqlite3` sin clave:

     ```bash
     sqlite3 nutrikids-check.db ".tables"
     ```

     Debe fallar con `Error: file is not a database`.

   - Ejecutar `strings nutrikids-check.db` y confirmar que no aparecen nombres de tablas ni datos ingresados en claro.

5. Eliminar `nutrikids-check.db` al finalizar la comprobación.

### B. Comprobar que NetInfo reacciona al modo avión

1. En el mismo development build de Android, registrar un listener temporal con `subscribeToConnectivity((status) => console.log('[connectivity]', status))`.
2. Con Wi-Fi o datos móviles activos, verificar que el estado inicial reportado por `getConnectivity()` y el listener es `'online'`.
3. Activar el **Modo avión** en el dispositivo y confirmar en los logs de Metro/Logcat la transición inmediata a `'offline'`.
4. Conectar únicamente a una red local sin acceso a internet (si está disponible) y confirmar que reporta `'offline'` cuando `isInternetReachable === false`.
5. Desactivar el modo avión y confirmar la transición de regreso a `'online'`.

## 8. Lectura sin conexión (NK-60)

La consulta de niños, controles y curvas de referencia sigue el patrón **«primero lo local, luego refrescar»** mediante el helper genérico `readThrough` en `apps/mobile/src/lib/offline-read.ts` y las operaciones tipadas de `apps/mobile/src/lib/offline-cache.ts`. El servidor continúa siendo la fuente de verdad.

### Flujo `readThrough`

1. **Lectura local inmediata:** antes de esperar a la red, lee la copia local en SQLCipher. Si existe, la entrega inmediatamente (`onLocalData`) con `fromCache: true` y la fecha `lastSyncedAt`.
2. **Refresco en línea:** verifica conectividad con `getConnectivity()`. Si no hay red y existe copia local, devuelve la copia local marcada como `stale: true`; si no existe copia local, lanza `OfflineNoDataError` (`loadError = 'needs-connection'`).
3. **Reemplazo atómico:** cuando el servidor responde, persiste el conjunto completo dentro de una transacción (`replaceAll` en niños o `replaceSentByChild` en controles). Cualquier registro que dejó de llegar (por ejemplo, un niño desvinculado) se elimina de la copia local.
4. **Manejo de errores remotos:**
   - Error de red o `5xx`: si hay copia local, la conserva y marca `fromCache: true, stale: true`; si no hay copia, propaga el error.
   - `401 / 403 / 404`: nunca se trata como «sin conexión» y siempre se propaga. En `403` y `404`, además se elimina la copia local del recurso para no conservar información cuyo acceso fue revocado o eliminado.

### Qué se guarda localmente y reglas de visibilidad (RF-14)

- **Niños (`children`):** particionados por `user_id` del usuario autenticado (`useOptionalAuth`). Si no hay usuario autenticado, no se lee ni se escribe caché.
- **Controles (`checkups`):** particionados por `user_id` y `child_id`. Se combinan los controles pendientes con `sync_state = 'LOCAL'` (marcados con `localOnly: true` para la UI) y los sincronizados con `sync_state = 'SENT'`, ordenados del más reciente al más antiguo.
- **Regla RF-14 (cuidador):** los controles del cuidador se validan con `CaregiverCheckupResponseSchema` antes de persistirse y al leerse; nunca se almacenan ni se muestran `results`, puntajes z ni clasificaciones en la copia del cuidador. Las lecturas del perfil profesional (`useAlertDetail`) guardan su propia copia en el registro de alertas/controles solo para usuarios autenticados.
- **Curvas OMS (`reference_curves`):** indexadas por `(indicator, sex, position)` con marca temporal `fetched_at` y caducidad de **24 horas** (`REFERENCE_CURVES_TTL_MS`).
  - Si la copia local tiene menos de 24 h, se usa directamente sin consultar al servidor (`fromCache: true, stale: false`).
  - Si tiene 24 h o más, intenta refrescar desde el servidor; si falla la red o hay `5xx`, conserva la copia vencida como respaldo (`fromCache: true, stale: true`).
  - Sin copia local ni conexión, expone el error claro «Conéctate una vez para descargar las curvas».

### Aviso en pantalla y estado vacío sin conexión

- `OfflineDataNotice` (`apps/mobile/src/components/OfflineDataNotice.tsx`) se muestra cuando `fromCache && stale` con el texto `Datos guardados en este dispositivo · actualizados hace <tiempo>` (formateado por `formatElapsedTime` en `apps/mobile/src/lib/relative-time.ts`) en Inicio del cuidador, Mis niños, Evolución y Detalle de alerta profesional.
- Si no hay copia local ni conexión (`loadError === 'needs-connection'`), las pantallas muestran un estado vacío diferenciado indicando que se requiere conexión al menos una vez para descargar la información.

### Degradación elegante sin SQLCipher

En entornos donde `getLocalDatabase()` falla (Expo Go, web sin soporte nativo de SQLCipher) o ante cualquier error de apertura, validación o escritura local, la capa `tryLocalOperation` captura la excepción, registra únicamente el nombre de la operación mediante `console.warn` (sin datos personales ni cargas útiles) y continúa ejecutando la aplicación normalmente solo con la red.

## 9. Motor de sincronización y contexto de conectividad (NK-61, parte A)

Implementado en `apps/mobile/src/lib/sync/`, `apps/mobile/src/context/connection-context.tsx`, `apps/mobile/src/hooks/useSyncStatus.ts` y montado en `apps/mobile/src/app/_layout.tsx` (alrededor de la aplicación con `ConnectionProvider` y arrancando/deteniendo `syncEngine` según la sesión activa en `AuthProvider`).

### Componentes del módulo `src/lib/sync/`

- **`backoff.ts` (`computeBackoffMs(attempts, random)`):** función pura que calcula la espera creciente exponencial partiendo de **1 s** (`1 s`, `2 s`, `4 s`, `8 s`, `16 s`, `32 s`, `64 s`, `128 s`, `256 s`), con **tope máximo de 5 minutos (`300 000 ms`)** y una **variación aleatoria de ±20 %** (respetando igualmente el tope de 5 minutos).
- **`sync-api.ts` (`postSyncCheckups(items)`):** cliente HTTP sobre `authFetch('POST /sync/checkups')`. Valida el lote saliente con `SyncCheckupsInputSchema` y la respuesta con `SyncCheckupsResponseSchema`. Emite `SyncApiError` distinguiendo:
  - **Errores transitorios reintentables (`retryable: true`):** fallo de red (`fetch` lanza `TypeError` u otro error de red) o HTTP `5xx`, `408` y `429`.
  - **Errores no reintentables del lote (`retryable: false`):** respuestas `4xx` del lote completo (p. ej. `400`, `403`) o respuestas con esquema inválido.
- **`sync-engine.ts` (`flushCheckupQueue` y `SyncEngine`):** coordina el vaciado de la cola `sync_queue` para `kind = 'checkup'` por usuario (`user_id`), la recuperación tras cierres inesperados, el control de concurrencia y el estado observable.

### Estados y transiciones en `sync_queue`

- **`LOCAL`:** control pendiente de envío (o devuelto para reintento tras fallo transitorio). Pasa a `SENDING` al incluirse en un lote elegible (`next_attempt_at IS NULL` o `<= now`, o al llamar `syncNow()`).
- **`SENDING`:** incluido en un lote actualmente en vuelo hacia `POST /sync/checkups`. Pasa a `SENT` si el servidor responde `CREATED` o `DUPLICATE`, a `ERROR` si hay rechazo `4xx`, o regresa a `LOCAL` si ocurre fallo de red/`5xx`/`408`/`429` o al recuperarse tras cierre inesperado en `start(userId)`.
- **`SENT`:** confirmado por el servidor y conciliado en `checkups` mediante `markSent` (estado terminal en la cola con `next_attempt_at = NULL` y `last_error = NULL`).
- **`ERROR`:** rechazado con `4xx` (p. ej. `400`/`403`/`404`/`409`), conservando `last_error` legible y `next_attempt_at = NULL`, sin reintento automático (ni siquiera con `syncNow()`). Solo un `ERROR` que tenga explícitamente `next_attempt_at` no nulo se considera reintentable.

### Flujo `flushCheckupQueue` y comportamiento ante cada respuesta

1. **Selección y lotes:** obtiene de `sync_queue` los ítems `kind = 'checkup'` del `userId` en estado `LOCAL` (o `ERROR` reintentable con `next_attempt_at` definido) cuyo `next_attempt_at` haya vencido (o todos los `LOCAL`/reintentables si `ignoreSchedule = true` en `syncNow()`), y los divide en lotes de hasta `SYNC_MAX_BATCH_SIZE` (**100**).
2. **Garantía _single-flight_:** tanto `flushCheckupQueue` (por instancia `LocalDb` y `userId`) como `SyncEngine` impiden ejecuciones paralelas; una solicitud concurrente espera al ciclo en curso sin duplicar peticiones HTTP. Si se llama `syncNow()` durante un ciclo automático en curso, se ejecuta una pasada adicional al terminar el ciclo activo.
3. **Recuperación tras cierre inesperado:** al llamar `syncEngine.start(userId)`, cualquier fila del usuario que haya quedado en `SENDING` vuelve inmediatamente a `LOCAL` antes de evaluar conectividad o emitir el estado inicial.
4. **Procesamiento por ítem en respuesta `200 OK`:**
   - **`CREATED` o `DUPLICATE`:** si viene `checkup` del servidor, sobrescribe el control local llamando a `checkupsRepository.markSent` (dejando `sync_state = 'SENT'` con los valores recalculados por el servidor y respetando la vista por perfil RF-14), actualiza `sync_queue` a `'SENT'` y registra `lastSyncedAt` en `meta`. Reenviar el mismo `id` es seguro e idempotente.
   - **`ERROR` con estado HTTP `4xx`:** pasa el ítem en `sync_queue` a `'ERROR'` con `last_error` legible y `next_attempt_at = NULL` (sin reintento automático; el usuario decidirá si corregir o descartar en la pantalla de pendientes). Si el estado embebido fuera transitorio (`5xx`/`408`/`429`), programa reintento en `'LOCAL'`.
5. **Fallo del lote completo (excepción de `postSyncCheckups`):**
   - **Red (`TypeError`) o `5xx` / `408` / `429`:** todos los ítems del lote vuelven a `'LOCAL'`, incrementan `attempts = attempts + 1`, fijan `next_attempt_at = now + computeBackoffMs(attempts)` y detienen los lotes restantes del ciclo.
   - **`401`:** devuelve los ítems a `'LOCAL'` sin marcarlos como error definitivo mientras se resuelve la expiración de sesión.
   - **Otros `4xx` del lote (`400`, `403`, etc.):** marca los ítems del lote en `'ERROR'` con `last_error` legible y sin reintento automático.

### Disparadores, estado observable y degradación

- **Disparadores de `SyncEngine`:**
  1. **Arranque de sesión (`start(userId)`):** tras recuperar `SENDING` -> `LOCAL`, si hay conectividad `'online'` ejecuta un ciclo; si está `'offline'`, no envía.
  2. **Recuperación de red (`subscribeToConnectivity`):** cuando pasa a `'online'`, reinicia `next_attempt_at = NULL` en los `'LOCAL'` pendientes (si venía de `'offline'`) y ejecuta un ciclo. Cuando pasa a `'offline'`, cancela el temporizador pendiente.
  3. **Retorno al primer plano (`AppState` `'active'`):** intenta sincronizar los pendientes elegibles si hay red.
  4. **Disparo manual (`syncNow()`):** verifica conectividad y, si está en línea, ejecuta el ciclo con `ignoreSchedule = true` (ignorando el `next_attempt_at` pendiente).
  5. **Temporizador programado:** mientras haya conexión, programa un único `setTimeout` para el menor `next_attempt_at` pendiente entre los controles por reintentar.
- **Estado observable (`getSyncState()`, `subscribe(listener)` y `useSyncStatus()`):** expone `{ pending, sending, error, lastSyncedAt }` consultados por usuario en `sync_queue` y `meta`, además de `syncNow` en el hook `useSyncStatus()`.
- **Degradación y privacidad:** si `getLocalDatabase()` falla (Expo Go o web), el motor no lanza errores y permanece inactivo con contadores en cero; los avisos en consola registran únicamente el nombre de la operación, nunca datos personales ni cargas clínicas.

## 10. Captura sin conexión y pantalla «Pendientes de envío» (NK-61, parte B)

Implementado en `apps/mobile/src/lib/offline-checkup.ts`, `apps/mobile/src/hooks/useCheckups.ts`, `apps/mobile/src/hooks/usePendingSyncItems.ts`, `apps/mobile/src/lib/checkup-route.ts` y las pantallas `add-checkup.tsx`, `checkup-saved.tsx`, `evolution.tsx`, `profile.tsx` y `pending-sync.tsx`.

### Captura sin conexión y guardado atómico

1. **Decisión en `useCheckups.create` (`createCheckupWithOfflineFallback`):**
   - Si `useConnection().isOnline` es `true`, intenta `createChildCheckup` normalmente (`savedLocally: false`) y cachea la respuesta en `checkups` (`SENT`).
   - Si el dispositivo está `offline`, o si el envío en línea falla por **red** (`isNetworkUnavailableError`: `TypeError`, `AbortError`, `TimeoutError`), conserva exactamente el mismo `id` UUID del intento y guarda el control en local devolviendo `{ ...checkup, savedLocally: true }`.
   - Los errores HTTP `4xx`/`5xx` devueltos por la API (p. ej. `400` validación o `403` sin consentimiento vigente) **nunca** caen a guardado local: se propagan al formulario para que el cuidador vea el error real.
2. **Transacción única (`saveCheckupLocallyInDb`):** dentro de un único `db.withTransactionAsync(...)` ejecuta:
   - `checkupsRepository.insertLocal(db, userId, payload)` con `sync_state = 'LOCAL'` (para que aparezca inmediatamente en Evolución marcado con `localOnly: true`).
   - `syncQueueRepository.enqueue(db, userId, { id: payload.id, kind: 'checkup', payload })` en estado `'LOCAL'`.
3. **Por qué no se calculan ni envían `results` en el teléfono:**
   - El servidor siempre recalcula todos los indicadores antropométricos OMS al sincronizar (`RF-07`, tanto en `POST /children/:id/checkups` como en `POST /sync/checkups`).
   - Además, el cuidador nunca visualiza puntajes z, percentiles ni clasificaciones en la aplicación (`RF-14`). Por ello, `buildSyncCheckupItem` construye el `SyncCheckupItem` (`id`, `childId`, `measuredAt`, `weightKg`, `lengthHeightCm`, `position`, `notes?`, `confirmOutlier?`) omitiendo `results`.
4. **Validación de atípicos (`confirmOutlier`):** el formulario (`buildCreateCheckupInput`) y la validación del esquema (`CreateCheckupInputSchema` / `SyncCheckupItemSchema`) exigen confirmación de valores extremos exactamente igual con o sin conexión.
5. **Sin base local (Expo Go / web):** si no hay red (o falla por red) y `getLocalDatabase()` devuelve `null`, se lanza `OfflineCheckupSaveError` («Necesitas conexión para guardar el control en este dispositivo») y el formulario mantiene los datos escritos sin limpiar campos ni el `attemptId`.
6. **Disparo tras guardar:** cuando cae a local tras un fallo con conexión disponible o recuperada, dispara `syncEngine.syncNow()` sin esperar; si se guardó explícitamente en modo `offline`, actualiza el estado observable con `syncEngine.refreshState()` (y el motor lo enviará automáticamente al recuperar conectividad).

### Retroalimentación en UI y pantalla «Pendientes de envío»

- **«Control guardado» (`checkup-saved.tsx`):** `toCheckupSavedParams` añade `pendingSync=1` cuando `savedLocally` es `true`. Con este parámetro, la pantalla muestra el aviso «Sin conexión · se enviará al reconectar» que abre `APP_ROUTES.CAREGIVER.PENDING_SYNC` al tocarlo; sin él, la pantalla no cambia.
- **Historial / Evolución (`evolution.tsx`):** los controles con `localOnly: true` muestran el chip «Guardado en este dispositivo».
- **Entrada en Perfil (`profile.tsx`):** mediante `useSyncStatus()`, muestra la fila «Pendientes de envío ({N})» (donde `N = pending + sending`) únicamente cuando `N > 0` o `error > 0`.
- **Pantalla «Pendientes de envío» (`apps/mobile/src/app/(caregiver)/pending-sync.tsx`):**
  - Alimentada por `usePendingSyncItems()`, que consulta `sync_queue` (`LOCAL`, `SENDING`, `ERROR` y los `SENT` de las últimas 24 horas) junto con los nombres de los niños en la tabla local `children`, y se actualiza en vivo mediante `syncEngine.subscribe`.
  - Sin conexión muestra arriba el aviso «Sin conexión · N controles por enviar» y deshabilita el botón inferior «Sincronizar ahora» (que en línea llama a `syncEngine.syncNow()`).
  - Muestra cada tarjeta con estado («Guardado en este dispositivo», «Error» o «Enviado» sin acciones) y el `lastError` cuando existe.
  - **Reintentar (`retryOfflineCheckup`):** devuelve el ítem de `sync_queue` a `'LOCAL'` con `attempts = 0`, `next_attempt_at = null` y `last_error = null`, y llama a `syncEngine.syncNow()`.
  - **Descartar (`discardOfflineCheckup`):** solicita confirmación («Este control no se enviará y se borrará de este dispositivo») y, al confirmar, elimina el registro de `sync_queue` y el control `LOCAL` en `checkups` dentro de una única transacción SQLite.
