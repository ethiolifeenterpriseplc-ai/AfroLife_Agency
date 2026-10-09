# Local platform validation — 8 October 2026

Environment: isolated PostgreSQL database on `127.0.0.1:5433`, local API on
`127.0.0.1:3000`, synthetic QA users only. The SACCO end-to-end helper refuses
non-local API and fixture-database hosts. No production or shared customer data
was used.

## Results

- **TypeScript build:** passed with `npm run build`.
- **Unit suite:** 49/49 passed with `npm run test:unit`, including credit policy
  validation, explainable score calculations, exact-cent schedule allocation,
  phone, rent, refunds, security, runtime policy, MFA, and CSV checks.
- **Existing platform integration suite:** 37/37 passed with
  `npm run test:integration` against isolated local data.
- **SACCO/MFI end-to-end journey:** passed with
  `npm run test:mfi:e2e:local`. It covers member onboarding/review/suspension and
  reactivation; approved credit-policy setup; credit affordability scoring and
  role-based privacy of income/factors; independent credit approval; cash-limited
  disbursement; exact-cent installment schedule; savings deposit idempotency;
  withdrawal reversal; repayment reversal and schedule recalculation; policy-band
  DPD rejection; independent NPL proposal and approval; collections case,
  promise-to-pay, and closure; overpayment rejection; balanced journals; audit;
  role authorization; and institution isolation.
- **Browser UI smoke:** passed in headless Chrome with policy, member, loan
  affordability, collections, NPL, and staff views; no horizontal overflow at
  390, 768, or 1440 CSS pixels and no browser console/runtime errors.
- **Migrations:** applied through `025_mfi_existing_loan_schedules.sql` to the
  isolated local database. The schedule migration backfills old disbursed pilot
  loans from their principal and term and does not rewrite posted ledger events.

The test runs create synthetic institution, member, staff membership, credit
policy, schedule, collection, risk-classification, and journal data in the local
QA database. Keep that database separate from any real institution data.

## Implemented SACCO workflows

- Member registration, independent activation review, suspend/reactivate, and
  closure blocked while savings, share, or loan balances remain.
- Versioned credit and delinquency policy submitted by a maker and activated by
  a different institution administrator.
- Loan application captures purpose and declared monthly income, expenses, and
  other debt; score factors and policy version are retained for review.
- Tellers cannot view the application income or detailed score factors.
- Principal-only monthly installments are generated with exact cent allocation;
  repayments and reversals recalculate the schedule from posted journal activity.
- Collection records support assigned ownership, contact notes, promises,
  next action dates, and manager-reviewed closure. A promise is not treated as a
  payment; financial repayments still post through the ledger workflow.
- Risk classifications use institution-configured DPD bands and require a
  proposal plus a different reviewer. Loan originators and disbursers cannot
  approve a risk-grade proposal.

## Not established by these local checks

No production backup/restore rehearsal, independent penetration or RLS review,
deployed ingress/proxy verification, physical Android test, screen-reader audit,
fluent-speaker policy review, or legal/privacy/regulatory approval was performed.
This is not authorization to accept public deposits or use interest-bearing
products.

The SACCO build remains principal-only. Product pricing and publication, interest
and fee accruals, member offer acceptance, collateral/CRB integration, automated
collection routing, cure-period logic, provisions, restructures, write-offs,
post-write-off recovery, AML/CFT, and regulatory reporting remain future work.
Policy values must be approved by the specific institution and checked for its
license and jurisdiction before use.
