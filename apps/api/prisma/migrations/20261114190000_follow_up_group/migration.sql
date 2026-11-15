-- ======================================================
-- Group clinical follow-ups (NK-75)
-- ======================================================
-- Adds nullable `group_id` column to `follow_ups` so observations, interventions,
-- and referrals recorded during the same clinical consultation are linked together.
-- Nullable so existing individual follow-ups remain unaffected (`group_id = NULL`).
--
-- Security and integrity considerations:
-- 1. Triggers: `follow_ups` does not define immutability triggers (unlike `checkups` and `alert_history`).
-- 2. Row Level Security: The existing RLS policy (`child_access` on `child_id`) covers the entire row,
--    so the new `group_id` column is automatically protected under the same child link context.
-- 3. Grants: Table-level privileges for `nutrikids_app` (`SELECT, INSERT, UPDATE, DELETE`) automatically
--    apply to the new column without requiring explicit GRANT statements.

ALTER TABLE "follow_ups" ADD COLUMN "group_id" UUID;

-- CreateIndex
CREATE INDEX "follow_ups_group_id_idx" ON "follow_ups"("group_id");
