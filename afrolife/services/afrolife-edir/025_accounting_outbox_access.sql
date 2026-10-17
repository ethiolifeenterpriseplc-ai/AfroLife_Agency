DROP POLICY IF EXISTS accounting_event_outbox_staff ON accounting_event_outbox;
CREATE POLICY accounting_event_outbox_staff ON accounting_event_outbox FOR ALL
  USING (current_setting('app.role',true)='accounting_dispatcher' OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer']))
  WITH CHECK (current_setting('app.role',true)='accounting_dispatcher' OR edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','finance_manager','treasurer']));
