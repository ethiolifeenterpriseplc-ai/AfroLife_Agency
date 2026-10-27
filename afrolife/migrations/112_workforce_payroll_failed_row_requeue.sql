ALTER TABLE workforce_payroll_export_items
  ADD COLUMN row_number integer;

WITH numbered_items AS (
  SELECT i.export_id,i.time_entry_id,
    row_number() OVER (PARTITION BY i.export_id ORDER BY s.starts_at,t.id)::integer AS row_number
  FROM workforce_payroll_export_items i
  JOIN workforce_time_entries t ON t.id=i.time_entry_id
  JOIN workforce_shifts s ON s.id=t.shift_id
)
UPDATE workforce_payroll_export_items i
SET row_number=numbered_items.row_number
FROM numbered_items
WHERE numbered_items.export_id=i.export_id
  AND numbered_items.time_entry_id=i.time_entry_id;

ALTER TABLE workforce_payroll_export_items
  ALTER COLUMN row_number SET NOT NULL,
  ADD CONSTRAINT workforce_payroll_export_items_row_number_positive CHECK (row_number > 0),
  DROP CONSTRAINT workforce_payroll_export_items_time_entry_id_key;

CREATE UNIQUE INDEX workforce_payroll_export_items_row_number_idx
  ON workforce_payroll_export_items(export_id,row_number);

CREATE TABLE workforce_payroll_export_requeues (
  source_export_id uuid NOT NULL REFERENCES workforce_payroll_exports(id),
  retry_export_id uuid NOT NULL UNIQUE REFERENCES workforce_payroll_exports(id),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  failed_row_numbers integer[] NOT NULL CHECK (cardinality(failed_row_numbers) BETWEEN 1 AND 2000),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  external_reference text CHECK (external_reference IS NULL OR length(trim(external_reference)) BETWEEN 3 AND 160),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_export_id,idempotency_key),
  CHECK (source_export_id <> retry_export_id)
);

CREATE INDEX workforce_payroll_export_requeues_source_idx
  ON workforce_payroll_export_requeues(source_export_id,created_at);

CREATE TABLE workforce_payroll_export_requeue_rows (
  source_export_id uuid NOT NULL,
  row_number integer NOT NULL,
  retry_export_id uuid NOT NULL REFERENCES workforce_payroll_exports(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_export_id,row_number),
  UNIQUE (retry_export_id,row_number),
  FOREIGN KEY (source_export_id,row_number)
    REFERENCES workforce_payroll_export_items(export_id,row_number)
);

CREATE INDEX workforce_payroll_export_requeue_rows_retry_idx
  ON workforce_payroll_export_requeue_rows(retry_export_id);

CREATE OR REPLACE FUNCTION validate_workforce_payroll_requeue_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM workforce_payroll_export_requeues requeue
    WHERE requeue.source_export_id=NEW.source_export_id
      AND requeue.retry_export_id=NEW.retry_export_id
      AND NEW.row_number=ANY(requeue.failed_row_numbers)
  ) THEN
    RAISE EXCEPTION 'Payroll retry row is not part of the recorded failed-row selection'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workforce_payroll_export_requeue_rows_validate
  BEFORE INSERT ON workforce_payroll_export_requeue_rows
  FOR EACH ROW EXECUTE FUNCTION validate_workforce_payroll_requeue_row();

CREATE OR REPLACE FUNCTION validate_workforce_payroll_requeue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE matching_rows integer;
        source_status text;
BEGIN
  SELECT status INTO source_status
    FROM workforce_payroll_exports
    WHERE id=NEW.source_export_id;
  IF source_status IS NULL OR source_status NOT IN ('handoff_failed','handed_off') THEN
    RAISE EXCEPTION 'Only an export with recorded handoff status can be requeued'
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO matching_rows
    FROM workforce_payroll_export_items
    WHERE export_id=NEW.source_export_id
      AND row_number=ANY(NEW.failed_row_numbers);
  IF matching_rows <> cardinality(NEW.failed_row_numbers)
     OR matching_rows <> (SELECT count(DISTINCT value) FROM unnest(NEW.failed_row_numbers) AS nums(value)) THEN
    RAISE EXCEPTION 'Requeue rows must be unique rows in the source payroll export'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workforce_payroll_export_requeues_validate
  BEFORE INSERT ON workforce_payroll_export_requeues
  FOR EACH ROW EXECUTE FUNCTION validate_workforce_payroll_requeue();

CREATE OR REPLACE FUNCTION validate_workforce_payroll_export_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Payroll export rows are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM workforce_payroll_export_items existing
    WHERE existing.time_entry_id=NEW.time_entry_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM workforce_payroll_export_requeues requeue
    JOIN workforce_payroll_export_requeue_rows requeue_row
      ON requeue_row.source_export_id=requeue.source_export_id
      AND requeue_row.retry_export_id=requeue.retry_export_id
    JOIN workforce_payroll_export_items source_item
      ON source_item.export_id=requeue_row.source_export_id
      AND source_item.row_number=requeue_row.row_number
    WHERE requeue.retry_export_id=NEW.export_id
      AND source_item.time_entry_id=NEW.time_entry_id
  ) THEN
    RAISE EXCEPTION 'Previously exported time can only be reissued for explicitly failed rows'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workforce_payroll_export_items_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON workforce_payroll_export_items
  FOR EACH ROW EXECUTE FUNCTION validate_workforce_payroll_export_item();

CREATE OR REPLACE FUNCTION verify_workforce_payroll_requeue_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE retry_rows integer;
        matching_rows integer;
        recorded_rows integer;
BEGIN
  SELECT count(*) INTO recorded_rows
    FROM workforce_payroll_export_requeue_rows
    WHERE source_export_id=NEW.source_export_id
      AND retry_export_id=NEW.retry_export_id;
  SELECT count(*) INTO retry_rows
    FROM workforce_payroll_export_items
    WHERE export_id=NEW.retry_export_id;
  SELECT count(*) INTO matching_rows
    FROM workforce_payroll_export_items retry_item
    JOIN workforce_payroll_export_requeue_rows requeue_row
      ON requeue_row.retry_export_id=retry_item.export_id
      AND requeue_row.source_export_id=NEW.source_export_id
    JOIN workforce_payroll_export_items source_item
      ON source_item.export_id=requeue_row.source_export_id
      AND source_item.row_number=requeue_row.row_number
      AND source_item.time_entry_id=retry_item.time_entry_id
    WHERE retry_item.export_id=NEW.retry_export_id
      AND requeue_row.row_number=ANY(NEW.failed_row_numbers);
  IF recorded_rows <> cardinality(NEW.failed_row_numbers)
     OR retry_rows <> cardinality(NEW.failed_row_numbers)
     OR matching_rows <> cardinality(NEW.failed_row_numbers) THEN
    RAISE EXCEPTION 'Payroll retry export must contain exactly the explicitly failed source rows'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER workforce_payroll_export_requeues_complete
  AFTER INSERT ON workforce_payroll_export_requeues
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_workforce_payroll_requeue_items();

CREATE OR REPLACE FUNCTION prevent_workforce_payroll_requeue_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Payroll failed-row requeue evidence is append-only'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER workforce_payroll_export_requeues_immutable
  BEFORE UPDATE OR DELETE ON workforce_payroll_export_requeues
  FOR EACH ROW EXECUTE FUNCTION prevent_workforce_payroll_requeue_mutation();

CREATE TRIGGER workforce_payroll_export_requeue_rows_immutable
  BEFORE UPDATE OR DELETE ON workforce_payroll_export_requeue_rows
  FOR EACH ROW EXECUTE FUNCTION prevent_workforce_payroll_requeue_mutation();

ALTER TABLE workforce_payroll_export_requeues ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_payroll_export_requeues FORCE ROW LEVEL SECURITY;
ALTER TABLE workforce_payroll_export_requeue_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_payroll_export_requeue_rows FORCE ROW LEVEL SECURITY;

CREATE POLICY workforce_payroll_export_requeues_manager_read
  ON workforce_payroll_export_requeues FOR SELECT
  USING (app_has_permission('workforce.payroll.export'));

CREATE POLICY workforce_payroll_export_requeues_manager_insert
  ON workforce_payroll_export_requeues FOR INSERT
  WITH CHECK (app_has_permission('workforce.payroll.export') AND actor_id=app_user_id());

CREATE POLICY workforce_payroll_export_requeue_rows_manager_read
  ON workforce_payroll_export_requeue_rows FOR SELECT
  USING (app_has_permission('workforce.payroll.export'));

CREATE POLICY workforce_payroll_export_requeue_rows_manager_insert
  ON workforce_payroll_export_requeue_rows FOR INSERT
  WITH CHECK (app_has_permission('workforce.payroll.export'));

GRANT SELECT,INSERT ON workforce_payroll_export_requeues TO "{{role}}";
GRANT SELECT,INSERT ON workforce_payroll_export_requeue_rows TO "{{role}}";
REVOKE ALL ON FUNCTION validate_workforce_payroll_requeue() FROM PUBLIC;
REVOKE ALL ON FUNCTION validate_workforce_payroll_export_item() FROM PUBLIC;
REVOKE ALL ON FUNCTION verify_workforce_payroll_requeue_items() FROM PUBLIC;
REVOKE ALL ON FUNCTION prevent_workforce_payroll_requeue_mutation() FROM PUBLIC;
