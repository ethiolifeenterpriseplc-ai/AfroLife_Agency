# AfroLife Agency Functional Specification Document — Version 11.0

> Source: user-provided read-only pasted-text snapshot. This Markdown conversion decodes HTML entities, normalizes whitespace, and preserves the source order and wording. PDF table layouts are linearized as Markdown text because the attachment is a text extraction.

# Part I — AUTHORITATIVE v9.0 IMPLEMENTATION MASTER

TABLE OF CONTENTS

0. Document Control, Change Log & Conflict Register

1. Regulatory Compliance Matrix (P0)

2. Financial Flows & Legal Responsibilities Catalogue (P0)

3. Full End-to-End User Journeys & Executable Workflows (P0)

### 3.1 Shared Journey
Grammar & State Machine

### 3.2 Journey A —
Employer / Property Owner Onboarding (E2E)

### 3.3 Journey B —
Property Listing, Rental & Lease Lifecycle (E2E)

### 3.4 Journey C —
Maintenance & Vendor Fulfilment (E2E)

### 3.5 Journey D —
Workforce, Shifts, Attendance & Payroll Hand-off (E2E)

### 3.6 Journey E —
Insurance Brokerage (Gated)

### 3.7 Journey F —
Marketplace Search, Matching & Booking (E2E)

### 3.8 Journey G — Agent
/ Super-Agent Network (E2E)

### 3.9 Journey H — Edir
Cooperative (Disabled)

### 3.10 Journey I —
Support & Complaints (E2E)

4. Governed Decision Log (P0)

5. Weighted Global Benchmark Capability Matrix (P1)

6. Data & Integration Interface Control Specifications (P1)

7. Measurable Release Gates & Delivery Plan (P1)

8. Requirement Traceability Matrix

9. Business & Financial Rules Catalogue

10. Implementation Principles & Approval

## Appendix A — Status Taxonomy & Normative Language

## Appendix B — Glossary

0. DOCUMENT CONTROL, CHANGE LOG
& CONFLICT REGISTER

### 0.1 Version Alignment

Baseline version: 9.0 (retained control layer). This version
merges the two identical v8.1 sources, preserves the full control layer, and
refines every major workflow into complete end-to-end user journeys with
actors, preconditions, steps, system effects, exceptions, notifications and
Given/When/Then acceptance tests. Prior identifiers (REG-xxx, DEC-xxx, FR-xxx,
NFR-xxx, E2E-xxx) are retained for traceability.

### 0.2 Change Log

Ver

Date

Change
Summary

Author
/ Gate

6.0

13 Oct 2026

Full
consolidated master (SRS+FSD+Tech Guide)

Baseline

7.0

Oct 2026

Enhancement:
acceptance criteria, isolation, lifecycle, API, security, release gates

Enhancement

8.0

23 Oct 2026

Research,
journeys, benchmarking, regulatory mapping

Research
layer

8.1

23 Oct 2026

Implementation
Master: closes P0/P1 gaps

Implementation
control

9.0

23 Oct 2026

Perfected
FSD: merged sources + full narrative E2E user journeys + expanded workflows
for platform perfection

FSD Synthesis

### 0.3 Conflict / Supersession
Register

Developers must not silently reconcile conflicts. Raise a
decision record. Until resolved, the higher-precedence baseline wording remains
in force.

ID

Topic

Nature
of Conflict

Resolution
Rule

CF-001

Working hours

v6.0
hard-codes Labour Proclamation limits; later versions require validation

Configurable
warnings until legal sign-off (REG-V81-003)

CF-002

10-year
retention

v6.0 applies
to e-invoices; risk of over-applying to all personal data

Per-class
retention schedule (REG-V81-001 / DEC-V8-007)

CF-003

Offline
invoicing

v6.0 requires
robust offline; later disables until approved

Feature flag
OFF until REG-V81-004 approved

CF-004

Screening

v6.0 lists
credit/eviction screening; no US-assumption for Ethiopia

Disabled
until REG-V81-011 / DEC

CF-005

Insurance
role

Brokerage
journey described; licensing undecided

Module gated;
DEC-V8-002 must close first

CF-006

Funds custody

Journeys
mention deposits/premiums; operating model undecided

Orchestration-only
default; DEC-V8-003

CF-007

Performance

v6.0: 95%
<3s; later proposes p95 ≤2.5s for critical journeys

Adopt measurable
profile NFR-V81-001

### 0.4 Status Taxonomy

Label

Meaning

MANDATORY (M)

Must-have for
release acceptance unless formally waived with risk acceptance

SHOULD (S)

Expected;
omission requires documented justification

PROPOSED

Engineering/design
recommendation; requires project approval before binding

LEGAL
VALIDATION REQUIRED

Must be
confirmed against current Ethiopian law/regulator guidance before production

DECISION
REQUIRED

Blocked until
named accountable owner records a formal decision

VENDOR/API
DEPENDENCY

Depends on
executed contract, credentials and technical specification

FEATURE-FLAGGED
OFF

Implemented
or designed but disabled in production until gate passed

1. REGULATORY COMPLIANCE MATRIX
(P0)

Every production behaviour that asserts a legal rule MUST map to
a row with APPROVED status. Until then the behaviour remains configurable or
feature-flagged OFF.

Status legend: DRAFT = research only | UNDER REVIEW = with
counsel | APPROVED = signed off for production | SUPERSEDED = replaced by later
instrument.

### 1.1 Personal Data Protection

Req
ID

Instrument

Product
Control

Evidence
Required

Owner
/ Status

REG-V81-001

Personal Data
Protection Proclamation No. 1321/2024

Data
inventory; purpose/lawful-basis register; notices; minimisation;
subject-rights; DPIA; breach playbook; processor contracts

Counsel
opinion; DPIA; DPAs; 72h notification procedure

Privacy Owner
/ LEGAL VALIDATION REQUIRED

REG-V81-002

Electronic
Transaction Proclamation No. 1205/2020

Versioned
agreement + signature evidence pack; timestamps; integrity; approved e-sign
provider only

Counsel
confirms signature type sufficiency per document class

Legal / LEGAL
VALIDATION REQUIRED

### 1.2 Labour & Employment

Req
ID

Instrument

Product
Control

Evidence
Required

Owner
/ Status

REG-V81-003

Labour
Proclamation No. 1156/2019 + amendments

Effective-dated
policy engine; warnings before hard blocks; employee vs contractor;
correction history; payroll export reconciliation

HR/Legal
sign-off of current rules; no universal hard-code of 8h/48h until validated

HR Lead /
LEGAL VALIDATION REQUIRED

### 1.3 Tax, VAT & Electronic
Invoicing

Req
ID

Instrument

Product
Control

Evidence
Required

Owner
/ Status

REG-V81-004

Electronic
Invoicing System Administration Directive (VERIFY current)

Configurable
tax rules; invoice state machine; authoritative clearance; duplicate/timeout
reconciliation; credit/debit notes

Official
directive text; taxpayer applicability; accreditation path; schema; offline
rules

Finance &
Tax / LEGAL VALIDATION REQUIRED

REG-V81-005

VAT
Proclamation No. 1341/2024; Regulation No. 570/2025

Tax engine
versioned rates; tax-point date distinct from issue/due/posting dates

Tax advisor
sign-off of rates and applicability by supply type

Tax Advisor /
LEGAL VALIDATION REQUIRED

### 1.4 Insurance Intermediation

Req
ID

Instrument

Product
Control

Evidence
Required

Owner
/ Status

REG-V81-006

Insurance
Business Proclamation No. 746/2012 as amended; NBE directives

Role-gated
module; credential registry; product catalogue; quote/proposal/policy
evidence; commission disclosure; premium custody DISABLED

NBE/counsel
opinion on licence class, allowed activities, remuneration

Insurance
Advisor / DECISION REQUIRED

### 1.5 Digital Identity, Commercial
Code, Payments, Property, Screening, Edir

Req
ID

Instrument

Product
Control

Evidence
Required

Owner
/ Status

REG-V81-007

Digital ID
Proclamation No. 1284/2023 / Fayda

Authorised
API only; minimum attributes; purpose limitation; store token/reference not
full payload

Eligibility,
consent, API agreement, assurance level, production certification

Integration
Owner / VENDOR DEPENDENCY

REG-V81-008

Commercial
Code Proclamation No. 1243/2021

Contracting-entity
records; delegated-authority matrix; versioned templates; agents cannot bind
Principal unless authorised

Counsel
validates corporate form, agency agreements, authority limits

Legal / LEGAL
VALIDATION REQUIRED

REG-V81-009

NBE
payment-system rules + PSP contracts

Payment
initiation ≠ confirmation ≠ allocation ≠ posting; no funds-custody claim
without authorisation

Confirm
orchestration-only vs holding model; provider contracts

Finance /
DECISION REQUIRED

REG-V81-010

Local rental
/ land / property rules

Owner-authority
checks; configurable document types; no title guarantee from uploads alone

Local counsel
on enforceability, deposits, permits by locality

Property Lead
/ LEGAL VALIDATION REQUIRED

REG-V81-011

Police /
criminal-record / background screening

OFF by
default; purpose, consent, source authorisation, minimisation, human review

Formal
authorisation + legal review; never imply check if not performed

Legal /
FEATURE-FLAGGED OFF

REG-V81-012

Edir / cooperative
governance law

Feature flag
OFF; bylaws, quorum, custody, audit only after approval

Legal form,
registration, governance, tax, dispute rules signed off

Governance
Committee / FEATURE-FLAGGED OFF

Engineering rule: Every legal/tax/workforce rule in configuration
MUST carry source citation, jurisdiction, version, effective-from/to,
configuration owner, legal approver, test cases and release status.

2. FINANCIAL FLOWS & LEGAL
RESPONSIBILITIES CATALOGUE (P0)

Default operating model until DEC-V8-003 is closed: AfroLife
ORCHESTRATES payments via licensed PSPs/banks and does NOT hold, safeguard or
control customer funds (rent deposits, insurance premiums, marketplace escrow,
Edir contributions). Any custody model requires separate legal authorisation
and account segregation.

### 2.1 Money-Flow Catalogue

Flow
ID

Money
Type

Who
Invoices

Who
Receives

Who
Holds

Who
Reconciles

Refund
/ Payout Rules

FF-001

Platform fees

AfroLife

AfroLife bank
via PSP

AfroLife
operating

Finance
Officer

Policy-based;
credit note + e-invoice

FF-002

Rent / tenant
charges

Owner or
AfroLife as agent (DEC)

Owner or
designated account

NOT AfroLife
unless authorised

Finance +
Owner statement

Linked to
source; deposit separate

FF-003

Security
deposits

Per lease

Designated
deposit account

Client-money
rules if held — DEC

Finance;
deposit register

Final account
+ inspection

FF-004

Owner
distributions

N/A (payout)

Owner
verified bank

Available
after holds

Finance
Approver

Step-up on
bank change; dual control

FF-005

Vendor
payments

Vendor
(e-invoice)

Vendor bank

AfroLife AP
until paid

Finance; WO
matching

Mismatch →
exception; no auto-approve

FF-006

Agent
commissions

AfroLife
accrual

Agent bank
after approval

Accrual
ledger

Finance;
commission ledger

Basis =
reconciled collections only

FF-007

Insurance
premiums

Insurer /
authorised

Insurer /
authorised collector

Custody
DISABLED by default

Brokerage +
Finance

Only if
licence + NBE rules permit

FF-008

Edir
contributions

Cooperative
(after approval)

Approved
cooperative account

Feature OFF
until legal form

Governance +
Finance

Dual control;
bylaws; eligibility

FF-009

Marketplace
booking fees

AfroLife or
provider

Per
commercial model

Escrow
DISABLED until authorised

Finance

Cancellation/refund
disclosed before commit

### 2.2 Ledger Ownership &
Reconciliation Rules

·
Posted
journal entries MUST balance (debits = credits) in the accounting currency.

·
Posted
entries are immutable; corrections use reversal + replacement, credit/debit
notes or approved adjustments.

·
Payment
state and accounting posting state are SEPARATE; controlled reconciliation
links them.

·
Provider
callbacks are idempotent; duplicate notifications MUST NOT create duplicate
payments or postings.

·
Unknown-outcome
(timeout) states require authoritative reconciliation before resubmission when
duplicate legal documents are possible.

·
Owner
statements are reproducible from posted transactions + retained calculation
rules; corrections create linked revised versions.

·
Commission
ledger basis = reconciled collections only; estimated commissions are not
payable.

### 2.3 Approval Limits &
Segregation of Duties

Action

Maker

Approver
(must differ)

Invoice preparation
/ clearance

Finance
Officer

Finance
Approver (high-value) / system policy

Payment
release / distribution

Finance Maker

Finance
Approver within limits

Owner
bank-detail change

Owner /
Support (assisted)

Step-up
verification + notification to prior channel

Refund above
threshold

Finance Maker

Finance
Approver + source-payment linkage

Commission
payment

Finance Maker

Finance
Approver; not agent's direct supervisor alone

Vendor
invoice approval

Maintenance
Supervisor / Finance

Separate
payment-release duty

### 2.4 Customer Disclosures
(mandatory before payment commitment)

·
Who
is the legal recipient of funds and for what purpose.

·
Whether
AfroLife holds funds or only orchestrates payment.

·
Fees,
taxes, and any platform charges (gross/net treatment).

·
Refund,
cancellation and dispute rules.

·
That
a quote, proposal or payment initiation is NOT a policy, lease or coverage
confirmation.

3. FULL END-TO-END USER JOURNEYS
& EXECUTABLE WORKFLOWS (P0)

Each journey converts narrative intent into executable
specifications: preconditions, actors, step-by-step flow, inputs &
validation, system effects, business rules, exception paths, notifications, and
Given/When/Then acceptance tests. Screen-level UI remains a UX deliverable;
this layer defines the system behaviour developers must implement.

### 3.1 Shared Journey Grammar &
### State Machine

All journeys share a common state progression that may be extended
by domain-specific states:

Initiated → Draft → Submitted → Validation → Pending
Review/Approval → Accepted / Rejected / Needs Information → Executed /
Confirmed → Reconciled / Closed

Every transition records: actor, timestamp (UTC), prior state,
new state, reason, source channel, correlation ID, notifications triggered, and
evidence references. Transitions are append-only and auditable.

### 3.2 Journey A — Employer /
Property Owner Onboarding (E2E)

### Actors

Prospective Owner/Employer · Field Agent · Onboarding Reviewer ·
Compliance Reviewer · Org Admin · Finance (commercial terms)

### Preconditions

·
Public
landing page and privacy notice published.

·
Service
packages and standard contract templates approved.

·
Agent
(if assisting) has active credentials and delegated scope.

End-to-End
Narrative

A property owner in Addis Ababa discovers AfroLife via a field
agent or digital channel. They capture interest, provide identity and authority
evidence, pass review, agree commercial terms, e-sign the service agreement,
and receive an activated organisation workspace with roles and portal access.
Only after authority is approved can verified listings be published.

Step-by-Step
Workflow

Step

Actor

Action

Inputs
& Validation

System
Effects / Rules

A1

Prospect

Discovery /
landing

Select Owner
/ Employer / Both

Lead record
created (status=New); attribution source stored

A2

Prospect

Lead capture
form

Contact,
org/property summary; privacy notice accepted (required); marketing opt-in
separate

Consent
record with timestamp; duplicate detection on phone/email/TIN

A3

System /
Agent

Identity
& authority

Legal
identity / business reg / tax data; contact channel verified

Agent cannot
self-approve high-risk onboarding; source recorded

A4

Prospect /
Agent

Evidence
upload

Owner
authority / property docs OR employer reg / representative authority

Virus scan;
classification; checksum; access-scoped storage

A5

Onboarding
Reviewer

Review queue

Completeness,
duplicate person/entity, authority, risk flags

Outcomes:
Approve | Needs Info | Reject | Escalate; controlled rejection reasons

A6

Finance / Legal

Commercial
setup

Package,
territory, fee schedule, tax config, payment terms, SLA

Non-standard
terms require Finance/Legal approval

A7

Authorised
signatory

Contracting

Draft from
approved template; e-sign of exact version

Agent may
facilitate but cannot bind AfroLife unless authorised; signature evidence
pack stored

A8

System / Org
Admin

Activation

Org/property
workspace, roles, portal invitation

Onboarding
checklist tracked; no verified listing publish until authority approved

Exception
Paths

·
Duplicate
entity → merge/flag task; do not create second active org.

·
Incomplete
evidence → Needs Information with field-level guidance.

·
Agent
without contracting authority clicks sign → server deny + audit + escalate.

·
Network
loss mid-form → draft preserved; no false success.

Acceptance
Tests (G/W/T)

E2E-A01: Given an unverified owner, When they attempt to publish
a verified listing, Then the platform blocks publication and creates a review
task.

E2E-A02: Given an agent without contracting authority, When they
invoke a signing action, Then the server denies it, logs the attempt, and no
contract is executed.

E2E-A03: Given a completed onboarding with signed contract, When
activation runs, Then org workspace, roles and invitation exist and audit trail
records all transitions.

3.3 Journey B — Property Listing,
Rental & Lease Lifecycle (E2E)

### Actors

Owner / Authorised Agent · Property Reviewer · Prospective
Tenant · Leasing Reviewer · Finance

Key
State Machine (Lease)

Draft → Approval (if required) → Signature Pending → Executed →
Active → Renewal/Notice → Expired/Terminated

Executed version is IMMUTABLE. Signature, commencement,
possession/key handover and rent start are DISTINCT events.

End-to-End
Narrative

An approved owner creates a property and unit, uploads evidence,
and submits a listing for verification. Once published, a prospective tenant
searches, views, applies (screening OFF unless approved), and progresses
through application review. Parties negotiate and e-sign a lease. Possession
and rent start are recorded as separate events. Charges, payments and
statements flow according to the financial catalogue. Amendments create linked
versions; terminations follow notice rules.

Critical
Rules

·
Listing
statuses: Draft | Pending Verification | Published | Paused | Reserved | Rented
| Expired | Rejected. Unverified/expired must not appear as fully
verified/available.

·
Screening
OFF unless lawful provider approved (REG-V81-011).

·
Adverse
application decisions require documented human-review path.

·
Amendments
create linked version with effective date; do not overwrite executed lease.

·
Unit
occupancy changes only when approved activation conditions are met.

Acceptance
Tests

E2E-B01: Given a lease signed on date T1, rent start T2 and key
handover T3, Then three events remain distinct, signed version unchanged,
schedule follows approved effective-date rule.

E2E-B02: Given Tenant A, When they attempt to read Tenant B
property/invoice/document, Then access is denied server-side with structured
security event and no data leakage.

E2E-B03: Given MoR invoice submission timeout, Then invoice
enters Unknown Outcome; authoritative reconciliation required before safe
retry; no duplicate legal invoice.

### 3.4 Journey C — Maintenance &
Vendor Fulfilment (E2E)

### Actors

Resident / Owner / Staff · Supervisor · Internal Technician ·
External Vendor · Finance

State
Machine (Work Order)

Submitted → Triaged → Assigned → Accepted → In Progress →
Awaiting Review → Completed | Rework Required | Cancelled

End-to-End
Narrative

A resident reports a maintenance issue via portal or app. The
system (or supervisor) triages priority. A technician or external vendor is
assigned. The assignee accepts, performs work, and submits completion with
evidence. Supervisor reviews. Vendor invoice is matched to the work order;
approval and payment release are separate duties. AI may suggest classification
but must not downgrade safety-critical cases.

Critical
Rules

·
AI
may suggest classification/priority but MUST NOT downgrade safety-critical
cases.

·
Vendor
sees ONLY assigned jobs and necessary data; URL guessing denied and logged.

·
Additional
work/cost requires approval before commitment except approved emergency rules.

·
Vendor
invoice matching identifies discrepancies; does NOT auto-approve mismatches.

·
Invoice
approval and payment release are separate duties.

·
Duplicate
webhook/callback cannot create duplicate work, invoice or payment.

Acceptance
Tests

E2E-C01: Given an unassigned vendor, When they open a work-order
URL by guessing, Then access is denied and logged with no metadata leakage.

E2E-C02: Given a duplicate vendor completion callback, Then one
completion record exists; no duplicate invoice or payment.

E2E-C03: Given AI or notification provider failure, Then
emergency workflow remains available via approved on-call path.

3.5 Journey D — Workforce, Shifts,
Attendance & Payroll Hand-off (E2E)

### Actors

Employer · Worker · Recruiter/Manager · HR/Workforce Manager ·
Finance

Mandatory
State Distinctions

Scheduled time ≠ Recorded time ≠ Approved time ≠ Payable time.
Export generation ≠ payroll filing ≠ payment.

End-to-End
Narrative

An employer defines shifts and assigns workers. Workers clock
in/out via mobile (low-end phone, intermittent connectivity). Exceptions enter
a queue for manager review. Approved time feeds payable calculations under
effective-dated Ethiopian labour rules. Payroll export is generated and handed
to the external payroll system; the platform never claims the export is filed
or paid. Terminated workers cannot accept new shifts; sessions are revoked.

Critical
Rules

·
Employee
and independent service-provider rules are NOT conflated; classification is
explicit.

·
Labour
thresholds are effective-dated and jurisdiction-configurable; hard blocks only
after legal validation (REG-V81-003).

·
Timesheet
corrections retain original value, revised value, reason, editor, approver,
timestamp.

·
Biometric/precise
location: minimise, restrict, retain per policy; privacy/legal review before
enable.

·
Terminated
worker cannot accept new shifts; sessions revoked on offboarding.

Acceptance
Tests

E2E-D01: Given a worker corrects a missing clock event after
manager approval, Then original event retained, correction reason/approver captured,
payable time recalculated under approved policy.

E2E-D02: Given a terminated worker, When they attempt to accept
a new shift, Then the action is blocked and sessions remain revoked.

E2E-D03: Given a payroll export, Then the platform never
represents the export as filed or paid payroll; reconciliation evidence is
retained.

### 3.6 Journey E — Insurance
Brokerage & Insurer Integration (GATED)

STATUS: FEATURE-FLAGGED OFF until DEC-V8-002 and REG-V81-006 are
APPROVED.

### Actors

Customer · Brokerage Officer · Insurer (authoritative) ·
Compliance

Critical
Invariants

·
Quote
/ proposal / payment initiation / uploaded draft ≠ policy Active.

·
Only
authoritative insurer confirmation + required evidence establishes
Confirmed/Active.

·
Premium
custody DISABLED unless specifically authorised.

·
Platform
must not rank solely on commission or hide exclusions.

·
Insurer
timeout → Pending Verification, not Active; late callbacks are idempotent.

·
Agent
cannot alter insurer terms or promise coverage.

Acceptance
Tests

E2E-E01: Given insurer timeout then late callback, Then quote
remains pending until verified; no policy Active without insurer confirmation;
update is idempotent.

E2E-E02: Given an agent attempts to promise coverage or sign
beyond authority, Then action is blocked, audited and escalated.

E2E-E03: Given insurance feature flag OFF, When API is called
directly, Then server denies operation, no data created, event logged.

### 3.7 Journey F — Marketplace
Search, Matching & Booking (E2E)

### Actors

Provider / Owner / Worker · Moderator · Customer · Support

End-to-End
Narrative

A customer searches the marketplace for services or listings.
Results display explicit verification levels (contact verified, documents
reviewed). Private contact data is not exposed until policy permits. Booking
requires acceptance by all required parties and any approved payment condition.
Cancellation, no-show, refund and dispute rules are disclosed BEFORE
commitment. Reviews are reportable and moderated with evidence and appeal.

Critical
Rules

·
Verification
level explicit; avoid absolute 'guaranteed safe' badge.

·
Private
contact data not exposed until policy permits.

·
Booking
confirmed only when all required parties accept and any approved payment
condition is verified.

·
Cancellation/no-show/refund/dispute
rules disclosed BEFORE commitment.

·
Reviews
reportable and moderated with evidence and appeal.

### 3.8 Journey G — Agent /
Super-Agent Network (E2E)

### Actors

Applicant Agent · Compliance Reviewer · Super-Agent · Central
Reviewer · Finance

End-to-End
Narrative

An applicant agent is onboarded with credentials and delegated
scope. Parent-child hierarchy exists for oversight and commission attribution —
NOT unrestricted customer-data access. Agents generate leads that are
attributed. Commissions accrue only from reconciled collections per signed
schedule. Suspension revokes sessions, blocks new leads, reassigns open cases
and preserves audit history. Quality targets must not incentivise mis-selling.

Critical
Rules

·
Agent
may NOT bind AfroLife or customer, collect funds, promise insurance coverage or
execute regulated activity unless expressly authorised and lawful.

·
Parent-child
hierarchy is for oversight and commission attribution — NOT unrestricted
customer-data access.

·
Commission
basis = reconciled collections per signed schedule; estimated ≠ payable.

·
Commission
queries do not edit underlying source transactions.

·
Suspension/offboarding:
revoke sessions, disable new lead intake, reassign open cases, preserve audit
records.

·
Quality
targets must not incentivise mis-selling.

Acceptance
Tests

E2E-G01: Given an agent without authority, When they attempt to
sign a contract or change price, Then server denies, audits and escalates.

E2E-G02: Given agent suspension, Then sessions revoked, new
leads blocked, open cases reassigned, history retained.

### 3.9 Journey H — Edir Cooperative
(DISABLED)

STATUS: FEATURE-FLAGGED OFF. Hard gate: legal form,
registration, bylaws, governance, payment/custody, tax, audit and dispute rules
signed off before any enablement.

·
No
benefit approval/payment before governance, eligibility and authorised dual
control.

·
Membership
does not guarantee payout unless approved rules expressly say so.

·
Do
not label module a regulated financial product without legal review.

### 3.10 Journey I — Support &
Complaints (E2E)

### Actors

User · Support Agent · Supervisor · Compliance/Legal

End-to-End
Narrative

A user raises a support request or complaint via portal, app or
channel. Automated triage is advisory only and cannot suppress safety, fraud,
privacy or legal complaints. Sensitive access requires just-in-time approval
and is audited. Complaints against an agent are not routed solely to that agent
or their commission approver. Financial/legal corrections go through formal
workflows. Resolution includes outcome, rationale, corrective action, refund
reference if any, and appeal route.

Critical
Rules

·
Automated
triage is advisory; cannot suppress safety, fraud, privacy or legal complaints.

·
Sensitive
access requires just-in-time approval and is audited.

·
Complaints
against an agent are not routed solely to that agent or their commission
approver.

·
Financial/legal
corrections go through formal workflows, not case-edit alone.

·
Resolution
includes outcome, rationale, corrective action, refund reference if any, appeal
route.

4. GOVERNED DECISION LOG (P0)

Blocked capabilities remain feature-flagged OFF until the
corresponding decision is recorded as DECIDED with evidence. Unresolved
decisions past due date escalate to Sponsor.

ID

Decision

Recommendation
/ Owner

Due
/ Gate

Consequence
if Unresolved

DEC-V8-001

Final release
scope: P1 vs P2 domains; marketplace boundary

Foundation +
Property + Workforce as P1; Marketplace P2; Insurance/Edir gated / Sponsor

Before
backlog baseline

No
multi-domain simultaneous build

DEC-V8-002

Legal entity
role in insurance

Obtain
NBE/counsel opinion before design freeze / Legal + Insurance Advisor

Before
insurance module design

Insurance
module remains OFF

DEC-V8-003

Whether
AfroLife holds customer funds

Orchestration-only
default / Sponsor + Finance + Legal

Before
payment architecture

Custody
features disabled

DEC-V8-004

Approved
contracts/APIs (Fayda, MoR, PSP, insurer, SMS, hosting)

Execute
contracts before production credentials / Integration Owner

Before
production credentials

Integrations
stay proposed

DEC-V8-005

Edir legal
form, registration, bylaws, governance

Full legal
pack before any enablement / Sponsor + Legal

Before
enabling Edir

FEATURE-FLAGGED
OFF

DEC-V8-006

Agent
authority, exclusivity, commission basis, tax, payment approval

Signed
commercial policy before agent recruitment / Commercial + Legal

Before agent
recruitment

Agent lead
intake limited

DEC-V8-007

Data
residency, AI provider, retention, privacy officer, incident notification

Complete
before production personal data / Security + Privacy

Before
production data

No production
PII

DEC-V8-008

Property
verification, lease templates, deposit treatment, e-sign

Legal pack
before leasing go-live / Property Lead + Legal

Before
leasing go-live

LEGAL
VALIDATION REQUIRED

DEC-V8-009

Current MoR
directive, e-invoice provider, schema, unknown-outcome rules

Official text
+ tax advisor sign-off / Finance + Tax

Before tax
engine acceptance

No production
tax invoicing

DEC-V8-010

Workforce
classifications, labour rules, payroll provider, biometric policy

HR/Legal pack
before workforce go-live / HR + Legal

Before
workforce go-live

LEGAL
VALIDATION REQUIRED

DEC-V8-011

SLO targets,
peak load, RPO/RTO, support hours, incident severity

Numeric
targets before production readiness / Sponsor + IT

Before
production readiness

DECISION
REQUIRED

DEC-V8-012

KPI
definitions, baseline, targets, owners per module

Versioned
metric catalogue before official dashboards / Product + Finance

Before
dashboards labelled official

DECISION
REQUIRED

DEC-001

Single-org vs
multi-tenant SaaS

Affects
isolation, billing, config / Sponsor + Architect

Architecture
sign-off

DECISION
REQUIRED

DEC-003

Direct MoR
accreditation vs accredited e-invoicing provider

Determines
integration, certification, liability / Sponsor + Finance

Before
e-invoice implementation

DECISION
REQUIRED

5. WEIGHTED GLOBAL BENCHMARK
CAPABILITY MATRIX (P1)

Evidence grades: V = Verified | C = Vendor-claimed | I =
Inferred. Ethiopia fit and legal adaptation always override feature parity.
Weight: 5 = critical differentiator … 1 = nice-to-have. Response: Adopt / Adapt
/ Defer / Reject.

### 5.1 Property & Portfolio Operations

Capability

Wt

AppFolio

Buildium

Yardi

Ev.

AfroLife

Ethiopia
Notes

Unified
property→lease→charge→maintenance timeline

5

C

C

C

C

ADOPT

Core P1;
immutable signed versions

Owner
statements with version history

5

C

C

C

C

ADOPT

Reproducible
from posted txs; ETB + e-invoice

Resident/Owner
self-service portals

5

C

C

C

C

ADOPT

Amharic+English;
mobile-first; low-bandwidth

US-centric
credit/eviction screening

2

C

C

C

C

REJECT/DEFER

OFF until
lawful provider

CAM /
association accounting

2

C

C

C

C

DEFER

Not in
current commercial scope

### 5.2 Workforce Management

Capability

Wt

UKG

Deputy

Ev.

AfroLife

Ethiopia
Notes

Scheduled vs
recorded vs approved vs payable time

5

C

C

C

ADOPT

Core
invariant; correction history mandatory

Mobile clock
+ exception queues

5

C

C

C

ADOPT

Low-end phone
UX; intermittent connectivity

Hard-coded
foreign labour rules

1

C

C

C

REJECT

Configurable
Ethiopian rules after legal validation

Biometric /
continuous location tracking

2

C

C

C

DEFER

Proportionality,
DPIA; OFF by default

### 5.3 Cross-cutting Principles

·
Mobile-first
+ offline draft preservation: ADOPT (critical for Ethiopia connectivity).

·
Explainable
AI recommendations + human approval for high-impact: ADOPT; no silent
automation of adverse decisions.

·
Idempotent
integrations + reconciliation: ADOPT from mature enterprise patterns.

·
Enterprise
complexity before operating model stable: REJECT.

·
Chat
as system of record: REJECT; WhatsApp/SMS are channels only.

6. DATA & INTEGRATION
INTERFACE CONTROL SPECIFICATIONS (P1)

Unavailable or uncontracted APIs are marked PROPOSED INTEGRATION
— not implemented capabilities. Each confirmed provider requires a full
Interface Control Document (ICD) before production credentials.

### 6.1 ICD Template (minimum fields)

ICD
Section

Required
Content

Provider
& contract

Legal entity,
contract ID, environment (sandbox/prod), credential owner, expiry

Direction
& protocol

Inbound/outbound/both;
REST/webhook/file; auth method (OAuth2, mTLS, HMAC)

Operations
& schemas

OpenAPI or
equivalent; field-level ownership; required/optional; enums; PII
classification

Idempotency

Key location,
TTL, behaviour on duplicate, correlation ID requirements

Errors &
retries

Error code
catalogue; retryable vs terminal; backoff; max attempts; dead-letter;
operator replay

Timeouts
& unknown outcome

Timeout
budgets; reconciliation procedure before resubmit when duplicate legal docs
possible

Webhooks

Signature
verification; replay protection; rate limits; async processing after durable
receipt

Security
& logging

Secrets
vault; redaction rules; raw payload retention policy; no secrets in logs

Reconciliation

Control
totals; unmatched queue; daily/period checks; ownership of resolution

Versioning
& change

Schema
version; deprecation policy; contract-test suite; change notification SLA

### 6.2 Integration Status Register

Integration

Status

ICD
Required Before

Key
Controls

Failure
Behaviour

MoR
e-Invoicing

PROPOSED

Tax engine
acceptance

Credential
vault; schema version; correlation IDs

Unknown-outcome
reconciliation; no auto-resubmit

Banking / PSP

PROPOSED

Payment
go-live

Signed
callbacks; idempotency; external ref

Unmatched
queue; daily control totals

Payroll
system

PROPOSED

Workforce
integration

Versioned
mapping; encrypted export

Failed export
queue; resubmit failed rows only

Background
screening

FEATURE-FLAGGED
OFF

Legal +
provider approval

Consent;
minimisation; restricted results

No fabricated
result; human review

SMS / email /
push

PROPOSED

Notification
go-live

Template
versioning; no sensitive body

Retry; bounce
tracking; no false delivery claim

Fayda /
Digital ID

PROPOSED

Identity
verification enablement

Authorised
API only; min attributes; token storage

Explicit
fallback; no silent failure as verified

Insurer APIs

GATED

NBE/licence +
contracts

Idempotent
adapters; insurer authoritative

Pending
Verification; never Active on timeout

Biometric /
kiosk

FEATURE-FLAGGED
OFF

Privacy/legal
review

Device auth;
signed records

Quarantine
invalid; manual exception

### 6.3 Core Entity Field Conventions

Every persistent business entity SHOULD include where
appropriate: id (UUID), organisation_id/tenant_id (server-assigned),
created_at/by, updated_at/by (UTC), version/optimistic-lock token, status
(controlled enum), source_system, external_reference, deleted_at (soft delete
only where lawful), effective_from/to. Monetary values: fixed-precision decimal
or integer minor units + currency code — never binary floating-point.

7. MEASURABLE RELEASE GATES &
DELIVERY PLAN (P1)

### 7.1 Phase Exit Criteria

Phase

Build
Focus

Exit
Criteria (must all pass)

Evidence
/ Owner

0 — Discovery

Scope, legal
entity, module priorities, hosting, privacy, payment model

Signed
decision register; high-risk functions feature-flagged OFF; privacy inventory
started

Sponsor
sign-off; decision log complete

1 —
Foundation

Identity, org
hierarchy, RBAC, consent, documents, audit, notifications, localisation

Tenant
isolation tests pass; account lifecycle; MFA for privileged; audit
append-only; Amharic/English critical paths

Security
acceptance; Privacy Owner; UX

2 — Property
ops

Property/unit,
owner onboarding, listing, lease, maintenance, portals

Core property
E2E (WF-A/B/C) pass; lease legal review; data isolation on all property
endpoints

Property Lead
UAT; Legal lease pack

3 — Finance
& workforce

Charges,
payments, tax/e-invoice, timesheets, shifts, payroll hand-off

Finance
totals reconcile; labour policy sign-off; provider failure paths tested;
unknown-outcome reconciliation proven

Finance + Tax
+ HR legal sign-off

4 — Agent
& marketplace

Agent
onboarding, lead attribution, commission, moderation, search/booking

Authority
boundaries enforced; commission policy approved; abuse/moderation UAT; agent
cannot bind/collect/promise

Commercial +
Legal + Ops UAT

5 — Insurance

Brokerage
workflow, product catalogue, quote adapters, policy/renewal

NBE/counsel
licensing gate PASSED; insurer contracts + API certification; premium custody
decision recorded

Insurance
Advisor + Legal

6 — Edir
& AI

Governance-controlled
Edir; assessed AI use cases

Legal/governance
approval; AI risk assessment + DPIA; human-oversight + adversarial tests pass

Governance
Committee + Security/Legal

7 — Scale

Capacity, DR,
redundancy, analytics, new languages/regions

Measured
SLOs; witnessed recovery drill vs RPO/RTO; security sign-off; support model
live

Sponsor
accepts transition to BAU

### 7.2 Production Release Gate
Checklist (MUST all be true)

·
All
Must-have requirements have traceable test evidence or formally approved
exception with risk acceptance.

·
Critical/high
security findings resolved or explicitly accepted by authorised risk owner with
compensating controls.

·
Legal/tax
sign-off for enabled Ethiopian e-invoicing, VAT, labour, privacy and
e-signature behaviours.

·
Data
isolation tests pass across UI, API, exports, reports, files, jobs and
integrations.

·
Finance
totals reconcile across invoice, payment, allocation, journal and statement
paths.

·
Backup
restoration and rollback/roll-forward demonstrated against approved RPO/RTO.

·
Monitoring,
alerting, runbooks, support ownership and incident response operational.

·
Business
owners approve UAT results and known limitations.

·
User
training, migration, cutover, communications and support plans signed off.

·
Decision
log items for enabled modules are DECIDED (not open).

8. REQUIREMENT TRACEABILITY MATRIX
(v9.0)

Req
ID

Statement

Journey
/ Module

Regulatory
Link

Release
Gate

FR-V81-FIN-001

Every money
flow has defined invoice issuer, receiver, holder, reconciler and refund
rules; custody default OFF

All financial

REG-V81-009;
DEC-V8-003

Phase 3

FR-V81-WF-001

Executable
workflow specs with preconditions, fields, rules, exceptions and G/W/T for
each major journey

WF-A…WF-I

—

Phase
matching domain

FR-V81-IAM-001

Agent cannot
bind Principal, collect funds or promise regulated coverage without explicit
authority

WF-G, WF-E

REG-V81-008

Phase 4

FR-V81-INV-001

Unknown-outcome
invoice states require authoritative reconciliation before resubmission

Finance /
e-invoice

REG-V81-004

Phase 3

FR-V81-INS-001

Insurance
module disabled until licence/appointment confirmed; only insurer
confirmation sets Active

WF-E

REG-V81-006;
DEC-V8-002

Phase 5

FR-V81-EDIR-001

Edir feature
flag OFF; API deny when off; no data creation

WF-H

REG-V81-012;
DEC-V8-005

Phase 6

NFR-V81-001

Critical
journeys p95 ≤2.5s under approved load profile (excl. identified 3rd-party
latency)

All

—

Phase 7

NFR-V81-002

Idempotency
for duplicate-sensitive writes; durable queues; DLQ; operator replay

Integrations

—

Phase 1–3

9. BUSINESS & FINANCIAL RULES
CATALOGUE

Rules below are implementation controls. Tax rates, labour
parameters and retention periods remain subject to legal validation before
production hard-coding.

### 9.1 Fees, Commissions, Taxes

·
Platform
subscription/service fees: AfroLife invoices as taxable supply; VAT treatment
per approved tax config.

·
Management
fees: invoiced per contract; appear on owner statements; e-invoice when in
scope.

·
Agent
commissions: accrued from reconciled collections only; tier/split/reversal per
signed schedule; tax/withholding fields where applicable.

·
Vendor
invoices: matched to WO + approval amount; e-invoicing compliance validated
before payment release.

9.2 Deposits, Refunds,
Reconciliation

·
Deposit
treatment follows approved legal/accounting policy (client-money vs owner-held
— DEC-V8-003).

·
Refunds
require policy-based authorisation, source-payment linkage and audit evidence.

·
Reconciliation
reports expose unresolved differences; never silently exclude them.

·
Period
close rejects ordinary postings; reopen requires privileged approval + reason +
full audit.

### 9.3 Authorisation Boundaries

·
Default-deny
access; permissions granted per role and scoped to organisation/property.

·
External
users never inherit internal staff permissions.

·
Emergency
access: time-limited, reason-coded, alerted, reviewed.

·
Support
access to personal/financial data: approved, logged, minimum scope.

10. IMPLEMENTATION PRINCIPLES
& APPROVAL

### 10.1 Final Implementation
Principles (v9.0)

·
Preserve
all v6.0 requirements and workflows; implement later layers as additional
precision, not content reduction.

·
Treat
legal citations, tax rates, labour parameters, retention periods and MoR API
behaviour as validation items until confirmed from current authoritative
sources.

·
Do
not infer third-party service availability from international competitor
features.

·
Do
not claim a legal invoice is cleared, a payment is settled, a message is
delivered, or a payroll is processed unless the authoritative system/provider
confirms that state.

·
Keep
all critical transitions, financial adjustments, permissions, exports and rule
changes auditable.

·
Build
for failure paths and reconciliation as deliberately as for happy paths.

·
Make
configuration changes versioned, effective-dated, approved and testable.

·
Keep
AI advisory by default; prevent it from bypassing permissions, legal controls
or financial approvals.

·
Do
not proceed to production while critical regulatory, security, data-isolation,
recovery or reconciliation gates remain unapproved.

·
Maintain
a living decision log, risk register, requirements traceability matrix and
release evidence pack.

·
Every
money flow has a named invoice issuer, receiver, holder (or explicit
non-holder), reconciler and refund path before go-live.

·
Executable
workflows with G/W/T tests are the unit of delivery acceptance for each
journey.

### 10.2 Recommended Implementation Order

1. Foundation and governance: identity, tenant
isolation, permissions, consent, documents, audit, notifications,
configuration, integration registry.

2. Core operating workflows: property operations
and workforce/service delivery per approved commercial launch scope
(DEC-V8-001).

3. Commercial operations: agent onboarding, lead
attribution, commission calculations, marketplace moderation, customer support,
approved financial workflows.

4. Controlled integrations: implement and certify
each identity, tax/e-invoicing, payment, messaging connection against actual
contract and technical specification.

5. Gated modules: activate insurance only after
licensing/appointment resolved; keep Edir disabled until legal and governance
model approved.

### 10.3 Approval Block

Role

Name

Signature

Date

AfroLife
Agency Project Sponsor

Finance &
Compliance Lead

Legal /
Regulatory Advisor

Property
Operations Lead

Human
Resources / Workforce Lead

IT / Systems
/ Security Representative

Privacy Owner

Product Owner

## Appendix A — STATUS TAXONOMY &
NORMATIVE LANGUAGE

MUST / MUST NOT / SHOULD / SHOULD NOT / MAY express requirement
strength per ISO/IEC/IEEE 29148 practice as adopted in v7.0.

MUST requirements are mandatory for release acceptance unless
formally waived by the accountable approver. Any waiver must record: requirement
ID, reason, risk, compensating control, approver, date, expiry/review date.

Labels used in this document: MANDATORY (M), SHOULD (S),
PROPOSED, LEGAL VALIDATION REQUIRED, DECISION REQUIRED, VENDOR/API DEPENDENCY,
FEATURE-FLAGGED OFF — defined in §0.4.

## Appendix B — GLOSSARY OF TERMS

Term

Definition

ICD

Interface
Control Document — contract of record for a provider integration

Unknown
Outcome

State after
timeout where neither success nor definitive rejection is known; requires
authoritative reconciliation

Orchestration-only

Platform
initiates or records payment via licensed PSP/bank but does not hold or
control customer funds

Evidence
grade (V/C/I)

Verified /
Vendor-claimed / Inferred — used in benchmark matrix

G/W/T

Given / When
/ Then acceptance test pattern

Feature-flagged
OFF

Capability
present in design or code but disabled in production until its release gate
is met

E2E

End-to-end —
full journey from initiation through completion and reconciliation

This perfected FSD is the
controlled specification for developers, legal reviewers, hosting providers and
business stakeholders.

# Part XII — RESEARCH AND BENCHMARK ENHANCEMENTS (v9.2)

0. RESEARCH SYNTHESIS — BEST
LESSONS EXTRACTED

### 0.1 International Property
Platforms (AppFolio, Buildium, Yardi)

·
Unified property
→ unit → listing → application → lease → charge → maintenance timeline is
non-negotiable for operational clarity.

·
Resident/owner
self-service portals with payments, documents, maintenance requests and
messaging drive adoption.

·
AI agents for
routine messaging and application triage are valuable only under human
supervision.

·
Immutable
executed lease + linked amendment versions prevent disputes.

·
Owner statements
must be reproducible from the ledger with version history.

·
Mobile-first
experience and strong open APIs are table stakes.

### 0.2 Local Ethiopian Property
Platforms (MiranaPM, Kulfo, Home Link, Minab)

·
Local payment
rails (Chapa, CBE Birr, bank transfer) and SMS reminders are essential — not
optional.

·
Amharic + English
bilingual UI and notifications dramatically improve usability.

·
Fayda Digital ID
integration for resident verification is a differentiator (MiranaPM pattern).

·
Many local
systems deliberately avoid holding tenant funds (Home Link model) — aligns with
AfroLife orchestration-only default.

·
Utility/meter
allocation, penalty automation and INSA-aligned security mindset matter for
Ethiopian operators.

·
Tenant portals
that surface invoices, maintenance and documents reduce phone follow-up load.

0.3 International Workforce (UKG,
Deputy)

·
Four-state time
model (Scheduled ≠ Recorded ≠ Approved ≠ Payable) is the gold standard.

·
Mobile clock
designed for low-end devices + intermittent connectivity is critical.

·
Exception queues
+ full correction audit trail protect both worker and employer.

·
Real-time labour
cost visibility while building rotas reduces overruns.

·
Shift swap and
self-service leave requests reduce manager admin.

### 0.4 Local Ethiopian Workforce / HR
(Demoz, GeezJobs, Lenvica, Ace Tech, LMIS)

·
Ethiopian
income-tax and pension calculation must be first-class (Demoz pattern).

·
Amharic payslips
and Telegram self-service channels are highly valued.

·
Biometric
attendance is common but must remain privacy-gated and optional.

·
Labour ID / LMIS
awareness supports future government interoperability.

·
Employee
self-service for leave, payslips and documents reduces HR load.

### 0.5 Freelancing & Gig
Platforms (Upwork, Fiverr, African patterns)

·
Explicit
verification levels and skills-based matching outperform absolute ‘guaranteed’
badges.

·
Clear packaging of
services (gig model) vs proposal/bidding model both have value; AfroLife
marketplace can support both.

·
Payment
protection / escrow patterns exist internationally; AfroLife retains
orchestration-only until custody decision is closed.

·
Dispute
resolution with evidence packs and moderated ratings with appeal is essential
for trust.

·
Payment
reliability and local payout options are decisive for African users.

### 0.6 Cross-Cutting Lessons Applied
to AfroLife

·
SMS + in-app +
optional Telegram as primary notification channels (local reality).

·
Progressive
verification (contact → documents → Fayda optional) instead of binary
‘verified’.

·
Local payment
orchestration (Chapa-class) with clear disclosure that AfroLife does not hold
funds.

·
Amharic-first
critical paths; English secondary.

·
AI advisory only;
high-impact and adverse decisions require human confirmation.

·
Idempotent
webhooks, unknown-outcome reconciliation, append-only audit everywhere.

·
Marketplace
supports both packaged services and shift-based workforce matching.

1. REGULATORY & FINANCIAL
CONTROL LAYERS

Full Regulatory Compliance Matrix (REG-V81-001 to 012) and
Financial Flow Catalogue (FF-001 to FF-009) from the control layer remain
binding. Orchestration-only default, insurance/Edir/screening feature flags,
and all DECISION REQUIRED items are unchanged. This version only enriches the
executable workflows.

3. RESEARCH-ENHANCED END-TO-END
WORKFLOWS

Every workflow below incorporates the best lessons above while
preserving every Ethiopian regulatory gate.

### 3.1 Shared Grammar &
Notification Strategy

State progression: Initiated → Draft → Submitted → Validation →
Pending Review → Accepted/Rejected/Needs Info → Executed/Confirmed →
Reconciled/Closed.

·
Notifications:
SMS (primary for critical), in-app, email, optional Telegram (Demoz-style
self-service pattern).

·
Every transition
records actor, UTC timestamp, prior/new state, reason, channel, correlation ID,
evidence.

·
Idempotency keys
+ unknown-outcome reconciliation on all external writes.

### 3.2 WF-A — Owner / Employer
Onboarding (AppFolio + MiranaPM inspired)

Best Lessons Applied

·
Progressive
multi-step profile with draft save and progress indicator (AppFolio).

·
Optional Fayda
Digital ID for higher assurance (MiranaPM).

·
Authority
verification before any ‘verified listing’ capability.

·
SMS confirmation
of every major milestone.

E2E Narrative

Prospect discovers AfroLife via agent, digital ad or referral.
Completes progressive form (contact → org/property summary → identity/tax →
authority evidence). Optional Fayda step for higher trust. System runs
duplicate detection. Human reviewer assesses. Finance attaches commercial
package. Authorised signatory e-signs exact template. Activation creates
workspace + roles + portal invite. SMS confirms each gate. Only after authority
approval can verified listings be published.

Key Steps (condensed)

·
Discovery &
lead capture with attribution and privacy consent.

·
Identity +
optional Fayda + contact channel verification.

·
Evidence upload
(virus-scanned, classified, checksummed).

·
Review queue
(Approve / Needs Info / Reject / Escalate).

·
Commercial
package & fee schedule attachment.

·
E-sign of exact
approved template; agent cannot bind.

·
Activation:
workspace, roles, portal invite, SMS confirmation.

·
Gate: no verified
listing publish until authority approved.

### Acceptance Tests

E2E-A01: Unverified owner cannot publish verified listing.

E2E-A02: Agent without authority cannot execute contract.

E2E-A03: Activation produces workspace + roles + full audit +
SMS.

### 3.3 WF-B — Property Listing →
Lease Lifecycle (AppFolio/Yardi + Kulfo/MiranaPM)

Best Lessons Applied

·
Unified timeline
+ immutable executed lease (AppFolio/Yardi).

·
Local payment
orchestration (Chapa-class) + SMS rent reminders (Kulfo/MiranaPM).

·
Utility/meter
allocation awareness (local platforms).

·
Tenant portal for
invoices, maintenance, documents (all modern platforms).

·
Penalty
automation with transparent rules (Home Link style).

E2E Narrative

Approved owner creates property/units, uploads photos &
evidence, submits listing. After verification the listing appears with explicit
verification level. Tenant searches (Amharic/English), views, applies.
Application review includes human path for adverse decisions. Parties negotiate
and e-sign. Signature, commencement, key handover and rent-start are distinct
events. Rent invoices generated; SMS reminders sent; payments orchestrated via
local PSP. Owner statements generated from ledger with version history.
Penalties applied only under disclosed rules.

### Critical Rules

·
Listing statuses
include explicit verification level; never absolute ‘guaranteed safe’.

·
Screening remains
FEATURE-FLAGGED OFF until lawful provider.

·
Amendments create
linked versions; executed lease never overwritten.

·
Payment
initiation ≠ confirmation ≠ allocation ≠ posting.

### 3.4 WF-C — Maintenance &
Vendor Fulfilment (Yardi/AppFolio + local)

Best Lessons Applied

·
Photo-enabled
maintenance requests from tenant portal (MiranaPM).

·
Vendor sees only
assigned jobs (least privilege).

·
Invoice-to-WO
matching with discrepancy queue; no auto-approve on mismatch.

·
SLA clocks and
priority escalation.

·
SMS status
updates to resident and owner.

### State Machine

Submitted → Triaged → Assigned → Accepted → In Progress →
Awaiting Review → Completed | Rework | Cancelled

### 3.5 WF-D — Workforce & Payroll
Hand-off (UKG/Deputy + Demoz)

Best Lessons Applied

·
Four-state time
model (UKG/Deputy).

·
Mobile clock
optimised for low-end phones + intermittent connectivity.

·
Exception queue +
full correction audit (original value retained).

·
Ethiopian
tax/pension awareness in export mapping (Demoz).

·
Optional Telegram
self-service for payslip/leave view (Demoz pattern).

·
Biometric remains
FEATURE-FLAGGED OFF until privacy/legal review.

Mandatory Distinctions

Scheduled ≠ Recorded ≠ Approved ≠ Payable. Export ≠ filing ≠
payment.

E2E Narrative

Employer builds shifts (real-time labour cost visibility).
Workers clock via mobile. Exceptions enter queue. Manager approves/corrects.
Payable time calculated under effective-dated Ethiopian labour config. Export
generated for external payroll (Demoz-class or bank). Platform never claims
‘filed’ or ‘paid’. Terminated workers blocked immediately; sessions revoked.
Optional Telegram channel for worker self-service.

### 3.6 WF-E — Insurance Brokerage
(Applied Epic) — GATED

STATUS: FEATURE-FLAGGED OFF until DEC-V8-002 + REG-V81-006.

Needs analysis → quote → proposal → policy assist → renewal
assist. Insurer remains authoritative. Premium custody DISABLED. Agent cannot
promise coverage.

3.7 WF-F — Marketplace Search,
Matching & Booking (Upwork/Fiverr + trust patterns)

Best Lessons Applied

·
Support both
packaged services (gig model) and open proposals/shift matching.

·
Explicit
multi-level verification (contact → documents → Fayda optional → performance
history).

·
Private contact
gated until policy permits.

·
Rules (cancellation,
no-show, refund, dispute) disclosed BEFORE commit.

·
Moderated reviews
with evidence and appeal (never pure public free-for-all).

·
Payment
orchestration with clear ‘AfroLife does not hold funds’ disclosure.

E2E Narrative

Customer searches or browses packaged services. Results show
verification level and relevant trust signals. Booking or gig purchase requires
acceptance by required parties. Payment condition (if any) verified via local
PSP. Rules presented before final commit. After fulfilment, both parties can
leave moderated reviews. Disputes open evidence pack and formal resolution
path.

### 3.8 WF-G — Agent / Super-Agent
Network

Delegated authority matrix; agents cannot bind Principal or
collect funds unless authorised. Hierarchy for oversight and commission
attribution only. Commission = reconciled collections only. Suspension cascade
(sessions, leads, case reassignment). Quality targets must not incentivise
mis-selling. SMS notifications for lead assignment and commission status.

### 3.9 WF-H — Edir Cooperative —
DISABLED

FEATURE-FLAGGED OFF. Hard gate unchanged: legal form,
registration, bylaws, governance, custody, tax, audit, dispute rules signed off
before any enablement.

### 3.10 WF-I — Support &
Complaints

Automated triage advisory only. Safety/fraud/privacy/legal
complaints cannot be suppressed. Sensitive access just-in-time + audited. Agent
complaints never routed solely to the agent or their commission approver.
Resolution always includes outcome, rationale, corrective action, refund
reference and appeal route. SMS confirmation of case updates.

5. ENHANCED BENCHMARK CAPABILITY
MATRIX

### 5.1 Property (International +
Local)

Capability

Wt

AppFolio

MiranaPM

Kulfo

Home
Link

AfroLife
Response

Unified
timeline

5

C

C

C

C

ADOPT

Local
payments (Chapa/CBE)

5

—

C

C

Orchestration

ADOPT
(orchestrate)

SMS reminders

5

C

C

C

C

ADOPT primary
channel

Fayda /
Digital ID

4

—

C

—

—

ADAPT
optional

Amharic UI +
notices

5

—

C

C

C

ADOPT
critical paths

Funds custody

5

Varies

Varies

Varies

Avoids

Orchestration-only
default

Tenant portal

5

C

C

C

C

ADOPT

### 5.2 Workforce (International +
Local)

Capability

Wt

UKG/Deputy

Demoz

GeezJobs

AfroLife
Response

4-state time
model

5

C

Partial

Partial

ADOPT fully

Mobile clock
(low-end)

5

C

C

C

ADOPT

ET
tax/pension calc

5

—

C

C

Export
mapping + awareness

Telegram
self-service

3

—

C

—

ADAPT
optional channel

Biometric

2

C

C

C

DEFER / gated

### 5.3 Marketplace / Gig Patterns

·
Verification
levels + skills matching (Upwork/Fiverr) → ADOPT progressive model.

·
Packaged services
+ open matching → both supported.

·
Payment
protection language → adapt to orchestration-only disclosure.

·
Moderated ratings
+ dispute evidence packs → ADOPT.

6–10. CONTROL, GATES,
TRACEABILITY, RULES, PRINCIPLES

Integration ICD template, Integration Status Register, Phase 0–7
exit criteria, 10-point Production Release Gate Checklist, Requirement
Traceability Matrix (FR-V81-* / NFR-V81-*), Business & Financial Rules, and
Implementation Principles remain exactly as defined in the v8.1/v9.0 control
layer. New research-derived steps inherit existing test IDs and phase gates.

New Implementation Emphasis from
Research

·
Prioritise SMS
reliability and local PSP (Chapa-class) certification early.

·
Ship Amharic
critical paths in Phase 1 Foundation.

·
Treat Fayda as
optional progressive verification, not mandatory.

·
Design
marketplace to support both packaged services and workforce shifts from day one
of Phase 4.

·
Keep all custody,
screening, biometric and Edir features feature-flagged OFF until their decision
gates close.

Approval Block

Role

Name

Signature

Date

AfroLife
Agency Project Sponsor

Finance &
Compliance Lead

Legal /
Regulatory Advisor

Property
Operations Lead

HR /
Workforce Lead

IT / Security
Representative

Privacy Owner

Product Owner

Best lessons from international
leaders and Ethiopian platforms synthesised into executable, regulated
workflows.

# Part XIII — ATOMIC WORKFLOW CATALOGUE (v10.0)

0. SHARED GRAMMAR, NOTIFICATIONS
& ATOMIC RULES

### 0.1 Common State Machine

Initiated → Draft → Submitted → Validation → Pending
Review/Approval → Accepted | Rejected | Needs Information → Executed/Confirmed
→ Reconciled/Closed

Every transition records: actor_id, UTC timestamp, prior_state,
new_state, reason_code, source_channel, correlation_id,
notifications_triggered[], evidence_refs[]. Transitions are append-only.

### 0.2 Notification Channels
(priority order)

·
SMS (primary for
critical milestones in Ethiopia)

·
In-app push /
inbox

·
Email

·
Optional Telegram
(self-service pattern)

### 0.3 Universal Atomic Rules

·
All external
writes carry idempotency_key; duplicates produce no second side-effect.

·
Timeout after
external call → Unknown Outcome; require authoritative reconciliation before
resubmit if legal document risk exists.

·
AI output is
advisory; high-impact or adverse decisions require explicit human confirmation.

·
Default-deny
access; permissions scoped to organisation / property.

·
Monetary values:
integer minor units + currency code (never float).

·
Soft-delete only
where lawful; hard-delete forbidden for financial/audit entities.

·
Amharic + English
on all critical paths.

1. WF-A — OWNER / EMPLOYER
ONBOARDING (ATOMIC)

### Actors

Prospect · Field Agent · Onboarding Reviewer · Compliance ·
Finance · Authorised Signatory · Org Admin · System

### Preconditions

·
Landing page +
privacy notice live

·
Service packages
& contract templates approved

·
Agent (if
present) has active credentials + delegated scope

Atomic Process Steps

ID

Actor

Atomic
Action

Validation
/ Rule

System
Effect

A.1.1

Prospect

Open landing
/ select Owner|Employer|Both

Valid
selection required

Lead record
created status=New; attribution_source stored

A.1.2

Prospect

Submit
contact + org summary

Phone/email
format; privacy notice accepted (required); marketing opt-in separate

Consent
record timestamped; duplicate check on phone/email/TIN

A.1.3

System

Detect
potential duplicate

Match on
phone OR email OR TIN

Flag or merge
task created; no second active org

A.2.1

Prospect/Agent

Enter legal
identity / business reg / tax data

Required
fields per entity type

Identity data
stored; source recorded

A.2.2

System

Verify
contact channel (OTP/SMS)

OTP match
within TTL

Channel
marked verified

A.2.3

Prospect

Optional
Fayda Digital ID step

Authorised
API only; min attributes; token not full payload

Higher
assurance flag set if successful

A.3.1

Prospect/Agent

Upload
authority / property / reg documents

File
type/size; virus scan; classification

Checksum
stored; access-scoped storage; evidence linked

A.3.2

System

Classify
document + extract metadata

Supported
types only

Document
typed; searchable metadata

A.4.1

Onboarding
Reviewer

Open review
queue item

Completeness
checklist

Review
started timestamp

A.4.2

Reviewer

Decide:
Approve | Needs Info | Reject | Escalate

Controlled
reason codes required for Reject/Needs Info

State
transition + notification to prospect/agent

A.4.3

System

If Needs Info
→ return field-level guidance

Specific
missing fields listed

Status=Needs
Information; SMS sent

A.5.1

Finance

Attach package,
territory, fee schedule, tax config, SLA

Standard
package or dual-approval for non-standard

Commercial
terms versioned & linked

A.6.1

Authorised
Signatory

Review exact
template version

Template
version hash matches approved

Review event
logged

A.6.2

Signatory

E-sign exact
version

Approved
e-sign provider only; agent cannot bind

Signature
evidence pack stored; contract Executed

A.6.3

System

Deny if agent
without contracting authority attempts sign

Authority
matrix check

Server deny +
audit + escalate

A.7.1

System/Org
Admin

Create org
workspace + roles + portal invitation

Contract must
be Executed

Workspace
live; invitation sent; checklist tracked

A.7.2

System

Block
verified listing publish until authority approved

Authority
status = Approved

Publish
action denied if not approved

A.8.1

System

Send SMS
confirmation of activation

Channel
verified

SMS delivered
or queued; event logged

Exception Paths (atomic)

·
Network loss
mid-form → draft auto-saved; no success toast.

·
Duplicate entity
→ merge task only; never second active org.

·
Virus detected →
quarantine file; reject upload; notify.

### Acceptance Tests

E2E-A01: Unverified owner → publish verified listing blocked +
review task created.

E2E-A02: Agent without authority → sign denied, logged, no
contract.

E2E-A03: Signed + activated → workspace + roles + invitation +
full audit exist.

2. WF-B — PROPERTY LISTING → LEASE
LIFECYCLE (ATOMIC)

### Actors

Owner/Authorised Agent · Property Reviewer · Prospective Tenant
· Leasing Reviewer · Finance · System

Lease State Machine (immutable
executed version)

Draft → Approval (if req) → Signature Pending → Executed →
Active → Renewal/Notice → Expired/Terminated

Distinct events: Signature · Commencement · Key Handover · Rent
Start

Atomic Process Steps — Listing

ID

Actor

Atomic
Action

Validation
/ Rule

System
Effect

B.1.1

Owner

Create
property + units

Required
address, type, unit count

Property/Unit
records created status=Draft

B.1.2

Owner

Upload photos
+ evidence

Virus scan;
type/size limits

Media linked;
checksums stored

B.1.3

Owner

Submit
listing for verification

Authority
must be Approved

Status=Pending
Verification; reviewer task created

B.1.4

Reviewer

Approve /
Reject / Needs Info

Controlled
reasons

Status
updated; SMS to owner

B.1.5

System

Publish
listing with verification level

Status=Published;
verification badge explicit

Visible in
search; never absolute ‘guaranteed safe’

Atomic Process Steps — Application
& Lease

ID

Actor

Atomic
Action

Validation
/ Rule

System
Effect

B.2.1

Tenant

Search /
filter listings

Published
only; Amharic/English

Results with
verification level shown

B.2.2

Tenant

View listing
+ submit application

Required
fields; screening OFF by default

Application
created status=Submitted

B.2.3

Leasing
Reviewer

Review
application

Adverse
decision requires human path + reason

Accepted /
Rejected / Needs Info

B.3.1

Parties

Negotiate
terms → generate draft lease

Approved
template only

Lease Draft
version created

B.3.2

Signatories

E-sign exact
version

All required
parties; approved e-sign provider

Lease
status=Executed; version IMMUTABLE

B.3.3

System

Record
Signature event (T1)

Distinct from
commencement

Signature
event logged

B.3.4

Owner/Agent

Record Key
Handover (T3)

After
Signature

Possession
event logged

B.3.5

System

Activate rent
schedule from Rent Start (T2)

Effective-date
rule

Charges
generated per schedule

B.4.1

System

Generate rent
invoice

Tax rules
from approved config

Invoice state
machine started

B.4.2

System

Send SMS rent
reminder

Configured
days before due

SMS event
logged

B.4.3

Tenant

Initiate
payment via local PSP

Orchestration
only; disclosure shown

Payment
initiation recorded; await confirmation

B.4.4

System

Receive PSP
callback (idempotent)

Signature
verified; duplicate ignored

Payment
confirmed → allocation → posting

B.5.1

System

Generate
owner statement

From posted
txs + retained rules

Versioned
statement; reproducible

B.6.1

Parties

Create
amendment

Linked
version + effective date; never overwrite Executed

New version
linked; original immutable

Critical Atomic Rules

·
Tenant A cannot
read Tenant B data → server-side deny + security event.

·
MoR invoice
timeout → Unknown Outcome; reconcile before retry; no duplicate legal invoice.

·
Unverified/expired
listing never shown as fully available.

3. WF-C — MAINTENANCE & VENDOR
FULFILMENT (ATOMIC)

### State Machine

Submitted → Triaged → Assigned → Accepted → In Progress →
Awaiting Review → Completed | Rework Required | Cancelled

Atomic Steps

ID

Actor

Atomic
Action

Validation
/ Rule

System
Effect

C.1.1

Resident/Owner

Submit
request + photos

Required
description; optional media

WO created
status=Submitted; SMS ack

C.1.2

System/AI

Suggest
classification/priority

AI advisory
only; cannot downgrade safety-critical

Suggestion
attached; human can override

C.1.3

Supervisor

Triage + set
priority/SLA

Priority enum
controlled

Status=Triaged;
SLA clock started

C.2.1

Supervisor

Assign
internal tech or external vendor

Assignee has
capacity/credentials

Status=Assigned;
SMS to assignee

C.2.2

Vendor/Tech

Accept
assignment

Only assigned
party can accept

Status=Accepted

C.2.3

System

Deny URL
guess by unassigned vendor

Server-side
access check

Deny + log;
no metadata leakage

C.3.1

Vendor/Tech

Mark In
Progress + update notes

Status
transition allowed

Status=In
Progress; SMS to resident

C.3.2

Vendor/Tech

Submit
completion + evidence

Required
evidence per type

Status=Awaiting
Review

C.3.3

System

Idempotent
completion callback

Duplicate key
ignored

Single
completion record only

C.4.1

Supervisor

Review
completion

Approve or
Rework

Completed or
Rework Required

C.5.1

Vendor

Submit
invoice

E-invoice
validated if required

Invoice
linked to WO

C.5.2

System

Match invoice
to WO + approved amount

Mismatch →
exception queue; no auto-approve

Match result
recorded

C.5.3

Finance

Approve
invoice (separate duty)

Maker ≠
Approver

Invoice
approved for payment

C.5.4

Finance
Approver

Release
payment

Within
limits; dual control

Payment
initiated via PSP

Emergency Path

·
AI or
notification failure → emergency on-call workflow remains available via
approved path.

4. WF-D — WORKFORCE, ATTENDANCE
& PAYROLL HAND-OFF (ATOMIC)

Mandatory Distinctions

Scheduled ≠ Recorded ≠ Approved ≠ Payable |
Export ≠ Filing ≠ Payment

Atomic Steps

ID

Actor

Atomic
Action

Validation
/ Rule

System
Effect

D.1.1

Manager

Create shift
/ rota

Worker
classification explicit (employee vs contractor)

Shift
status=Scheduled; labour cost visible

D.1.2

Manager

Assign worker
to shift

Worker not
terminated; has capacity

Assignment
linked

D.2.1

Worker

Clock in
(mobile)

Low-end
device support; offline queue possible

Recorded time
event created

D.2.2

Worker

Clock out

Paired with
clock-in

Duration
calculated; status=Recorded

D.2.3

System

Detect
missing/irregular clock

Policy rules

Exception
queued for manager

D.3.1

Manager

Review
exception / approve time

Labour
thresholds warning only until legal hard-block approved

Status=Approved;
original retained on correction

D.3.2

Manager

Correct time
entry

Reason +
approver required

Original +
revised + reason + editor + timestamp stored

D.4.1

System

Calculate
payable time

Under
effective-dated Ethiopian labour config

Payable time
finalised

D.5.1

HR/Finance

Generate
payroll export

Versioned
mapping; encrypted

Export file
created; never claimed as filed/paid

D.5.2

System

Hand-off to
external payroll

Idempotent;
failed rows requeueable

Export status
tracked

D.6.1

System

On worker
termination

Immediate

Sessions
revoked; new shifts blocked; history retained

D.6.2

Terminated
Worker

Attempt
accept new shift

Status check

Action
blocked

Gated Features

·
Biometric /
continuous location → FEATURE-FLAGGED OFF until privacy + DPIA.

·
Hard labour
blocks → only after REG-V81-003 legal sign-off.

5. WF-E — INSURANCE BROKERAGE
(GATED ATOMIC)

STATUS: FEATURE-FLAGGED OFF until DEC-V8-002 + REG-V81-006
APPROVED.

Atomic Invariants (when enabled)

ID

Atomic
Rule

System
Behaviour

E.1

Quote /
proposal / payment initiation ≠ Active policy

Only insurer
confirmation + evidence sets Confirmed/Active

E.2

Insurer
timeout

Status=Pending
Verification; late callback idempotent

E.3

Agent
attempts to promise coverage or alter terms

Server deny +
audit + escalate

E.4

Premium
custody

DISABLED by
default

E.5

Feature flag
OFF → any API call

Server deny;
no data created; event logged

6. WF-F — MARKETPLACE SEARCH,
MATCH & BOOK (ATOMIC)

Atomic Steps

ID

Actor

Atomic
Action

Validation
/ Rule

System
Effect

F.1.1

Customer

Search /
browse (packaged or open)

Filters
applied

Results with
explicit verification level

F.1.2

System

Display
verification level

Contact /
Documents / Fayda / Performance

Never
absolute ‘guaranteed safe’ badge

F.2.1

Customer

Request
booking or purchase gig

Required
parties defined

Request
created status=Pending Acceptance

F.2.2

Provider

Accept /
Decline

Within SLA

All required
parties must accept

F.2.3

System

Gate private
contact data

Only after
policy permits

Contact
revealed or remains hidden

F.3.1

System

Present
cancellation / refund / dispute rules

BEFORE final
commit

Rules
acknowledgement recorded

F.3.2

Customer

Confirm
commit + any payment condition

Payment
orchestration; disclosure shown

Booking
Confirmed when all conditions met

F.4.1

Parties

Submit review
after fulfilment

Evidence
optional

Review enters
moderation queue

F.4.2

Moderator

Approve /
Reject / Escalate review

Appeal path
available

Published or
rejected with reason

7. WF-G — AGENT / SUPER-AGENT
NETWORK (ATOMIC)

Atomic Steps

ID

Actor

Atomic
Action

Validation
/ Rule

System
Effect

G.1.1

Applicant

Submit agent
application

Required
identity + documents

Application
Submitted

G.1.2

Compliance

Review +
approve credentials + scope

Authority
matrix defined

Agent active
with delegated scope

G.2.1

Agent

Generate lead
/ assist onboarding

Within scope

Attribution
recorded for commission

G.2.2

System

Block bind /
collect / promise coverage if unauthorised

Authority
check on every sensitive action

Deny + audit
+ escalate

G.3.1

System

Accrue
commission

Basis =
reconciled collections only

Accrual
ledger entry; estimated ≠ payable

G.3.2

Finance

Approve
commission payment

Maker ≠
Approver; not agent’s supervisor alone

Payment
released after dual control

G.4.1

Central

Suspend agent

Reason
required

Sessions
revoked; new leads blocked; cases reassigned; history retained

8. WF-H — EDIR COOPERATIVE
(DISABLED)

FEATURE-FLAGGED OFF. Hard gate: legal form, registration,
bylaws, governance, payment/custody, tax, audit, dispute rules signed off
before any enablement. API calls while OFF → server deny, no data created,
event logged.

9. WF-I — SUPPORT & COMPLAINTS
(ATOMIC)

Atomic Steps

ID

Actor

Atomic
Action

Validation
/ Rule

System
Effect

I.1.1

User

Raise support
request / complaint

Category
selected

Case created;
SMS ack

I.1.2

System

Automated
triage (advisory)

Cannot
suppress safety/fraud/privacy/legal

Suggested
priority/route; human can override

I.2.1

Support

Request
sensitive access

Just-in-time
approval required

Access
granted time-limited + audited

I.2.2

System

Route agent
complaint

Never solely
to agent or their commission approver

Routed to
independent queue

I.3.1

Support/Supervisor

Resolve case

Outcome +
rationale + corrective action + refund ref + appeal route required

Case Closed;
SMS to user

I.3.2

System

Financial/legal
correction

Must go
through formal workflow; not free-form case edit

Linked to
formal adjustment record

10. CONTROL LAYERS SUMMARY

### 10.1 Regulatory (binding)

·
REG-V81-001/002
Personal Data + e-Transactions → LEGAL VALIDATION REQUIRED

·
REG-V81-003
Labour → configurable warnings until hard-block sign-off

·
REG-V81-004/005
e-Invoicing + VAT → LEGAL VALIDATION REQUIRED

·
REG-V81-006
Insurance → DECISION REQUIRED; module OFF

·
REG-V81-009
Payments → orchestration-only default (DEC-V8-003)

·
REG-V81-011
Screening → FEATURE-FLAGGED OFF

·
REG-V81-012 Edir
→ FEATURE-FLAGGED OFF

### 10.2 Financial

·
FF-001 to FF-009
money-flow catalogue remains binding.

·
Posted journals
immutable; corrections via reversal + replacement.

·
Segregation of
duties: Maker ≠ Approver on payments, commissions, high-value refunds.

·
Mandatory
pre-payment disclosures (recipient, custody status, fees, refund rules).

### 10.3 Key Open Decisions

·
DEC-V8-001 Scope
P1/P2 · DEC-V8-002 Insurance role · DEC-V8-003 Custody model

·
DEC-V8-005 Edir
form · DEC-V8-006 Agent commercial policy · DEC-V8-009 MoR path

### 10.4 Production Gate (must all be
true)

·
All Must-have
requirements have test evidence or approved waiver.

·
Legal/tax
sign-off for enabled e-invoicing, VAT, labour, privacy, e-sign.

·
Data isolation
tests pass across UI/API/exports/files/jobs.

·
Finance totals
reconcile across invoice/payment/allocation/journal/statement.

·
Decision log
items for enabled modules are DECIDED.

### 10.5 Implementation Order

·
Phase 1
Foundation (identity, isolation, audit, Amharic, SMS, integration registry)

·
Phase 2 Property
ops (WF-A/B/C atomic)

·
Phase 3 Finance
& Workforce (WF-D + payments + tax)

·
Phase 4 Agent
& Marketplace (WF-G/F)

·
Phase 5–6 Gated
modules only after decisions close

APPENDIX — STATUS TAXONOMY &
GLOSSARY

MANDATORY · SHOULD · PROPOSED · LEGAL VALIDATION REQUIRED ·
DECISION REQUIRED · VENDOR/API DEPENDENCY · FEATURE-FLAGGED OFF — definitions
unchanged from control layer.

Atomic process = smallest indivisible user or system action that
produces a state change, validation, notification or audit event.

Unknown Outcome = timeout state requiring authoritative
reconciliation before resubmit.

Orchestration-only = platform initiates/records payment via
licensed PSP but does not hold customer funds.

Every workflow decomposed to the
smallest executable process step. Ready for developer implementation &
legal review.

# Part XIV — DETAILED VALIDATION RULES (v10.1)

0. SHARED VALIDATION FRAMEWORK

### 0.1 Validation Categories

Category

Description
& Enforcement Point

Field

Required /
optional, data type, length, pattern, enum membership. Enforced client-side
(UX) + server-side (authoritative).

Format

Phone (E.164
or local ET), email (RFC 5322 simplified), TIN, UUID, date (ISO-8601),
currency minor units.

Business

Domain rules
(e.g. rent start ≥ signature date, commission basis = reconciled only).
Server-side only.

Cross-field

Dependencies
between fields (e.g. if entity_type=Company then TIN required).

State-transition

Allowed
from→to transitions only; actor must hold required permission for the
transition.

Security

Default-deny;
organisation/property scope; authority matrix; sensitive-access just-in-time.

Integration

Idempotency
key present; signature/HMAC valid; timeout → Unknown Outcome; no
auto-resubmit of legal docs.

Idempotency

Duplicate key
within TTL produces same result; no second side-effect (payment, invoice,
completion).

### 0.2 Universal Field Rules

·
id: UUID v4,
server-generated, immutable.

·
organisation_id /
tenant_id: server-assigned; client cannot set or change.

·
created_at /
updated_at: UTC ISO-8601; server-controlled.

·
version:
optimistic-lock integer; increment on every successful update; conflict → 409.

·
status:
controlled enum only; free-text forbidden.

·
Monetary amount:
integer minor units (e.g. 15000 = 150.00 ETB) + ISO 4217 currency code; never
binary float.

·
Phone: E.164
preferred; local Ethiopian formats accepted and normalised.

·
Email: lowercase
normalised; max 254 chars.

·
Soft-delete:
deleted_at set only where lawful; financial/audit entities never hard-deleted.

### 0.3 Error Response Contract

·
All validation
failures return structured error: { code, field, message_am, message_en,
correlation_id }.

·
Client must
display Amharic message when locale=am; English otherwise.

·
Security denials
never leak existence of other tenants’ data.

1. WF-A — ONBOARDING: DETAILED VALIDATION
RULES

### 1.1 Field Validation

Field

Required

Type
/ Pattern

Business
/ Cross-field Rules

entity_type

Yes

Enum:
Owner|Employer|Both

Determines
subsequent required fields

full_name /
org_name

Yes

String 2–200
chars

Trim; reject
pure whitespace

phone

Yes

E.164 or
local ET

Normalise;
unique among active leads/orgs or flag duplicate

email

Yes*

RFC
simplified

*Required if
phone not verified; unique check

tin

Conditional

Ethiopian TIN
pattern

Required if
entity_type involves business; unique

privacy_accepted

Yes

Boolean true

Must be true
at submission; timestamp recorded

marketing_opt_in

No

Boolean

Default
false; independent of privacy

authority_docs[]

Yes

File list

Min 1 file;
each ≤10 MB; allowed MIME; virus-clean

fayda_token

No

Opaque token

Store
reference only; never full payload; purpose-limited

### 1.2 State-Transition Validation

·
New → Draft:
always allowed for creator.

·
Draft →
Submitted: all required fields present + privacy_accepted=true + at least one
contact channel.

·
Submitted →
Pending Review: automatic after successful validation.

·
Pending Review →
Approved: only Onboarding Reviewer or higher; completeness checklist must pass.

·
Pending Review →
Needs Information: reason_code required; field-level guidance required.

·
Pending Review →
Rejected: reason_code from controlled list required.

·
Approved →
Contracted: commercial terms attached + e-sign completed by authorised
signatory.

·
Contracted →
Active: system only; creates workspace.

·
Any → Rejected
terminal for that lead version; new lead may be created after cooldown.

### 1.3 Security Validation

·
Agent may
create/update lead only within own territory/scope.

·
Agent cannot
self-approve high-risk onboarding (authority matrix).

·
Agent without
contracting_authority cannot invoke sign action → 403 + audit.

·
Reviewer cannot
approve own submitted lead.

### 1.4 Integration Validation

·
OTP verify: code
match + within TTL + max attempts; lockout after threshold.

·
Fayda call:
authorised API only; timeout → graceful fallback (no silent verified).

·
E-sign provider:
only approved provider; signature evidence pack must contain provider ref +
timestamp + hash.

2. WF-B — PROPERTY / LEASE:
DETAILED VALIDATION RULES

### 2.1 Listing Field Validation

Field

Required

Type
/ Pattern

Rules

property.address

Yes

Structured +
free text

City/region
required; Ethiopia locality rules configurable

unit.count

Yes

Integer ≥1

Must match
created unit records

rent_amount

Yes

Integer minor
units

>0;
currency=ETB default

listing.status

System

Controlled
enum

Draft|Pending
Verification|Published|Paused|Reserved|Rented|Expired|Rejected

verification_level

System

Enum

None|Contact|Documents|Fayda|Full;
never absolute ‘guaranteed safe’

media[]

Yes (≥1)

Image/PDF

Virus scan;
max size; allowed MIME; checksum

### 2.2 Lease Field & Business
Validation

Field
/ Rule

Required

Validation

lease.template_version

Yes

Must match
currently approved template hash; reject if superseded

signature_date
(T1)

Yes

≤ today;
recorded as distinct event

rent_start
(T2)

Yes

≥
signature_date; business rule configurable

key_handover
(T3)

Yes*

*Required
before occupancy status change; ≥ signature_date

executed_version

System

IMMUTABLE
after status=Executed; amendments create linked new version

parties[]

Yes

All required
signatories must have valid e-sign before Executed

deposit_amount

Conditional

If present
>0; custody model follows DEC-V8-003 (default not held by AfroLife)

### 2.3 State-Transition Validation
(Lease)

·
Draft → Signature
Pending: all parties identified + template locked.

·
Signature Pending
→ Executed: all required signatures present + evidence pack complete.

·
Executed →
Active: commencement conditions met (configurable).

·
Any amendment:
creates new version with effective_from; original remains immutable and linked.

·
Active →
Terminated: notice rules + final account required.

### 2.4 Payment & Invoice
Validation

·
Invoice amount =
sum of charge lines; tax calculated from approved tax engine version.

·
Payment
initiation ≠ confirmation; confirmation requires signed PSP callback.

·
Duplicate
callback (same idempotency key) → no second posting.

·
Timeout → Unknown
Outcome; block resubmit until authoritative reconciliation.

·
Tenant A cannot
read Tenant B invoice/document → 403 + security event.

3. WF-C — MAINTENANCE: DETAILED
VALIDATION RULES

### 3.1 Work Order Field Validation

Field

Required

Type

Rules

description

Yes

String
10–2000

Trim; reject
empty

priority

Yes

Enum

AI may
suggest; human may override; AI MUST NOT downgrade safety-critical

property_id /
unit_id

Yes

UUID

Must belong
to caller’s accessible scope

media[]

No

Image

Virus scan;
size/MIME limits

assignee_id

Conditional

UUID

Required for
Assigned; must have active credentials

### 3.2 State-Transition & Access
Validation

·
Submitted →
Triaged: Supervisor or system policy.

·
Triaged →
Assigned: assignee must exist and be active.

·
Assigned →
Accepted: only the assigned party.

·
Unassigned party
opens WO URL → 403 + security log; zero metadata leakage.

·
In Progress →
Awaiting Review: completion evidence rules per category.

·
Duplicate
completion callback → single record; no duplicate invoice.

### 3.3 Invoice Matching Validation

·
Vendor invoice
must reference existing Completed (or approved) WO.

·
Amount match
within configured tolerance; mismatch → exception queue; never auto-approve.

·
Invoice approval
and payment release are separate duties (Maker ≠ Approver).

·
E-invoice
compliance check before payment release when in scope.

4. WF-D — WORKFORCE: DETAILED
VALIDATION RULES

### 4.1 Time & Shift Validation

Field
/ Rule

Required

Validation

worker.classification

Yes

Enum:
Employee | IndependentContractor; never conflated

shift.start /
end

Yes

end >
start; within configurable horizon

clock_in /
clock_out

Yes*

*For Recorded
state; offline queue allowed; device low-end capable

correction.original_value

System

Always
retained on correction; never overwritten

correction.reason

Yes

Required when
corrected; approver + timestamp required

payable_time

System

Calculated
only from Approved time under effective-dated labour config

labour_threshold

Config

Warning only
until REG-V81-003 hard-block approved; then enforce

### 4.2 Termination & Access
Validation

·
On termination:
sessions revoked immediately; accept-new-shift blocked; history retained.

·
Terminated worker
clock or shift-accept attempt → 403.

·
Biometric data:
FEATURE-FLAGGED OFF; if ever enabled → minimisation + DPIA + lawful basis
required.

### 4.3 Payroll Export Validation

·
Export contains
only Approved → Payable rows for the period.

·
Platform never
sets status ‘filed’ or ‘paid’ on export.

·
Failed rows
re-queueable; successful rows not re-exported without new period.

·
Mapping version
recorded; totals control hash generated.

5. WF-E — INSURANCE (GATED)
VALIDATION

·
Feature flag OFF
→ any write/read of insurance entities → 403 + no data created + event logged.

·
When enabled:
quote/proposal/payment_initiation status ≠ Active.

·
Only insurer
authoritative confirmation (signed callback + required evidence) may set
Active.

·
Timeout → Pending
Verification; late callback must be idempotent.

·
Agent action that
promises coverage or alters insurer terms → 403 + audit + escalate.

·
Premium custody
operations → disabled unless DEC-V8-003 and licence explicitly allow.

6. WF-F — MARKETPLACE VALIDATION

### 6.1 Search & Listing
Validation

·
Only Published
listings with allowed verification_level appear in public search.

·
verification_level
displayed exactly as stored; no inflation.

·
Private contact
fields null/redacted until policy permits (post-acceptance or paid).

### 6.2 Booking Validation

·
All required
parties must Accept before status=Confirmed.

·
Cancellation /
refund / dispute rules must be acknowledged (boolean true) before final commit.

·
Payment condition
(if any) verified via PSP confirmation before Confirmed.

·
Escrow operations
→ disabled until custody decision allows.

### 6.3 Review Validation

·
Review allowed
only after Confirmed + fulfilment window.

·
Review enters
moderation; not auto-published.

·
Appeal path must
exist; moderator decision recorded with reason.

7. WF-G — AGENT NETWORK VALIDATION

·
Every sensitive
action (sign, price change, collect, promise coverage) checks authority matrix
→ 403 if missing.

·
Commission
accrual: amount calculated only from reconciled collection rows; estimated rows
ignored.

·
Commission
payment: Maker ≠ Approver; agent’s direct supervisor alone insufficient.

·
Suspension:
sessions revoked + new lead intake disabled + open cases reassigned in single
transaction.

·
Hierarchy grants
oversight visibility only; never unrestricted customer PII access.

8. WF-I — SUPPORT VALIDATION

·
Automated triage
cannot close or suppress cases tagged safety | fraud | privacy | legal.

·
Sensitive-data
access: just-in-time approval required; access token time-limited; every access
audited.

·
Complaint where
target is an agent: routing excludes that agent and their commission approver.

·
Resolution record
must contain: outcome, rationale, corrective_action, refund_reference
(nullable), appeal_route.

·
Financial or
legal correction must reference formal workflow ID; free-form case edit of
money/legal fields forbidden.

9. CROSS-CUTTING VALIDATION RULES

### 9.1 Idempotency

·
All PSP
callbacks, insurer callbacks, vendor completion webhooks, e-invoice clearances
require Idempotency-Key (or equivalent).

·
Duplicate key
within TTL → return original result; zero additional side-effects.

·
Missing key on
write that can produce legal documents → 400.

### 9.2 Unknown Outcome

·
After timeout on
any operation that can create a legal document (invoice, policy, signed
contract): status=Unknown Outcome.

·
Resubmit blocked
until authoritative reconciliation confirms absence of prior document.

·
Operator replay
available via privileged tool with full audit.

### 9.3 Multi-tenancy & Isolation

·
Every
query/mutation filtered by organisation_id (server-enforced).

·
Cross-tenant IDOR
attempts → 403 + security event; no existence leak.

·
Exports, reports,
files, background jobs inherit same isolation.

### 9.4 Audit

·
Append-only audit
log for: state transitions, permission changes, financial adjustments,
sensitive access, configuration changes.

·
Audit records
contain actor, timestamp, before/after (or ref), reason, correlation_id.

### 9.5 Localisation &
Notification

·
Critical
user-facing validation messages available in Amharic and English.

·
SMS content
length-aware; critical status changes generate SMS when channel verified.

10. CONTROL LAYER REMINDER

All validation rules above operate inside the binding Regulatory
Compliance Matrix, Financial Flow Catalogue, Decision Log and Production
Release Gates defined in the master control layer. Validation does not override
a FEATURE-FLAGGED OFF or DECISION REQUIRED gate.

## Appendix C — MERGE TRACEABILITY AND REVIEW FINDINGS

APPENDIX C.0 —
v10.2 REVIEW NOTE

v10.2 is a controlled editorial and implementation-readiness
revision of the v10.1 complete master. No substantive business control is
removed. The changes clarify approval posture, expose release blockers earlier,
remove inherited source-file end markers, improve terminology, and provide a
compact dashboard for implementation planning.

C.1 Source disposition

·
v8.0 Research/Journeys Benchmark: superseded
source layer; its substantive journey and benchmark content is represented in
later v9.x layers.

·
v8.1 Implementation Master (two identical
files): consolidated into the v9.0 control baseline; duplicate file omitted.

·
v9.0 Implementation Master: retained in full as
the authoritative control and implementation baseline.

·
v9.1 Benchmarked Workflows: benchmark patterns
are carried forward through the v9.2 research-enhanced layer and the v10.x
workflow detail; no conflicting control was found.

·
v9.2 Research Enhanced: retained as the
research/benchmark enhancement layer.

·
v10.0 Master Atomic Workflows: retained as the
atomic process catalogue.

·
v10.1 Validation Rules: retained as the field,
business, cross-field, state, security, integration and idempotency validation
layer.

C.2 Review findings closed by this merge

·
Version ambiguity resolved: the deliverable is
explicitly v10.1 Complete Master, with v9.0 as control baseline and v10.x as
later implementation precision.

·
Atomic steps and validation rules are no longer
detached addenda; they are incorporated into the controlled master and linked
by workflow IDs and shared gates.

·
Duplicate v8.1 copies are removed from the
controlled set.

·
Feature gates, orchestration-only financial
posture, unknown-outcome handling, idempotency, tenant isolation and audit
requirements are preserved across all layers.

·
The document distinguishes research/benchmark
evidence from approved Ethiopian legal requirements and keeps legal validation
gates visible.

C.3 Remaining approval actions before production

·
Close and evidence DEC-V8-001, DEC-V8-002,
DEC-V8-003, DEC-V8-005, DEC-V8-006 and DEC-V8-009, or record approved
replacements.

·
Obtain legal/tax/privacy approvals for each
enabled regulatory rule and effective-dated configuration.

·
Complete API/interface control documents for
every confirmed provider before production credentials.

·
Produce field-level data dictionary, ERD,
migrations, retention classes, ownership and test evidence.

·
Pass the full production release gate checklist,
including restore testing, reconciliation, isolation, security and UAT
evidence.

END OF BASE MASTER CONTENT

This document is the consolidated delivery artifact
generated from the supplied archive after review and merge. Any future change
must be versioned, approved and recorded in the change log and decision
register.

# Part XV — GOVERNED ENABLEMENT AND EXPERIENCE DESIGN

This layer turns the FSD into an implementation-ready
experience and design system. “Enablement” means the feature-flagged path, UI
states, APIs, tests, operational runbooks, and approval evidence are prepared.
It does not override legal, licensing, custody, privacy, security, or
governance gates. No disabled capability may be activated merely because its
screens or code exist.

### 15.1 Enablement policy

·
Every gated capability has a server-side feature
flag, a visible but non-misleading UI state, an owner, an approval checklist,
an evidence pack, and a rollback switch.

·
The server is authoritative: direct API calls
while a capability is disabled return a safe denial, create no business record,
and generate an audit/security event.

·
A gated module may move through Design Ready →
Build Ready → Pilot Ready → Approved for Production → Enabled. Only the final
state permits production activation.

·
User-facing copy must distinguish “Coming soon”,
“Unavailable in this organisation”, “Pending verification”, and “Active”; never
imply a service is available when it is not.

·
Activation is organisation-scoped and
reversible. A kill switch must disable new actions while preserving audit
history and safe read-only access where lawful.

### 15.2 Disabled-function enablement register

Capability

Current
flag / safe default

Enablement
criteria

UI/UX
behaviour while disabled

Release
owner

Insurance brokerage (WF-E)

insurance.enabled = false

DEC-V8-002 and REG-V81-006 approved; licence/appointment confirmed;
insurer ICD signed; authoritative callback tested; disclosures, complaints
and audit UAT passed.

Show “Insurance services are not currently available”; no
quote/policy data creation; preserve enquiry/contact path only.

Compliance + Product + Insurance Officer

Screening / adverse application decisions

screening.enabled = false

Lawful provider and legal basis approved; data-minimisation/retention
set; human-review path and appeal tested; provider contract and DPIA
approved.

Do not expose “screened” or “approved” badges; use manual review
status and clear disclosure.

Compliance + Leasing Product

Edir cooperative (WF-H)

edir.enabled = false

Legal form, registration, bylaws, governance, eligibility, custody,
tax, audit, disputes and dual-control approvals complete.

Display “Programme not yet available”; no membership, benefit,
contribution, or payout records.

Sponsor + Legal + Finance

Escrow / customer-fund custody

custody.mode = orchestration_only

Separate legal authorisation, segregated accounts, reconciliation,
safeguarding controls, refund policy, audit and provider evidence approved.

Use “Payment initiated” / “Payment confirmed” only; never show escrow
or held-funds language.

Finance + Legal

Biometric / continuous location

workforce.biometric = false; workforce.location = minimised

Privacy notice, lawful basis, DPIA, necessity test, access/retention
controls and employee consultation approved.

Use ordinary clocking and optional coarse location only if approved;
explain why data is requested.

Privacy + Workforce

Hard labour-law blocks

labour.enforcement = warning

REG-V81-003 approved, effective-dated rules tested, exception/appeal
process and counsel sign-off complete.

Show warning and review task; do not silently block until approved
enforcement is enabled.

Legal + Workforce

AI high-impact decisions

ai.high_impact_auto_action = false

Model evaluation, bias/privacy/prompt-injection tests, human
override, monitoring, kill switch and owner approved.

Label suggestions as AI-assisted; require human confirmation for
adverse/high-impact outcomes.

AI Safety + Product

### 15.3 Activation gate record

Gate

Required
evidence

Pass
condition

G1 — Legal and policy

Signed legal memo, policy version, jurisdiction, effective date,
approver

All applicable rules are APPROVED, not merely researched.

G2 — Product and UX

Approved user journeys, content, disclosures, accessibility review,
disabled/error states

No misleading availability or status claims.

G3 — Technical controls

Feature flag, server denial, tenant scope, audit events, kill switch,
rollback runbook

Direct API and UI tests pass.

G4 — Integration

Provider ICD, authentication/signature tests, idempotency, timeout
and reconciliation tests

Authoritative provider states are handled correctly.

G5 — Operational readiness

Support queue, incident runbook, monitoring, training, escalation and
data-retention setup

Named owner and response targets exist.

G6 — Pilot and release

UAT evidence, security/privacy sign-off, risk acceptance, release
approval

Pilot results accepted and production change approved.

# Part XVI — UI/UX, INFORMATION ARCHITECTURE AND WORKFLOW DESIGN

The UI/UX system is role-based, mobile-first, low-bandwidth
tolerant, Amharic/English ready, and designed around workflow state rather than
isolated screens. Every form must expose status, owner, next action, evidence,
validation, save/synchronisation state, and audit-sensitive consequences.

### 16.1 Information architecture

Role
area

Primary
navigation

Core
screens

High-risk
confirmations

Organisation / owner portal

Overview · Properties · Leases · Maintenance · Statements · Documents
· Support

Organisation dashboard, property list, lease timeline, work-order
inbox, owner statement, document vault

Publish listing, sign lease, approve cost, publish statement, change
bank/payment details

Tenant / resident portal

Search · Applications · Lease · Payments · Maintenance · Support

Search results, listing detail, application tracker, lease timeline,
payment status, maintenance request

Submit application, confirm payment, accept booking, disclose
sensitive issue

Workforce portal

My shifts · Clocking · Exceptions · Leave · Payslips/exports ·
Support

Shift calendar, offline clocking, correction request, manager
approval queue

Approve payable time, correct time, terminate/offboard worker

Agent workspace

Leads · Cases · Assignments · Commissions · Training · Support

Lead pipeline, delegated-scope view, case detail, commission
statement

Sign, price change, collect funds, promise coverage, access PII

Operations console

Queues · Reviews · Work orders · Finance · Integrations · Reports · Audit

Universal queue, verification review, reconciliation, integration
health, audit explorer

Approve invoice/refund, close period, enable flag, grant emergency
access

Support console

Cases · Escalations · Knowledge · QA · Audit

Case list, safe customer view, escalation panel, resolution form

Sensitive access, legal/financial correction, complaint against agent

### 16.2 UI state and content rules

·
Use text plus iconography plus colour; colour
alone never communicates status.

·
Every asynchronous action shows one of Saved,
Syncing, Submitted, Pending, Confirmed, Failed, or Unknown Outcome.

·
Every error has a safe English and Amharic
message, a machine code, correlation ID, and next-step guidance where safe.

·
Forms preserve entered data during recoverable
network failure and visibly show the last saved timestamp.

·
High-impact actions require a confirmation sheet
that states actor, object, amount/status change, effective date, irreversible
consequences, and audit notice.

·
Disabled modules use honest explanatory content and
a safe alternative; never render dead-end buttons without context.

### 16.3 Reusable atomic workflow UI table

UI
layer

Required
component

Behaviour
/ acceptance criteria

Entry

Role-specific landing card + next-action queue

Shows only permitted tasks; scope and status are
server-authoritative.

Input

Progressive form + field help + autosave

Inline validation, Amharic/English copy, draft recovery, document
classification, accessibility labels.

Review

Evidence panel + decision rail

Shows required evidence, reason codes, conflict warnings, reviewer
identity and delegated authority.

Commit

Confirmation sheet + disclosure block

Shows legal recipient, amount, status, effective date,
refund/cancellation terms and irreversible effects.

Async

Timeline + notification centre

Shows state transition, correlation ID, provider status,
retry/reconciliation status and notification history.

Exception

Exception queue + recovery action

Separates retry-safe failures from Unknown Outcome; requires authority
for replay.

Audit

Activity timeline + export log

Append-only, filtered by scope, with before/after references and
sensitive-access indicator.

### 16.4 Workflow-to-screen implementation table

Workflow

Primary
screens to implement

Critical
UI states

Required
design deliverables

WF-A Onboarding

Landing, progressive intake, OTP, document upload, reviewer queue,
commercial terms, e-sign, activation

Draft, Needs Information, Rejected, Awaiting Signature, Active,
duplicate flagged

Mobile form, evidence viewer, reviewer decision rail, activation
confirmation

WF-B Property/Lease

Property editor, listing review, search, application, lease builder,
signature, handover, invoice/payment, statement

Pending Verification, Published, Signature Pending, Unknown Outcome,
Active, Terminated

Listing cards, lease timeline, payment status, statement table,
disclosure modal

WF-C Maintenance

Request form, triage queue, assignment board, vendor view, evidence
review, invoice match

Submitted, Assigned, In Progress, Rework, Mismatch, Paid

Priority badge, SLA timer, evidence gallery, exception queue

WF-D Workforce

Rota, worker schedule, clocking, exception queue, approval, export
status, offboarding

Offline, Recorded, Needs Review, Approved, Payable, Exported, Revoked

Low-end mobile clocking, correction diff view, payroll control totals

WF-E Insurance (gated)

Availability state, needs analysis, quote, proposal, insurer
confirmation, renewal

Unavailable, Pending Verification, Confirmed, Active only after
authority

Gated-state screen, insurer evidence panel, disclosure/consent flow

WF-F Marketplace

Search, result/detail, booking request, acceptance, commitment,
review moderation

Pending Acceptance, Confirmed, Cancelled, Disputed, Moderation

Trust signals, contact redaction, rule acknowledgement, review appeal

WF-G Agent network

Application, scope, lead pipeline, commission, suspension/offboarding

Pending Review, Active, Restricted, Suspended, Payable/Not Payable

Authority matrix display, commission ledger, suspension checklist

WF-H Edir (disabled)

Availability state, governance checklist, future enrolment
placeholder

Unavailable; no contribution/benefit creation

Non-deceptive coming-soon screen, governance readiness view

WF-I Support

Case intake, queue, safe customer view, sensitive-access approval,
resolution, appeal

New, Triage, Escalated, Pending Customer, Resolved, Appealed

Case timeline, redaction, approval drawer, resolution template

### 16.5 Responsive and accessibility targets

·
Design breakpoints: 360–479px mobile, 480–767px
large mobile, 768–1023px tablet, 1024px+ desktop; critical actions remain
usable at 320px equivalent content width.

·
Target WCAG 2.2 AA subject to project approval:
keyboard access, visible focus, semantic headings, screen-reader labels,
contrast, reduced-motion option, and non-colour status cues.

·
Low-bandwidth mode reduces image payloads,
defers non-critical analytics, queues writes safely, and makes sync status
explicit.

·
Usability acceptance requires representative
Amharic and English testing with owner, tenant, worker, agent, reviewer,
finance, and support personas.

# Part XVII — AFROLIFE BRAND AND VISUAL ASSET GUIDELINES

The following is the proposed AfroLife product visual system
for implementation and brand approval. It is intentionally practical: one
visual language should work across web, mobile, SMS-adjacent status screens,
dashboards, documents, presentations, and marketplace surfaces.

### 17.1 Brand expression

Brand promise: trusted everyday infrastructure for property,
work, services, and community. The visual expression should feel human,
reliable, locally grounded, and operationally clear — not speculative, overly
luxurious, or fintech-aggressive.

### 17.2 Colour tokens

Token

Hex

Use

Accessibility
rule

AfroLife Navy

#17324D

Primary headings, navigation, high-trust surfaces

Use white text only after contrast check.

AfroLife Teal

#0F766E

Primary action, verified/success accent, links

Never use colour alone for success or verification.

AfroLife Gold

#D9A441

Highlights, selected states, warmth, key metrics

Use sparingly; pair with text/icon.

Earth Sand

#F4EFE6

Warm background, cards, editorial sections

Do not use for disabled text.

Cloud

#F7FAFC

Page background, forms, neutral containers

Maintain separation with borders/shadows.

Ink

#17202A

Body text

Minimum normal-text contrast target.

Muted Slate

#5B6775

Secondary text, metadata

Do not use for essential instructions below contrast target.

Critical Red

#B42318

Danger, denial, fraud/privacy escalation

Pair with label and icon.

Warning Amber

#B54708

Pending, review required, caution

Pair with label and reason.

### 17.3 Typography

·
Primary UI font: Inter or an approved equivalent
with Amharic coverage; fallback: Noto Sans / system sans-serif. Use one family
consistently.

·
Display: 28–32px for page titles; section
heading 20–24px; card title 16–18px; body 14–16px; metadata 12–13px.

·
Use sentence case for UI labels. Use bold only
for hierarchy and status; avoid all-caps except short system labels.

·
Numbers, ETB amounts, dates, and status values
must use consistent tabular presentation where comparison matters.

### 17.4 Logo and mark usage

·
Maintain clear space equal to the height of the
“A” mark on all sides; never crowd the logo with controls or imagery.

·
Approved lockups: full wordmark, compact mark,
monochrome navy, monochrome white. Do not stretch, rotate, outline, add
shadows, or recolour outside approved tokens.

·
Use the full wordmark on public landing pages
and documents; use the compact mark in app navigation and favicon contexts.

·
Minimum digital size: 120px wide for wordmark
and 24px for compact mark, subject to legibility testing.

### 17.5 Photography, illustration, and iconography

·
Photography should show real Ethiopian contexts,
diverse people, homes, work, service delivery, and community — with consent and
no misleading claims.

·
Avoid exploitative poverty imagery, unverified
“before/after” claims, fake documents, or visuals that imply guaranteed safety,
coverage, income, or payout.

·
Use a consistent rounded-line icon set with
1.5–2px strokes, simple silhouettes, and labels for critical actions. Do not
use decorative icons as substitutes for instructions.

·
Illustrations should use navy/teal foundations
with restrained gold and earth accents; maintain adequate contrast in Amharic
and English.

### 17.6 Data visualisation and status graphics

Asset
type

Design
rule

Implementation
requirement

Status badge

Label + icon + colour; e.g., Active, Pending Review, Unknown Outcome

Controlled enum mapped to accessible text and tooltip.

Workflow timeline

One visual node per state transition; current state prominent

Show timestamp, actor, reason, evidence and notification references.

Financial chart

Use navy/teal primary series; gold for selected comparison; red only
for exception

Show currency, period, timezone, data freshness and draft/posted
basis.

Map/property card

Use verified level explicitly; never “guaranteed safe”

Redact private contacts until policy permits.

Empty/error state

Explain what happened and the next safe action

Include retry/reconcile/help route; never expose internal errors.

### 17.7 Visual asset production and naming

·
Source files: SVG/Figma/AI where applicable;
delivery formats: SVG for icons/logos, WebP/AVIF for photos, PNG for
transparent exports, PDF for print documents.

·
Naming convention:
afrolife_[product]_[surface]_[asset]_[variant]_[locale]_[version].[ext].
Example: afrolife_property_listing_empty_en_v1.svg.

·
Every asset record stores owner,
licence/consent, source, usage scope, alt text, locale, colour mode,
dimensions, version, expiry/review date, and accessibility notes.

·
Do not ship unlicensed competitor logos, stock
images without licence evidence, provider marks without permission, or
generated imagery that could be mistaken for a real person/document.

### 17.8 Brand QA checklist

·
Logo clear space, proportions, contrast, and
minimum size pass.

·
All text, icons, charts, and states remain
understandable in Amharic and English.

·
Critical actions and denials are not conveyed by
colour alone.

·
No visual implies legal approval, insurance
coverage, verified safety, escrow, payout, settlement, or provider confirmation
without authoritative evidence.

·
Asset licences, consent, alt text, version and
owner are recorded.

·
Rendered screens pass mobile, low-bandwidth,
keyboard, screen-reader and reduced-motion review.

# Part XVIII — IMPLEMENTATION BACKLOG AND ACCEPTANCE

Workstream

First
implementation increment

Definition
of done

Enablement platform

Feature-flag registry, server guards, audit events, kill switch,
approval evidence schema

Every gated flag denies safely by default and is testable by
organisation.

Design system

Tokens, typography, buttons, inputs, badges, tables, modals,
timeline, notifications

Component library has states, responsive behaviour, accessibility and
Amharic/English content.

Workflow UX

WF-A/B/C first, then WF-D/G/F, then gated WF-E/H

Each workflow has screen map, atomic step mapping, validations,
exceptions, analytics and UAT cases.

Content and localisation

Status taxonomy, legal disclosures, error messages, SMS templates,
glossary

Approved bilingual copy exists for critical paths and has translation
ownership.

Asset library

Logo, icon set, imagery rules, chart styles, empty/error states

Assets are versioned, licensed, accessible and connected to design
tokens.

Release evidence

UAT, security, privacy, legal, recovery, reconciliation and
operational runbooks

Release gate pack is complete; only approved flags may be enabled.

FINAL END OF EXPERIENCE, ENABLEMENT & DESIGN MASTER — v11.0

This document is based on the specified v10.2 source and
adds governed enablement planning, UI/UX and workflow design specifications,
and proposed AfroLife brand/visual asset guidelines. Disabled functions remain
disabled until their activation gates are approved and evidenced.
