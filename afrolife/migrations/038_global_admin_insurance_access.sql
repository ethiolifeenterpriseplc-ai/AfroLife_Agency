DROP POLICY insurance_org_catalog ON insurance_ledger_organizations;
CREATE POLICY insurance_org_catalog ON insurance_ledger_organizations FOR SELECT
  USING (status='active' OR id=app_edir_id() OR insurance_ledger_is_master()
    OR app_role() IN ('global_admin','super_admin'));

DROP POLICY insurance_org_master_create ON insurance_ledger_organizations;
CREATE POLICY insurance_org_master_create ON insurance_ledger_organizations FOR INSERT
  WITH CHECK ((insurance_ledger_is_master() OR app_role() IN ('global_admin','super_admin'))
    AND parent_organization_id='00000000-0000-4000-8000-000000000001'
    AND organization_type IN ('member_edir','independent_master'));

DROP POLICY insurance_org_master_update ON insurance_ledger_organizations;
CREATE POLICY insurance_org_master_update ON insurance_ledger_organizations FOR UPDATE
  USING (insurance_ledger_is_master() OR app_role() IN ('global_admin','super_admin'))
  WITH CHECK (insurance_ledger_is_master() OR app_role() IN ('global_admin','super_admin'));

DROP POLICY insurance_staff_self_read ON insurance_ledger_staff;
CREATE POLICY insurance_staff_self_read ON insurance_ledger_staff FOR SELECT
  USING (user_id=app_user_id()
    OR organization_id=app_edir_id() AND insurance_ledger_has_role(ARRAY['insurance_admin'])
    OR insurance_ledger_is_master() OR app_role() IN ('global_admin','super_admin'));

DROP POLICY insurance_staff_manage ON insurance_ledger_staff;
CREATE POLICY insurance_staff_manage ON insurance_ledger_staff FOR ALL
  USING (organization_id=app_edir_id() AND insurance_ledger_has_role(ARRAY['insurance_admin'])
    OR insurance_ledger_is_master() OR app_role() IN ('global_admin','super_admin'))
  WITH CHECK (organization_id=app_edir_id() AND insurance_ledger_has_role(ARRAY['insurance_admin'])
    OR insurance_ledger_is_master() OR app_role() IN ('global_admin','super_admin'));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['insurance_ledger_accounts','insurance_ledger_journals','insurance_ledger_lines','insurance_ledger_audit'] LOOP
    EXECUTE format('DROP POLICY %I ON %I', table_name||'_tenant_scope', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL USING (organization_id=app_edir_id() OR app_role() IN (''global_admin'',''super_admin'')) WITH CHECK (organization_id=app_edir_id() OR app_role() IN (''global_admin'',''super_admin''))',
      table_name||'_tenant_scope', table_name
    );
  END LOOP;
END $$;

DROP POLICY insurance_ledger_accounts_read ON insurance_ledger_accounts;
CREATE POLICY insurance_ledger_accounts_read ON insurance_ledger_accounts FOR SELECT
  USING (app_role() IN ('global_admin','super_admin')
    OR insurance_ledger_has_role(ARRAY['insurance_admin','finance','finance_manager','compliance','auditor']));
DROP POLICY insurance_ledger_accounts_create ON insurance_ledger_accounts;
CREATE POLICY insurance_ledger_accounts_create ON insurance_ledger_accounts FOR INSERT
  WITH CHECK (created_by=app_user_id()
    AND (app_role() IN ('global_admin','super_admin') OR insurance_ledger_has_role(ARRAY['insurance_admin'])));

DROP POLICY insurance_ledger_journals_read ON insurance_ledger_journals;
CREATE POLICY insurance_ledger_journals_read ON insurance_ledger_journals FOR SELECT
  USING (app_role() IN ('global_admin','super_admin')
    OR insurance_ledger_has_role(ARRAY['insurance_admin','finance','finance_manager','compliance','auditor']));
DROP POLICY insurance_ledger_journals_create ON insurance_ledger_journals;
CREATE POLICY insurance_ledger_journals_create ON insurance_ledger_journals FOR INSERT
  WITH CHECK (created_by=app_user_id()
    AND (app_role() IN ('global_admin','super_admin')
      OR insurance_ledger_has_role(ARRAY['finance','finance_manager','insurance_admin'])));
DROP POLICY insurance_ledger_journals_decide ON insurance_ledger_journals;
CREATE POLICY insurance_ledger_journals_decide ON insurance_ledger_journals FOR UPDATE
  USING (app_role() IN ('global_admin','super_admin')
    OR insurance_ledger_has_role(ARRAY['finance_manager','insurance_admin']))
  WITH CHECK (app_role() IN ('global_admin','super_admin')
    OR insurance_ledger_has_role(ARRAY['finance_manager','insurance_admin']));

DROP POLICY insurance_ledger_lines_read ON insurance_ledger_lines;
CREATE POLICY insurance_ledger_lines_read ON insurance_ledger_lines FOR SELECT
  USING (app_role() IN ('global_admin','super_admin')
    OR insurance_ledger_has_role(ARRAY['insurance_admin','finance','finance_manager','compliance','auditor']));
DROP POLICY insurance_ledger_lines_create ON insurance_ledger_lines;
CREATE POLICY insurance_ledger_lines_create ON insurance_ledger_lines FOR INSERT
  WITH CHECK ((app_role() IN ('global_admin','super_admin')
      OR insurance_ledger_has_role(ARRAY['finance','finance_manager','insurance_admin']))
    AND EXISTS (SELECT 1 FROM insurance_ledger_journals j
      WHERE j.id=journal_id AND j.organization_id=insurance_ledger_lines.organization_id
        AND j.status='draft' AND j.created_by=app_user_id()));

DROP POLICY insurance_ledger_audit_read ON insurance_ledger_audit;
CREATE POLICY insurance_ledger_audit_read ON insurance_ledger_audit FOR SELECT
  USING (app_role() IN ('global_admin','super_admin')
    OR insurance_ledger_has_role(ARRAY['insurance_admin','finance_manager','compliance','auditor']));
DROP POLICY insurance_ledger_audit_create ON insurance_ledger_audit;
CREATE POLICY insurance_ledger_audit_create ON insurance_ledger_audit FOR INSERT
  WITH CHECK (actor_id=app_user_id()
    AND (app_role() IN ('global_admin','super_admin')
      OR insurance_ledger_has_role(ARRAY['insurance_admin','finance','finance_manager'])));
