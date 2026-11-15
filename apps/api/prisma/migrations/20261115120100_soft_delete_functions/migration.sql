-- Marcar algo como eliminado lo deja fuera de la política de lectura de RLS, y PostgreSQL exige que
-- la fila nueva de un UPDATE también sea visible. Por eso el soft delete se hace con funciones
-- SECURITY DEFINER. Quien llama (el servicio) ya comprobó los permisos; las funciones solo
-- marcan filas aún no eliminadas y nunca tocan otra columna.

CREATE OR REPLACE FUNCTION soft_delete_checkup(p_checkup uuid, p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE checkups SET deleted_at = now(), deleted_by_id = p_user
   WHERE id = p_checkup AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION soft_delete_child(p_child uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE children SET deleted_at = now()
   WHERE id = p_child AND deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION soft_delete_checkup(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION soft_delete_child(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_checkup(uuid, uuid) TO nutrikids_app;
GRANT EXECUTE ON FUNCTION soft_delete_child(uuid) TO nutrikids_app;

-- Ya no hace falta que el rol de la aplicación actualice columnas de checkups directamente.
REVOKE UPDATE ("deleted_at", "deleted_by_id") ON "checkups" FROM nutrikids_app;
