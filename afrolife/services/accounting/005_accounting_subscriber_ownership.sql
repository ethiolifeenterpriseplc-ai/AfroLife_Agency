-- A paid business subscriber may create a root book and its own initial admin
-- membership. This grants no global platform role and no access to other books.
DROP POLICY accounting_entities_read ON accounting_entities;
CREATE POLICY accounting_entities_read ON accounting_entities FOR SELECT
  USING (
    accounting_can_access(id,ARRAY['entity_admin','finance_manager','accountant','reviewer','auditor','viewer','consolidated_viewer'])
    OR (
      current_setting('app.role',true) IN ('customer','property_owner')
      AND created_by=nullif(current_setting('app.user_id',true),'')::uuid
      AND parent_entity_id IS NULL
    )
  );

DROP POLICY accounting_entities_write ON accounting_entities;
CREATE POLICY accounting_entities_write ON accounting_entities FOR INSERT
  WITH CHECK (
    current_setting('app.role',true) IN ('global_admin','super_admin')
    OR accounting_can_access(parent_entity_id,ARRAY['entity_admin'])
    OR (
      current_setting('app.role',true) IN ('customer','property_owner')
      AND parent_entity_id IS NULL
      AND created_by=nullif(current_setting('app.user_id',true),'')::uuid
      AND entity_type IN ('legal_entity','cooperative','merchant','landlord','property_owner','other')
    )
  );

CREATE FUNCTION accounting_subscriber_owns_root(target uuid, actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM accounting_entities e
    WHERE e.id=target AND e.parent_entity_id IS NULL AND e.created_by=actor
  )
$$;
REVOKE ALL ON FUNCTION accounting_subscriber_owns_root(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accounting_subscriber_owns_root(uuid,uuid) TO "{{role}}";

DROP POLICY accounting_members_write ON accounting_memberships;
CREATE POLICY accounting_members_insert ON accounting_memberships FOR INSERT
  WITH CHECK (
    current_setting('app.role',true) IN ('global_admin','super_admin')
    OR accounting_can_access(entity_id,ARRAY['entity_admin'])
    OR (
      current_setting('app.role',true) IN ('customer','property_owner')
      AND user_id=nullif(current_setting('app.user_id',true),'')::uuid
      AND assigned_by=nullif(current_setting('app.user_id',true),'')::uuid
      AND role='entity_admin'
      AND accounting_subscriber_owns_root(
        accounting_memberships.entity_id,
        nullif(current_setting('app.user_id',true),'')::uuid
      )
    )
  );
CREATE POLICY accounting_members_update ON accounting_memberships FOR UPDATE
  USING(current_setting('app.role',true) IN ('global_admin','super_admin') OR accounting_can_access(entity_id,ARRAY['entity_admin']))
  WITH CHECK(current_setting('app.role',true) IN ('global_admin','super_admin') OR accounting_can_access(entity_id,ARRAY['entity_admin']));
CREATE POLICY accounting_members_delete ON accounting_memberships FOR DELETE
  USING(current_setting('app.role',true) IN ('global_admin','super_admin') OR accounting_can_access(entity_id,ARRAY['entity_admin']));
