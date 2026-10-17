ALTER TABLE staffing_engagements
  ADD COLUMN client_accepted_by uuid REFERENCES users(id),
  ADD COLUMN client_accepted_at timestamptz,
  ADD COLUMN worker_accepted_by uuid REFERENCES users(id),
  ADD COLUMN worker_accepted_at timestamptz;

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT conname FROM pg_constraint
    WHERE conrelid='staffing_engagements'::regclass AND contype='c'
      AND (pg_get_constraintdef(oid) ILIKE '%status%' OR pg_get_constraintdef(oid) ILIKE '%terms_pending%')
  LOOP EXECUTE format('ALTER TABLE staffing_engagements DROP CONSTRAINT %I',item.conname); END LOOP;
END $$;

ALTER TABLE staffing_engagements
  ADD CONSTRAINT staffing_engagements_status_check
    CHECK (status IN ('terms_pending','terms_approved','active','completed','cancelled')),
  ADD CONSTRAINT staffing_engagements_terms_lifecycle_check
    CHECK (
      (status='terms_pending' AND terms_approved_by IS NULL AND terms_approved_at IS NULL)
      OR (status IN ('terms_approved','active','completed','cancelled') AND terms_approved_by IS NOT NULL AND terms_approved_at IS NOT NULL)
    ),
  ADD CONSTRAINT staffing_engagements_party_acceptance_check
    CHECK (
      (client_accepted_by IS NULL) = (client_accepted_at IS NULL)
      AND (worker_accepted_by IS NULL) = (worker_accepted_at IS NULL)
      AND (status NOT IN ('active','completed') OR (client_accepted_by IS NOT NULL AND worker_accepted_by IS NOT NULL))
      AND (client_accepted_by IS NULL OR client_accepted_by <> terms_approved_by)
      AND (worker_accepted_by IS NULL OR worker_accepted_by <> terms_approved_by)
    );

CREATE POLICY staffing_engagement_participant_read ON staffing_engagements
  FOR SELECT USING (
    (app_role()='customer' AND EXISTS (SELECT 1 FROM leads l JOIN users u ON u.id=app_user_id() WHERE l.id=client_lead_id AND l.phone=u.phone))
    OR (app_role()='worker' AND EXISTS (SELECT 1 FROM workers w JOIN users u ON u.id=app_user_id() WHERE w.id=worker_id AND w.phone=u.phone))
  );

CREATE OR REPLACE FUNCTION accept_staffing_engagement(target_id uuid, party text, acceptance_reason text)
RETURNS staffing_engagements LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET row_security=off AS $$
DECLARE e staffing_engagements%ROWTYPE;
DECLARE actor uuid := nullif(current_setting('app.user_id',true),'')::uuid;
DECLARE actor_role text := current_setting('app.role',true);
DECLARE actor_phone text;
DECLARE actor_matches boolean;
BEGIN
  IF party NOT IN ('client','worker') OR length(trim(acceptance_reason)) < 10 THEN RAISE EXCEPTION 'Invalid Staffing acceptance'; END IF;
  SELECT phone INTO actor_phone FROM users WHERE id=actor AND active;
  IF actor IS NULL OR actor_phone IS NULL OR (party='client' AND actor_role<>'customer') OR (party='worker' AND actor_role<>'worker') THEN RAISE EXCEPTION 'Staffing acceptance identity is not authorized'; END IF;
  SELECT * INTO e FROM staffing_engagements WHERE id=target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staffing engagement not found'; END IF;
  IF e.status NOT IN ('terms_approved','active') THEN RAISE EXCEPTION 'Finance approved terms are required before either party can accept'; END IF;
  IF party='client' THEN
    SELECT phone=actor_phone INTO actor_matches FROM leads WHERE id=e.client_lead_id;
    IF NOT coalesce(actor_matches,false) THEN RAISE EXCEPTION 'This identity is not the client named in the engagement'; END IF;
    IF e.client_accepted_by IS NOT NULL THEN RAISE EXCEPTION 'The client has already accepted these terms'; END IF;
    e.client_accepted_by:=actor;e.client_accepted_at:=now();
  ELSE
    SELECT phone=actor_phone INTO actor_matches FROM workers WHERE id=e.worker_id;
    IF NOT coalesce(actor_matches,false) THEN RAISE EXCEPTION 'This identity is not the worker named in the engagement'; END IF;
    IF e.worker_accepted_by IS NOT NULL THEN RAISE EXCEPTION 'The worker has already accepted these terms'; END IF;
    e.worker_accepted_by:=actor;e.worker_accepted_at:=now();
  END IF;
  IF e.client_accepted_by IS NOT NULL AND e.worker_accepted_by IS NOT NULL THEN e.status:='active'; END IF;
  UPDATE staffing_engagements SET client_accepted_by=e.client_accepted_by,client_accepted_at=e.client_accepted_at,
    worker_accepted_by=e.worker_accepted_by,worker_accepted_at=e.worker_accepted_at,status=e.status WHERE id=e.id RETURNING * INTO e;
  RETURN e;
END $$;
REVOKE ALL ON FUNCTION accept_staffing_engagement(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_staffing_engagement(uuid,text,text) TO "{{role}}";
