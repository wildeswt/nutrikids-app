-- ======================================================
-- Checkup observations / notes (NK-72)
-- ======================================================
-- Adds optional clinical observations (up to 500 characters) to immutable checkups.
-- Nullable so existing checkups keep `notes = NULL`.
-- Immutability trigger (`checkups_immutable`), RLS (`child_access`) and table-level
-- grants (`SELECT, INSERT` for `nutrikids_app`) remain unaffected by adding a nullable column.

ALTER TABLE "checkups" ADD COLUMN "notes" VARCHAR(500);

-- Reject empty or whitespace-only strings when `notes` is provided.
ALTER TABLE "checkups"
  ADD CONSTRAINT "checkups_notes_check"
  CHECK ("notes" IS NULL OR char_length(btrim("notes")) BETWEEN 1 AND 500);
