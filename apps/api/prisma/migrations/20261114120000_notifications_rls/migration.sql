-- Drop existing single-policy RLS on notifications
DROP POLICY IF EXISTS user_notifications ON "notifications";

-- Notifications RLS: separate SELECT, UPDATE, and INSERT
CREATE POLICY notifications_read ON "notifications"
  FOR SELECT USING (user_id = app_user_id());

CREATE POLICY notifications_update ON "notifications"
  FOR UPDATE USING (user_id = app_user_id())
  WITH CHECK (user_id = app_user_id());

CREATE POLICY notifications_insert ON "notifications"
  FOR INSERT WITH CHECK (true);

-- Partial / Composite index for notification lookups and deduplication
CREATE INDEX IF NOT EXISTS "notifications_entity_sent_idx"
  ON "notifications" ("entity_type", "entity_id", "type", "sent_at" DESC);

