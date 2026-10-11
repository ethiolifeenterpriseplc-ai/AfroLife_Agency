-- Remove the exact duplicate legacy constraint observed on the isolated UAT DB.
-- Refuse to drop it if an installation reused the name for another rule.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definition
  FROM pg_constraint
  WHERE conrelid='edir_loans'::regclass AND conname='edir_loans_check1' AND contype='c';
  IF definition IS NOT NULL THEN
    IF definition NOT ILIKE '%status%' OR definition NOT ILIKE '%repaid%'
       OR definition ILIKE '%written_off%' THEN
      RAISE EXCEPTION 'Unexpected edir_loans_check1 definition; refusing to remove it';
    END IF;
    ALTER TABLE edir_loans DROP CONSTRAINT edir_loans_check1;
  END IF;
END $$;
GRANT SELECT ON TABLE edir_loans TO "{{role}}";
