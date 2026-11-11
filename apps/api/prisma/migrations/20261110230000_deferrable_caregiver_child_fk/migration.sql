-- Make caregiver_children foreign key to children deferrable
-- This allows atomic transaction insertion: caregiver_children -> children -> consents
-- ensuring RLS policies like app_has_child_access(id) on children succeed during insertion.

ALTER TABLE "caregiver_children"
  DROP CONSTRAINT "caregiver_children_child_id_fkey",
  ADD CONSTRAINT "caregiver_children_child_id_fkey"
    FOREIGN KEY ("child_id")
    REFERENCES "children"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

