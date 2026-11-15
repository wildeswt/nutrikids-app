-- ======================================================
-- Segundo factor TOTP para profesionales (NK-10, RT-06)
-- ======================================================
-- Último paso TOTP (contador de 30 s) aceptado al iniciar sesión. Se actualiza de forma
-- condicional (solo si el nuevo paso es mayor) para que un código no pueda reutilizarse.

ALTER TABLE "professionals" ADD COLUMN "totp_last_used_step" BIGINT;
