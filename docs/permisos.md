# Permisos por rol y vínculo (`apps/api`)

Implementación de **RT-05**: los permisos se aplican en el servidor, no solo en la interfaz. Código en `src/middlewares/authenticate.ts`, `src/middlewares/access.ts` y `src/lib/permissions.ts`.

## 1. Orden de evaluación

1. **`authenticate`**: exige `Authorization: Bearer <jwt>`; deja `req.auth = { userId, roles, specialty }`. Falla con `401`.
2. **`requireRole(...roles)`**: el usuario debe tener alguno de los roles (`CAREGIVER`, `PROFESSIONAL`). Falla con `403`.
3. **`requireSpecialty(...)` / `requirePermission(permiso)`**: dentro del rol profesional distingue `nursing` (enfermería), `nutrition` (nutrición) y `pediatrics` (pediatría). Falla con `403`.
4. **`requireVinculo(source = 'ninoId')`**: comprueba el vínculo con el niño concreto. Falla con `403` (o `400` si el id no es un UUID).

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
  '/ninos/:ninoId/seguimientos',
  authenticate,
  requireRole('PROFESSIONAL'),
  requirePermission('followup:create'),
  requireVinculo(), // lee req.params.ninoId; o requireVinculo((req) => req.body.childId)
  handler,
);
```

## 5. Respuestas

| Código | Causa                                                                    |
| ------ | ------------------------------------------------------------------------ |
| `401`  | Token ausente, inválido o vencido.                                       |
| `403`  | Rol o especialidad insuficiente, permiso ausente, o sin vínculo vigente. |
| `400`  | El identificador del niño no es un UUID válido.                          |
