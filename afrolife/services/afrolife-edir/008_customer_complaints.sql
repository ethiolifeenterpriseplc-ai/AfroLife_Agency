CREATE TABLE edir_customer_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT app_edir_id() REFERENCES edir_organizations(id),
  member_id uuid NOT NULL,
  reference text NOT NULL,
  category text NOT NULL CHECK (category IN ('service','loan_decision','repayment','fees','privacy','fraud','other')),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 5 AND 160),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','awaiting_customer','resolved','rejected')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  resolution_due_at timestamptz NOT NULL DEFAULT now()+interval '15 days',
  assigned_to uuid,
  resolution text CHECK (resolution IS NULL OR length(trim(resolution)) BETWEEN 10 AND 5000),
  resolved_by uuid,
  resolved_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,reference),
  UNIQUE (id,organization_id),
  FOREIGN KEY (member_id,organization_id) REFERENCES edir_memberships(id,organization_id),
  CHECK ((status IN ('resolved','rejected') AND resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
      OR status NOT IN ('resolved','rejected'))
);
CREATE INDEX edir_customer_complaint_queue_idx ON edir_customer_complaints(organization_id,status,priority,created_at);
ALTER TABLE edir_customer_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE edir_customer_complaints FORCE ROW LEVEL SECURITY;
CREATE POLICY edir_customer_complaint_read ON edir_customer_complaints FOR SELECT
  USING (created_by=app_user_id() AND edir_has_active_membership()
    OR edir_has_staff_role(ARRAY['edir_admin','member_support','compliance','auditor'])
    OR edir_is_platform_admin());
CREATE POLICY edir_customer_complaint_create ON edir_customer_complaints FOR INSERT
  WITH CHECK (created_by=app_user_id() AND EXISTS (
    SELECT 1 FROM edir_memberships m WHERE m.id=member_id AND m.user_id=app_user_id() AND m.status='active'
  ));
CREATE POLICY edir_customer_complaint_manage ON edir_customer_complaints FOR UPDATE
  USING (edir_has_staff_role(ARRAY['edir_admin','member_support','compliance']) OR edir_is_platform_admin())
  WITH CHECK (edir_has_staff_role(ARRAY['edir_admin','member_support','compliance']) OR edir_is_platform_admin());
CREATE POLICY edir_customer_complaint_tenant_scope ON edir_customer_complaints AS RESTRICTIVE FOR ALL
  USING (organization_id=app_edir_id() OR edir_is_platform_admin())
  WITH CHECK (organization_id=app_edir_id() OR edir_is_platform_admin());
CREATE TRIGGER edir_customer_complaint_tenant_guard BEFORE UPDATE OF organization_id ON edir_customer_complaints
  FOR EACH ROW EXECUTE FUNCTION edir_prevent_tenant_change();
GRANT SELECT,INSERT,UPDATE ON TABLE edir_customer_complaints TO "{{role}}";
