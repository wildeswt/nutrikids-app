-- Solicitudes de eliminación de datos del niño (NK-41, RF-20).

CREATE TABLE "erasure_requests" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "erasure_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "erasure_requests_status_check" CHECK ("status" IN ('pending', 'completed', 'cancelled'))
);

CREATE INDEX "erasure_requests_child_id_idx" ON "erasure_requests"("child_id");
CREATE INDEX "erasure_requests_requested_by_id_idx" ON "erasure_requests"("requested_by_id");

-- A lo sumo una solicitud pendiente por niño.
CREATE UNIQUE INDEX "erasure_requests_one_pending_idx" ON "erasure_requests"("child_id")
  WHERE "status" = 'pending';

ALTER TABLE "erasure_requests" ADD CONSTRAINT "erasure_requests_child_id_fkey"
  FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "erasure_requests" ADD CONSTRAINT "erasure_requests_requested_by_id_fkey"
  FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "erasure_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY child_access ON "erasure_requests"
  USING (app_has_child_access(child_id)) WITH CHECK (app_has_child_access(child_id));

-- Ejecuta las solicitudes pendientes con más de p_grace_days de antigüedad (NK-41).
-- Cumplir una eliminación = ANONIMIZAR al niño, no borrar las filas inmutables:
--   * nombre y apellido pasan a 'Anonimizado' y la fecha de nacimiento se reduce al mes;
--   * se borran el registro de alimentación y los recordatorios;
--   * el texto libre de los seguimientos se reemplaza (puede nombrar al niño o a la familia);
--   * se revoca el consentimiento y se cierran los vínculos con profesionales;
--   * se borran los vínculos con los cuidadores: nadie vuelve a ver al niño en la app.
-- Se conservan, ya sin identidad, controles, resultados, alertas, su historial y la auditoría
-- (tablas inmutables, NK-8) durante el plazo de docs/backups.md.
-- SECURITY DEFINER porque corre sin usuario de sesión (RLS lo bloquearía).
CREATE OR REPLACE FUNCTION execute_erasure_requests(p_grace_days int)
RETURNS TABLE (request_id uuid, child_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT e.id, e.child_id, e.requested_by_id
      FROM erasure_requests e
     WHERE e.status = 'pending'
       AND e.requested_at <= NOW() - make_interval(days => p_grace_days)
     ORDER BY e.requested_at
       FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE children
       SET first_name = 'Anonimizado',
           last_name = 'Anonimizado',
           birth_date = date_trunc('month', birth_date)::date
     WHERE id = r.child_id;
    DELETE FROM feeding_logs WHERE feeding_logs.child_id = r.child_id;
    DELETE FROM reminders WHERE reminders.child_id = r.child_id;
    UPDATE follow_ups
       SET details = '[eliminado por solicitud del representante]'
     WHERE follow_ups.child_id = r.child_id;
    UPDATE consents
       SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE consents.child_id = r.child_id;
    UPDATE professional_children
       SET end_date = LEAST(COALESCE(end_date, CURRENT_DATE), CURRENT_DATE)
     WHERE professional_children.child_id = r.child_id;
    DELETE FROM caregiver_children WHERE caregiver_children.child_id = r.child_id;

    UPDATE erasure_requests SET status = 'completed', resolved_at = NOW() WHERE id = r.id;

    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, occurred_at)
    VALUES (gen_random_uuid(), r.requested_by_id, 'ERASE', 'children', r.child_id,
            jsonb_build_object('requestId', r.id), NOW());

    request_id := r.id;
    child_id := r.child_id;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION execute_erasure_requests(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION execute_erasure_requests(int) TO nutrikids_app;
