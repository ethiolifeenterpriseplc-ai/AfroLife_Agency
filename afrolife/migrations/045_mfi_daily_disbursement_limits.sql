CREATE TABLE mfi_disbursement_limit_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES mfi_institutions(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version>0),
  daily_limit numeric(16,2) CHECK (daily_limit IS NULL OR daily_limit>0),
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','active','superseded','rejected')),
  change_reason text NOT NULL CHECK (length(trim(change_reason)) BETWEEN 10 AND 1000),
  created_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(institution_id,version),
  UNIQUE(id,institution_id),
  CHECK ((status='pending_approval' AND approved_by IS NULL AND approved_at IS NULL AND review_reason IS NULL)
    OR (status<>'pending_approval' AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)),
  CHECK (approved_by IS NULL OR approved_by<>created_by)
);
CREATE UNIQUE INDEX mfi_disbursement_limit_one_pending_idx ON mfi_disbursement_limit_versions(institution_id) WHERE status='pending_approval';
CREATE UNIQUE INDEX mfi_disbursement_limit_one_active_idx ON mfi_disbursement_limit_versions(institution_id) WHERE status='active';
ALTER TABLE mfi_disbursement_limit_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_disbursement_limit_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_disbursement_limit_scope ON mfi_disbursement_limit_versions
  USING(mfi_has_access(institution_id)) WITH CHECK(mfi_has_access(institution_id));
CREATE FUNCTION mfi_guard_disbursement_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Disbursement limit history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status'-'approved_by'-'approved_at'-'review_reason')<>
     (to_jsonb(OLD)-'status'-'approved_by'-'approved_at'-'review_reason') THEN
    RAISE EXCEPTION 'Disbursement limit terms and authorship are immutable';
  END IF;
  IF OLD.status='pending_approval' AND NEW.status IN ('active','rejected') THEN
    IF NEW.approved_by IS DISTINCT FROM app_user_id() OR NEW.approved_by=OLD.created_by OR NEW.approved_at IS NULL
       OR NEW.review_reason IS NULL OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'Limit decision requires an independent reviewer and reason';
    END IF;
  ELSIF OLD.status='active' AND NEW.status='superseded' THEN
    IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN RAISE EXCEPTION 'Limit review evidence is immutable'; END IF;
  ELSE RAISE EXCEPTION 'Invalid disbursement limit transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mfi_disbursement_limit_guard BEFORE UPDATE OR DELETE ON mfi_disbursement_limit_versions
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_disbursement_limit();
GRANT SELECT,INSERT,UPDATE ON TABLE mfi_disbursement_limit_versions TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_guard_disbursement_limit() TO "{{role}}";
