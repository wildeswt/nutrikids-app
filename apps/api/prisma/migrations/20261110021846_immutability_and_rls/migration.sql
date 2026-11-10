-- DropForeignKey
ALTER TABLE "alert_history" DROP CONSTRAINT "alert_history_alert_id_fkey";

-- DropForeignKey
ALTER TABLE "checkups" DROP CONSTRAINT "checkups_child_id_fkey";

-- DropIndex
DROP INDEX "checkups_child_id_measured_at_idx";

-- CreateIndex
CREATE INDEX "checkups_child_id_measured_at_idx" ON "checkups"("child_id", "measured_at" DESC);

-- AddForeignKey
ALTER TABLE "checkups" ADD CONSTRAINT "checkups_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ======================================================
-- A. Immutability: Prevent UPDATE and DELETE
-- ======================================================

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is immutable: % not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER checkups_immutable BEFORE UPDATE OR DELETE ON "checkups"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER alert_history_immutable BEFORE UPDATE OR DELETE ON "alert_history"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ======================================================
-- B. Application Role
-- ======================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nutrikids_app') THEN
    CREATE ROLE nutrikids_app LOGIN;
  END IF;
END $$;

GRANT nutrikids_app TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO nutrikids_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nutrikids_app;
REVOKE UPDATE, DELETE ON "checkups", "alert_history", "audit_logs" FROM nutrikids_app;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations') THEN
    REVOKE ALL ON "_prisma_migrations" FROM nutrikids_app;
  END IF;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nutrikids_app;

-- ======================================================
-- C. Request Identity and Row Level Security (RLS)
-- ======================================================

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_has_child_access(p_child uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM caregiver_children
                  WHERE child_id = p_child AND caregiver_id = app_user_id())
      OR EXISTS (SELECT 1 FROM professional_children
                  WHERE child_id = p_child AND professional_id = app_user_id()
                    AND start_date <= CURRENT_DATE
                    AND (end_date IS NULL OR end_date >= CURRENT_DATE));
$$;

-- Direct child-scoped tables
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['consents','checkups','feeding_logs','follow_ups','reminders'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY child_access ON %I
      USING (app_has_child_access(child_id)) WITH CHECK (app_has_child_access(child_id))', t);
  END LOOP;
END $$;

ALTER TABLE "children" ENABLE ROW LEVEL SECURITY;
CREATE POLICY child_access ON "children"
  USING (app_has_child_access(id)) WITH CHECK (app_has_child_access(id));

-- Association / link tables
ALTER TABLE "caregiver_children" ENABLE ROW LEVEL SECURITY;
CREATE POLICY caregiver_children_access ON "caregiver_children"
  USING (caregiver_id = app_user_id() OR app_has_child_access(child_id))
  WITH CHECK (caregiver_id = app_user_id() OR app_has_child_access(child_id));

ALTER TABLE "professional_children" ENABLE ROW LEVEL SECURITY;
CREATE POLICY professional_children_access ON "professional_children"
  USING (professional_id = app_user_id() OR app_has_child_access(child_id))
  WITH CHECK (professional_id = app_user_id() OR app_has_child_access(child_id));

-- User communication tables
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_notifications ON "notifications"
  USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_messages ON "messages"
  USING (sender_id = app_user_id() OR recipient_id = app_user_id())
  WITH CHECK (sender_id = app_user_id());

-- Indirect child-scoped tables (chained via parent relationship)
ALTER TABLE "indicator_results" ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_checkup ON "indicator_results"
  USING (EXISTS (SELECT 1 FROM checkups c WHERE c.id = checkup_id))
  WITH CHECK (EXISTS (SELECT 1 FROM checkups c WHERE c.id = checkup_id));

ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_indicator_results ON "alerts"
  USING (EXISTS (SELECT 1 FROM indicator_results ir WHERE ir.id = indicator_result_id))
  WITH CHECK (EXISTS (SELECT 1 FROM indicator_results ir WHERE ir.id = indicator_result_id));

ALTER TABLE "alert_history" ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_alerts ON "alert_history"
  USING (EXISTS (SELECT 1 FROM alerts a WHERE a.id = alert_id))
  WITH CHECK (EXISTS (SELECT 1 FROM alerts a WHERE a.id = alert_id));

-- ======================================================
-- D. Business Rules Triggers
-- ======================================================

CREATE OR REPLACE FUNCTION checkups_check_date() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.measured_at AT TIME ZONE 'America/Caracas')::date <
     (SELECT birth_date FROM children WHERE id = NEW.child_id) THEN
    RAISE EXCEPTION 'measured_at precedes the child''s birth date';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER checkups_date BEFORE INSERT ON "checkups"
  FOR EACH ROW EXECUTE FUNCTION checkups_check_date();

CREATE OR REPLACE FUNCTION alerts_require_follow_up() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'FOLLOW_UP_ESTABLISHED'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NOT EXISTS (SELECT 1 FROM follow_ups WHERE alert_id = NEW.id) THEN
    RAISE EXCEPTION 'alert % needs a follow-up first', NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER alerts_follow_up BEFORE INSERT OR UPDATE OF status ON "alerts"
  FOR EACH ROW EXECUTE FUNCTION alerts_require_follow_up();

-- ======================================================
-- E. Partial Index for Open Alerts
-- ======================================================

CREATE INDEX "alerts_open_idx" ON "alerts" ("created_at" DESC)
  WHERE "status" IN ('GENERATED', 'PENDING_REVIEW');
