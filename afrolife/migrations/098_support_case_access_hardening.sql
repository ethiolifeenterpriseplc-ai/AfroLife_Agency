CREATE OR REPLACE FUNCTION app_support_case_can_access(target_case uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM support_cases c
    WHERE c.id = target_case AND c.user_id = app_user_id()
  ) OR EXISTS (
    SELECT 1 FROM support_case_access_requests a
    WHERE a.case_id = target_case
      AND a.requested_by = app_user_id()
      AND a.status = 'approved'
      AND a.expires_at > now()
  )
$$;
REVOKE ALL ON FUNCTION app_support_case_can_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_support_case_can_access(uuid) TO "{{role}}";

CREATE OR REPLACE FUNCTION app_support_case_queue()
RETURNS TABLE (
  id uuid,
  category text,
  priority text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT c.id, c.category, c.priority, c.status, c.created_at, c.updated_at
  FROM support_cases c
  WHERE app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager')
    AND c.status NOT IN ('resolved','appealed')
  ORDER BY CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, c.created_at
  LIMIT 300
$$;
REVOKE ALL ON FUNCTION app_support_case_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_support_case_queue() TO "{{role}}";

CREATE OR REPLACE FUNCTION app_support_case_exists_for_staff(target_case uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT app_role() IN ('global_admin','super_admin','compliance','corporate_business_manager')
    AND EXISTS (SELECT 1 FROM support_cases c WHERE c.id = target_case)
$$;
REVOKE ALL ON FUNCTION app_support_case_exists_for_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_support_case_exists_for_staff(uuid) TO "{{role}}";

DROP POLICY support_cases_owner_read ON support_cases;
DROP POLICY support_cases_staff_read ON support_cases;
CREATE POLICY support_cases_authorized_read ON support_cases
  FOR SELECT USING (app_support_case_can_access(id));

DROP POLICY support_case_events_read ON support_case_events;
CREATE POLICY support_case_events_authorized_read ON support_case_events
  FOR SELECT USING (app_support_case_can_access(case_id));

REVOKE UPDATE ON support_case_access_requests FROM "{{role}}";
GRANT UPDATE (status, reviewed_by, review_reason, reviewed_at, expires_at)
  ON support_case_access_requests TO "{{role}}";
