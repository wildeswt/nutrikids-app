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

### 6.3 Orden del consentimiento informado en el alta (`POST /children`)

Para evitar registrar nombres, apellidos o fecha de nacimiento de un menor sin consentimiento vigente (RF-02 + RF-03):

1. Solo usuarios con rol `CAREGIVER` y declarados como representante legal (`isLegalRepresentative: true`) pueden dar de alta al niño (`403 Forbidden` en caso contrario).
2. En **una única transacción** bajo RLS (`withUser`), aprovechando la clave foránea diferible `caregiver_children_child_id_fkey`, el servidor inserta atómicamente:
   - El vínculo inicial en `caregiver_children` (`is_legal_representative = true`).
   - El registro en `children` únicamente con los 4 datos mínimos (`firstName`, `lastName`, `birthDate`, `sex`).
   - El consentimiento inicial en `consents` (`textVersion`, por defecto `'v1'`, `grantedAt = now()`, `revokedAt = null`).

La renovación de versión o revocación posterior se gestiona mediante los endpoints dedicados de consentimiento (NK-16).

### 6.4 Límite de edad OMS (`12–60` meses) y controles futuros

- **Al dar de alta (`POST /children`):** el niño debe tener entre `12` y `60` meses cumplidos (`400 Bad Request` fuera de ese rango).
- **Lecturas históricas (`GET /children`, `GET /children/:childId`, `GET /children/:childId/professionals`, `GET /children/:childId/caregivers` y futuras consultas clínicas):** permanecen accesibles incluso cuando el niño supere los `60` meses, garantizando la preservación de su historial.
- **Registro de nuevos controles (`POST /children/:childId/checkups`):** las tablas `lms_references` de la OMS cubren exclusivamente de `12` a `60` meses cumplidos. Todo nuevo control valida la edad del niño **a la fecha de medición (`measuredAt`)** mediante `assertChildAgeInOmsRange`; si en esa fecha supera los `60` meses (o tiene menos de `12`), la API rechaza la operación con `400 Bad Request`.
