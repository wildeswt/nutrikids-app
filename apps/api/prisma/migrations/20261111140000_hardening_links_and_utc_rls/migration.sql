-- Partial unique index to prevent race-condition duplicate open professional assignments
CREATE UNIQUE INDEX "professional_children_active_unique_idx"
  ON "professional_children" ("child_id", "professional_id")
  WHERE "end_date" IS NULL;

-- Align RLS date checks with UTC date (matching Node.js utcTodayDate())
CREATE OR REPLACE FUNCTION app_has_child_access(p_child uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM caregiver_children
                  WHERE child_id = p_child AND caregiver_id = app_user_id())
      OR EXISTS (SELECT 1 FROM professional_children
                  WHERE child_id = p_child AND professional_id = app_user_id()
                    AND start_date <= (now() AT TIME ZONE 'UTC')::date
                    AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'UTC')::date));
$$;

