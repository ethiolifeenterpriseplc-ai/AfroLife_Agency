DROP POLICY IF EXISTS platform_tenant_capability_global_admin
  ON platform_tenant_capability_grants;

CREATE POLICY platform_tenant_capability_grants_self_or_global_read
  ON platform_tenant_capability_grants
  FOR SELECT
  USING (
    user_id = app_user_id()
    OR current_setting('app.role',true) = 'global_admin'
  );

CREATE POLICY platform_tenant_capability_grants_global_manage
  ON platform_tenant_capability_grants
  FOR ALL
  USING (current_setting('app.role',true) = 'global_admin')
  WITH CHECK (current_setting('app.role',true) = 'global_admin');

CREATE POLICY platform_tenant_operator_requests_self_read
  ON platform_tenant_operator_requests
  FOR SELECT
  USING (
    actor_id = app_user_id()
    OR current_setting('app.role',true) = 'global_admin'
  );

CREATE POLICY platform_tenant_operator_requests_assigned_database_admin_create
  ON platform_tenant_operator_requests
  FOR INSERT
  WITH CHECK (
    actor_id = app_user_id()
    AND EXISTS (
      SELECT 1
      FROM platform_tenant_capability_grants g
      JOIN platform_tenants t ON t.id=g.tenant_id
      WHERE g.user_id=app_user_id()
        AND g.tenant_id=platform_tenant_operator_requests.tenant_id
        AND g.capability='database_admin'
        AND t.status='active'
    )
  );
