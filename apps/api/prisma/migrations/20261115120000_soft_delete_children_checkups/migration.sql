-- Eliminación lógica (soft delete) de niños y controles.
--
-- Los controles siguen siendo inmutables: el único cambio permitido es marcarlos como eliminados
-- (deleted_at / deleted_by_id, una sola vez). Una fila eliminada queda en la base para auditoría
-- pero RLS la oculta a toda la aplicación (indicadores y alertas cuelgan del control y también
-- dejan de verse). Si se elimina una corrección, el control original vuelve a ser el vigente.
-- Un niño eliminado deja de ser accesible para todos (app_has_child_access devuelve false).

ALTER TABLE "children" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "checkups"
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_by_id" UUID;

ALTER TABLE "checkups"
  ADD CONSTRAINT "checkups_deleted_by_id_fkey"
  FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------
-- Inmutabilidad: solo se permite marcar el control como eliminado
-- ------------------------------------------------------
DROP TRIGGER IF EXISTS checkups_immutable ON "checkups";

CREATE OR REPLACE FUNCTION checkups_only_soft_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL
     AND (to_jsonb(NEW) - 'deleted_at' - 'deleted_by_id')
         = (to_jsonb(OLD) - 'deleted_at' - 'deleted_by_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'checkups is immutable: % not allowed (only soft delete)', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER checkups_only_soft_delete BEFORE UPDATE OR DELETE ON "checkups"
  FOR EACH ROW EXECUTE FUNCTION checkups_only_soft_delete();

-- El rol de la aplicación solo puede escribir estas dos columnas.
GRANT UPDATE ("deleted_at", "deleted_by_id") ON "checkups" TO nutrikids_app;

-- ------------------------------------------------------
-- RLS: lo eliminado no se ve
-- ------------------------------------------------------
CREATE OR REPLACE FUNCTION app_has_child_access(p_child uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (EXISTS (SELECT 1 FROM caregiver_children
                   WHERE child_id = p_child AND caregiver_id = app_user_id())
       OR EXISTS (SELECT 1 FROM professional_children
                   WHERE child_id = p_child AND professional_id = app_user_id()
                     AND start_date <= (now() AT TIME ZONE 'UTC')::date
                     AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'UTC')::date)))
     AND NOT EXISTS (SELECT 1 FROM children WHERE id = p_child AND deleted_at IS NOT NULL);
$$;

DROP POLICY IF EXISTS child_access ON "checkups";
CREATE POLICY child_access ON "checkups"
  USING (app_has_child_access(child_id) AND deleted_at IS NULL)
  WITH CHECK (app_has_child_access(child_id));

-- ------------------------------------------------------
-- Alertas vencidas: ignorar controles y niños eliminados
-- ------------------------------------------------------
CREATE OR REPLACE FUNCTION find_overdue_alert_recipients(
  p_standard_hours int,
  p_severe_hours int,
  p_renotify_hours int
)
RETURNS TABLE (alert_id uuid, professional_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT a.id AS alert_id, pc.professional_id
  FROM alerts a
  JOIN indicator_results ir ON ir.id = a.indicator_result_id
  JOIN checkups c ON c.id = ir.checkup_id
  JOIN children ch ON ch.id = c.child_id
  JOIN professional_children pc ON pc.child_id = c.child_id
  WHERE a.status IN ('GENERATED', 'PENDING_REVIEW')
    AND c.deleted_at IS NULL
    AND ch.deleted_at IS NULL
    -- Excluir alertas de controles ya corregidos (equivalente a checkupIsCurrent)
    AND NOT EXISTS (
      SELECT 1 FROM checkups c2
       WHERE c2.corrected_checkup_id = c.id AND c2.deleted_at IS NULL
    )
    -- Vínculo vigente hoy
    AND pc.start_date <= CURRENT_DATE
    AND (pc.end_date IS NULL OR pc.end_date >= CURRENT_DATE)
    -- Vencida contada únicamente desde alerts.created_at (docs/alerts.md)
    AND NOW() - a.created_at > make_interval(
      hours => CASE WHEN a.is_severe THEN p_severe_hours ELSE p_standard_hours END
    )
    -- Ventana de renotificación para no repetir el aviso al mismo profesional
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = pc.professional_id
        AND n.entity_type = 'alert'
        AND n.entity_id = a.id
        AND n.type IN ('alert_new', 'alert_pending_review', 'alert_overdue')
        AND n.sent_at > NOW() - make_interval(hours => p_renotify_hours)
    );
$$;
