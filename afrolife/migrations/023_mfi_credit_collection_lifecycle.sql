-- Add configurable, auditable credit and servicing primitives without assuming
-- interest, fee, provisioning, or regulatory policy values for an institution.
ALTER TABLE mfi_loans
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS monthly_income numeric(16,2),
  ADD COLUMN IF NOT EXISTS monthly_expenses numeric(16,2),
  ADD COLUMN IF NOT EXISTS monthly_debt numeric(16,2),
  ADD COLUMN IF NOT EXISTS credit_score smallint,
  ADD COLUMN IF NOT EXISTS credit_scorecard_version integer,
  ADD COLUMN IF NOT EXISTS credit_score_factors jsonb,
  ADD COLUMN IF NOT EXISTS application_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS npl_status text NOT NULL DEFAULT 'performing'
    CHECK (npl_status IN ('performing','watch','substandard','doubtful','loss','written_off')),
  ADD COLUMN IF NOT EXISTS npl_classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS npl_reason text;

ALTER TABLE mfi_members
  ADD COLUMN IF NOT EXISTS lifecycle_updated_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at timestamptz;

ALTER TABLE mfi_loans
  ADD CONSTRAINT mfi_loans_financial_inputs_check CHECK (
    (monthly_income IS NULL OR monthly_income >= 0) AND
    (monthly_expenses IS NULL OR monthly_expenses >= 0) AND
    (monthly_debt IS NULL OR monthly_debt >= 0) AND
    (credit_score IS NULL OR credit_score BETWEEN 0 AND 100)
  );

CREATE TABLE mfi_credit_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','active','superseded','rejected')),
  policy jsonb NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
  change_reason text NOT NULL CHECK (length(trim(change_reason)) BETWEEN 10 AND 1000),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  effective_at timestamptz,
  UNIQUE (institution_id, version),
  UNIQUE (institution_id, id),
  CHECK (approved_by IS NULL OR approved_by <> created_by),
  CHECK ((status = 'active' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND effective_at IS NOT NULL)
      OR status <> 'active')
);
CREATE UNIQUE INDEX mfi_credit_policy_one_active_idx ON mfi_credit_policy_versions(institution_id) WHERE status='active';
CREATE INDEX mfi_credit_policy_history_idx ON mfi_credit_policy_versions(institution_id, version DESC);

CREATE TABLE mfi_loan_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id),
  loan_id uuid NOT NULL,
  installment_no integer NOT NULL CHECK (installment_no > 0),
  due_on date NOT NULL,
  principal_due numeric(16,2) NOT NULL CHECK (principal_due > 0),
  principal_paid numeric(16,2) NOT NULL DEFAULT 0 CHECK (principal_paid >= 0 AND principal_paid <= principal_due),
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due','partial','paid','waived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id, loan_id) REFERENCES mfi_loans(institution_id, id),
  UNIQUE (institution_id, loan_id, installment_no),
  UNIQUE (institution_id, id),
  CHECK ((status='due' AND principal_paid=0) OR (status='partial' AND principal_paid>0 AND principal_paid<principal_due)
      OR (status='paid' AND principal_paid=principal_due) OR status='waived')
);
CREATE INDEX mfi_installment_due_idx ON mfi_loan_installments(institution_id, due_on, status);

-- Backfill principal-only schedules for loans disbursed before this capability
-- existed. Existing accounting journals remain untouched.
INSERT INTO mfi_loan_installments (institution_id,loan_id,installment_no,due_on,principal_due)
SELECT l.institution_id,l.id,n,
  (date_trunc('month',l.disbursed_at) + n*interval '1 month'
    + (least(extract(day FROM l.disbursed_at)::int,28)-1)*interval '1 day')::date,
  ((round(l.principal_amount*100)::bigint/l.term_months
    + CASE WHEN n <= (round(l.principal_amount*100)::bigint%l.term_months) THEN 1 ELSE 0 END)::numeric/100)
FROM mfi_loans l CROSS JOIN LATERAL generate_series(1,l.term_months) n
WHERE l.status IN ('disbursed','repaid') AND l.disbursed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mfi_loan_installments i WHERE i.institution_id=l.institution_id AND i.loan_id=l.id);

WITH ordered AS (
  SELECT i.id,i.principal_due,l.principal_repaid,
    COALESCE(sum(i.principal_due) OVER (PARTITION BY i.loan_id ORDER BY i.installment_no
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior_due
  FROM mfi_loan_installments i JOIN mfi_loans l ON l.institution_id=i.institution_id AND l.id=i.loan_id
), allocated AS (
  SELECT id,principal_due,LEAST(principal_due,GREATEST(0,principal_repaid-prior_due)) AS paid FROM ordered
)
UPDATE mfi_loan_installments i SET principal_paid=a.paid,
  status=CASE WHEN a.paid=0 THEN 'due' WHEN a.paid=a.principal_due THEN 'paid' ELSE 'partial' END
FROM allocated a WHERE a.id=i.id;

CREATE TABLE mfi_collection_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id),
  loan_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','promise_to_pay','escalated','resolved','closed')),
  created_by uuid NOT NULL REFERENCES users(id),
  assigned_to uuid REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  next_action_at timestamptz,
  closed_at timestamptz,
  closed_by uuid REFERENCES users(id),
  close_reason text,
  FOREIGN KEY (institution_id, loan_id) REFERENCES mfi_loans(institution_id, id),
  UNIQUE (institution_id, id),
  CHECK ((status IN ('resolved','closed') AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_reason IS NOT NULL)
      OR status NOT IN ('resolved','closed'))
);
CREATE UNIQUE INDEX mfi_collection_one_open_case_idx ON mfi_collection_cases(institution_id, loan_id)
  WHERE status IN ('open','promise_to_pay','escalated');

CREATE TABLE mfi_collection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  case_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('contact','promise_to_pay','visit','escalation','resolution','note')),
  outcome text NOT NULL CHECK (length(trim(outcome)) BETWEEN 2 AND 1000),
  promised_amount numeric(16,2) CHECK (promised_amount IS NULL OR promised_amount > 0),
  promised_on date,
  next_action_at timestamptz,
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id, case_id) REFERENCES mfi_collection_cases(institution_id, id),
  CHECK ((event_type='promise_to_pay' AND promised_amount IS NOT NULL AND promised_on IS NOT NULL)
      OR event_type <> 'promise_to_pay')
);
CREATE INDEX mfi_collection_events_history_idx ON mfi_collection_events(institution_id, case_id, created_at DESC);

CREATE TABLE mfi_npl_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  prior_status text NOT NULL CHECK (prior_status IN ('performing','watch','substandard','doubtful','loss','written_off')),
  next_status text NOT NULL CHECK (next_status IN ('performing','watch','substandard','doubtful','loss','written_off')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','approved','rejected')),
  proposed_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  decision_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id, loan_id) REFERENCES mfi_loans(institution_id, id),
  CHECK (prior_status <> next_status),
  CHECK (approved_by IS NULL OR approved_by <> proposed_by),
  CHECK ((status='pending_approval' AND approved_by IS NULL AND reviewed_at IS NULL)
      OR (status IN ('approved','rejected') AND approved_by IS NOT NULL AND reviewed_at IS NOT NULL AND decision_reason IS NOT NULL))
);
CREATE INDEX mfi_npl_events_history_idx ON mfi_npl_events(institution_id, loan_id, created_at DESC);
CREATE UNIQUE INDEX mfi_npl_one_pending_idx ON mfi_npl_events(institution_id, loan_id) WHERE status='pending_approval';

CREATE TABLE mfi_member_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  member_id uuid NOT NULL,
  prior_status text NOT NULL,
  next_status text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id, member_id) REFERENCES mfi_members(institution_id, id),
  CHECK (prior_status <> next_status)
);

ALTER TABLE mfi_credit_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_credit_policy_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_credit_policy_scope ON mfi_credit_policy_versions
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
ALTER TABLE mfi_loan_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_loan_installments FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_installment_scope ON mfi_loan_installments
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
ALTER TABLE mfi_collection_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_collection_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_collection_case_scope ON mfi_collection_cases
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
ALTER TABLE mfi_collection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_collection_events FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_collection_event_scope ON mfi_collection_events
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
ALTER TABLE mfi_npl_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_npl_events FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_npl_event_scope ON mfi_npl_events
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
ALTER TABLE mfi_member_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_member_lifecycle_events FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_member_lifecycle_scope ON mfi_member_lifecycle_events
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
