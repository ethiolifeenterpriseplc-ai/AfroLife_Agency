DROP POLICY release_approvals_insert ON release_approvals;

CREATE POLICY release_approvals_insert ON release_approvals
  FOR INSERT WITH CHECK (
    app_role() IN ('global_admin','super_admin','finance','finance_manager')
    AND approver_role = coalesce(nullif(current_setting('app.role', true), ''), '')
    AND approver_name = (SELECT legal_name FROM users WHERE id=app_user_id())
    AND approver_email IS NOT DISTINCT FROM (SELECT email FROM users WHERE id=app_user_id())
  );
