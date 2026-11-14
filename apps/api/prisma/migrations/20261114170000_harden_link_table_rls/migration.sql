-- Endurece la seguridad por filas de las tablas de vínculo (NK-46).
--
-- Hallazgo: las políticas `caregiver_children_access` y `professional_children_access` aceptaban
-- cualquier INSERT donde la fila fuera "propia" (caregiver_id / professional_id = usuario de la
-- sesión), sin exigir acceso previo al niño. A nivel de base de datos cualquier usuario podía
-- vincularse a sí mismo a cualquier niño cuyo UUID conociera y, con ello, leer todos sus datos.
-- La API lo evitaba con requireLink, pero RLS es la segunda barrera (RT-05) y debía contenerlo.
--
-- Nuevas reglas:
--   * caregiver_children, INSERT: hace falta acceso al niño, o ser el alta de un niño que todavía
--     no existe (así funciona createChild: vínculo primero con FK diferida, niño después).
--   * professional_children, INSERT: hace falta acceso al niño (lo asigna el representante o un
--     profesional ya asignado). Nadie se asigna a sí mismo.
--   * professional_children, UPDATE: sin acceso vigente solo se puede dejar la fila cerrada
--     (end_date pasado); así un profesional puede terminar su vínculo, pero no reabrirlo.
--   * Lectura, borrado y actualización de filas propias siguen como antes.

CREATE OR REPLACE FUNCTION app_child_exists(p_child uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM children WHERE id = p_child);
$$;

REVOKE ALL ON FUNCTION app_child_exists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_child_exists(uuid) TO nutrikids_app;

-- caregiver_children
DROP POLICY IF EXISTS caregiver_children_access ON "caregiver_children";

CREATE POLICY caregiver_children_select ON "caregiver_children" FOR SELECT
  USING (caregiver_id = app_user_id() OR app_has_child_access(child_id));

CREATE POLICY caregiver_children_insert ON "caregiver_children" FOR INSERT
  WITH CHECK (
    app_has_child_access(child_id)
    OR (caregiver_id = app_user_id() AND NOT app_child_exists(child_id))
  );

CREATE POLICY caregiver_children_update ON "caregiver_children" FOR UPDATE
  USING (caregiver_id = app_user_id() OR app_has_child_access(child_id))
  WITH CHECK (app_has_child_access(child_id));

CREATE POLICY caregiver_children_delete ON "caregiver_children" FOR DELETE
  USING (caregiver_id = app_user_id() OR app_has_child_access(child_id));

-- professional_children
DROP POLICY IF EXISTS professional_children_access ON "professional_children";

CREATE POLICY professional_children_select ON "professional_children" FOR SELECT
  USING (professional_id = app_user_id() OR app_has_child_access(child_id));

CREATE POLICY professional_children_insert ON "professional_children" FOR INSERT
  WITH CHECK (app_has_child_access(child_id));

CREATE POLICY professional_children_update ON "professional_children" FOR UPDATE
  USING (professional_id = app_user_id() OR app_has_child_access(child_id))
  WITH CHECK (
    app_has_child_access(child_id)
    OR (
      professional_id = app_user_id()
      AND end_date IS NOT NULL
      AND end_date < (now() AT TIME ZONE 'UTC')::date
    )
  );

CREATE POLICY professional_children_delete ON "professional_children" FOR DELETE
  USING (professional_id = app_user_id() OR app_has_child_access(child_id));
