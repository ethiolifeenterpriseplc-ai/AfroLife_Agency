ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'global_admin','super_admin','corporate_business_manager','compliance','finance',
  'finance_manager','master_agent','field_agent','customer','worker','property_owner',
  'property_vendor'
));

ALTER TABLE role_activity_permissions
  DROP CONSTRAINT IF EXISTS role_activity_permissions_role_name_check;
ALTER TABLE role_activity_permissions
  ADD CONSTRAINT role_activity_permissions_role_name_check CHECK (role_name IN (
    'global_admin','super_admin','corporate_business_manager','compliance','finance',
    'finance_manager','master_agent','field_agent','customer','worker','property_owner',
    'property_vendor'
  ));

ALTER TABLE role_activity_defaults
  DROP CONSTRAINT IF EXISTS role_activity_defaults_role_name_check;
ALTER TABLE role_activity_defaults
  ADD CONSTRAINT role_activity_defaults_role_name_check CHECK (role_name IN (
    'global_admin','super_admin','corporate_business_manager','compliance','finance',
    'finance_manager','master_agent','field_agent','customer','worker','property_owner',
    'property_vendor'
  ));

ALTER TABLE user_signups
  DROP CONSTRAINT user_signups_account_type_check,
  ADD CONSTRAINT user_signups_account_type_check
    CHECK (account_type IN ('worker','customer','agent','property_owner','property_vendor'));
ALTER TABLE user_signups
  ADD COLUMN vendor_id uuid REFERENCES property_vendors(id),
  ADD CONSTRAINT user_signups_vendor_account_check
    CHECK ((account_type='property_vendor') = (vendor_id IS NOT NULL));

UPDATE marketplace_configuration
SET config_value = config_value || '{"property_vendor":["national_id"]}'::jsonb
WHERE scope='users' AND config_key='kyc_requirements'
  AND NOT (config_value ? 'property_vendor');

CREATE TABLE property_vendor_memberships (
  vendor_id uuid NOT NULL REFERENCES property_vendors(id),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id,user_id)
);

ALTER TABLE property_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY property_vendors_member_read ON property_vendors FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM property_vendor_memberships membership
    WHERE membership.vendor_id=property_vendors.id
      AND membership.user_id=app_user_id() AND membership.active
  ));
CREATE POLICY property_vendors_maintenance_supervisor_read ON property_vendors FOR SELECT
  USING (
    active AND app_has_permission('property.maintenance.manage')
    AND app_role() IN ('corporate_business_manager','super_admin','global_admin')
  );

ALTER TABLE property_vendor_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_vendor_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY property_vendor_memberships_member_read ON property_vendor_memberships FOR SELECT
  USING (user_id=app_user_id() AND active);
CREATE POLICY property_vendor_memberships_admin_manage ON property_vendor_memberships FOR ALL
  USING (app_role() IN ('finance','finance_manager','super_admin','global_admin'))
  WITH CHECK (app_role() IN ('finance','finance_manager','super_admin','global_admin'));
GRANT SELECT,INSERT,UPDATE,DELETE ON property_vendor_memberships TO "{{role}}";

ALTER TABLE maintenance_requests
  ADD COLUMN assigned_vendor_id uuid REFERENCES property_vendors(id),
  ADD COLUMN accepted_by uuid REFERENCES users(id),
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN sla_due_at timestamptz,
  ADD COLUMN completion_idempotency_key uuid UNIQUE,
  ADD COLUMN completion_payload_hash text
    CHECK (completion_payload_hash IS NULL OR completion_payload_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE maintenance_requests
  DROP CONSTRAINT maintenance_requests_status_check,
  ADD CONSTRAINT maintenance_requests_status_check
    CHECK (status IN ('open','triaged','assigned','accepted','in_progress','awaiting_review','completed','rework_required','done','cancelled')),
  ADD CONSTRAINT maintenance_vendor_assignment_required
    CHECK (status NOT IN ('assigned','accepted','in_progress','awaiting_review','completed','rework_required')
      OR assigned_to IS NOT NULL OR assigned_vendor_id IS NOT NULL),
  ADD CONSTRAINT maintenance_acceptance_evidence_required
    CHECK (assigned_vendor_id IS NULL
      OR status NOT IN ('accepted','in_progress','awaiting_review','completed','rework_required')
      OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL));

ALTER TABLE maintenance_request_events
  DROP CONSTRAINT maintenance_request_events_event_type_check,
  ADD CONSTRAINT maintenance_request_events_event_type_check
    CHECK (event_type IN ('opened','triaged','assigned','accepted','in_progress','awaiting_review','completed','rework_required','cancelled','note'));

CREATE TABLE maintenance_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_request_id uuid NOT NULL REFERENCES maintenance_requests(id),
  storage_key uuid NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  scan_status text NOT NULL DEFAULT 'clean' CHECK (scan_status IN ('clean','rejected')),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_evidence_request_idx
  ON maintenance_evidence (maintenance_request_id,created_at,id);
ALTER TABLE maintenance_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_evidence_authorized_read ON maintenance_evidence FOR SELECT
  USING (scan_status='clean' AND EXISTS (
    SELECT 1 FROM maintenance_requests m
    WHERE m.id=maintenance_request_id
      AND (
        (app_has_permission('property.maintenance.manage')
          AND (app_can_access_agent(m.source_agent_id)
            OR EXISTS (SELECT 1 FROM properties p WHERE p.id=m.property_id AND p.owner_user_id=app_user_id())
            OR app_role() IN ('super_admin','global_admin','corporate_business_manager')))
        OR (app_role()='property_vendor' AND EXISTS (
          SELECT 1 FROM property_vendor_memberships membership
          WHERE membership.vendor_id=m.assigned_vendor_id
            AND membership.user_id=app_user_id() AND membership.active
        ))
      )
  ));
CREATE POLICY maintenance_evidence_authorized_insert ON maintenance_evidence FOR INSERT
  WITH CHECK (
    uploaded_by=app_user_id() AND scan_status='clean'
    AND EXISTS (
      SELECT 1 FROM maintenance_requests m
      WHERE m.id=maintenance_request_id AND (
        (app_role()='property_vendor' AND EXISTS (
          SELECT 1 FROM property_vendor_memberships membership
          WHERE membership.vendor_id=m.assigned_vendor_id
            AND membership.user_id=app_user_id() AND membership.active
        ) AND m.status IN ('accepted','in_progress','rework_required'))
        OR (app_has_permission('property.maintenance.manage')
          AND (app_can_access_agent(m.source_agent_id)
            OR EXISTS (SELECT 1 FROM properties p WHERE p.id=m.property_id AND p.owner_user_id=app_user_id())
            OR app_role() IN ('super_admin','global_admin','corporate_business_manager'))
          AND m.status IN ('open','triaged','assigned','in_progress'))
      )
    )
  );
GRANT SELECT,INSERT ON maintenance_evidence TO "{{role}}";

CREATE TABLE maintenance_cost_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_request_id uuid NOT NULL REFERENCES maintenance_requests(id),
  vendor_id uuid NOT NULL REFERENCES property_vendors(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  rationale text NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 1000),
  requested_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decision_reason text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='pending' AND decided_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
    OR (status IN ('approved','rejected') AND decided_by IS NOT NULL AND decided_by<>requested_by
      AND decided_at IS NOT NULL AND length(trim(decision_reason)) BETWEEN 10 AND 1000))
);
CREATE UNIQUE INDEX maintenance_cost_change_one_pending
  ON maintenance_cost_change_requests (maintenance_request_id) WHERE status='pending';
ALTER TABLE maintenance_cost_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_cost_change_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_cost_change_vendor_read ON maintenance_cost_change_requests FOR SELECT
  USING (app_role()='property_vendor' AND EXISTS (
    SELECT 1 FROM property_vendor_memberships membership
    WHERE membership.vendor_id=maintenance_cost_change_requests.vendor_id
      AND membership.user_id=app_user_id() AND membership.active
  ));
CREATE POLICY maintenance_cost_change_finance_read ON maintenance_cost_change_requests FOR SELECT
  USING (app_role() IN ('finance','finance_manager','super_admin','global_admin'));
CREATE POLICY maintenance_cost_change_vendor_insert ON maintenance_cost_change_requests FOR INSERT
  WITH CHECK (
    app_role()='property_vendor' AND requested_by=app_user_id() AND status='pending'
    AND EXISTS (
      SELECT 1 FROM maintenance_requests m
      JOIN property_vendor_memberships membership ON membership.vendor_id=m.assigned_vendor_id
      WHERE m.id=maintenance_cost_change_requests.maintenance_request_id
        AND membership.vendor_id=maintenance_cost_change_requests.vendor_id
        AND membership.user_id=app_user_id() AND membership.active
        AND m.status IN ('accepted','in_progress','rework_required')
    )
  );
CREATE POLICY maintenance_cost_change_finance_update ON maintenance_cost_change_requests FOR UPDATE
  USING (app_role() IN ('finance_manager','super_admin','global_admin'))
  WITH CHECK (app_role() IN ('finance_manager','super_admin','global_admin'));
GRANT SELECT,INSERT,UPDATE ON maintenance_cost_change_requests TO "{{role}}";

ALTER TABLE property_vendor_bills
  ADD COLUMN expected_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (expected_amount >= 0),
  ADD COLUMN match_status text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched','matched','mismatch','accepted_exception')),
  ADD COLUMN match_variance numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN match_reviewed_by uuid REFERENCES users(id),
  ADD COLUMN match_reviewed_at timestamptz,
  ADD COLUMN match_review_reason text,
  ADD COLUMN evidence_storage_key uuid UNIQUE,
  ADD COLUMN evidence_sha256 text CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN evidence_mime text CHECK (evidence_mime IS NULL OR evidence_mime IN ('application/pdf','image/jpeg','image/png')),
  ADD COLUMN evidence_size_bytes integer CHECK (evidence_size_bytes IS NULL OR evidence_size_bytes BETWEEN 1 AND 10485760),
  ADD CONSTRAINT property_vendor_bill_match_review_check
    CHECK ((match_status IN ('unmatched','matched','mismatch') AND match_reviewed_by IS NULL AND match_reviewed_at IS NULL AND match_review_reason IS NULL)
      OR (match_status='accepted_exception' AND match_reviewed_by IS NOT NULL AND match_reviewed_at IS NOT NULL
        AND length(trim(match_review_reason)) BETWEEN 10 AND 1000)),
  ADD CONSTRAINT property_vendor_bill_evidence_check
    CHECK ((evidence_storage_key IS NULL AND evidence_sha256 IS NULL AND evidence_mime IS NULL AND evidence_size_bytes IS NULL)
      OR (evidence_storage_key IS NOT NULL AND evidence_sha256 IS NOT NULL AND evidence_mime IS NOT NULL AND evidence_size_bytes IS NOT NULL));

UPDATE property_vendor_bills bill
SET expected_amount=COALESCE(maintenance.cost,0),
    match_variance=bill.amount-COALESCE(maintenance.cost,0),
    match_status=CASE WHEN bill.amount=COALESCE(maintenance.cost,0) THEN 'matched' ELSE 'mismatch' END
FROM maintenance_requests maintenance
WHERE maintenance.id=bill.maintenance_request_id;

CREATE POLICY property_vendor_bills_vendor_read ON property_vendor_bills FOR SELECT
  USING (app_role()='property_vendor' AND EXISTS (
    SELECT 1 FROM property_vendor_memberships membership
    WHERE membership.vendor_id=property_vendor_bills.vendor_id
      AND membership.user_id=app_user_id() AND membership.active
  ));
CREATE POLICY property_vendor_bills_vendor_insert ON property_vendor_bills FOR INSERT
  WITH CHECK (
    app_role()='property_vendor' AND recorded_by=app_user_id()
    AND status='pending_approval' AND approved_by IS NULL
    AND EXISTS (
      SELECT 1 FROM maintenance_requests m
      JOIN property_vendor_memberships membership ON membership.vendor_id=m.assigned_vendor_id
      WHERE m.id=maintenance_request_id AND membership.vendor_id=property_vendor_bills.vendor_id
        AND membership.user_id=app_user_id() AND membership.active
        AND m.status IN ('completed','done')
    )
  );

CREATE OR REPLACE FUNCTION enforce_maintenance_workflow_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NOT (CASE OLD.status
    WHEN 'open' THEN NEW.status IN ('triaged','cancelled')
    WHEN 'triaged' THEN NEW.status IN ('assigned','cancelled')
    WHEN 'assigned' THEN NEW.status IN ('accepted','cancelled')
      OR (NEW.status='in_progress' AND NEW.assigned_vendor_id IS NULL)
    WHEN 'accepted' THEN NEW.status IN ('in_progress','cancelled')
    WHEN 'in_progress' THEN NEW.status IN ('awaiting_review','cancelled')
    WHEN 'awaiting_review' THEN NEW.status IN ('completed','rework_required')
    WHEN 'rework_required' THEN NEW.status IN ('in_progress','cancelled')
    ELSE false
  END) THEN
    RAISE EXCEPTION 'Invalid maintenance status transition: % to %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'triaged' AND length(trim(COALESCE(NEW.resolution_note,''))) < 5 THEN
    RAISE EXCEPTION 'Maintenance triage requires a documented note' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'assigned' AND NEW.assigned_vendor_id IS NULL
    AND length(trim(COALESCE(NEW.assigned_to,''))) < 2 THEN
    RAISE EXCEPTION 'Maintenance assignment requires an assignee' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'accepted' AND (
    app_role()<>'property_vendor'
    OR NEW.accepted_by IS DISTINCT FROM app_user_id()
    OR NEW.accepted_at IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM property_vendor_memberships membership
      WHERE membership.vendor_id=NEW.assigned_vendor_id
        AND membership.user_id=app_user_id() AND membership.active
    )
  ) THEN
    RAISE EXCEPTION 'Only an assigned vendor can accept this maintenance work' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'awaiting_review' AND (
    length(trim(COALESCE(NEW.resolution_note,''))) < 5
    OR NEW.completion_submitted_by IS DISTINCT FROM app_user_id()
    OR NEW.completion_submitted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Maintenance work submission is incomplete' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('completed','rework_required') AND (
    app_role() NOT IN ('corporate_business_manager','super_admin','global_admin')
    OR NEW.reviewed_by IS DISTINCT FROM app_user_id()
    OR NEW.reviewed_by = NEW.completion_submitted_by
    OR NEW.reviewed_at IS NULL
    OR length(trim(COALESCE(NEW.review_note,''))) < 5
  ) THEN
    RAISE EXCEPTION 'Maintenance completion requires an independent authorized reviewer and reason'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'cancelled' AND length(trim(COALESCE(NEW.review_note,''))) < 5 THEN
    RAISE EXCEPTION 'Maintenance cancellation requires a reason' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_maintenance_vendor_update_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app_role()<>'property_vendor' THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM property_vendor_memberships membership
    WHERE membership.vendor_id=OLD.assigned_vendor_id
      AND membership.user_id=app_user_id() AND membership.active
  ) THEN
    RAISE EXCEPTION 'Vendor is not assigned to this maintenance work' USING ERRCODE = '42501';
  END IF;
  IF ROW(NEW.property_id,NEW.unit_id,NEW.description,NEW.category,NEW.priority,NEW.source_agent_id,
         NEW.assigned_to,NEW.assigned_vendor_id,NEW.cost,NEW.sla_due_at,NEW.review_note,NEW.reviewed_by,
         NEW.reviewed_at,NEW.completed_at)
     IS DISTINCT FROM
     ROW(OLD.property_id,OLD.unit_id,OLD.description,OLD.category,OLD.priority,OLD.source_agent_id,
         OLD.assigned_to,OLD.assigned_vendor_id,OLD.cost,OLD.sla_due_at,OLD.review_note,OLD.reviewed_by,
         OLD.reviewed_at,OLD.completed_at) THEN
    RAISE EXCEPTION 'Vendors cannot change work-order scope, assignment, priority, SLA, or approved cost'
      USING ERRCODE = '42501';
  END IF;
  IF NOT (OLD.status='assigned' AND NEW.status='accepted')
      AND ROW(NEW.accepted_by,NEW.accepted_at) IS DISTINCT FROM ROW(OLD.accepted_by,OLD.accepted_at) THEN
    RAISE EXCEPTION 'Vendor acceptance identity is immutable after acceptance' USING ERRCODE = '42501';
  END IF;
  IF NOT (NEW.status='awaiting_review' AND OLD.status IN ('in_progress','rework_required'))
      AND ROW(NEW.completion_submitted_by,NEW.completion_submitted_at,
              NEW.completion_idempotency_key,NEW.completion_payload_hash)
          IS DISTINCT FROM
          ROW(OLD.completion_submitted_by,OLD.completion_submitted_at,
              OLD.completion_idempotency_key,OLD.completion_payload_hash) THEN
    RAISE EXCEPTION 'Vendor completion evidence is immutable outside work submission' USING ERRCODE = '42501';
  END IF;
  IF NEW.status NOT IN ('accepted','in_progress','awaiting_review') THEN
    RAISE EXCEPTION 'Vendor status transition is not permitted' USING ERRCODE = '42501';
  END IF;
  IF NEW.status='awaiting_review' AND NOT EXISTS (
    SELECT 1 FROM maintenance_evidence evidence
    WHERE evidence.maintenance_request_id=NEW.id
      AND evidence.uploaded_by=app_user_id() AND evidence.scan_status='clean'
  ) THEN
    RAISE EXCEPTION 'Completion requires malware-scanned evidence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER maintenance_vendor_update_scope
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_maintenance_vendor_update_scope();

CREATE POLICY maintenance_vendor_assigned_read ON maintenance_requests FOR SELECT
  USING (app_role()='property_vendor' AND EXISTS (
    SELECT 1 FROM property_vendor_memberships membership
    WHERE membership.vendor_id=maintenance_requests.assigned_vendor_id
      AND membership.user_id=app_user_id() AND membership.active
  ));
CREATE POLICY maintenance_vendor_assigned_update ON maintenance_requests FOR UPDATE
  USING (app_role()='property_vendor' AND EXISTS (
    SELECT 1 FROM property_vendor_memberships membership
    WHERE membership.vendor_id=maintenance_requests.assigned_vendor_id
      AND membership.user_id=app_user_id() AND membership.active
  ))
  WITH CHECK (app_role()='property_vendor');

CREATE POLICY maintenance_vendor_events_read ON maintenance_request_events FOR SELECT
  USING (app_role()='property_vendor' AND EXISTS (
    SELECT 1 FROM maintenance_requests m
    JOIN property_vendor_memberships membership ON membership.vendor_id=m.assigned_vendor_id
    WHERE m.id=maintenance_request_events.maintenance_request_id
      AND membership.user_id=app_user_id() AND membership.active
  ));
CREATE POLICY maintenance_vendor_events_insert ON maintenance_request_events FOR INSERT
  WITH CHECK (
    app_role()='property_vendor' AND actor_id=app_user_id()
    AND EXISTS (
      SELECT 1 FROM maintenance_requests m
      JOIN property_vendor_memberships membership ON membership.vendor_id=m.assigned_vendor_id
      WHERE m.id=maintenance_request_events.maintenance_request_id
        AND membership.user_id=app_user_id() AND membership.active
    )
  );

CREATE TABLE maintenance_sla_escalations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  maintenance_request_id uuid NOT NULL REFERENCES maintenance_requests(id),
  escalation_level integer NOT NULL CHECK (escalation_level BETWEEN 1 AND 3),
  recipient_id uuid NOT NULL REFERENCES users(id),
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (maintenance_request_id,escalation_level,recipient_id)
);
ALTER TABLE maintenance_sla_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_sla_escalations FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_sla_escalations_staff ON maintenance_sla_escalations FOR ALL
  USING (app_role() IN ('corporate_business_manager','super_admin','global_admin'))
  WITH CHECK (app_role() IN ('corporate_business_manager','super_admin','global_admin'));
GRANT SELECT,INSERT ON maintenance_sla_escalations TO "{{role}}";
GRANT USAGE,SELECT ON SEQUENCE maintenance_sla_escalations_id_seq TO "{{role}}";
