CREATE OR REPLACE FUNCTION app_offboard_worker(target_worker uuid, reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
DECLARE worker_record workers%ROWTYPE;
        worker_user_id uuid;
BEGIN
  IF NOT app_has_permission('workforce.workers.offboard')
    OR length(trim(coalesce(reason,''))) < 10 THEN
    RAISE EXCEPTION 'Worker offboarding is not authorized or the reason is too short';
  END IF;
  SELECT * INTO worker_record FROM workers WHERE id=target_worker;
  IF NOT FOUND THEN RAISE EXCEPTION 'Worker not found'; END IF;
  IF app_role() NOT IN ('global_admin','super_admin','corporate_business_manager','compliance')
    AND NOT app_can_access_agent(worker_record.source_agent_id) THEN
    RAISE EXCEPTION 'Worker is outside the actor scope';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('workforce-worker:' || target_worker::text, 0)
  );
  PERFORM set_config('app.access_change_reason',trim(reason),true);
  PERFORM 1 FROM staffing_engagements
    WHERE worker_id=target_worker ORDER BY id FOR UPDATE;
  SELECT * INTO worker_record FROM workers WHERE id=target_worker FOR UPDATE;
  IF worker_record.employment_status='terminated' THEN RAISE EXCEPTION 'Worker is already terminated'; END IF;
  UPDATE workers SET employment_status='terminated',terminated_at=now(),terminated_by=app_user_id(),
    termination_reason=trim(reason) WHERE id=target_worker;
  SELECT id INTO worker_user_id FROM users WHERE role='worker' AND phone=worker_record.phone FOR UPDATE;
  IF worker_user_id IS NOT NULL THEN
    UPDATE users SET active=false WHERE id=worker_user_id;
    UPDATE auth_sessions SET revoked_at=now() WHERE user_id=worker_user_id AND revoked_at IS NULL;
  END IF;
  UPDATE workforce_shifts SET status='cancelled'
    WHERE engagement_id IN (SELECT id FROM staffing_engagements WHERE worker_id=target_worker)
      AND status='scheduled' AND starts_at>now()
      AND NOT EXISTS (SELECT 1 FROM workforce_clock_events c WHERE c.shift_id=workforce_shifts.id);
  UPDATE staffing_engagements SET status='completed'
    WHERE worker_id=target_worker AND status='active';
  RETURN worker_user_id;
END
$$;

REVOKE ALL ON FUNCTION app_offboard_worker(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_offboard_worker(uuid,text) TO "{{role}}";
