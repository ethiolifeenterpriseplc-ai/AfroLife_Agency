-- Backfill environments that applied an earlier draft of migration 023.
ALTER TABLE mfi_members ADD COLUMN IF NOT EXISTS lifecycle_updated_by uuid REFERENCES users(id);
ALTER TABLE mfi_members ADD COLUMN IF NOT EXISTS lifecycle_updated_at timestamptz;

ALTER TABLE mfi_npl_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';
ALTER TABLE mfi_npl_events ADD COLUMN IF NOT EXISTS proposed_by uuid REFERENCES users(id);
ALTER TABLE mfi_npl_events ADD COLUMN IF NOT EXISTS decision_reason text;
ALTER TABLE mfi_npl_events ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
UPDATE mfi_npl_events SET proposed_by=approved_by WHERE proposed_by IS NULL;
UPDATE mfi_npl_events SET decision_reason='Legacy risk classification recorded before separate approval workflow'
  WHERE decision_reason IS NULL;
UPDATE mfi_npl_events SET reviewed_at=created_at WHERE reviewed_at IS NULL AND status IN ('approved','rejected');
ALTER TABLE mfi_npl_events ALTER COLUMN proposed_by SET NOT NULL;
ALTER TABLE mfi_npl_events ALTER COLUMN approved_by DROP NOT NULL;
ALTER TABLE mfi_npl_events ALTER COLUMN status SET DEFAULT 'pending_approval';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mfi_npl_event_status_check') THEN
    ALTER TABLE mfi_npl_events ADD CONSTRAINT mfi_npl_event_status_check
      CHECK (status IN ('pending_approval','approved','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mfi_npl_event_review_state_check') THEN
    ALTER TABLE mfi_npl_events ADD CONSTRAINT mfi_npl_event_review_state_check
      CHECK ((status='pending_approval' AND approved_by IS NULL AND reviewed_at IS NULL)
          OR (status IN ('approved','rejected') AND approved_by IS NOT NULL AND reviewed_at IS NOT NULL AND decision_reason IS NOT NULL));
  END IF;
END $$;
ALTER TABLE mfi_npl_events VALIDATE CONSTRAINT mfi_npl_event_status_check;
ALTER TABLE mfi_npl_events VALIDATE CONSTRAINT mfi_npl_event_review_state_check;
CREATE UNIQUE INDEX IF NOT EXISTS mfi_npl_one_pending_idx
  ON mfi_npl_events(institution_id, loan_id) WHERE status='pending_approval';
CREATE UNIQUE INDEX IF NOT EXISTS mfi_credit_policy_one_pending_idx
  ON mfi_credit_policy_versions(institution_id) WHERE status='pending_approval';

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

CREATE OR REPLACE FUNCTION mfi_prevent_append_only_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'MFI workflow history is append-only';
END
$$;
DROP TRIGGER IF EXISTS mfi_collection_events_immutable ON mfi_collection_events;
CREATE TRIGGER mfi_collection_events_immutable BEFORE UPDATE OR DELETE ON mfi_collection_events
  FOR EACH ROW EXECUTE FUNCTION mfi_prevent_append_only_history_mutation();
DROP TRIGGER IF EXISTS mfi_member_lifecycle_immutable ON mfi_member_lifecycle_events;
CREATE TRIGGER mfi_member_lifecycle_immutable BEFORE UPDATE OR DELETE ON mfi_member_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION mfi_prevent_append_only_history_mutation();

CREATE OR REPLACE FUNCTION mfi_guard_credit_policy_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Credit policy history cannot be deleted'; END IF;
  IF (to_jsonb(NEW) - 'status' - 'approved_by' - 'approved_at' - 'effective_at') <>
     (to_jsonb(OLD) - 'status' - 'approved_by' - 'approved_at' - 'effective_at') THEN
    RAISE EXCEPTION 'Credit policy content and authorship are immutable';
  END IF;
  IF NOT ((OLD.status='pending_approval' AND NEW.status IN ('active','rejected')) OR
          (OLD.status='active' AND NEW.status='superseded')) THEN
    RAISE EXCEPTION 'Invalid credit policy lifecycle transition';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS mfi_credit_policy_history_guard ON mfi_credit_policy_versions;
CREATE TRIGGER mfi_credit_policy_history_guard BEFORE UPDATE OR DELETE ON mfi_credit_policy_versions
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_credit_policy_history();

CREATE OR REPLACE FUNCTION mfi_guard_npl_event_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'NPL classification history cannot be deleted'; END IF;
  IF OLD.status <> 'pending_approval' OR NEW.status NOT IN ('approved','rejected') OR
     (to_jsonb(NEW) - 'status' - 'approved_by' - 'decision_reason' - 'reviewed_at') <>
     (to_jsonb(OLD) - 'status' - 'approved_by' - 'decision_reason' - 'reviewed_at') THEN
    RAISE EXCEPTION 'NPL assessments are immutable after independent decision';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS mfi_npl_event_history_guard ON mfi_npl_events;
CREATE TRIGGER mfi_npl_event_history_guard BEFORE UPDATE OR DELETE ON mfi_npl_events
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_npl_event_history();
