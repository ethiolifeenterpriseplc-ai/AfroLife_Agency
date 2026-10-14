CREATE OR REPLACE FUNCTION edir_lock_member_credit_controls(target_member uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT (
    edir_is_platform_admin()
    OR edir_has_staff_role(ARRAY['edir_admin','credit_manager','compliance','finance_manager','treasurer'])
    OR EXISTS (
      SELECT 1 FROM edir_memberships
      WHERE id=target_member AND organization_id=app_edir_id() AND user_id=app_user_id()
    )
  ) THEN
    RAISE EXCEPTION 'Edir member credit-control access is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM edir_memberships
    WHERE id=target_member AND organization_id=app_edir_id()
  ) THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(779820,hashtext(target_member::text));
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION edir_lock_member_credit_controls(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edir_lock_member_credit_controls(uuid) TO "{{role}}";
