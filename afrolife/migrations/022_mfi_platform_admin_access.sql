CREATE OR REPLACE FUNCTION mfi_has_access(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_role() = 'super_admin' OR EXISTS (
    SELECT 1 FROM mfi_institution_memberships
    WHERE institution_id = target AND user_id = app_user_id() AND active
  )
$$;
