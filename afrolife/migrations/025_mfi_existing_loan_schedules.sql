-- Upgrade older pilot loans to principal-only schedule visibility. Never mutate
-- already-posted journal entries as part of schedule backfill.
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
