-- Remove only the verified duplicate pre-waiver installment constraint found
-- on the isolated UAT database. Refuse the change if the name was repurposed.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definition
  FROM pg_constraint
  WHERE conrelid='edir_loan_installments'::regclass
    AND conname='edir_loan_installments_check1' AND contype='c';
  IF definition IS NOT NULL THEN
    IF definition NOT ILIKE '%status%' OR definition NOT ILIKE '%paid%'
       OR definition ILIKE '%waived%' THEN
      RAISE EXCEPTION 'Unexpected edir_loan_installments_check1 definition; refusing to remove it';
    END IF;
    ALTER TABLE edir_loan_installments DROP CONSTRAINT edir_loan_installments_check1;
  END IF;
END $$;
GRANT SELECT ON TABLE edir_loan_installments TO "{{role}}";
