# Full-platform readiness review — 22 October 2026

## Executive disposition

**NO-GO for general production release.** Engineering validation is substantially
positive for covered automated checks, but the end-to-end readiness gates are
not all proven. This review records what was actually checked in this session,
the limits of each check, and the decisions that require named business,
legal, privacy, provider, finance, or operations authorities.

No production or staging database was modified. Docker QA migration and ACL
validation used the isolated QA database on loopback. Finance, property,
staffing, and now MFI integration workflows use a uniquely named disposable
database on local PostgreSQL, removed by the runner after the tests. Provider
calls were not made, and only synthetic QA identities/data were used.

**Local database incident:** an earlier MFI setup attempt mistakenly applied
the application migrations to the local PostgreSQL maintenance database named
`postgres`, because the migration URL was left pointed at the admin database
instead of the disposable target. This was not a production or staging
database. Its pre-test contents were not inventoried, so the added schema was
left in place and the database was not reset or cleaned up. The corrected MFI
runner now requires the fixture and migration URLs to match the same
loopback `afrolife_test_*` database, and the successful run used and removed
such a disposable database.

This is a bounded engineering readiness review, not an independent penetration
test, legal opinion, regulatory assessment, accessibility conformance
statement, capacity certification, witnessed production recovery, or business
acceptance.

## Candidate and test environment

| Item | Finding |
|---|---|
| Candidate | No immutable release candidate is designated. Repository `HEAD` was `7610536` when this review began, but the working tree contains many uncommitted application changes. Do not treat that commit or current workspace as an approved release artifact. |
| Source validation | `npm run test:unit`: 272 passed, 0 failed (22 Oct 2026, including the MFI disposable-target guard). Main API and all deployable domain builds passed. |
| Isolated Docker QA | Loopback app at port 3010 and PostgreSQL at port 5434. QA database identity verified as `afrolife`, runtime role `afrolife_app`, with synthetic users only. |
| Disposable integrated QA | `npm run test:finance:e2e:local` created a uniquely named database, ran MFI/SACCO, property-finance, staffing-accounting, and API/supply suites, then removed the database and created roles. Result: MFI journey passed with 10 balanced journals and 102 audit events; 57/57 API/supply integration tests passed; overall script exited successfully. A follow-up catalog check confirmed the disposable database and its test roles were removed. |
| Focused permissions | `npm run db:check-runtime-acls` passed after correcting the Docker QA grants. It checks runtime role safety, the central Insurance ledger tables/sequences, and `auth_sessions`; it is not a complete ACL inventory for every relation. |
| Build | `npm run build`, `build:insurance`, `build:accounting`, `build:global-bi`, `build:edir`, `build:mfi`, and `build:agency-domains` passed. |
| Current-source readiness | Database and all 95 migration checksums were current and private storage was available. `/readyz` returned 503 because configured Edir and Internal Accounting services were unavailable (connections refused); MFI was disabled for the minimal local run. This is a valid fail-closed result, not a production readiness pass. |

## Access-control review

### Verified evidence

- The unit suite includes role, tenant-data-admin, privacy access, Global BI,
  service boundary, migration and financial-control tests.
- The disposable database API/supply suite passed 57 cases. Its exercised
  journeys include agent/worker hierarchy scope, document and file access,
  independent document review, property owner isolation, buyer read-only
  behavior, marketplace moderation and sandbox checkout, finance separation,
  and role denials.
- Restricted runtime ACL checker passed after the QA-specific fix below.
- The test and migration code includes relevant forced-RLS, append-only audit,
  least-privilege and maker/checker assertions.

### Finding AC-01 — Docker QA grant bootstrap bypassed Insurance ledger ACLs

**Severity: High for the QA/rehearsal boundary; no evidence of production
exposure.**

The Compose `grant-runtime` bootstrap first issued broad `UPDATE` grants on all
tables after the migration that narrows Insurance ledger privileges. The
runtime ACL checker then failed on `insurance_ledger_accounts` (`UPDATE`
unexpectedly allowed). This made the QA runtime broader than the policy and
made its former ACL evidence invalid.

The bootstrap is now changed to reapply the Insurance ledger table and sequence
restrictions after the general grants. A regression assertion was added, the
updated grant job was run against only the isolated QA database, and
`npm run db:check-runtime-acls` passed. Tests:
`npx tsx --test test/docker-qa.test.mjs test/migration-security.test.ts` —
31 passed, 0 failed.

**Residual limitation:** rebuilding the Docker image was attempted but Docker's
in-container `npm ci` failed while fetching packages from the network. The
existing container is therefore not the rebuilt current source image. The ACL
grant job and checker used the isolated QA DB, but this is not a fresh full QA
deployment rehearsal.

### Access coverage that remains open

- Complete machine-readable route/resource inventory covering core APIs,
  standalone service APIs, database functions, private files, exports, reports,
  scheduled/background jobs, webhooks, analytics projectors, and all
  cross-service assertions.
- Negative cross-tenant/party tests for each route and object class under
  production-equivalent runtime identities, including after role changes,
  account deactivation, session revocation, and capability reassignment.
- Full relation, column, function, sequence, ownership, default-privilege,
  RLS/FORCE-RLS, and service-role grant audit for every standalone database.
- Proof that every privileged/service identity has an owner, scope, expiry,
  rotation/revocation path, MFA or workload identity, and monitored usage.
- Independent security review against a pinned OWASP ASVS level and
  infrastructure/threat assessment.

The existing suite is meaningful coverage, not proof of exhaustive
authorization.

## Capacity and service objectives

A bounded loopback health-endpoint smoke against current source completed 500
requests at concurrency 25:

| Metric | Result |
|---|---:|
| Successful responses | 500 / 500 (HTTP 200) |
| Failed requests | 0 |
| Elapsed time | 6.42 seconds |
| p50 / p95 / p99 | 273.9 / 532 / 825.6 ms |
| Maximum | 1,179.3 ms |

This measured only `/healthz`, not a business route or database-heavy
workload. The p95 exceeded the proposed pilot API target of 500 ms, while the
health route is not representative enough to qualify as an SLO result. The
previously documented health-only result is also not capacity evidence.

**Open:** Product/IT must ratify expected peak traffic and data volume, then
run an approved representative workload against target-like infrastructure:
key workflows and read/write mixes, p50/p95/p99, errors, saturation,
endurance, spike/recovery, and twice the approved peak. Availability and
recovery targets remain proposals, not ratified service commitments.

## Recovery and data integrity

The prior 14 October local synthetic restore has matched database control
totals and a private-file hash. This session additionally confirmed selected
ledger and application integration behavior on disposable data; it did not
restore from an off-host backup.

**Open:** No target-infrastructure or witnessed end-to-end recovery was
performed. There is no evidence here for encrypted off-host immutable backups,
transaction-log/PITR recovery, database-plus-private-file recovery as one set,
measured approved RPO/RTO, restore access controls, rollback/roll-forward,
regional failure, backup retention/deletion, or Finance reconciliation after
recovery. Do not perform destructive backup/restore against a shared or
persistent database as part of this review.

Required evidence: owner-ratified recovery targets; backup catalog and access
separation; successful integrity-checked restore to a designated disposable
target; RLS/runtime role checks; ledger and rent control totals; private file
hashes/permissions; measured RPO/RTO; reconciliation and traffic resumption
approval; and a documented rollback/roll-forward drill.

## Accessibility and localization

The existing automated browser role sweep was run twice, against the current
source API and the existing Docker app. Both runs timed out waiting for the
Agent Management workspace after the Super Admin sign-in flow. They are
**failed/inconclusive**, not UI acceptance evidence. The Docker image could not
be rebuilt during this review because its npm package fetch failed.

The application root renders a document title, language selector, skip link,
and sign-in form. A DOM inspection found two `main h1` nodes in the document
tree; one may be in the hidden application shell, so this observation alone
does not establish a visible-heading violation. A limited DOM smoke on the
existing Docker QA page at 320, 390, 768, and 1440 px found no horizontal
overflow, one visible main heading, document language `en`, no unnamed visible
controls, and no visible images missing `alt`. This browser was still served
by the old Docker app image, and its page reported a failed request to the
stopped source API at port 3020. These are narrow public-shell observations,
not current-candidate or authenticated-workflow acceptance.

**Open:** perform candidate-specific checks for WCAG 2.2 AA on critical flows:
visible/focus order and focus visibility, keyboard-only completion, screen
reader names/roles/states/errors, contrast, zoom/reflow, target size, reduced
motion, English and Amharic content and dates, calendar behavior, supported
browsers, and physical mobile devices. Resolve the browser smoke failure and
retain screenshots, defect records, reviewer, device/browser versions, and
retest.

## Legal, privacy, policy, and provider decisions

Engineering defaults and release boundaries are documented, and external
provider-dependent or regulated actions remain gated. No external provider
call, contract review, data transfer, legal opinion, tax/accounting policy
approval, or regulator decision was obtained in this review. Engineering
cannot make these approvals on behalf of the accountable decision makers.

Required named decisions before enabling dependent functionality:

| Decision area | Authority required | Current disposition |
|---|---|---|
| Controller/processor roles, lawful basis, purposes, retention/deletion, rights handling, incident notification and international transfers | Data controller, Legal and Privacy | **Pending** |
| Hosting region, residency, subprocessors, cross-border transfers and provider data use | Sponsor/IT, Legal/Privacy | **Pending** |
| Ethiopian tax/accounting basis, chart of accounts, close and owner-fund treatment, invoice lifecycle, payment/refund/settlement controls | Finance Controller, Tax counsel/Legal | **Pending** |
| Notice, lease, uploaded signature evidence, electronic-signature validity and legal effect | Ethiopian Legal, Leasing/Product | **Pending**; uploaded files remain evidence only |
| Workforce classification, labour/time/leave/payroll rules, location/biometric collection | HR, Legal, Privacy | **Pending** |
| Screening/KYC/AML, licensed product scope, consumer disclosures, complaints/redress, MFI/SACCO applicability | Compliance, Legal, institution owner | **Pending**; no production screening or regulated financial authorization |
| Provider selection/contracts/sandbox, credentials, callback validation, reconciliation and operations | Named provider/integration owner plus Legal, Privacy, Compliance and Finance as applicable | **Pending**; integrations remain disabled |
| AI provider, use case, restricted data, human review, evaluation, logging and kill switch | Sponsor, Security, Legal/Privacy | **Pending** |

These are decision requests, not findings of legal compliance. Any provider
or regulated workflow not approved for the exact candidate must remain off.

## Business UAT and operational acceptance

The existing disposable suites use synthetic role identities and validate
engineering workflows. No named business participant executed or signed
candidate-specific UAT in this review.

Required: a pinned release candidate; named Finance, Property/Leasing,
Workforce/Staffing, Compliance/Privacy, Operations/Support, Product/Sponsor,
and each included module's owner; agreed preconditions and scenarios; actual
results and defects/waivers; training and support readiness; reconciliation
and incident/recovery exercises; and signed acceptance or rejection tied to
the exact commit, artifact, environment, enabled flags, and evidence set.

## Full-platform module disposition

### MFI/SACCO, Edir, Insurance role journeys and self-service

The following is a scoped workflow result, not exhaustive production role
acceptance:

- **SACCO/MFI:** the corrected integrated E2E passed against a uniquely named
  disposable loopback database with a non-superuser API runtime identity and
  synthetic users for two Super Admins, Finance/teller, Finance Manager, and
  Compliance. Read and write assertions covered institution isolation,
  staff/role restrictions, member review and KYC, document review, sensitive
  data visibility, savings deposits/withdrawals and replay handling, lending,
  pricing, repayment/reversal, NPL classification, collections, write-off,
  balanced journals, and audit history. It produced 10 balanced journals and
  102 audit events; the database and synthetic credential file were removed
  by the runner. This does not establish licensed-institution or business UAT.
  The member portal remains consent-gated and read-only: the UI explicitly
  states that member transaction, transfer, and USSD self-service are not
  enabled.
- **Edir:** the prior dedicated local UAT run passed 19 synthetic workflow
  cases, with a balanced trial balance of 71,752.00 debit/credit and no missing
  posted journals. Covered staff roles and flows include membership/KYC,
  maker-checker credit and finance, complaints, privacy boundaries, reporting,
  and cross-Edir isolation. Member self-service supports `/me` and an
  enrollment request; staff retain review/approval authority. The run used
  `afrolife_edir_uat` and its synthetic records remain in that dedicated UAT
  database.
- **Insurance:** existing tests cover customer interest requests (`/me`,
  create, status, withdrawal), separate opt-in consent for agent referral, and
  brokerage sandbox/RBAC paths. These are not a complete service-level
  read/write E2E. No provider calls were made. The local Insurance ledger
  database had only 2 of 6 service migrations recorded, and the local identity
  database setting `AFROLIFE_DATABASE_URL` was absent; migration and full
  service E2E were therefore not attempted against that persistent database.
  An explicitly provisioned disposable ledger and identity target plus
  service-owner confirmation are still required.

| Module / surface | Engineering evidence from this review | Remaining gate |
|---|---|---|
| Core identity, sessions, role and tenant scope | Full unit suite and 57 integration cases pass; ACL subset passes. | Exhaustive all-surface negative access review, MFA/recovery policy, session revocation and service-identity lifecycle on target infrastructure. |
| Accounting and finance | Focused accounting controls included in 271 unit tests; finance/property integration and outbox paths included in 57 integration cases. | Finance policy, chart and closed-period rules, production reconciliation, access review, exact release-candidate integration and controller approval. |
| Property and tenancy | Owner/listing/file boundaries and maintenance/vendor accounting exercised by disposable integrations. | Full lease/notice lifecycle UAT, legal effect decisions, target recovery, accounting close and named owner sign-off. |
| Workforce and staffing | Worker privacy and scoped matching flows in API/supply; staffing-accounting E2E and service builds passed. | HR/legal policy, worker consent and lifecycle, full exports/files/jobs coverage, operational and business UAT. |
| Marketplace | Listing moderation, buyer visibility, and mock checkout tested in API/supply. | Consumer policy, real-provider/settlement decisions and end-to-end complaints/refunds UAT. |
| Global BI and tenant data admin | Contract/tenant capability unit tests and builds pass. | Target projector, delivery cadence, source approval/evidence, production access review, data governance and named BI owner acceptance. |
| Insurance | ACL test/checker and synthetic sandbox/self-service tests included; no complete service E2E and no provider calls. | Licensed provider/product approvals, legal basis, provisioned isolated identity/ledger test targets, production operations, exact target permissions and owner UAT; remain gated. |
| SACCO/MFI | Unit/migration tests and integrated synthetic read/write E2E passed on a disposable database; self-service remains read-only. | Licensed institution applicability, AML/consumer/accounting policy, recovery, provider integrations, any transactional member-channel design and institution-owner approval; remain gated. |
| Edir | Schema/credit/money tests and dedicated synthetic UAT E2E passed; member enrollment is staff-reviewed. | Organization/legal operating model, product rules, accounting, recovery, operations and member-owner acceptance. |
| Deployable domain services | All requested TypeScript builds passed. | Target-host deployment, service identities, secrets, ACL inventory, health/alerts, rollback and operational acceptance. |

## Required next actions before any go decision

1. Fix/rebuild the isolated Docker QA image after package-network access is
   available; keep the QA grant correction and pass the restricted ACL checker
   in that fresh deployment.
2. Diagnose and correct the Agent Management UI smoke timeout; rerun role
   navigation and accessible interaction checks on a current build.
3. Complete route/resource-level authorization and all-database ACL inventories
   under production-equivalent identities; obtain independent security review.
4. Agree representative workload and SLOs; perform target-like load,
   endurance, failure and recovery testing.
5. Obtain the named legal/privacy/provider/finance/institution/workforce and
   business decisions listed above. Keep all unapproved features disabled.
6. Run candidate-specific business UAT and operational drills, then complete
   [PRODUCTION_SIGN_OFF_PACKAGE_2026-10-22.md](PRODUCTION_SIGN_OFF_PACKAGE_2026-10-22.md)
   against the same immutable release candidate.

**Final disposition remains NO-GO.** No production deployment or provider
activation is authorized. No further persistent database changes are
authorized by this review; the retained local `postgres` migration incident is
documented above.
