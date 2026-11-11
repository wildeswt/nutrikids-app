-- Partial unique index: at most one active (non-revoked) consent per child
CREATE UNIQUE INDEX "consents_child_active_unique_idx"
  ON "consents" ("child_id")
  WHERE "revoked_at" IS NULL;

-- Trigger function: ensure child has active consent before inserting checkups
CREATE OR REPLACE FUNCTION checkups_require_active_consent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM consents
    WHERE child_id = NEW.child_id
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'checkup cannot be recorded without active consent for child %', NEW.child_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER checkups_active_consent BEFORE INSERT ON "checkups"
  FOR EACH ROW EXECUTE FUNCTION checkups_require_active_consent();

