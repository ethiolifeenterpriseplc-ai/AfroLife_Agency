ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'global_admin','super_admin','corporate_business_manager','compliance','finance',
  'finance_manager','master_agent','field_agent','customer','worker','property_owner'
));

ALTER TABLE contract_signatures DROP CONSTRAINT IF EXISTS contract_signatures_signer_role_check;
ALTER TABLE contract_signatures ADD CONSTRAINT contract_signatures_signer_role_check
  CHECK (signer_role IN ('global_admin','super_admin','corporate_business_manager'));

CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN nullif(current_setting('app.role', true), '') = 'global_admin' THEN 'super_admin'
    ELSE coalesce(nullif(current_setting('app.role', true), ''), '')
  END
$$;

CREATE OR REPLACE FUNCTION prevent_unverified_activation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active AND NEW.role NOT IN ('global_admin','super_admin','corporate_business_manager','compliance','finance','finance_manager')
     AND NEW.kyc_status <> 'verified' THEN
    RAISE EXCEPTION 'Account must be KYC verified before activation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TABLE global_admin_role_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES users(id),
  target_user_id uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (requested_by <> target_user_id),
  CHECK (approved_by IS NULL OR (approved_by <> requested_by AND approved_by <> target_user_id)),
  CHECK (
    (status = 'pending' AND approved_by IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
    OR (status IN ('approved','rejected') AND approved_by IS NOT NULL AND decided_at IS NOT NULL
        AND decision_reason IS NOT NULL AND length(trim(decision_reason)) BETWEEN 10 AND 1000)
  )
);

CREATE UNIQUE INDEX global_admin_pending_promotion_target_idx
  ON global_admin_role_change_requests (target_user_id) WHERE status = 'pending';
CREATE INDEX global_admin_role_change_requests_recent_idx
  ON global_admin_role_change_requests (created_at DESC);
ALTER TABLE global_admin_role_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY global_admin_role_change_requests_staff ON global_admin_role_change_requests
  USING (app_is_staff()) WITH CHECK (app_is_staff());
