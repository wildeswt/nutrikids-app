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
- `subscribeToConnectivity(listener)`: envuelve `NetInfo.addEventListener` emitiendo `'online' | 'offline'` y retorna la función de desuscripción. El contexto React para la UI se implementará en NK-61.

## 5. Diseño propuesto de la cola de sincronización (NK-59 a NK-63)

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

## 6. Verificación pendiente en dispositivo

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
