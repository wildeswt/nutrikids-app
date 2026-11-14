-- Función SQL SECURITY DEFINER para buscar alertas pendientes de revisión vencidas (NK-36).
-- Alertas con status GENERATED o PENDING_REVIEW que superen el plazo (estándar o severo)
-- desde su created_at, de controles vigentes (no corregidos), con profesional asignado hoy,
-- y sin notificaciones enviadas a ese profesional en las últimas p_renotify_hours.

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
  JOIN professional_children pc ON pc.child_id = c.child_id
  WHERE a.status IN ('GENERATED', 'PENDING_REVIEW')
    -- Excluir alertas de controles ya corregidos (equivalente a checkupIsCurrent)
    AND NOT EXISTS (
      SELECT 1 FROM checkups c2 WHERE c2.corrected_checkup_id = c.id
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

GRANT EXECUTE ON FUNCTION find_overdue_alert_recipients(int, int, int) TO nutrikids_app;

