-- Mensajes y derivaciones (NK-38, RF-19).
-- Un mensaje pertenece siempre a un niño (child_id): el vínculo con ese niño es lo que autoriza
-- a escribir y a leer. `kind` distingue el mensaje normal de la derivación entre profesionales.

ALTER TABLE "messages" ADD COLUMN "child_id" UUID NOT NULL;
ALTER TABLE "messages" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'message';
ALTER TABLE "messages" ADD COLUMN "read_at" TIMESTAMPTZ(3);

ALTER TABLE "messages" ADD CONSTRAINT "messages_child_id_fkey"
  FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_check" CHECK ("kind" IN ('message', 'referral'));
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_check"
  CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000);
ALTER TABLE "messages" ADD CONSTRAINT "messages_participants_check" CHECK ("sender_id" <> "recipient_id");

CREATE INDEX "messages_thread_idx" ON "messages"("child_id", "sender_id", "recipient_id", "sent_at" DESC);
CREATE INDEX "messages_recipient_unread_idx" ON "messages"("recipient_id", "read_at");

-- Quién puede escribir a quién sobre un niño. El remitente es el usuario de la sesión.
--   * ambos deben tener vínculo vigente con el niño (cuidador, o profesional con asignación activa);
--   * al menos uno debe ser profesional (cuidador con cuidador no);
--   * una derivación (kind = 'referral') exige que ambos sean profesionales del niño.
CREATE OR REPLACE FUNCTION app_can_message(p_child uuid, p_recipient uuid, p_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT EXISTS (SELECT 1 FROM caregiver_children
                    WHERE child_id = p_child AND caregiver_id = app_user_id()) AS cg,
           EXISTS (SELECT 1 FROM professional_children
                    WHERE child_id = p_child AND professional_id = app_user_id()
                      AND start_date <= CURRENT_DATE
                      AND (end_date IS NULL OR end_date >= CURRENT_DATE)) AS pro
  ), r AS (
    SELECT EXISTS (SELECT 1 FROM caregiver_children
                    WHERE child_id = p_child AND caregiver_id = p_recipient) AS cg,
           EXISTS (SELECT 1 FROM professional_children
                    WHERE child_id = p_child AND professional_id = p_recipient
                      AND start_date <= CURRENT_DATE
                      AND (end_date IS NULL OR end_date >= CURRENT_DATE)) AS pro
  )
  SELECT app_user_id() IS NOT NULL
     AND app_user_id() <> p_recipient
     AND (s.cg OR s.pro) AND (r.cg OR r.pro)
     AND (s.pro OR r.pro)
     AND (p_kind <> 'referral' OR (s.pro AND r.pro))
    FROM s, r;
$$;

-- RLS: se leen los mensajes propios mientras se conserve acceso al niño; se insertan solo como
-- remitente y con permiso de escritura; el destinatario solo puede marcar como leído.
DROP POLICY IF EXISTS user_messages ON "messages";

CREATE POLICY messages_read ON "messages" FOR SELECT
  USING ((sender_id = app_user_id() OR recipient_id = app_user_id()) AND app_has_child_access(child_id));

CREATE POLICY messages_insert ON "messages" FOR INSERT
  WITH CHECK (sender_id = app_user_id() AND app_can_message(child_id, recipient_id, kind));

CREATE POLICY messages_mark_read ON "messages" FOR UPDATE
  USING (recipient_id = app_user_id()) WITH CHECK (recipient_id = app_user_id());

-- Los mensajes son inmutables: la única modificación válida es fijar read_at una vez.
CREATE OR REPLACE FUNCTION messages_only_mark_read() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.child_id, NEW.sender_id, NEW.recipient_id, NEW.kind, NEW.body, NEW.sent_at)
       IS DISTINCT FROM
     (OLD.id, OLD.child_id, OLD.sender_id, OLD.recipient_id, OLD.kind, OLD.body, OLD.sent_at)
     OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at) THEN
    RAISE EXCEPTION 'messages is immutable: only read_at can be set once'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER messages_only_mark_read BEFORE UPDATE ON "messages"
  FOR EACH ROW EXECUTE FUNCTION messages_only_mark_read();

-- Nadie borra mensajes desde la app; solo la anonimización (función de abajo, SECURITY DEFINER).
REVOKE DELETE ON "messages" FROM nutrikids_app;

-- La eliminación solicitada por el representante (NK-41) también borra los mensajes del niño.
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
    DELETE FROM messages WHERE messages.child_id = r.child_id;
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

REVOKE ALL ON FUNCTION app_can_message(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_can_message(uuid, uuid, text) TO nutrikids_app;
