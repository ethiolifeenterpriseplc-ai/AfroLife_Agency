ALTER TABLE insurance_interest_requests
  ADD COLUMN agent_referral_consented_at timestamptz;

CREATE TABLE insurance_agent_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES insurance_interest_requests(id),
  user_id uuid NOT NULL REFERENCES users(id),
  product_interest text NOT NULL CHECK (product_interest IN ('life','household','property')),
  customer_consented_at timestamptz NOT NULL,
  assigned_agent_id uuid REFERENCES agents(id),
  status text NOT NULL DEFAULT 'unassigned'
    CHECK (status IN (
      'unassigned','assigned','contact_attempted','referred_to_insurance_team',
      'customer_declined','customer_withdrew'
    )),
  assigned_by uuid REFERENCES users(id),
  assigned_at timestamptz,
  assignment_reason text CHECK (
    assignment_reason IS NULL OR assignment_reason IN (
      'customer_requested','workload_balance','staff_review'
    )
  ),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (assigned_agent_id IS NULL AND status = 'unassigned'
      AND assigned_by IS NULL AND assigned_at IS NULL AND assignment_reason IS NULL)
    OR (assigned_agent_id IS NULL AND status = 'customer_withdrew'
      AND assigned_by IS NULL AND assigned_at IS NULL AND assignment_reason IS NULL)
    OR (assigned_agent_id IS NOT NULL AND status <> 'unassigned'
      AND assigned_by IS NOT NULL AND assigned_at IS NOT NULL AND assignment_reason IS NOT NULL)
  )
);

CREATE INDEX insurance_agent_referrals_agent_status_idx
  ON insurance_agent_referrals (assigned_agent_id, status, created_at DESC);

CREATE TABLE insurance_agent_referral_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  referral_id uuid NOT NULL REFERENCES insurance_agent_referrals(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN (
    'customer_consented','assigned','contact_attempted',
    'referred_to_insurance_team','customer_declined','customer_withdrew'
  )),
  from_status text CHECK (
    from_status IS NULL OR from_status IN (
      'unassigned','assigned','contact_attempted','referred_to_insurance_team',
      'customer_declined','customer_withdrew'
    )
  ),
  to_status text NOT NULL CHECK (to_status IN (
    'unassigned','assigned','contact_attempted','referred_to_insurance_team',
    'customer_declined','customer_withdrew'
  )),
  assigned_agent_id uuid REFERENCES agents(id),
  assignment_reason text CHECK (
    assignment_reason IS NULL OR assignment_reason IN (
      'customer_requested','workload_balance','staff_review'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX insurance_agent_referral_events_history_idx
  ON insurance_agent_referral_events (referral_id, id);

CREATE FUNCTION insurance_prevent_agent_referral_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Insurance agent referral events are append-only';
END $$;

CREATE TRIGGER insurance_agent_referral_event_immutable
  BEFORE UPDATE OR DELETE ON insurance_agent_referral_events
  FOR EACH ROW EXECUTE FUNCTION insurance_prevent_agent_referral_event_mutation();

CREATE FUNCTION insurance_record_agent_referral_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO insurance_agent_referral_events
      (referral_id, actor_id, event_type, to_status)
    VALUES (NEW.id, NEW.user_id, 'customer_consented', NEW.status);
    RETURN NEW;
  END IF;

  IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.assignment_reason IS DISTINCT FROM OLD.assignment_reason
     OR (NEW.status = 'assigned' AND OLD.status <> 'assigned') THEN
    INSERT INTO insurance_agent_referral_events
      (referral_id, actor_id, event_type, from_status, to_status, assigned_agent_id, assignment_reason)
    VALUES (NEW.id, NEW.assigned_by, 'assigned', OLD.status, NEW.status,
      NEW.assigned_agent_id, NEW.assignment_reason);
  ELSIF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.updated_by IS DISTINCT FROM OLD.updated_by
     OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    INSERT INTO insurance_agent_referral_events
      (referral_id, actor_id, event_type, from_status, to_status, assigned_agent_id)
    VALUES (NEW.id, NEW.updated_by, NEW.status, OLD.status, NEW.status, NEW.assigned_agent_id);
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER insurance_agent_referral_event_record
  AFTER INSERT OR UPDATE ON insurance_agent_referrals
  FOR EACH ROW EXECUTE FUNCTION insurance_record_agent_referral_event();

CREATE OR REPLACE FUNCTION insurance_agent_referral_staff_access() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_role() IN ('global_admin','super_admin')
    OR insurance_ledger_has_role(ARRAY['insurance_admin','finance_manager','compliance'])
$$;

CREATE FUNCTION insurance_guard_agent_referral() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Insurance agent referral history cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM app_user_id()
       OR NEW.assigned_agent_id IS NOT NULL
       OR NEW.status <> 'unassigned'
       OR NEW.assigned_by IS NOT NULL
       OR NEW.assigned_at IS NOT NULL
       OR NEW.assignment_reason IS NOT NULL
       OR NOT EXISTS (
         SELECT 1 FROM insurance_interest_requests request
         WHERE request.id = NEW.request_id AND request.user_id = NEW.user_id
           AND request.product_interest = NEW.product_interest
           AND request.agent_referral_consented_at = NEW.customer_consented_at
       ) THEN
      RAISE EXCEPTION 'Insurance agent referrals require the requester’s explicit consent';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.product_interest IS DISTINCT FROM OLD.product_interest
     OR NEW.customer_consented_at IS DISTINCT FROM OLD.customer_consented_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Insurance agent referral identity and consent cannot be changed';
  END IF;

  IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.assignment_reason IS DISTINCT FROM OLD.assignment_reason
     OR (NEW.status = 'assigned' AND OLD.status <> 'assigned') THEN
    IF NOT insurance_agent_referral_staff_access()
       OR NEW.assigned_agent_id IS NULL
       OR NEW.status <> 'assigned'
       OR NEW.assigned_by IS DISTINCT FROM app_user_id()
       OR NEW.assigned_at IS NULL
       OR NEW.assignment_reason NOT IN ('customer_requested','workload_balance','staff_review')
       OR NOT EXISTS (
         SELECT 1
         FROM agents agent
         JOIN users agent_user ON agent_user.id = agent.id
         WHERE agent.id = NEW.assigned_agent_id
           AND agent_user.active
           AND agent_user.role IN ('master_agent','field_agent')
       )
       OR NEW.updated_by IS DISTINCT FROM app_user_id()
       OR NEW.updated_at IS NULL THEN
      RAISE EXCEPTION 'Insurance referral assignment requires authorized staff and an active Agent';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'customer_withdrew' THEN
    IF OLD.user_id IS DISTINCT FROM app_user_id()
       OR OLD.status = 'customer_withdrew'
       OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
       OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
       OR NEW.assignment_reason IS DISTINCT FROM OLD.assignment_reason
       OR NEW.updated_by IS DISTINCT FROM app_user_id()
       OR NEW.updated_at IS NULL THEN
      RAISE EXCEPTION 'Only the customer can withdraw Insurance Agent referral consent';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.assignment_reason IS DISTINCT FROM OLD.assignment_reason
     OR OLD.assigned_agent_id IS DISTINCT FROM app_user_id()
     OR app_role() NOT IN ('master_agent','field_agent')
     OR OLD.status NOT IN ('assigned','contact_attempted')
     OR NEW.status NOT IN ('contact_attempted','referred_to_insurance_team','customer_declined')
     OR NEW.updated_by IS DISTINCT FROM app_user_id()
     OR NEW.updated_at IS NULL THEN
    RAISE EXCEPTION 'Insurance referral updates are limited to the assigned Agent’s non-binding follow-up';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER insurance_agent_referral_guard
  BEFORE INSERT OR UPDATE OR DELETE ON insurance_agent_referrals
  FOR EACH ROW EXECUTE FUNCTION insurance_guard_agent_referral();

ALTER TABLE insurance_agent_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_agent_referrals FORCE ROW LEVEL SECURITY;
ALTER TABLE insurance_agent_referral_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY insurance_agent_referral_read ON insurance_agent_referrals
  FOR SELECT USING (
    user_id = app_user_id()
    OR insurance_agent_referral_staff_access()
    OR (
      app_role() IN ('master_agent','field_agent')
      AND status <> 'customer_withdrew'
      AND assigned_agent_id IS NOT NULL
      AND app_can_access_agent(assigned_agent_id)
    )
  );
CREATE POLICY insurance_agent_referral_create ON insurance_agent_referrals
  FOR INSERT WITH CHECK (
    user_id = app_user_id()
    AND assigned_agent_id IS NULL
    AND status = 'unassigned'
  );
CREATE POLICY insurance_agent_referral_update ON insurance_agent_referrals
  FOR UPDATE
  USING (
    insurance_agent_referral_staff_access()
    OR (app_role() IN ('master_agent','field_agent') AND assigned_agent_id = app_user_id())
  )
  WITH CHECK (
    insurance_agent_referral_staff_access()
    OR (app_role() IN ('master_agent','field_agent') AND assigned_agent_id = app_user_id())
  );
CREATE OR REPLACE FUNCTION insurance_agent_can_view_referral_events(target_referral_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM insurance_agent_referrals referral
    WHERE referral.id = target_referral_id
      AND (
        referral.user_id = app_user_id()
        OR insurance_agent_referral_staff_access()
        OR (
          app_role() IN ('master_agent','field_agent')
          AND referral.status <> 'customer_withdrew'
          AND referral.assigned_agent_id IS NOT NULL
          AND app_can_access_agent(referral.assigned_agent_id)
        )
      )
  )
$$;
CREATE POLICY insurance_agent_referral_events_read ON insurance_agent_referral_events
  FOR SELECT USING (insurance_agent_can_view_referral_events(referral_id));
CREATE POLICY insurance_agent_referral_customer_withdraw ON insurance_agent_referrals
  FOR UPDATE
  USING (user_id = app_user_id() AND status <> 'customer_withdrew')
  WITH CHECK (user_id = app_user_id() AND status = 'customer_withdrew');

CREATE POLICY agents_insurance_referral_staff_read ON agents
  FOR SELECT USING (insurance_agent_referral_staff_access());

GRANT SELECT, INSERT, UPDATE ON insurance_agent_referrals TO "{{role}}";
REVOKE ALL ON TABLE insurance_agent_referral_events FROM "{{role}}";
GRANT SELECT ON insurance_agent_referral_events TO "{{role}}";
REVOKE ALL ON SEQUENCE insurance_agent_referral_events_id_seq FROM "{{role}}";
GRANT EXECUTE ON FUNCTION insurance_agent_referral_staff_access() TO "{{role}}";
GRANT EXECUTE ON FUNCTION insurance_agent_can_view_referral_events(uuid) TO "{{role}}";
GRANT EXECUTE ON FUNCTION insurance_guard_agent_referral() TO "{{role}}";
REVOKE ALL ON FUNCTION insurance_prevent_agent_referral_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION insurance_record_agent_referral_event() FROM PUBLIC;
