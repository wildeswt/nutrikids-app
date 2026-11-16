-- Eliminación lógica de registros de alimentación: la fila queda en la base y RLS la oculta.
-- (Un UPDATE normal no puede dejar la fila invisible, por eso se marca con una función
-- SECURITY DEFINER; el servicio ya comprobó vínculo y permisos.)

ALTER TABLE "feeding_logs" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

DROP POLICY IF EXISTS child_access ON "feeding_logs";
CREATE POLICY child_access ON "feeding_logs"
  USING (app_has_child_access(child_id) AND deleted_at IS NULL)
  WITH CHECK (app_has_child_access(child_id));

CREATE OR REPLACE FUNCTION soft_delete_feeding_log(p_log uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE feeding_logs SET deleted_at = now()
   WHERE id = p_log AND deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION soft_delete_feeding_log(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_feeding_log(uuid) TO nutrikids_app;
