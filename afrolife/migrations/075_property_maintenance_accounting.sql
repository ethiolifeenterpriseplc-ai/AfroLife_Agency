CREATE TABLE property_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 200),
  tax_id text,
  phone text,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX property_vendors_tax_id_unique ON property_vendors(tax_id) WHERE tax_id IS NOT NULL;
CREATE UNIQUE INDEX property_vendors_name_unique ON property_vendors(lower(name));

CREATE TABLE property_vendor_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_request_id uuid NOT NULL REFERENCES maintenance_requests(id),
  vendor_id uuid NOT NULL REFERENCES property_vendors(id),
  invoice_reference text NOT NULL CHECK (length(trim(invoice_reference)) BETWEEN 1 AND 160),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  invoice_date date NOT NULL,
  due_date date NOT NULL CHECK (due_date >= invoice_date),
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','approved','payment_pending','paid','rejected')),
  recorded_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approval_reason text,
  approved_at timestamptz,
  payment_reference text UNIQUE,
  payment_channel text,
  payment_date date,
  payment_recorded_by uuid REFERENCES users(id),
  payment_reconciled_by uuid REFERENCES users(id),
  payment_reason text,
  payment_reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, invoice_reference),
  CHECK (approved_by IS NULL OR approved_by <> recorded_by),
  CHECK (payment_reconciled_by IS NULL OR payment_reconciled_by <> payment_recorded_by),
  CHECK (
    (status='pending_approval' AND approved_by IS NULL AND approval_reason IS NULL AND approved_at IS NULL AND payment_reference IS NULL AND payment_channel IS NULL AND payment_date IS NULL AND payment_recorded_by IS NULL AND payment_reconciled_by IS NULL AND payment_reason IS NULL AND payment_reconciled_at IS NULL)
    OR (status='approved' AND approved_by IS NOT NULL AND length(trim(approval_reason))>=10 AND approved_at IS NOT NULL AND payment_reference IS NULL AND payment_channel IS NULL AND payment_date IS NULL AND payment_recorded_by IS NULL AND payment_reconciled_by IS NULL AND payment_reason IS NULL AND payment_reconciled_at IS NULL)
    OR (status='payment_pending' AND approved_by IS NOT NULL AND length(trim(approval_reason))>=10 AND approved_at IS NOT NULL AND payment_reference IS NOT NULL AND payment_channel IS NOT NULL AND payment_date IS NOT NULL AND payment_recorded_by IS NOT NULL AND payment_reconciled_by IS NULL AND payment_reason IS NULL AND payment_reconciled_at IS NULL)
    OR (status='paid' AND approved_by IS NOT NULL AND length(trim(approval_reason))>=10 AND approved_at IS NOT NULL AND payment_reference IS NOT NULL AND payment_channel IS NOT NULL AND payment_date IS NOT NULL AND payment_recorded_by IS NOT NULL AND payment_reconciled_by IS NOT NULL AND length(trim(payment_reason))>=10 AND payment_reconciled_at IS NOT NULL)
    OR (status='rejected' AND approved_by IS NOT NULL AND length(trim(approval_reason))>=10 AND approved_at IS NOT NULL AND payment_reference IS NULL AND payment_recorded_by IS NULL AND payment_reconciled_by IS NULL)
  )
);
CREATE INDEX property_vendor_bills_status_idx ON property_vendor_bills(status, created_at);
CREATE INDEX property_vendor_bills_vendor_idx ON property_vendor_bills(vendor_id, invoice_date DESC);
ALTER TABLE property_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY property_vendors_staff ON property_vendors FOR ALL
  USING (app_role() IN ('finance','finance_manager','super_admin','global_admin'))
  WITH CHECK (app_role() IN ('finance','finance_manager','super_admin','global_admin'));
ALTER TABLE property_vendor_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_vendor_bills FORCE ROW LEVEL SECURITY;
CREATE POLICY property_vendor_bills_read ON property_vendor_bills FOR SELECT USING (app_is_staff());
CREATE POLICY property_vendor_bills_insert ON property_vendor_bills FOR INSERT
  WITH CHECK (app_role() IN ('finance','finance_manager','super_admin','global_admin') AND recorded_by=app_user_id());
CREATE POLICY property_vendor_bills_update ON property_vendor_bills FOR UPDATE
  USING (app_role() IN ('finance','finance_manager','super_admin','global_admin'))
  WITH CHECK (app_role() IN ('finance','finance_manager','super_admin','global_admin'));
GRANT SELECT,INSERT,UPDATE ON property_vendors,property_vendor_bills TO "{{role}}";
