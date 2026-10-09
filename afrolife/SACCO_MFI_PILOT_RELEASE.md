# AfroLife SACCO/MFI pilot release candidate

Release candidate: `2026-10-08-rc2` (local extended-workflow validation)

This candidate includes the institution-scoped SACCO/MFI workspace, API, and
schema through migration `025_mfi_existing_loan_schedules.sql`, alongside the
AfroLife web app and operations workflows. It is prepared for a controlled,
supervised pilot after deployment gates are completed. It has not been published
to a public host.

## Included scope

- Institution registration and separate institution staff memberships.
- Member registration, separate-person onboarding review, and audited suspend,
  reactivate, and closure controls. Closure is blocked while financial balances
  remain open.
- Ordinary savings and share accounts, deposits, withdrawals, minimum-balance
  controls, balanced journals, and authorized reversals.
- Versioned credit and delinquency policy with independent submission and
  approval, configurable score weights and thresholds, and score explanations.
- Loan applications with stated purpose and affordability evidence,
  privacy-aware score visibility, independent underwriting, cash-constrained
  disbursement, and a cent-balanced principal-only installment schedule.
- Reversal-aware installment allocation, collection cases, contact notes,
  promises-to-pay, follow-up scheduling, and independent case closure.
- Configurable days-past-due bands and independently approved risk
  classifications. Older disbursed pilot loans receive schedule backfill
  without changing posted journals.
- Institution-isolated row-level security, idempotent transaction posting,
  append-only audit/journal records, and role authorization.
- Existing AfroLife agency, marketplace, contract, rent, workforce, and admin
  operations remain available through their existing permission boundaries.

## Pilot boundary

This remains a supervised principal-only pilot, not production-ready regulated
banking software. It generates principal-only installments and configurable
delinquency classes, but it does not calculate or post interest, fees,
provisions, accruals, write-offs, restructures, or post-write-off recoveries. It
also lacks document-backed member KYC, AML/CFT screening, external credit
reference checks, collateral and guarantor administration, member offer
acceptance, regulatory and Sharia compliance decisions, deposit insurance,
treasury and settlement, reconciliation imports, multi-currency, and formal
period close/reopen controls. Do not accept public deposits or originate
interest-bearing credit based on this candidate.

Credit scores and delinquency day bands are institution-configured and
versioned. No rate, fee, provisioning percentage, affordability limit, or
regulatory threshold is silently presumed. Qualified institution owners must
approve values and confirm applicability before using this workflow.

Before a supervised pilot, the institution must establish its licensing,
accounting policy, member disclosures, operating procedures, dispute process,
security ownership, and independent financial validation. Posted transactions
are corrected through authorized reversal workflows; do not edit ledger facts
directly.

## Local candidate verification

- TypeScript build: passed.
- Unit suite: 49 tests passed, including credit policy validation, scorecard
  calculation, schedule rounding, security, and runtime configuration.
- Existing platform integration suite: 37 tests passed against isolated local
  data.
- SACCO API journey: passed member lifecycle, policy maker-checker, affordability
  scoring, role-based personal and financial data visibility, schedules, reversals, NPL
  classification, collections, balanced journals, and tenant isolation.
- Browser UI smoke: passed member, credit policy, affordability, collections,
  NPL, and staff screens with mobile/tablet/desktop overflow checks.
- Migrations through `025_mfi_existing_loan_schedules.sql`: applied to the
  isolated local database.

This is local development evidence, not production acceptance. No production
restore rehearsal, independent security review, regulatory/legal review,
physical-device release test, or public deployment was performed.

## Deployment sequence

1. Provision a supported host, trusted HTTPS ingress, restricted database
   runtime account, separate migration owner, durable private files, encrypted
   backups, monitoring, and incident contacts.
2. Configure production secrets and apply migrations through
   `025_mfi_existing_loan_schedules.sql` to staging before production.
3. Run integration scenarios against disposable staging data, verify
   institution isolation and maker-checker controls using the restricted runtime
   role, and rehearse database plus private-file recovery.
4. Complete privacy, retention, licensing, legal, financial, and independent
   security reviews. Establish account recovery before accepting real users or
   financial activity.
5. Deploy behind trusted HTTPS. Publish a signed Android release only after
   protected signing credentials and physical-device checks are complete.
