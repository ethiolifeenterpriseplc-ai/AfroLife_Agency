CREATE TABLE property_rental_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  unit_id uuid REFERENCES property_units(id),
  applicant_user_id uuid NOT NULL REFERENCES users(id),
  applicant_message text NOT NULL CHECK (length(trim(applicant_message)) BETWEEN 10 AND 2000),
  applicant_response text CHECK (applicant_response IS NULL OR length(trim(applicant_response)) BETWEEN 10 AND 2000),
  contact_consent boolean NOT NULL CHECK (contact_consent),
  idempotency_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','needs_info','accepted','rejected')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_reason text CHECK (review_reason IS NULL OR length(trim(review_reason)) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CHECK (reviewed_by IS NULL OR reviewed_by <> applicant_user_id),
  CHECK (status NOT IN ('needs_info','accepted','rejected') OR
    (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL))
);

CREATE UNIQUE INDEX property_rental_applications_idempotency_idx
  ON property_rental_applications(applicant_user_id,idempotency_key);
CREATE UNIQUE INDEX property_rental_applications_one_open_idx
  ON property_rental_applications(applicant_user_id,property_id)
  WHERE status IN ('submitted','needs_info');
CREATE INDEX property_rental_applications_property_queue_idx
  ON property_rental_applications(property_id,status,created_at DESC);
CREATE INDEX property_rental_applications_applicant_idx
  ON property_rental_applications(applicant_user_id,created_at DESC);

CREATE TABLE property_rental_application_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES property_rental_applications(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('submitted','needs_info','responded','accepted','rejected')),
  from_status text CHECK (from_status IS NULL OR from_status IN ('submitted','needs_info','accepted','rejected')),
  to_status text NOT NULL CHECK (to_status IN ('submitted','needs_info','accepted','rejected')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_rental_application_events_history_idx
  ON property_rental_application_events(application_id,created_at,id);

CREATE OR REPLACE FUNCTION app_can_manage_rental_application(target_property uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id=target_property
      AND (
        p.owner_user_id=app_user_id()
        OR app_can_access_agent(p.source_agent_id)
        OR app_role() IN ('global_admin','super_admin','corporate_business_manager')
      )
  )
$$;

CREATE OR REPLACE FUNCTION guard_property_rental_application()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor uuid := app_user_id();
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.applicant_user_id IS DISTINCT FROM actor OR app_role()<>'customer'
      OR NEW.status<>'submitted' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
      OR NEW.review_reason IS NOT NULL OR NEW.applicant_response IS NOT NULL THEN
      RAISE EXCEPTION 'Rental applications must be submitted by the customer in the submitted state'
        USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_reason'-'applicant_response'-'updated_at')
     <> (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_reason'-'applicant_response'-'updated_at') THEN
    RAISE EXCEPTION 'Rental application identity and submitted details are immutable'
      USING ERRCODE='42501';
  END IF;

  IF OLD.status IN ('submitted','needs_info')
    AND NEW.status IN ('needs_info','accepted','rejected')
    AND NEW.status<>OLD.status THEN
    IF actor IS NULL OR actor=OLD.applicant_user_id
      OR NOT app_can_manage_rental_application(OLD.property_id)
      OR NEW.reviewed_by IS DISTINCT FROM actor OR NEW.reviewed_at IS NULL
      OR NEW.review_reason IS NULL THEN
      RAISE EXCEPTION 'Only an authorized independent property reviewer may decide an application'
        USING ERRCODE='42501';
    END IF;
    IF NEW.status IN ('needs_info','rejected') AND length(trim(NEW.review_reason))<10 THEN
      RAISE EXCEPTION 'A reason is required for an adverse rental application decision'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status='needs_info' AND NEW.status='submitted'
    AND actor=OLD.applicant_user_id
    AND NEW.reviewed_by IS NOT DISTINCT FROM OLD.reviewed_by
    AND NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at
    AND NEW.review_reason IS NOT DISTINCT FROM OLD.review_reason
    AND NEW.applicant_response IS NOT NULL
    AND length(trim(NEW.applicant_response))>=10 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Rental application transition is not permitted'
    USING ERRCODE='42501';
END;
$$;

CREATE TRIGGER property_rental_application_guard
  BEFORE INSERT OR UPDATE ON property_rental_applications
  FOR EACH ROW EXECUTE FUNCTION guard_property_rental_application();

CREATE OR REPLACE FUNCTION prevent_property_rental_application_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Rental application history is append-only'
    USING ERRCODE='42501';
END;
$$;
CREATE TRIGGER property_rental_application_events_immutable
  BEFORE UPDATE OR DELETE ON property_rental_application_events
  FOR EACH ROW EXECUTE FUNCTION prevent_property_rental_application_event_mutation();

ALTER TABLE property_rental_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_rental_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY property_rental_applications_read
  ON property_rental_applications FOR SELECT
  USING (applicant_user_id=app_user_id() OR app_can_manage_rental_application(property_id));
CREATE POLICY property_rental_applications_create
  ON property_rental_applications FOR INSERT
  WITH CHECK (
    applicant_user_id=app_user_id() AND app_role()='customer'
    AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id=property_id AND p.status='available'
        AND p.listing_review_status='approved' AND p.listing_mode IN ('rent','sale_or_rent')
    )
    AND (unit_id IS NULL OR EXISTS (
      SELECT 1 FROM property_units u
      WHERE u.id=unit_id AND u.property_id=property_id AND u.occupancy='vacant'
    ))
    AND (unit_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM property_units u
      WHERE u.property_id=property_id
    ))
  );
CREATE POLICY property_rental_applications_update
  ON property_rental_applications FOR UPDATE
  USING (applicant_user_id=app_user_id() OR app_can_manage_rental_application(property_id))
  WITH CHECK (applicant_user_id=app_user_id() OR app_can_manage_rental_application(property_id));

ALTER TABLE property_rental_application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_rental_application_events FORCE ROW LEVEL SECURITY;
CREATE POLICY property_rental_application_events_read
  ON property_rental_application_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM property_rental_applications a
    WHERE a.id=application_id
      AND (a.applicant_user_id=app_user_id() OR app_can_manage_rental_application(a.property_id))
  ));
CREATE POLICY property_rental_application_events_insert
  ON property_rental_application_events FOR INSERT
  WITH CHECK (
    actor_id=app_user_id()
    AND EXISTS (
      SELECT 1 FROM property_rental_applications a
      WHERE a.id=application_id
        AND (
          a.applicant_user_id=app_user_id()
          OR app_can_manage_rental_application(a.property_id)
        )
    )
  );

GRANT SELECT,INSERT,UPDATE ON property_rental_applications TO "{{role}}";
GRANT SELECT,INSERT ON property_rental_application_events TO "{{role}}";
GRANT USAGE,SELECT ON SEQUENCE property_rental_application_events_id_seq TO "{{role}}";
