CREATE FUNCTION edir_platform_disbursement_cap_allows(operation_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  operation edir_loan_operations%ROWTYPE;
  active_limit numeric(14,2);
  posted_today numeric(14,2);
BEGIN
  IF NOT edir_is_platform_admin()
     AND NOT edir_has_staff_role(ARRAY['edir_admin','credit_manager','finance_manager','treasurer']) THEN
    RAISE EXCEPTION 'Edir disbursement review access is required';
  END IF;
  SELECT * INTO operation FROM edir_loan_operations
  WHERE id=operation_id AND organization_id=app_edir_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A pending Edir disbursement operation in the current organization is required';
  END IF;
  IF operation.operation_type<>'disbursement' OR operation.status<>'pending' THEN
    RAISE EXCEPTION 'A pending Edir disbursement operation in the current organization is required';
  END IF;

  PERFORM pg_advisory_xact_lock(779819,1);
  SELECT daily_limit INTO active_limit
  FROM edir_platform_disbursement_limit_versions WHERE status='active';
  IF active_limit IS NULL THEN RETURN true; END IF;

  SELECT coalesce(sum(journal.amount),0) INTO posted_today
  FROM edir_loan_journals journal
  JOIN edir_loan_operations posted_operation
    ON posted_operation.id=journal.operation_id
    AND posted_operation.organization_id=journal.organization_id
  WHERE journal.status='posted'
    AND posted_operation.operation_type='disbursement'
    AND journal.posted_at::date=current_date;
  RETURN posted_today+operation.amount<=active_limit;
END
$$;
REVOKE ALL ON FUNCTION edir_platform_disbursement_cap_allows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION edir_platform_disbursement_cap_allows(uuid) TO "{{role}}";
