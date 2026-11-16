-- Restricciones de formato para campos PII cifrados (RT-07, NK-41).
-- NOT VALID permite aplicar la migración sin bloquear ni fallar sobre datos históricos en claro;
-- tras el backfill (prisma/backfill-pii.ts) se validan con VALIDATE CONSTRAINT.

ALTER TABLE "users"
  ADD CONSTRAINT "users_first_name_enc_format"
    CHECK ("first_name" LIKE 'v1:%') NOT VALID,
  ADD CONSTRAINT "users_last_name_enc_format"
    CHECK ("last_name" LIKE 'v1:%') NOT VALID;

ALTER TABLE "children"
  ADD CONSTRAINT "children_first_name_enc_format"
    CHECK ("first_name" LIKE 'v1:%' OR "first_name" = 'Anonimizado') NOT VALID,
  ADD CONSTRAINT "children_last_name_enc_format"
    CHECK ("last_name" LIKE 'v1:%' OR "last_name" = 'Anonimizado') NOT VALID;

ALTER TABLE "caregivers"
  ADD CONSTRAINT "caregivers_phone_enc_format"
    CHECK ("phone" IS NULL OR "phone" LIKE 'v1:%') NOT VALID;
