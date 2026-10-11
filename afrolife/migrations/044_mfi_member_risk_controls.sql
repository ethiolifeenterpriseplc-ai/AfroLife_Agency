CREATE TABLE mfi_member_risk_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  member_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('identity_mismatch','suspicious_activity','fraud','aml_hold','delinquency_restriction')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','active','rejected','released')),
  created_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_reason text,
  released_by uuid REFERENCES users(id),
  released_at timestamptz,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (institution_id,member_id) REFERENCES mfi_members(institution_id,id),
  CHECK ((status='pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
     OR (status<>'pending_review' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
       AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 2000)),
  CHECK ((status='released' AND released_by IS NOT NULL AND released_at IS NOT NULL AND release_reason IS NOT NULL)
     OR (status<>'released' AND released_by IS NULL AND released_at IS NULL AND release_reason IS NULL)),
  CHECK (reviewed_by IS NULL OR reviewed_by<>created_by)
);
CREATE INDEX mfi_member_risk_active_idx ON mfi_member_risk_flags(institution_id,member_id) WHERE status='active';
ALTER TABLE mfi_member_risk_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_member_risk_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY mfi_member_risk_scope ON mfi_member_risk_flags
  USING (mfi_has_access(institution_id)) WITH CHECK (mfi_has_access(institution_id));
CREATE FUNCTION mfi_guard_member_risk_flag() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Member risk history cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_reason'-'released_by'-'released_at'-'release_reason')<>
     (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_reason'-'released_by'-'released_at'-'release_reason') THEN
    RAISE EXCEPTION 'Member risk flag evidence is immutable';
  END IF;
  IF OLD.status='pending_review' AND NEW.status IN ('active','rejected') THEN
    IF NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=OLD.created_by OR NEW.reviewed_at IS NULL
       OR NEW.review_reason IS NULL OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 2000 THEN
      RAISE EXCEPTION 'Risk flag review requires an independent actor and reason';
    END IF;
  ELSIF OLD.status='active' AND NEW.status='released' THEN
    IF NEW.released_by IS DISTINCT FROM app_user_id() OR NEW.released_by=OLD.created_by OR NEW.released_at IS NULL
       OR NEW.release_reason IS NULL OR length(trim(NEW.release_reason)) NOT BETWEEN 10 AND 2000 THEN
      RAISE EXCEPTION 'Risk hold release requires an independent actor and reason';
    END IF;
  ELSE RAISE EXCEPTION 'Invalid member risk flag transition'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mfi_member_risk_guard BEFORE UPDATE OR DELETE ON mfi_member_risk_flags
  FOR EACH ROW EXECUTE FUNCTION mfi_guard_member_risk_flag();
GRANT SELECT,INSERT,UPDATE ON TABLE mfi_member_risk_flags TO "{{role}}";
GRANT EXECUTE ON FUNCTION mfi_guard_member_risk_flag() TO "{{role}}";
