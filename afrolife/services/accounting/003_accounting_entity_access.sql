CREATE OR REPLACE FUNCTION accounting_can_access(target uuid, allowed_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT current_setting('app.role',true) IN ('global_admin','super_admin') OR EXISTS (
    SELECT 1 FROM accounting_memberships m
    WHERE m.entity_id=target
      AND m.user_id=nullif(current_setting('app.user_id',true),'')::uuid
      AND m.active AND m.role=ANY(allowed_roles)
  )
$$;
