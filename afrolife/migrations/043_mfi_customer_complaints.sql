CREATE TABLE mfi_customer_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL,
  reference text NOT NULL,
  category text NOT NULL CHECK (category IN ('service','loan_decision','repayment','fees','privacy','fraud','other')),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 5 AND 160),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','awaiting_customer','resolved','rejected')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  resolution_due_at timestamptz NOT NULL DEFAULT now()+interval '15 days',
  assigned_to uuid REFERENCES users(id),
  resolution text CHECK (resolution IS NULL OR length(trim(resolution)) BETWEEN 10 AND 5000),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id,reference),
  FOREIGN KEY (institution_id,member_id) REFERENCES mfi_members(institution_id,id),
  CHECK ((status IN ('resolved','rejected') AND resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
      OR status NOT IN ('resolved','rejected'))
);
CREATE INDEX mfi_customer_complaint_queue_idx ON mfi_customer_complaints(institution_id,status,priority,created_at);
ALTER TABLE mfi_customer_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_customer_complaints FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_customer_complaint_scope ON mfi_customer_complaints
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
GRANT SELECT,INSERT,UPDATE ON TABLE mfi_customer_complaints TO "{{role}}";
