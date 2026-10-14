CREATE TABLE lease_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL REFERENCES leases(id),
  idempotency_key uuid NOT NULL,
  notice_type text NOT NULL CHECK (notice_type IN (
    'tenant_to_owner','owner_to_tenant','mutual_agreement','other'
  )),
  received_on date NOT NULL,
  proposed_effective_on date NOT NULL,
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 10 AND 1000),
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lease_id, idempotency_key),
  CHECK (proposed_effective_on >= received_on)
);

CREATE INDEX lease_notices_lease_created_idx ON lease_notices (lease_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_lease_notice_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Lease notice records are append-only';
END
$$;

CREATE TRIGGER lease_notices_immutable
BEFORE UPDATE OR DELETE ON lease_notices
FOR EACH ROW EXECUTE FUNCTION prevent_lease_notice_mutation();

ALTER TABLE lease_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE lease_notices FORCE ROW LEVEL SECURITY;
CREATE POLICY lease_notices_scope ON lease_notices
  USING (EXISTS (SELECT 1 FROM leases l WHERE l.id=lease_id AND
    (app_can_access_agent(l.source_agent_id)
     OR app_has_permission('property.tenancy.approve')
     OR app_has_permission('property.tenancy.execute'))))
  WITH CHECK (recorded_by=app_user_id() AND EXISTS (
    SELECT 1 FROM leases l WHERE l.id=lease_id AND app_can_access_agent(l.source_agent_id)
  ));

REVOKE ALL ON TABLE lease_notices FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE lease_notices TO "{{role}}";
