-- ======================================================
-- Row Level Security (RLS) on audit_logs (NK-21)
-- ======================================================

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- INSERT: permite registrar eventos de auditoría
CREATE POLICY audit_logs_insert ON "audit_logs"
  FOR INSERT
  WITH CHECK (user_id = app_user_id() OR app_user_id() IS NULL);

-- SELECT: permite lectura controlada por el backend con permiso audit:read
CREATE POLICY audit_logs_select ON "audit_logs"
  FOR SELECT
  USING (true);
