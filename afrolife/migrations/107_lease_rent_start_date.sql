ALTER TABLE leases
  ADD COLUMN rent_start_on date;

UPDATE leases
SET rent_start_on = start_date
WHERE rent_start_on IS NULL;

ALTER TABLE leases
  ALTER COLUMN rent_start_on SET NOT NULL,
  ADD CONSTRAINT leases_rent_start_within_term_check
    CHECK (rent_start_on >= start_date AND rent_start_on <= end_date);

CREATE OR REPLACE FUNCTION prevent_versioned_lease_rent_start_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rent_start_on IS DISTINCT FROM OLD.rent_start_on
    AND EXISTS (
      SELECT 1 FROM lease_versions version
      WHERE version.lease_id = OLD.id
    ) THEN
    RAISE EXCEPTION 'Versioned lease rent commencement is immutable; create an approved amendment';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER versioned_lease_rent_start_immutable
  BEFORE UPDATE ON leases
  FOR EACH ROW EXECUTE FUNCTION prevent_versioned_lease_rent_start_change();
