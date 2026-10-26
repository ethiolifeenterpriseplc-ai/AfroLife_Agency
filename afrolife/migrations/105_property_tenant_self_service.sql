ALTER TABLE maintenance_requests
  ADD COLUMN lease_id uuid REFERENCES leases(id),
  ADD COLUMN resident_user_id uuid REFERENCES users(id);

CREATE TABLE property_tenant_access_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL REFERENCES leases(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  source_agent_id uuid NOT NULL REFERENCES agents(id),
  property_owner_user_id uuid REFERENCES users(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  redeemed_by uuid REFERENCES users(id),
  redeemed_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  revocation_reason text CHECK (revocation_reason IS NULL OR length(trim(revocation_reason)) BETWEEN 10 AND 1000),
  CHECK (expires_at > created_at),
  CHECK ((redeemed_by IS NULL) = (redeemed_at IS NULL)),
  CHECK ((revoked_by IS NULL) = (revoked_at IS NULL)),
  CHECK (revoked_at IS NULL OR redeemed_at IS NULL)
);
CREATE UNIQUE INDEX property_tenant_access_invitation_open_lease_idx
  ON property_tenant_access_invitations(lease_id)
  WHERE redeemed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE property_tenant_account_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  invitation_id uuid NOT NULL UNIQUE REFERENCES property_tenant_access_invitations(id),
  source_agent_id uuid NOT NULL REFERENCES agents(id),
  property_owner_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  revocation_reason text CHECK (revocation_reason IS NULL OR length(trim(revocation_reason)) BETWEEN 10 AND 1000),
  CHECK ((revoked_by IS NULL) = (revoked_at IS NULL))
);
CREATE UNIQUE INDEX property_tenant_account_links_active_idx
  ON property_tenant_account_links(tenant_id,user_id) WHERE revoked_at IS NULL;
CREATE INDEX property_tenant_account_links_user_idx
  ON property_tenant_account_links(user_id,tenant_id) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION app_can_manage_property_tenant_scope(target_agent uuid,target_owner uuid)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT app_has_permission('property.tenancy.manage')
    AND (
      app_can_access_agent(target_agent)
      OR target_owner=app_user_id()
      OR app_role() IN ('global_admin','super_admin','corporate_business_manager')
    )
$$;

REVOKE ALL ON FUNCTION app_can_manage_property_tenant_scope(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_can_manage_property_tenant_scope(uuid,uuid) TO "{{role}}";

CREATE OR REPLACE FUNCTION guard_property_tenant_access_invitation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE actor uuid := app_user_id();
DECLARE lease_tenant uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    IF actor IS NULL OR NEW.invited_by IS DISTINCT FROM actor
      OR NOT app_can_manage_property_tenant_scope(NEW.source_agent_id,NEW.property_owner_user_id)
      OR NEW.redeemed_by IS NOT NULL OR NEW.redeemed_at IS NOT NULL
      OR NEW.revoked_by IS NOT NULL OR NEW.revoked_at IS NOT NULL
      OR NEW.revocation_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Only an authorized property manager may issue a tenant access invitation'
        USING ERRCODE='42501';
    END IF;
    SELECT lease.tenant_id INTO lease_tenant
    FROM leases lease
    JOIN property_units unit ON unit.id=lease.unit_id
    JOIN properties property ON property.id=unit.property_id
    WHERE lease.id=NEW.lease_id AND lease.status='active'
      AND lease.source_agent_id=NEW.source_agent_id
      AND property.owner_user_id IS NOT DISTINCT FROM NEW.property_owner_user_id;
    IF lease_tenant IS NULL OR NEW.tenant_id IS DISTINCT FROM lease_tenant THEN
      RAISE EXCEPTION 'Tenant access invitations require the active lease tenant'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW)-'redeemed_by'-'redeemed_at'-'revoked_by'-'revoked_at'-'revocation_reason')
     <> (to_jsonb(OLD)-'redeemed_by'-'redeemed_at'-'revoked_by'-'revoked_at'-'revocation_reason') THEN
    RAISE EXCEPTION 'Tenant access invitation identity and token are immutable'
      USING ERRCODE='42501';
  END IF;

  IF OLD.redeemed_at IS NULL AND OLD.revoked_at IS NULL
    AND NEW.revoked_at IS NOT NULL AND NEW.revoked_by IS NOT NULL
    AND NEW.revoked_by=actor AND NEW.redeemed_at IS NULL
    AND app_can_manage_property_tenant_scope(OLD.source_agent_id,OLD.property_owner_user_id)
    AND NEW.revocation_reason IS NOT NULL
    AND length(trim(NEW.revocation_reason))>=10 THEN
    RETURN NEW;
  END IF;

  IF OLD.redeemed_at IS NULL AND OLD.revoked_at IS NULL
    AND NEW.redeemed_by=actor AND NEW.redeemed_at IS NOT NULL
    AND NEW.revoked_by IS NULL AND NEW.revoked_at IS NULL
    AND NEW.revocation_reason IS NULL AND app_role()='customer'
    AND NEW.expires_at>now()
    AND EXISTS (
      SELECT 1 FROM users u JOIN tenants t ON t.id=OLD.tenant_id
      WHERE u.id=actor AND u.active AND u.role='customer' AND u.phone=t.phone
    ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Tenant access invitation cannot be changed or redeemed by this account'
    USING ERRCODE='42501';
END;
$$;
CREATE TRIGGER property_tenant_access_invitation_guard
  BEFORE INSERT OR UPDATE ON property_tenant_access_invitations
  FOR EACH ROW EXECUTE FUNCTION guard_property_tenant_access_invitation();

CREATE OR REPLACE FUNCTION guard_property_tenant_account_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE actor uuid := app_user_id();
DECLARE invite_source_agent uuid;
DECLARE invite_owner_user uuid;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT invitation.source_agent_id,invitation.property_owner_user_id
      INTO invite_source_agent,invite_owner_user
      FROM property_tenant_access_invitations invitation
      JOIN tenants tenant ON tenant.id=invitation.tenant_id
      JOIN users account ON account.id=NEW.user_id
      WHERE invitation.id=NEW.invitation_id
        AND invitation.tenant_id=NEW.tenant_id
        AND invitation.redeemed_by=NEW.user_id
        AND invitation.redeemed_at IS NOT NULL
        AND account.active AND account.role='customer'
        AND account.phone=tenant.phone;
    IF actor IS NULL OR NEW.user_id IS DISTINCT FROM actor OR app_role()<>'customer'
      OR NEW.revoked_by IS NOT NULL OR NEW.revoked_at IS NOT NULL
      OR NEW.revocation_reason IS NOT NULL OR invite_source_agent IS NULL THEN
      RAISE EXCEPTION 'Tenant accounts may only be linked by redeeming a matching active invitation'
        USING ERRCODE='42501';
    END IF;
    NEW.source_agent_id := invite_source_agent;
    NEW.property_owner_user_id := invite_owner_user;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW)-'revoked_by'-'revoked_at'-'revocation_reason')
     <> (to_jsonb(OLD)-'revoked_by'-'revoked_at'-'revocation_reason') THEN
    RAISE EXCEPTION 'Tenant account links are immutable'
      USING ERRCODE='42501';
  END IF;
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
    AND NEW.revoked_by=actor AND NEW.revocation_reason IS NOT NULL
    AND length(trim(NEW.revocation_reason))>=10
    AND app_can_manage_property_tenant_scope(OLD.source_agent_id,OLD.property_owner_user_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Tenant account link cannot be changed'
    USING ERRCODE='42501';
END;
$$;
CREATE TRIGGER property_tenant_account_link_guard
  BEFORE INSERT OR UPDATE ON property_tenant_account_links
  FOR EACH ROW EXECUTE FUNCTION guard_property_tenant_account_link();

ALTER TABLE property_tenant_access_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_tenant_access_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY property_tenant_access_invites_read
  ON property_tenant_access_invitations FOR SELECT
  USING (
    app_can_manage_property_tenant_scope(source_agent_id,property_owner_user_id)
    OR (app_role()='customer'
      AND token_hash=current_setting('app.property_tenant_invite_hash',true))
  );
CREATE POLICY property_tenant_access_invites_insert
  ON property_tenant_access_invitations FOR INSERT
  WITH CHECK (app_can_manage_property_tenant_scope(source_agent_id,property_owner_user_id));
CREATE POLICY property_tenant_access_invites_update
  ON property_tenant_access_invitations FOR UPDATE
  USING (
    app_can_manage_property_tenant_scope(source_agent_id,property_owner_user_id)
    OR (app_role()='customer'
      AND token_hash=current_setting('app.property_tenant_invite_hash',true))
  )
  WITH CHECK (
    app_can_manage_property_tenant_scope(source_agent_id,property_owner_user_id)
    OR (app_role()='customer'
      AND token_hash=current_setting('app.property_tenant_invite_hash',true))
  );

ALTER TABLE property_tenant_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_tenant_account_links FORCE ROW LEVEL SECURITY;
CREATE POLICY property_tenant_account_links_read
  ON property_tenant_account_links FOR SELECT
  USING (
    user_id=app_user_id()
    OR app_can_manage_property_tenant_scope(source_agent_id,property_owner_user_id)
  );
CREATE POLICY property_tenant_account_links_insert
  ON property_tenant_account_links FOR INSERT
  WITH CHECK (user_id=app_user_id() AND app_role()='customer');
CREATE POLICY property_tenant_account_links_update
  ON property_tenant_account_links FOR UPDATE
  USING (
    app_can_manage_property_tenant_scope(source_agent_id,property_owner_user_id)
  )
  WITH CHECK (
    app_can_manage_property_tenant_scope(source_agent_id,property_owner_user_id)
  );

GRANT SELECT,INSERT,UPDATE ON TABLE property_tenant_access_invitations TO "{{role}}";
GRANT SELECT,INSERT,UPDATE ON TABLE property_tenant_account_links TO "{{role}}";

CREATE POLICY tenants_linked_resident_read ON tenants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM property_tenant_account_links link
    WHERE link.tenant_id=tenants.id AND link.user_id=app_user_id() AND link.revoked_at IS NULL
  ));
CREATE POLICY tenants_invitation_claim_read ON tenants FOR SELECT
  USING (app_role()='customer' AND EXISTS (
    SELECT 1 FROM property_tenant_access_invitations invitation
    WHERE invitation.tenant_id=tenants.id
      AND invitation.token_hash=current_setting('app.property_tenant_invite_hash',true)
      AND (
        (invitation.redeemed_at IS NULL AND invitation.revoked_at IS NULL
          AND invitation.expires_at>now())
        OR invitation.redeemed_by=app_user_id()
      )
  ));
CREATE POLICY leases_linked_resident_read ON leases FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM property_tenant_account_links link
    WHERE link.tenant_id=leases.tenant_id AND link.user_id=app_user_id() AND link.revoked_at IS NULL
  ));
CREATE POLICY properties_linked_resident_read ON properties FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM leases lease
    JOIN property_tenant_account_links link ON link.tenant_id=lease.tenant_id
    JOIN property_units unit ON unit.id=lease.unit_id
    WHERE unit.property_id=properties.id AND link.user_id=app_user_id()
      AND link.revoked_at IS NULL AND lease.status='active'
  ));
CREATE POLICY property_units_linked_resident_read ON property_units FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM leases lease
    JOIN property_tenant_account_links link ON link.tenant_id=lease.tenant_id
    WHERE lease.unit_id=property_units.id AND link.user_id=app_user_id()
      AND link.revoked_at IS NULL AND lease.status='active'
  ));
CREATE POLICY rent_charges_linked_resident_read ON rent_charges FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM leases lease
    JOIN property_tenant_account_links link ON link.tenant_id=lease.tenant_id
    WHERE lease.id=rent_charges.lease_id AND link.user_id=app_user_id()
      AND link.revoked_at IS NULL
  ));
CREATE POLICY rent_transactions_linked_resident_read ON rent_transactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM leases lease
    JOIN property_tenant_account_links link ON link.tenant_id=lease.tenant_id
    WHERE lease.id=rent_transactions.lease_id AND link.user_id=app_user_id()
      AND link.revoked_at IS NULL
  ));
CREATE POLICY lease_documents_linked_resident_read ON lease_documents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM leases lease
    JOIN property_tenant_account_links link ON link.tenant_id=lease.tenant_id
    WHERE lease.id=lease_documents.lease_id AND link.user_id=app_user_id()
      AND link.revoked_at IS NULL
  ));
CREATE POLICY lease_notices_linked_resident_read ON lease_notices FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM leases lease
    JOIN property_tenant_account_links link ON link.tenant_id=lease.tenant_id
    WHERE lease.id=lease_notices.lease_id AND link.user_id=app_user_id()
      AND link.revoked_at IS NULL
  ));
CREATE POLICY lease_notices_linked_resident_insert ON lease_notices FOR INSERT
  WITH CHECK (
    recorded_by=app_user_id() AND app_role()='customer'
    AND notice_type='tenant_to_owner'
    AND EXISTS (
      SELECT 1 FROM leases lease
      JOIN property_tenant_account_links link ON link.tenant_id=lease.tenant_id
      WHERE lease.id=lease_notices.lease_id AND lease.status='active'
        AND link.user_id=app_user_id() AND link.revoked_at IS NULL
    )
  );
CREATE POLICY lease_events_linked_resident_read ON lease_lifecycle_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM leases lease
    JOIN property_tenant_account_links link ON link.tenant_id=lease.tenant_id
    WHERE lease.id=lease_lifecycle_events.lease_id AND link.user_id=app_user_id()
      AND link.revoked_at IS NULL
  ));

ALTER TABLE maintenance_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_linked_resident_read ON maintenance_requests FOR SELECT
  USING (resident_user_id=app_user_id() AND app_role()='customer');
CREATE POLICY maintenance_linked_resident_insert ON maintenance_requests FOR INSERT
  WITH CHECK (
    resident_user_id=app_user_id() AND app_role()='customer'
    AND lease_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM leases lease
      JOIN property_tenant_account_links link ON link.tenant_id=lease.tenant_id
      JOIN property_units unit ON unit.id=lease.unit_id
      WHERE lease.id=maintenance_requests.lease_id
        AND lease.unit_id=maintenance_requests.unit_id
        AND unit.property_id=maintenance_requests.property_id
        AND lease.status='active'
        AND link.user_id=app_user_id() AND link.revoked_at IS NULL
    )
  );
CREATE POLICY maintenance_events_linked_resident_read ON maintenance_request_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM maintenance_requests maintenance
    WHERE maintenance.id=maintenance_request_events.maintenance_request_id
      AND maintenance.resident_user_id=app_user_id() AND app_role()='customer'
  ));
CREATE POLICY maintenance_events_linked_resident_insert ON maintenance_request_events FOR INSERT
  WITH CHECK (
    actor_id=app_user_id() AND app_role()='customer'
    AND event_type='opened' AND from_status IS NULL AND to_status='open'
    AND EXISTS (
      SELECT 1 FROM maintenance_requests maintenance
      WHERE maintenance.id=maintenance_request_events.maintenance_request_id
        AND maintenance.resident_user_id=app_user_id()
        AND maintenance.status='open'
    )
  );
CREATE POLICY maintenance_evidence_linked_resident_read ON maintenance_evidence FOR SELECT
  USING (scan_status='clean' AND EXISTS (
    SELECT 1 FROM maintenance_requests maintenance
    WHERE maintenance.id=maintenance_evidence.maintenance_request_id
      AND maintenance.resident_user_id=app_user_id() AND app_role()='customer'
  ));
CREATE POLICY maintenance_evidence_linked_resident_insert ON maintenance_evidence FOR INSERT
  WITH CHECK (
    uploaded_by=app_user_id() AND scan_status='clean'
    AND app_role()='customer'
    AND EXISTS (
      SELECT 1 FROM maintenance_requests maintenance
      WHERE maintenance.id=maintenance_evidence.maintenance_request_id
        AND maintenance.resident_user_id=app_user_id()
        AND maintenance.status IN ('open','triaged','assigned','in_progress')
    )
  );
GRANT SELECT,INSERT,UPDATE ON TABLE maintenance_requests TO "{{role}}";
GRANT SELECT ON TABLE maintenance_request_events,maintenance_evidence TO "{{role}}";
GRANT INSERT ON TABLE maintenance_evidence TO "{{role}}";
