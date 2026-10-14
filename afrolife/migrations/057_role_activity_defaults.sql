CREATE TABLE role_activity_defaults (
  role_name text NOT NULL CHECK (role_name IN (
    'global_admin','super_admin','corporate_business_manager','compliance','finance',
    'finance_manager','master_agent','field_agent','customer','worker','property_owner'
  )),
  activity_key text NOT NULL CHECK (activity_key IN (
    'workforce.workers.view','workforce.workers.register',
    'workforce.documents.view','workforce.documents.upload','workforce.documents.review',
    'workforce.workers.verify','staffing.requests.manage','property.listings.view',
    'property.listings.manage',    'property.tenancy.manage','property.tenancy.approve','property.tenancy.execute',
    'property.maintenance.manage',
    'rent.payments.submit','rent.transactions.view','rent.transactions.reconcile',
    'rent.transactions.void','rent.deposit.refund_request','learning.content.view',
    'learning.content.manage'
  )),
  enabled boolean NOT NULL CHECK (enabled),
  PRIMARY KEY (role_name, activity_key)
);

INSERT INTO role_activity_defaults (role_name, activity_key, enabled) VALUES
  ('global_admin','workforce.workers.view',true),
  ('global_admin','workforce.documents.view',true),
  ('global_admin','workforce.documents.upload',true),
  ('global_admin','staffing.requests.manage',true),
  ('global_admin','property.listings.view',true),
  ('global_admin','property.listings.manage',true),
  ('global_admin','property.tenancy.manage',true),
  ('global_admin','property.tenancy.approve',true),
  ('global_admin','property.tenancy.execute',true),
  ('global_admin','property.maintenance.manage',true),
  ('global_admin','rent.payments.submit',true),
  ('global_admin','rent.transactions.view',true),
  ('global_admin','rent.transactions.reconcile',true),
  ('global_admin','rent.transactions.void',true),
  ('global_admin','rent.deposit.refund_request',true),
  ('global_admin','learning.content.view',true),
  ('global_admin','learning.content.manage',true),
  ('super_admin','workforce.workers.view',true),
  ('super_admin','workforce.documents.view',true),
  ('super_admin','workforce.documents.upload',true),
  ('super_admin','staffing.requests.manage',true),
  ('super_admin','property.listings.view',true),
  ('super_admin','property.listings.manage',true),
  ('super_admin','property.tenancy.manage',true),
  ('super_admin','property.tenancy.approve',true),
  ('super_admin','property.tenancy.execute',true),
  ('super_admin','property.maintenance.manage',true),
  ('super_admin','rent.payments.submit',true),
  ('super_admin','rent.transactions.view',true),
  ('super_admin','rent.transactions.reconcile',true),
  ('super_admin','rent.transactions.void',true),
  ('super_admin','rent.deposit.refund_request',true),
  ('super_admin','learning.content.view',true),
  ('super_admin','learning.content.manage',true),
  ('corporate_business_manager','property.listings.view',true),
  ('corporate_business_manager','property.listings.manage',true),
  ('corporate_business_manager','learning.content.view',true),
  ('corporate_business_manager','learning.content.manage',true),
  ('compliance','workforce.workers.view',true),
  ('compliance','workforce.documents.view',true),
  ('compliance','workforce.documents.upload',true),
  ('compliance','workforce.documents.review',true),
  ('compliance','workforce.workers.verify',true),
  ('compliance','learning.content.view',true),
  ('finance','workforce.workers.view',true),
  ('finance','rent.payments.submit',true),
  ('finance','rent.deposit.refund_request',true),
  ('finance','learning.content.view',true),
  ('finance_manager','workforce.workers.view',true),
  ('finance_manager','rent.payments.submit',true),
  ('finance_manager','rent.transactions.view',true),
  ('finance_manager','rent.transactions.reconcile',true),
  ('finance_manager','rent.transactions.void',true),
  ('finance_manager','rent.deposit.refund_request',true),
  ('finance_manager','learning.content.view',true),
  ('master_agent','workforce.workers.view',true),
  ('master_agent','workforce.workers.register',true),
  ('master_agent','workforce.documents.view',true),
  ('master_agent','workforce.documents.upload',true),
  ('master_agent','staffing.requests.manage',true),
  ('master_agent','property.listings.view',true),
  ('master_agent','property.listings.manage',true),
  ('master_agent','property.tenancy.manage',true),
  ('master_agent','property.maintenance.manage',true),
  ('master_agent','rent.payments.submit',true),
  ('master_agent','learning.content.view',true),
  ('field_agent','workforce.workers.view',true),
  ('field_agent','workforce.workers.register',true),
  ('field_agent','workforce.documents.view',true),
  ('field_agent','workforce.documents.upload',true),
  ('field_agent','staffing.requests.manage',true),
  ('field_agent','property.listings.view',true),
  ('field_agent','property.listings.manage',true),
  ('field_agent','property.tenancy.manage',true),
  ('field_agent','property.maintenance.manage',true),
  ('field_agent','rent.payments.submit',true),
  ('field_agent','learning.content.view',true),
  ('customer','property.listings.view',true),
  ('customer','learning.content.view',true),
  ('worker','learning.content.view',true),
  ('property_owner','property.listings.view',true),
  ('property_owner','property.listings.manage',true),
  ('property_owner','learning.content.view',true);

REVOKE ALL ON TABLE role_activity_defaults FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE role_activity_defaults FROM "{{role}}";
GRANT SELECT ON TABLE role_activity_defaults TO "{{role}}";

CREATE OR REPLACE FUNCTION app_has_permission(permission_key text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (nullif(current_setting('app.role_permissions', true), '')::jsonb ->> permission_key)::boolean,
    (
      SELECT d.enabled
      FROM role_activity_defaults d
      WHERE d.role_name = current_setting('app.role', true)
        AND d.activity_key = permission_key
    ),
    false
  )
$$;
