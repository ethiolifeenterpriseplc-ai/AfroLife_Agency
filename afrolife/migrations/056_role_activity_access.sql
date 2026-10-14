CREATE OR REPLACE FUNCTION app_has_permission(permission_key text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (nullif(current_setting('app.role_permissions', true), '')::jsonb ->> permission_key)::boolean,
    false
  )
$$;

CREATE TABLE role_activity_permissions (
  role_name text NOT NULL CHECK (role_name IN (
    'global_admin','super_admin','corporate_business_manager','compliance','finance',
    'finance_manager','master_agent','field_agent','customer','worker','property_owner'
  )),
  activity_key text NOT NULL CHECK (activity_key IN (
    'workforce.workers.view','workforce.workers.register',
    'workforce.documents.view','workforce.documents.upload','workforce.documents.review',
    'workforce.workers.verify','staffing.requests.manage','property.listings.view',
    'property.listings.manage','property.tenancy.manage','property.maintenance.manage',
    'rent.payments.submit','rent.transactions.view','rent.transactions.reconcile',
    'rent.transactions.void','rent.deposit.refund_request','learning.content.view',
    'learning.content.manage'
  )),
  enabled boolean NOT NULL,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_name, activity_key)
);

CREATE TABLE role_activity_permission_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  role_name text NOT NULL,
  activity_key text NOT NULL,
  previous_enabled boolean,
  new_enabled boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_role_activity_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Role activity permission audit history is append-only';
END
$$;
CREATE TRIGGER role_activity_permission_audit_immutable
BEFORE UPDATE OR DELETE ON role_activity_permission_audit
FOR EACH ROW EXECUTE FUNCTION prevent_role_activity_audit_mutation();

ALTER TABLE role_activity_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_activity_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY role_activity_permissions_super_admin ON role_activity_permissions
  FOR ALL USING (current_setting('app.role', true) = 'super_admin')
  WITH CHECK (current_setting('app.role', true) = 'super_admin');
CREATE POLICY role_activity_permissions_runtime_read ON role_activity_permissions
  FOR SELECT USING (true);

ALTER TABLE role_activity_permission_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_activity_permission_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY role_activity_permission_audit_super_admin ON role_activity_permission_audit
  FOR ALL USING (current_setting('app.role', true) = 'super_admin')
  WITH CHECK (current_setting('app.role', true) = 'super_admin');

GRANT SELECT, INSERT, UPDATE ON TABLE role_activity_permissions TO "{{role}}";
GRANT SELECT, INSERT ON TABLE role_activity_permission_audit TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE role_activity_permission_audit_id_seq TO "{{role}}";

CREATE POLICY workforce_workers_activity_read ON workers
  FOR SELECT USING (
    app_can_access_agent(source_agent_id)
    AND (app_has_permission('workforce.workers.view') OR app_has_permission('staffing.requests.manage'))
  );
CREATE POLICY workforce_workers_activity_insert ON workers
  FOR INSERT WITH CHECK (
    app_has_permission('workforce.workers.register') AND source_agent_id = app_user_id()
  );
CREATE POLICY workforce_workers_activity_verify ON workers
  FOR UPDATE USING (app_has_permission('workforce.workers.verify') AND app_can_access_agent(source_agent_id))
  WITH CHECK (app_has_permission('workforce.workers.verify') AND app_can_access_agent(source_agent_id));
CREATE POLICY workforce_workers_activity_match ON workers
  FOR UPDATE USING (app_has_permission('staffing.requests.manage') AND app_can_access_agent(source_agent_id))
  WITH CHECK (app_has_permission('staffing.requests.manage') AND app_can_access_agent(source_agent_id));

CREATE POLICY workforce_documents_activity_read ON documents
  FOR SELECT USING (
    (app_has_permission('workforce.documents.view') OR app_has_permission('staffing.requests.manage'))
    AND EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = worker_id AND app_can_access_agent(w.source_agent_id)
    )
  );
CREATE POLICY workforce_documents_activity_upload ON documents
  FOR INSERT WITH CHECK (
    app_has_permission('workforce.documents.upload')
    AND EXISTS (
      SELECT 1 FROM workers w
      WHERE w.id = worker_id AND app_can_access_agent(w.source_agent_id)
    )
  );
CREATE POLICY workforce_documents_activity_review ON documents
  FOR UPDATE USING (
    app_has_permission('workforce.documents.review')
    AND EXISTS (SELECT 1 FROM workers w WHERE w.id = worker_id AND app_can_access_agent(w.source_agent_id))
  )
  WITH CHECK (
    app_has_permission('workforce.documents.review')
    AND EXISTS (SELECT 1 FROM workers w WHERE w.id = worker_id AND app_can_access_agent(w.source_agent_id))
  );

CREATE POLICY staffing_leads_activity_read ON leads
  FOR SELECT USING (
    app_has_permission('staffing.requests.manage') AND app_can_access_agent(source_agent_id)
  );
CREATE POLICY staffing_requests_activity_manage ON job_requests
  FOR ALL USING (
    app_has_permission('staffing.requests.manage') AND app_can_access_agent(source_agent_id)
  )
  WITH CHECK (
    app_has_permission('staffing.requests.manage') AND app_can_access_agent(source_agent_id)
  );
CREATE POLICY staffing_matches_activity_manage ON matches
  FOR ALL USING (
    app_has_permission('staffing.requests.manage')
    AND EXISTS (SELECT 1 FROM job_requests r WHERE r.id = request_id AND app_can_access_agent(r.source_agent_id))
  )
  WITH CHECK (
    app_has_permission('staffing.requests.manage')
    AND EXISTS (SELECT 1 FROM job_requests r WHERE r.id = request_id AND app_can_access_agent(r.source_agent_id))
  );

CREATE POLICY property_listings_activity_read ON properties
  FOR SELECT USING (
    app_has_permission('property.listings.view')
    AND (app_can_access_agent(source_agent_id) OR owner_user_id = app_user_id()
      OR app_role() = 'corporate_business_manager')
  );
CREATE POLICY property_listings_activity_manage ON properties
  FOR ALL USING (
    app_has_permission('property.listings.manage')
    AND (app_can_access_agent(source_agent_id) OR owner_user_id = app_user_id()
      OR app_role() = 'corporate_business_manager')
  )
  WITH CHECK (
    app_has_permission('property.listings.manage')
    AND (app_can_access_agent(source_agent_id) OR owner_user_id = app_user_id()
      OR app_role() = 'corporate_business_manager')
  );
CREATE POLICY property_units_activity_read ON property_units
  FOR SELECT USING (
    app_has_permission('property.listings.view')
    AND EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id
      AND (app_can_access_agent(p.source_agent_id) OR p.owner_user_id = app_user_id()
        OR app_role() = 'corporate_business_manager'))
  );
CREATE POLICY property_units_activity_manage ON property_units
  FOR ALL USING (
    (app_has_permission('property.listings.manage') OR app_has_permission('property.tenancy.manage'))
    AND EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id
      AND (app_can_access_agent(p.source_agent_id) OR p.owner_user_id = app_user_id()
        OR app_role() = 'corporate_business_manager'))
  )
  WITH CHECK (
    (app_has_permission('property.listings.manage') OR app_has_permission('property.tenancy.manage'))
    AND EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id
      AND (app_can_access_agent(p.source_agent_id) OR p.owner_user_id = app_user_id()
        OR app_role() = 'corporate_business_manager'))
  );
CREATE POLICY property_photos_activity_read ON property_photos
  FOR SELECT USING (
    app_has_permission('property.listings.view')
    AND EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id
      AND (app_can_access_agent(p.source_agent_id) OR p.owner_user_id = app_user_id()
        OR app_role() = 'corporate_business_manager'))
  );
CREATE POLICY property_photos_activity_upload ON property_photos
  FOR INSERT WITH CHECK (
    app_has_permission('property.listings.manage')
    AND EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id
      AND (app_can_access_agent(p.source_agent_id) OR p.owner_user_id = app_user_id()
        OR app_role() = 'corporate_business_manager'))
  );
CREATE POLICY property_tenants_activity_read ON tenants
  FOR SELECT USING (
    (app_has_permission('property.tenancy.manage')
      OR app_has_permission('rent.payments.submit')
      OR app_has_permission('rent.transactions.view')
      OR app_has_permission('rent.transactions.reconcile'))
    AND app_can_access_agent(source_agent_id)
  );
CREATE POLICY property_tenants_activity_manage ON tenants
  FOR ALL USING (app_has_permission('property.tenancy.manage') AND app_can_access_agent(source_agent_id))
  WITH CHECK (app_has_permission('property.tenancy.manage') AND app_can_access_agent(source_agent_id));
CREATE POLICY property_leases_activity_read ON leases
  FOR SELECT USING (
    (app_has_permission('property.tenancy.manage')
      OR app_has_permission('rent.payments.submit')
      OR app_has_permission('rent.transactions.view')
      OR app_has_permission('rent.transactions.reconcile')
      OR app_has_permission('rent.transactions.void')
      OR app_has_permission('rent.deposit.refund_request'))
    AND app_can_access_agent(source_agent_id)
  );
CREATE POLICY property_leases_activity_manage ON leases
  FOR ALL USING (app_has_permission('property.tenancy.manage') AND app_can_access_agent(source_agent_id))
  WITH CHECK (app_has_permission('property.tenancy.manage') AND app_can_access_agent(source_agent_id));
CREATE POLICY property_maintenance_activity_manage ON maintenance_requests
  FOR ALL USING (app_has_permission('property.maintenance.manage') AND app_can_access_agent(source_agent_id))
  WITH CHECK (app_has_permission('property.maintenance.manage') AND app_can_access_agent(source_agent_id));

CREATE POLICY rent_charges_activity_read ON rent_charges
  FOR SELECT USING (
    app_has_permission('property.tenancy.manage')
    OR app_has_permission('rent.payments.submit')
    OR app_has_permission('rent.transactions.view')
    OR app_has_permission('rent.transactions.reconcile')
  );
CREATE POLICY rent_charges_activity_reconcile ON rent_charges
  FOR UPDATE USING (
    app_has_permission('rent.transactions.reconcile')
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id = lease_id AND app_can_access_agent(l.source_agent_id))
  )
  WITH CHECK (
    app_has_permission('rent.transactions.reconcile')
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id = lease_id AND app_can_access_agent(l.source_agent_id))
  );
CREATE POLICY rent_transactions_activity_read ON rent_transactions
  FOR SELECT USING (
    (app_has_permission('rent.transactions.view')
      OR app_has_permission('rent.transactions.reconcile')
      OR app_has_permission('rent.transactions.void')
      OR app_has_permission('rent.deposit.refund_request'))
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id = lease_id AND app_can_access_agent(l.source_agent_id))
  );
CREATE POLICY rent_transactions_activity_submit ON rent_transactions
  FOR INSERT WITH CHECK (
    app_has_permission('rent.payments.submit')
    AND recorded_by = app_user_id()
    AND status = 'pending'
    AND reconciled_by IS NULL AND reconciled_at IS NULL
    AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL
    AND (
      (
        kind = 'rent' AND rent_charge_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM leases l JOIN rent_charges c ON c.lease_id = l.id
          WHERE l.id = rent_transactions.lease_id
            AND c.id = rent_transactions.rent_charge_id
            AND c.status = 'due' AND c.amount = rent_transactions.amount
            AND app_can_access_agent(l.source_agent_id)
            AND NOT EXISTS (
              SELECT 1 FROM rent_transactions prior
              WHERE prior.rent_charge_id = c.id AND prior.kind = 'rent' AND prior.status <> 'void'
            )
        )
      )
      OR (
        kind = 'deposit' AND rent_charge_id IS NULL
        AND EXISTS (
          SELECT 1 FROM leases l WHERE l.id = rent_transactions.lease_id
            AND l.status = 'active' AND l.deposit > 0
            AND l.deposit = rent_transactions.amount
            AND app_can_access_agent(l.source_agent_id)
            AND NOT EXISTS (
              SELECT 1 FROM rent_transactions prior
              WHERE prior.lease_id = l.id AND prior.kind = 'deposit' AND prior.status <> 'void'
            )
        )
      )
    )
  );
CREATE POLICY rent_transactions_activity_refund_request ON rent_transactions
  FOR INSERT WITH CHECK (
    app_has_permission('rent.deposit.refund_request')
    AND kind = 'deposit_refund'
    AND recorded_by = app_user_id()
    AND status = 'pending'
    AND reconciled_by IS NULL AND reconciled_at IS NULL
    AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL
    AND EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = rent_transactions.lease_id AND l.status = 'ended'
        AND app_can_access_agent(l.source_agent_id)
    )
  );
CREATE POLICY rent_transactions_activity_reconcile ON rent_transactions
  FOR UPDATE USING (
    app_has_permission('rent.transactions.reconcile')
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id = lease_id AND app_can_access_agent(l.source_agent_id))
  )
  WITH CHECK (
    app_has_permission('rent.transactions.reconcile')
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id = lease_id AND app_can_access_agent(l.source_agent_id))
  );
CREATE POLICY rent_transactions_activity_void ON rent_transactions
  FOR UPDATE USING (
    app_has_permission('rent.transactions.void')
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id = lease_id AND app_can_access_agent(l.source_agent_id))
  )
  WITH CHECK (
    app_has_permission('rent.transactions.void')
    AND EXISTS (SELECT 1 FROM leases l WHERE l.id = lease_id AND app_can_access_agent(l.source_agent_id))
  );

CREATE TABLE learning_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 200),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 5 AND 1000),
  category text NOT NULL CHECK (category IN (
    'workforce_onboarding','property_management','tenant_support','landlord_support',
    'buyer_support','seller_support','agent_training','general_support'
  )),
  content_type text NOT NULL CHECK (content_type IN ('video','tutorial','article')),
  audience_roles text[] NOT NULL CHECK (
    cardinality(audience_roles) > 0
    AND audience_roles <@ ARRAY[
      'global_admin','super_admin','corporate_business_manager','compliance','finance',
      'finance_manager','master_agent','field_agent','customer','worker','property_owner'
    ]::text[]
  ),
  video_url text CHECK (video_url IS NULL OR video_url ~ '^https://[^[:space:]]+$'),
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (content_type <> 'video' OR video_url IS NOT NULL)
);
CREATE INDEX learning_content_published_idx ON learning_content (status, category, updated_at DESC);
ALTER TABLE learning_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_content FORCE ROW LEVEL SECURITY;
CREATE POLICY learning_content_audience_read ON learning_content
  FOR SELECT USING (
    current_setting('app.role', true) = ANY(audience_roles)
    AND status = 'published'
    AND app_has_permission('learning.content.view')
  );
CREATE POLICY learning_content_manager_manage ON learning_content
  FOR ALL USING (app_has_permission('learning.content.manage'))
  WITH CHECK (app_has_permission('learning.content.manage'));

CREATE TABLE learning_content_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES learning_content(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('created','updated','published','archived')),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX learning_content_audit_content_idx ON learning_content_audit (content_id, changed_at DESC);
ALTER TABLE learning_content_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_content_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY learning_content_audit_manager ON learning_content_audit
  FOR ALL USING (app_has_permission('learning.content.manage'))
  WITH CHECK (app_has_permission('learning.content.manage'));
CREATE TRIGGER learning_content_audit_immutable
BEFORE UPDATE OR DELETE ON learning_content_audit
FOR EACH ROW EXECUTE FUNCTION prevent_role_activity_audit_mutation();

GRANT SELECT, INSERT, UPDATE ON TABLE learning_content TO "{{role}}";
GRANT SELECT, INSERT ON TABLE learning_content_audit TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE learning_content_audit_id_seq TO "{{role}}";
