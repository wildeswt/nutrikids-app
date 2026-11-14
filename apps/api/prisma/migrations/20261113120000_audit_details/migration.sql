-- ======================================================
-- Detalle estructurado en audit_logs (RT-02)
-- ======================================================
-- Permite guardar contexto adicional de un evento, p. ej. la discrepancia entre los
-- indicadores calculados por el celular y los recalculados por el servidor al sincronizar.
-- La tabla sigue siendo inmutable (trigger audit_logs_immutable + REVOKE UPDATE/DELETE).

ALTER TABLE "audit_logs" ADD COLUMN "details" JSONB;
