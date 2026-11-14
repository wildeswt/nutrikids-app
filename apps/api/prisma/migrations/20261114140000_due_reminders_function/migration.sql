-- Despacha los recordatorios pendientes que ya entraron en su ventana de anticipación (NK-37).
-- En una sola sentencia: marca como 'sent' los recordatorios 'pending' con
-- scheduled_for <= NOW() + p_lead_hours, y crea una notificación interna 'reminder_due' para
-- cada cuidador del niño. Al ser atómica, dos ejecuciones simultáneas no duplican avisos.
-- SECURITY DEFINER porque el job corre sin usuario de sesión (RLS lo bloquearía).

CREATE OR REPLACE FUNCTION dispatch_due_reminders(p_lead_hours int)
RETURNS TABLE (notification_id uuid, user_id uuid, reminder_id uuid)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    UPDATE reminders
       SET status = 'sent'
     WHERE status = 'pending'
       AND scheduled_for <= NOW() + make_interval(hours => p_lead_hours)
    RETURNING id, child_id
  ), created AS (
    INSERT INTO notifications (id, user_id, type, entity_type, entity_id, sent_at)
    SELECT gen_random_uuid(), cc.caregiver_id, 'reminder_due', 'reminder', due.id, NOW()
      FROM due
      JOIN caregiver_children cc ON cc.child_id = due.child_id
    RETURNING id, user_id, entity_id
  )
  SELECT id, user_id, entity_id FROM created;
$$;

REVOKE ALL ON FUNCTION dispatch_due_reminders(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dispatch_due_reminders(int) TO nutrikids_app;
