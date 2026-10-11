ALTER TABLE edir_loan_acceptances
  ADD COLUMN terms_snapshot jsonb,
  ADD COLUMN agreement_hash text,
  ADD CONSTRAINT edir_loan_acceptance_snapshot_check CHECK (
    (terms_snapshot IS NULL AND agreement_hash IS NULL)
    OR (jsonb_typeof(terms_snapshot)='object' AND agreement_hash ~ '^[0-9a-f]{64}$')
  );
GRANT SELECT,INSERT ON TABLE edir_loan_acceptances TO "{{role}}";
