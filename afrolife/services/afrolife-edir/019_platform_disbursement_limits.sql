CREATE TABLE edir_platform_disbursement_limit_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version>0),
  daily_limit numeric(14,2) CHECK (daily_limit IS NULL OR daily_limit>0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','superseded','rejected')),
  change_reason text NOT NULL CHECK (length(trim(change_reason)) BETWEEN 10 AND 1000),
  created_by uuid NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
    OR (status<>'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 10 AND 1000)
  ),
  CHECK (reviewed_by IS NULL OR reviewed_by<>created_by)
);
CREATE UNIQUE INDEX edir_platform_disbursement_limit_one_pending_idx
  ON edir_platform_disbursement_limit_versions((true)) WHERE status='pending';
CREATE UNIQUE INDEX edir_platform_disbursement_limit_one_active_idx
  ON edir_platform_disbursement_limit_versions((true)) WHERE status='active';
ALTER TABLE edir_platform_disbursement_limit_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY edir_platform_disbursement_limit_admin ON edir_platform_disbursement_limit_versions
  FOR ALL USING (edir_is_platform_admin()) WITH CHECK (edir_is_platform_admin());

CREATE FUNCTION edir_guard_platform_disbursement_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Platform disbursement limit history cannot be deleted';
  END IF;
  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_reason') <>
     (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_reason') THEN
    RAISE EXCEPTION 'Platform disbursement limit terms and authorship are immutable';
  END IF;
  IF OLD.status='pending' AND NEW.status IN ('active','rejected') THEN
    IF NEW.reviewed_by IS DISTINCT FROM app_user_id() OR NEW.reviewed_by=OLD.created_by
       OR NEW.reviewed_at IS NULL OR NEW.review_reason IS NULL
       OR length(trim(NEW.review_reason)) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'Platform limit decision requires an independent reviewer and reason';
    END IF;
  ELSIF OLD.status='active' AND NEW.status='superseded' THEN
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.review_reason IS DISTINCT FROM OLD.review_reason THEN
      RAISE EXCEPTION 'Platform disbursement limit review evidence is immutable';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid platform disbursement limit transition';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER edir_platform_disbursement_limit_guard
  BEFORE UPDATE OR DELETE ON edir_platform_disbursement_limit_versions
  FOR EACH ROW EXECUTE FUNCTION edir_guard_platform_disbursement_limit();

GRANT SELECT,INSERT,UPDATE ON TABLE edir_platform_disbursement_limit_versions TO "{{role}}";
GRANT EXECUTE ON FUNCTION edir_guard_platform_disbursement_limit() TO "{{role}}";
