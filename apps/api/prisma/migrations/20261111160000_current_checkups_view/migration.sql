-- Vista derivada de controles vigentes.
-- `checkups` es inmutable: una corrección crea un control nuevo con `corrected_checkup_id`
-- apuntando al original. Un control es vigente si ningún otro control lo corrige.
-- Gráficas (NK-26), alertas (NK-30) y sincronización (NK-28) deben leer de esta vista.
-- security_invoker aplica las políticas RLS de `checkups` al usuario que consulta.
CREATE VIEW "current_checkups" WITH (security_invoker = true) AS
SELECT c.*
FROM "checkups" c
WHERE NOT EXISTS (
  SELECT 1 FROM "checkups" r WHERE r."corrected_checkup_id" = c."id"
);

GRANT SELECT ON "current_checkups" TO nutrikids_app;
