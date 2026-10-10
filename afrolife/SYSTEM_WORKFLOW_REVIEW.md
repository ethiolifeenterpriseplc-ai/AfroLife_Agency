# System workflow review

## Cross-role journey and service review — 10 October 2026

This update reviews the live source workflows for agents, sellers, property owners,
corporate business managers, compliance and finance staff, workers, buyers, and
tenants. It records current behavior and the next process improvements; it does
not certify legal compliance, production readiness, accessibility, or the
correctness of a live deployment.

### Role journeys and access boundaries

| User / owner | Current journey and access | Process gap to close |
| --- | --- | --- |
| Field and master agents | Create scoped leads and worker records, upload worker documents, submit contracts, list property and marketplace inventory, manage scoped rentals/maintenance, and view team data according to role/plan | Give agents a single work queue with aging, next action, due date, and owner across leads, KYC, contracts, disputes, and rent; expose blockers before submission |
| Corporate business manager | Configure marketplace domains and categories, create listings for sellers, manage property inventory, and review marketplace submissions | Add a clear review queue and status history, measurable SLA, and change request checklist; distinguish own submissions from independent reviews |
| Property owner / seller | Register, upload signup KYC, manage own listings/media and property units, and view rent statements | Owners cannot register tenants, create leases, or manage rent; define whether this is intentionally agent-managed or add owner-authorized tenancy actions with maker/checker controls |
| Compliance | Review signup and worker documents, verify workers, review KYC, and handle privacy and dispute work within authorized scope | Add a unified document queue with missing/expired/duplicate states, reason codes, re-upload loop, and aging/escalation |
| Finance / finance manager | Record and reconcile contract and rent payments, approve commissions, view finance reports; finance manager has additional rent reconciliation controls | Add exception lists and aging/exportable reconciliation evidence; keep recorder/reconciler separation and make duplicate references easy to resolve |
| Super Admin / Global Admin | Super Admin operates most operational workflows; Global Admin has explicit platform configuration, audit, and selected privacy access | Publish a route-by-route role matrix. Do not assume Global Admin is a Super Admin substitute: many operational endpoints explicitly accept only `super_admin`, while others include `global_admin` or check platform-admin status |
| Worker | Worker account can be registered and KYC-reviewed; staff records availability and compliance state; verified eligible workers can be proposed and reserved | No worker self-service portal for profile correction, consent, document renewal, availability, match response, or dispute/reporting. Capture willingness and terms before reservation under the current staff-operated process |
| Buyer / customer | Register and complete configured KYC; browse available property inventory and published marketplace listings | No inquiry, viewing request, saved search, shortlist, application, offer, or buyer-facing recommendation workflow. Avoid implying these exist in marketing copy |
| Tenant | Tenant contact is recorded by an agent; a lease creates a rent schedule; staff record and reconcile receipts; tenant is shown in agent workflows | No tenant account, lease document upload/signing, payment confirmation, maintenance self-service, receipt portal, or notice workflow |

Access is enforced through route role checks and user-scoped PostgreSQL access;
these layers must be reviewed together. A role hidden from a browser tab is not
an authorization control. In particular, test direct API access and RLS for every
new workflow and every role change, including Global Admin, Corporate Business
Manager, property owner, buyer, and tenant.

### Document and evidence lifecycle

The current upload path accepts private PDF/JPEG/PNG files for worker and signup
KYC documents and signed contracts, plus private property/listing photos and
videos. Worker document metadata includes type, status, reviewer, and optional
expiry. Worker verification checks verified, unexpired identity and police
clearance documents; candidate ranking also applies configured reference and
certificate requirements. Contract stages distinguish party-signed and
company-countersigned files. File type is checked from file bytes, uploads are
hashed, and authorized downloads are audited for worker documents.

**Implemented in this update:** compliance rejection of worker and signup identity
documents requires a reason of at least 10 characters. The review reason is stored
with the document and shown in the review UI and applicant follow-up; audit events
record the decision without copying the reason into audit metadata. Applicants can
replace a rejected signup document from the same browser session while the upload
token remains valid. Worker document history exposes reviewer feedback so the
responsible agent can upload a correction. Migration
`041_document_review_feedback.sql` is applied to the local database. The applicant
replacement token expires after 24 hours; expired-token recovery is still needed
for a complete long-running application journey.

There is no OCR or automatic field extraction, no source-to-extracted-value
record, no extracted-data correction/approval flow, and no general document
requirement matrix for property title/authority, seller authority, tenant/lease,
or listing evidence. Signup KYC is configurable by account type, but worker
eligibility and contract evidence have their own fixed workflow rules. Therefore
the system must not describe uploaded documents as extracted or validated beyond
the checks actually performed.

Recommended document journey before expanding real-data use:

1. Show the required document list, purpose, accepted formats, size, and whether
   expiry is required before the user starts each upload.
2. Show per-document states (`missing`, `uploaded`, `under review`, `verified`,
   `rejected`, `expired`) and a plain-language next action. Include rejection
   reason, reviewer and decision time, and a safe replacement flow.
3. If OCR is approved and implemented, retain the original separately from
   extracted candidates; display field-level confidence and source page, require
   human confirmation for identity, ownership, dates, and money, and record
   corrections and reviewer identity. OCR output must never itself activate an
   account, verify a person, establish property ownership, or approve a contract.
4. Define a market-specific checklist for title/owner authority, listing
   authorization, lease/tenant identity, contract signatures, and any locally
   required evidence. Keep requirements configurable and versioned; do not
   collect extra sensitive data without a stated purpose and retention rule.
5. Add expiry reminders and a renewal hold for documents that control worker
   eligibility. Define access, retention, deletion, legal hold, and incident
   response before collecting real identity/title documents.

### Matching, recommendations, and reports

Worker ranking is explainable and staff-mediated: it filters by sector,
verification, availability, current required documents, and prior proposals,
then scores skills, territory, availability, experience, rate, and language.
Staff propose a candidate; acceptance rechecks eligibility and reserves the
worker. This is a recommendation, not an automatic hiring or placement decision.
The journey should additionally capture worker consent/willingness, customer
confirmation, offer/terms, reservation timeout, placement outcome, and reason
for decline/release before treating a match as a completed service.

Property and marketplace discovery currently consists of available/published
catalog browsing and listing media. There is no buyer preference intake or
property recommendation engine. Add buyer criteria (area, budget, property
type, dates, household needs), explain each result, let the buyer correct or
remove criteria, and keep an agent review/contact step. Do not infer sensitive
traits or rank sellers for paid placement without a disclosed policy.

Reports currently include staff summary measures for leads, contracts, ledger,
commissions, pending invoices, disputes, maintenance, overdue rent, agents and
worker verification. Enterprise portfolio reports are a separate role/plan
route. Owner statements distinguish charged, reconciled and pending rent and
explicitly disclaim payout/remittance accounting. This is useful operational
visibility, but it is not a complete business intelligence or statutory report
suite. Add named report owners, definitions, time/territory filters, export
permissions, reconciliation cut-off, data freshness, and an audit trail for
exports before reports become management or regulatory evidence.

### Priority process improvements

1. **Make work actionable:** one role-aware queue with status, next action,
   responsible person, age, due date, blocker, and escalation for KYC, listing
   review, contract signature/payment/reconciliation, match response, rent, and
   disputes. Keep direct API permissions authoritative.
2. **Close the customer journeys:** decide whether owners and tenants remain
   agent-assisted; if so, make the agent responsibility and owner/tenant
   communications explicit. Otherwise implement scoped portals, consent,
   tenancy evidence, receipt, maintenance, and dispute workflows.
3. **Finish evidence handling:** provide upload checklists and rejection/resubmit
   feedback now; scope OCR only after privacy, accuracy, human-review, and
   retention decisions. Add property/lease documents only with defined access
   and approval rules.
4. **Complete matching outcomes:** add expiry of stale requests/reservations,
   recorded consent and terms, decline reasons, placement outcome, and fairness
   monitoring. Keep scores explainable and subject to human review.
5. **Make reporting operationally reliable:** define source of truth, time zone,
   currency rounding, reconciliation states, access/export rules, and exception
   ownership for each KPI. Do not label operational summaries as audited
   financial statements.
6. **Improve form and content quality:** show required/optional labels, format
   examples, inline validation, save/retry feedback for uploads, and a review
   screen before consequential submission. Complete translations and keyboard/
   screen-reader review across all role workspaces.

These are product and operating decisions, not all code defects. The safe
current description is that the app provides staff-led workflows with scoped
records and audit trails; buyer, worker, and tenant self-service, OCR extraction,
full customer recommendations, and end-to-end reporting remain unimplemented.

The initial system review was performed 8 October 2026 against the application routes, database migrations,
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
