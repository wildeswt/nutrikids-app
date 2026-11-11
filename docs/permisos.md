# Permisos por rol y vínculo (`apps/api`)

Implementación de **RT-05**: los permisos se aplican en el servidor, no solo en la interfaz. Código en `src/middlewares/authenticate.ts`, `src/middlewares/access.ts` y `src/lib/permissions.ts`.

## 1. Orden de evaluación

1. **`authenticate`**: exige `Authorization: Bearer <jwt>`; deja `req.auth = { userId, roles, specialty }`. Falla con `401`.
2. **`requireRole(...roles)`**: el usuario debe tener alguno de los roles (`CAREGIVER`, `PROFESSIONAL`). Falla con `403`.
3. **`requireSpecialty(...)` / `requirePermission(permiso)`**: dentro del rol profesional distingue `nursing` (enfermería), `nutrition` (nutrición) y `pediatrics` (pediatría). Falla con `403`.
4. **`requireVinculo(source = 'childId')`**: comprueba el vínculo con el niño concreto. Falla con `403` (o `400` si el id no es un UUID).

Primero rol, luego vínculo: tener el rol correcto nunca basta para ver un niño ajeno.

## 2. Vínculo

| Rol         | Tabla                   | Condición                                                                                             |
| ----------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Cuidador    | `caregiver_children`    | Existe la fila (`cuida`) para (cuidador, niño).                                                       |
| Profesional | `professional_children` | Existe una fila (`atiende`) vigente hoy: `start_date <= hoy` y (`end_date` nulo o `end_date >= hoy`). |

- Si la cuenta tiene ambos roles, basta con cumplir uno; `req.vinculo` indica cuál.
- Un niño inexistente y un niño ajeno responden igual (`403`), para no revelar qué ids existen.
- La consulta corre dentro de `withUser(userId, …)`, de modo que también se aplican las políticas RLS de la base de datos (defensa en profundidad).

## 3. Matriz de permisos

| Permiso                                                                                           | Cuidador (solo sus niños) | Enfermería | Nutrición | Pediatría |
| ------------------------------------------------------------------------------------------------- | :-----------------------: | :--------: | :-------: | :-------: |
| Ver niño, controles, curvas y alertas (`child:read`, `checkup:read`, `curves:read`, `alert:read`) |            Sí             |     Sí     |    Sí     |    Sí     |
| Ver registro de alimentación (`feedinglog:read`)                                                  |            Sí             |     Sí     |    Sí     |    Sí     |
| Registrar control antropométrico (`checkup:create`)                                               |            Sí             |     Sí     |    Sí     |    Sí     |
| Revisar alertas (`alert:review`)                                                                  |            No             |     Sí     |    Sí     |    Sí     |
| Crear seguimientos (`followup:create`)                                                            |            No             |     No     |    Sí     |    Sí     |

Todos los permisos de la tabla aplican **solo sobre niños con vínculo** (paso 4). El `origin` de un control (`CAREGIVER`/`PROFESSIONAL`) lo deriva el servidor del rol, nunca del cliente.

Esta matriz es la fuente única en `PERMISSIONS_BY_ACTOR`; para cambiarla se edita ese objeto y esta tabla.

## 4. Uso en rutas

```ts
router.post(
  '/children/:childId/follow-ups',
  authenticate,
  requireRole('PROFESSIONAL'),
  requirePermission('followup:create'),
  requireVinculo(), // lee req.params.childId; o requireVinculo((req) => req.body.childId)
  handler,
);
```

## 5. Respuestas

| Código | Causa                                                                    |
| ------ | ------------------------------------------------------------------------ |
| `401`  | Token ausente, inválido o vencido.                                       |
| `403`  | Rol o especialidad insuficiente, permiso ausente, o sin vínculo vigente. |
| `400`  | El identificador del niño no es un UUID válido.                          |

---

## 6. Reglas de alta de niños, vínculos `cuida`/`atiende` y límite de edad OMS (RF-03)

Implementado en `src/routes/children.routes.ts` y `src/services/children.service.ts`.

### 6.1 Quién puede crear o finalizar un vínculo `atiende` (`professional_children`)

En PostgreSQL, la política RLS de `professional_children` permite `professional_id = app_user_id() OR app_has_child_access(child_id)`. Sin una regla en la API, cualquier profesional registrado podría auto-asignarse a cualquier niño si conociera su UUID.

Por ello, `POST /children/:childId/professionals` y `PATCH /children/:childId/professionals/:professionalId/end` exigen primero `requireVinculo('childId')` y aplican reglas diferenciadas:

1. **Crear un vínculo (`POST /children/:childId/professionals` — `assertCanManageProfessionalLinks`):**
   - El **representante legal** del niño (`caregiver_children.is_legal_representative = true`), **o**
   - Un **profesional con vínculo `atiende` vigente** sobre ese niño (`startDate <= hoy` y `endDate` nulo o `>= hoy`), habilitando derivaciones/interconsultas (RF-19).
2. **Finalizar un vínculo (`PATCH /children/:childId/professionals/:professionalId/end` — `assertCanEndProfessionalLink`):**
   - El **representante legal** del niño (puede finalizar el vínculo de cualquier profesional asignado al niño), **o**
   - El **propio profesional titular de ese vínculo** (`auth.userId === professionalId` con vínculo vigente), impidiendo que un profesional dé de baja a otro colega (`403 Forbidden`).

Cualquier otro actor (profesional sin vínculo previo, profesional distinto al titular en la baja, o cuidador secundario con `isLegalRepresentative = false`) recibe `403 Forbidden`. Además:

- El profesional destino debe existir y estar activo (`404 Not Found` en caso contrario).
- No puede existir otro vínculo vigente o solapado con el mismo niño (`409 Conflict`, reforzado en BD con el índice único parcial `professional_children_active_unique_idx` donde `end_date IS NULL`).
- `endDate` debe ser mayor o igual a `startDate` (`400 Bad Request`).

### 6.2 Gestión de vínculos con cuidadores (`cuida` — `caregiver_children`)

Los endpoints bajo `/children/:childId/caregivers` permiten consultar y gestionar los cuidadores vinculados al niño:

- **`GET /children/:childId/caregivers`:** accesible para cualquier usuario con vínculo vigente sobre el niño (`requirePermission('child:read')` + `requireVinculo('childId')`).
- **`POST /children/:childId/caregivers`:** permite vincular a un cuidador adicional (por `caregiverId` o `email`, indicando `relationship` e `isLegalRepresentative`). Restringido **exclusivamente al representante legal** del niño (`assertIsChildLegalRepresentative`, `403 Forbidden` en caso contrario). Responde `404` si el cuidador no existe o está inactivo, y `409 Conflict` si ya está vinculado.
- **`PATCH /children/:childId/caregivers/:caregiverId`:** permite actualizar `relationship` y/o `isLegalRepresentative`. Restringido al representante legal. Si intenta pasar `isLegalRepresentative: false` al único representante legal activo del niño, responde `409 Conflict`.
- **`DELETE /children/:childId/caregivers/:caregiverId`:** desvincula a un cuidador del niño (`204 No Content`). Restringido al representante legal e impide desvincular al único representante legal activo (`409 Conflict`).

### 6.3 Ciclo de vida y orden del consentimiento informado (RF-02, NK-16, NK-17, NK-20)

Para garantizar que ningún dato clínico ni de filiación del menor exista o se registre sin consentimiento informado vigente:

1. **Alta inicial del niño (`POST /children` — NK-17 y NK-20):**
   - La app muestra la pantalla de consentimiento al representante legal **antes** de confirmar el alta (NK-20).
   - En el servidor, `POST /children` ejecuta una **única transacción bajo RLS** (`withUser`), donde mediante la clave foránea diferible `caregiver_children_child_id_fkey` inserta de forma indivisible:
     1. El vínculo inicial en `caregiver_children` (`is_legal_representative = true`).
     2. El registro en `children` con los datos mínimos (`firstName`, `lastName`, `birthDate`, `sex`).
     3. El consentimiento inicial en `consents` (`granted_at = now()`, `revoked_at = null`, `text_version = 'v1'`).
   - Esto resuelve la aparente discrepancia técnica: la UI pide el consentimiento previo al registro y la base de datos lo asocia al `childId` creado atómicamente, sin dejar jamás un niño en estado no consentido.

2. **Endpoints de consentimiento (`/children/:childId/consent` — NK-16):**
   - **`GET /children/:childId/consent`:** Devuelve el consentimiento vigente (`revokedAt: null`) o el último registrado para trazabilidad y auditoría. Accesible con `child:read` y vínculo vigente sobre el niño.
   - **`POST /children/:childId/consent`:** Otorga o renueva el consentimiento. Restringido **exclusivamente al representante legal** (`isLegalRepresentative = true`). Si ya existe uno vigente con distinta `textVersion`, marca `revokedAt = now()` en el anterior y crea el nuevo en la misma transacción (`201 Created`). Si se envía la misma versión vigente, responde `409 Conflict`.
   - **`DELETE /children/:childId/consent`:** Revoca el consentimiento activo mediante revocación lógica (`revokedAt = now()`, responde `200 OK` con `ConsentResponse`). Restringido **exclusivamente al representante legal**. Si ya está revocado, responde `409 Conflict`.
   - **Índice único de integridad:** El índice único parcial `consents_child_active_unique_idx` (`WHERE revoked_at IS NULL`) previene condiciones de carrera garantizando como máximo un consentimiento activo por niño.

3. **Bloqueo de registros clínicos sin consentimiento activo:**
   - Todo endpoint de registro de controles (p. ej. `POST /children/:childId/checkups`) aplica el middleware `requireActiveConsent('childId')` y la validación en servicio `assertActiveConsent`. Si el niño no cuenta con un consentimiento con `revoked_at IS NULL`, la solicitud se rechaza con `403 Forbidden`.
   - Como defensa en profundidad, el trigger de PostgreSQL `checkups_active_consent` (`BEFORE INSERT ON checkups`) aborta cualquier inserción de control si no existe consentimiento activo para ese `child_id`.

### 6.4 Límite de edad OMS (`12–60` meses) y controles futuros

- **Al dar de alta (`POST /children`):** el niño debe tener entre `12` y `60` meses cumplidos (`400 Bad Request` fuera de ese rango).
- **Lecturas históricas (`GET /children`, `GET /children/:childId`, `GET /children/:childId/professionals`, `GET /children/:childId/caregivers` y futuras consultas clínicas):** permanecen accesibles incluso cuando el niño supere los `60` meses, garantizando la preservación de su historial.
- **Registro de nuevos controles (`POST /children/:childId/checkups`):** las tablas `lms_references` de la OMS cubren exclusivamente de `12` a `60` meses cumplidos. Todo nuevo control valida la edad del niño **a la fecha de medición (`measuredAt`)** mediante `assertChildAgeInOmsRange`; si en esa fecha supera los `60` meses (o tiene menos de `12`), la API rechaza la operación con `400 Bad Request`.
