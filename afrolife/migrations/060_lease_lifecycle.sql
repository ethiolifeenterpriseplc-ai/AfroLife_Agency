ALTER TABLE leases DROP CONSTRAINT IF EXISTS leases_status_check;
ALTER TABLE leases ADD CONSTRAINT leases_status_check CHECK (status IN (
  'draft','pending_approval','pending_signature','executed','active',
  'renewal_offered','notice_received','expired','terminated','rejected',
  'cancelled','suspended','disputed','ended'
));

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS term_months integer CHECK (term_months IS NULL OR term_months BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS due_day integer CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS executed_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS executed_at timestamptz,
  ADD COLUMN IF NOT EXISTS execution_hash text CHECK (execution_hash IS NULL OR execution_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS possession_handover_on date,
  ADD COLUMN IF NOT EXISTS move_in_inspection_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notice_received_on date,
  ADD COLUMN IF NOT EXISTS termination_reason text;

CREATE TABLE lease_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL REFERENCES leases(id),
  party text NOT NULL CHECK (party IN ('tenant','owner')),
  signer_name text NOT NULL CHECK (length(trim(signer_name)) BETWEEN 2 AND 200),
  storage_key uuid NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lease_id, party)
);

CREATE TABLE lease_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL REFERENCES leases(id),
  version integer NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  signature_document_ids uuid[] NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lease_id, version)
);

CREATE TABLE lease_lifecycle_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lease_id uuid NOT NULL REFERENCES leases(id),
  from_status text,
  to_status text NOT NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_lease_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Lease lifecycle evidence is append-only';
END
$$;

CREATE TRIGGER lease_documents_immutable
BEFORE UPDATE OR DELETE ON lease_documents
FOR EACH ROW EXECUTE FUNCTION prevent_lease_evidence_mutation();
CREATE TRIGGER lease_versions_immutable
BEFORE UPDATE OR DELETE ON lease_versions
FOR EACH ROW EXECUTE FUNCTION prevent_lease_evidence_mutation();
CREATE TRIGGER lease_lifecycle_events_immutable
BEFORE UPDATE OR DELETE ON lease_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION prevent_lease_evidence_mutation();

CREATE OR REPLACE FUNCTION prevent_executed_lease_terms_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lease_versions v WHERE v.lease_id=OLD.id)
     AND (
       NEW.unit_id IS DISTINCT FROM OLD.unit_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.rent IS DISTINCT FROM OLD.rent
       OR NEW.deposit IS DISTINCT FROM OLD.deposit
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.term_months IS DISTINCT FROM OLD.term_months
       OR NEW.due_day IS DISTINCT FROM OLD.due_day
     ) THEN
    RAISE EXCEPTION 'Versioned lease terms are immutable; create an approved amendment';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER executed_lease_terms_immutable
BEFORE UPDATE ON leases
FOR EACH ROW EXECUTE FUNCTION prevent_executed_lease_terms_change();

REVOKE ALL ON TABLE lease_documents, lease_versions, lease_lifecycle_events FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE lease_documents, lease_versions, lease_lifecycle_events TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE lease_lifecycle_events_id_seq TO "{{role}}";

UPDATE leases
SET created_by = coalesce(created_by, source_agent_id),
    term_months = coalesce(term_months, least(120, greatest(1,
      ((extract(year FROM end_date)::int - extract(year FROM start_date)::int) * 12)
      + extract(month FROM end_date)::int - extract(month FROM start_date)::int
      + CASE WHEN extract(day FROM end_date) >= extract(day FROM start_date) THEN 1 ELSE 0 END))),
    due_day = coalesce(due_day, greatest(1, least(28, coalesce((
      SELECT extract(day FROM min(c.due_on))::int FROM rent_charges c WHERE c.lease_id=leases.id
    ), 5))));

INSERT INTO lease_versions (lease_id, version, snapshot, snapshot_sha256, signature_document_ids, created_by)
SELECT l.id, 1, baseline.snapshot,
       encode(digest(convert_to(baseline.snapshot::text, 'UTF8'), 'sha256'), 'hex'),
       ARRAY[]::uuid[], l.created_by
FROM leases l
JOIN property_units u ON u.id=l.unit_id
JOIN properties p ON p.id=u.property_id
JOIN tenants t ON t.id=l.tenant_id
CROSS JOIN LATERAL (
       SELECT jsonb_build_object(
         'baseline', true,
         'source_status', l.status,
         'property', jsonb_build_object('id', p.id, 'address', p.address),
         'unit', jsonb_build_object('id', u.id, 'unit_no', u.unit_no),
         'tenant', jsonb_build_object('id', t.id, 'name', t.name),
         'rent', l.rent::text,
         'deposit', l.deposit::text,
         'start_date', l.start_date,
         'end_date', l.end_date,
         'term_months', l.term_months,
         'due_day', l.due_day,
         'captured_at', now()
       ) AS snapshot
) baseline
WHERE NOT EXISTS (SELECT 1 FROM lease_versions v WHERE v.lease_id=l.id);

INSERT INTO lease_lifecycle_events
  (lease_id, from_status, to_status, action, actor_id, reason, metadata)
SELECT l.id, NULL, l.status, 'legacy_state_captured', l.created_by,
       'Existing lease state captured during additive lifecycle migration',
       jsonb_build_object('baseline', true, 'signature_evidence_available', false)
FROM leases l
WHERE NOT EXISTS (SELECT 1 FROM lease_lifecycle_events e WHERE e.lease_id=l.id);

ALTER TABLE lease_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY lease_documents_scope ON lease_documents
  USING (EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND
    (app_can_access_agent(l.source_agent_id)
     OR app_has_permission('property.tenancy.approve')
     OR app_has_permission('property.tenancy.execute'))))
  WITH CHECK (EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND app_can_access_agent(l.source_agent_id)));

ALTER TABLE lease_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY lease_versions_scope ON lease_versions
  USING (EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND
    (app_can_access_agent(l.source_agent_id)
     OR app_has_permission('property.tenancy.approve')
     OR app_has_permission('property.tenancy.execute'))))
  WITH CHECK (EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND
    (app_can_access_agent(l.source_agent_id) OR app_has_permission('property.tenancy.execute'))));

ALTER TABLE lease_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_lifecycle_events FORCE ROW LEVEL SECURITY;
CREATE POLICY lease_lifecycle_events_scope ON lease_lifecycle_events
  USING (EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND
    (app_can_access_agent(l.source_agent_id)
     OR app_has_permission('property.tenancy.approve')
     OR app_has_permission('property.tenancy.execute'))))
  WITH CHECK (EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND app_can_access_agent(l.source_agent_id)));
CREATE POLICY lease_lifecycle_events_insert ON lease_lifecycle_events
  FOR INSERT WITH CHECK (
    actor_id = app_user_id()
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND
      (app_can_access_agent(l.source_agent_id)
       OR app_has_permission('property.tenancy.approve')
       OR app_has_permission('property.tenancy.execute')))
  );

CREATE POLICY leases_lifecycle_read ON leases
  FOR SELECT USING (
    app_has_permission('property.tenancy.approve')
    OR app_has_permission('property.tenancy.execute')
  );

CREATE POLICY properties_lifecycle_read ON properties
  FOR SELECT USING (
    app_has_permission('property.tenancy.approve')
    OR app_has_permission('property.tenancy.execute')
  );
CREATE POLICY property_units_lifecycle_read ON property_units
  FOR SELECT USING (
    app_has_permission('property.tenancy.approve')
    OR app_has_permission('property.tenancy.execute')
  );
CREATE POLICY property_units_lifecycle_execute ON property_units
  FOR UPDATE USING (app_has_permission('property.tenancy.execute'))
  WITH CHECK (app_has_permission('property.tenancy.execute'));
CREATE POLICY tenants_lifecycle_read ON tenants
  FOR SELECT USING (
    app_has_permission('property.tenancy.approve')
    OR app_has_permission('property.tenancy.execute')
  );
CREATE POLICY rent_charges_lifecycle_insert ON rent_charges
  FOR INSERT WITH CHECK (
    app_has_permission('property.tenancy.execute')
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id)
  );

CREATE POLICY property_leases_activity_lifecycle ON leases
  FOR UPDATE USING (
    (app_has_permission('property.tenancy.approve') OR app_has_permission('property.tenancy.execute'))
    AND (app_can_access_agent(source_agent_id)
      OR app_has_permission('property.tenancy.approve')
      OR app_has_permission('property.tenancy.execute'))
  )
  WITH CHECK (
    (app_has_permission('property.tenancy.approve') OR app_has_permission('property.tenancy.execute'))
    AND (app_can_access_agent(source_agent_id)
      OR app_has_permission('property.tenancy.approve')
      OR app_has_permission('property.tenancy.execute'))
  );

ALTER TABLE role_activity_permissions DROP CONSTRAINT IF EXISTS role_activity_permissions_activity_key_check;
ALTER TABLE role_activity_permissions ADD CONSTRAINT role_activity_permissions_activity_key_check CHECK (activity_key IN (
  'workforce.workers.view','workforce.workers.register','workforce.documents.view',
  'workforce.documents.upload','workforce.documents.review','workforce.workers.verify',
  'staffing.requests.manage','property.listings.view','property.listings.manage',
  'property.tenancy.manage','property.tenancy.approve','property.tenancy.execute',
  'property.maintenance.manage','rent.payments.submit','rent.transactions.view',
  'rent.transactions.reconcile','rent.transactions.void','rent.deposit.refund_request',
  'learning.content.view','learning.content.manage'
));
ALTER TABLE role_activity_defaults DROP CONSTRAINT IF EXISTS role_activity_defaults_activity_key_check;
ALTER TABLE role_activity_defaults ADD CONSTRAINT role_activity_defaults_activity_key_check CHECK (activity_key IN (
  'workforce.workers.view','workforce.workers.register','workforce.documents.view',
  'workforce.documents.upload','workforce.documents.review','workforce.workers.verify',
  'staffing.requests.manage','property.listings.view','property.listings.manage',
  'property.tenancy.manage','property.tenancy.approve','property.tenancy.execute',
  'property.maintenance.manage','rent.payments.submit','rent.transactions.view',
  'rent.transactions.reconcile','rent.transactions.void','rent.deposit.refund_request',
  'learning.content.view','learning.content.manage'
));

INSERT INTO role_activity_defaults (role_name, activity_key, enabled) VALUES
  ('global_admin','property.tenancy.approve',true),
  ('global_admin','property.tenancy.execute',true),
  ('super_admin','property.tenancy.approve',true),
  ('super_admin','property.tenancy.execute',true),
  ('corporate_business_manager','property.tenancy.approve',true),
  ('corporate_business_manager','property.tenancy.execute',true),
  ('compliance','property.tenancy.approve',true)
ON CONFLICT (role_name, activity_key) DO NOTHING;
