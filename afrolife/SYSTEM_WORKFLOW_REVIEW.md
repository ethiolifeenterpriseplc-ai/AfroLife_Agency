# System workflow review

Reviewed 8 October 2026 against the current application routes, database migrations,
browser flows, and local test harness. This is a source and local-environment review;
it is not a legal, regulatory, penetration, accessibility, or production operations
certification.

## Highest-priority correction made

SACCO journal reversals previously acquired the institution cash-account lock before
locking the associated loan. Repayments and disbursements lock the loan before cash.
Concurrent actions could therefore form a database lock cycle, abort one request,
and surface as a generic server error. Reversal now locks the loan before cash and
checks cash and savings minimum-balance constraints after obtaining the cash lock.
The local SACCO journey now also reverses a partial loan repayment and checks that
the principal balance returns to zero before completing repayment.

## Workflow and control review

| Area | Reviewed path and controls | Remaining operational/product decision |
| --- | --- | --- |
| Registration and identity | Signup, phone normalization, KYC document storage, compliance review, activation, rate limits, password change, optional MFA | Approve retention/deletion periods, document access review, and language for consent and identity notices before real KYC data |
| Leads and contracts | Lead creation, fee snapshot, KYC, approval, party-signed then company-countersigned documents, payment, separate reconciliation, activation, commission, cancellation and renewal | Decide treatment of expired invoices and contract amendments; finance must reconcile real receipts outside the synthetic journey |
| Agent commissions | Qualification, independent finance approval, Super Admin payment, append-only ledger, audit and notification | Confirm payment-reference uniqueness and finance reconciliation/reporting requirements |
| Workers and matching | Worker records, private documents, compliance review/verification, requests, matching, response/release | Define stale-request expiry, matching SLA, dispute ownership and workforce/privacy retention policy |
| Property and rentals | Listing plan gates, private media, units, tenants, lease schedules, rent posting, reconciliation, voids, deposits and refunds | Confirm legal tenancy templates, local-calendar/payment rules, and approved refund/fee policy in target markets |
| SACCO/MFI | Institution isolation, audited member lifecycle, idempotent savings, versioned maker-checker credit rules, explainable affordability score, principal schedule, role-based score privacy, reversal-aware collection allocation, promise-to-pay cases, configurable DPD classification, and four-eyes NPL decisions | Keep principal-only until product pricing, KYC/AML, consumer disclosures, provisions/write-off, payment reconciliation, and regulatory review are approved |
| Notifications and operations | Transactional outbox, signed webhook, retry of pending/stale events, disputes, maintenance and read state | Set retry/dead-letter alerting, delivery ownership, escalation SLAs and runbook for webhook outages |
| Browser/mobile | SACCO responsive smoke at 390/768/1440 CSS px, core forms and console errors | Screen-reader/keyboard audit, physical-device Android test, poor-network/offline behavior, and fluent-speaker review remain necessary |

## Process-level findings

- Money posting is represented by append-only journal events; corrections use a
  reversal event and require a different actor for SACCO reversals. Ledger entries
  are balanced by database constraints at commit.
- Most long-lived business decisions use explicit states and reject stale
  transitions. Contract payment recording requires an exact invoice amount; rent
  and SACCO reversals use separate workflows.
- Tenant-scoped tables use PostgreSQL row-level policies. Route checks add role
  restrictions, and local SACCO coverage checks cross-institution access at both
  API and role levels.
- Uploads are type-sniffed and stored privately; download routes first authorize
  the metadata row through user-scoped database access.
- The local test suite does not prove production reverse-proxy configuration,
  back-up restoration, retention compliance, accessibility, localized policy
  wording, payment processor behavior, or live webhook delivery.
- SACCO lending remains principal-only. Installment schedules and policy-driven
  DPD classifications are implemented, but interest, fees, accruals, provisions,
  write-offs, restructures, AML monitoring, and regulatory returns are not.
- Credit applications capture purpose and declared monthly income/expenses/debt.
  The configurable score is a transparent decision aid, not a credit-bureau or
  collateral assessment. Teller responses omit sensitive income and factor data.
- NPL grade changes require an independent proposal and decision. Write-off is
  intentionally absent until its approval policy and accounting entries exist.
- SACCO services are presented as service areas with workflow submodules and
  owner/readiness labels. Institution administration, product setup, staff-role
  administration, and credit-policy configuration are restricted to institution
  administrators; API checks deny non-admin staff listing and policy edits.
- Savings and share accounts still provide basic open/deposit/withdraw services;
  term products, holds, interest, dividends, and configurable product publication
  are not yet live.

## Recommended next work, in order

The complete service-by-service rollout register is in
`SACCO_SERVICE_ROLLOUT.md`. The catalog must retain Pilot/Partial/Planned
states until each service passes its promotion gates; activating every label
without the underlying workflows would misrepresent the product.

1. Run migration-upgrade and restore rehearsals against a disposable staging copy;
   retain schema and restore evidence with the release.
2. Obtain legal/privacy approval for consent, KYC retention/deletion, tenancy,
   refunds, and each SACCO market before accepting real customer records.
3. Define and test operational alert thresholds for old pending KYC, unreconciled
   payments, overdue rent, failed webhooks, and unresolved disputes.
4. Perform independent authorization/RLS review with the actual production runtime
   database role and deployed ingress settings.
5. Complete keyboard/screen-reader and physical Android checks, poor-network
   recovery, and fluent-speaker review of money, consent, coverage, and security
   language.
6. Before enabling interest, fees, provisioning, restructures, or write-offs,
   approve accounting and disclosure policy, implement immutable ledger postings,
   and add independent end-to-end scenarios for reversals and month-end reporting.

## Local verification

The preceding local validation record is in `LOCAL_VALIDATION_2026-10-08.md`.
The extended SACCO journey now covers policy maker-checker, financial-data
privacy by role, member suspension/reactivation, schedule cents, repayment
reversal, DPD threshold rejection, independent NPL decision, and collection
resolution. Local build, unit, integration, SACCO API, and browser checks passed
for the extended workflow revision.
