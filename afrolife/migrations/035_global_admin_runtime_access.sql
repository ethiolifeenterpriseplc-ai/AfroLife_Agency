ALTER TABLE global_admin_role_change_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS global_admin_role_change_requests_staff ON global_admin_role_change_requests;
CREATE POLICY global_admin_role_change_requests_admin ON global_admin_role_change_requests
  USING (app_role() = 'super_admin')
  WITH CHECK (app_role() = 'super_admin');

GRANT SELECT, INSERT, UPDATE ON TABLE global_admin_role_change_requests TO "{{role}}";
