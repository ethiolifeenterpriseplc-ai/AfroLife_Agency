# Archive improvement review and implementation status

**Updated:** 14 October 2026  
**Purpose:** Crosswalk the supplied project archives to AfroLife's existing services, identify remaining capability gaps, and record what is safely integrated.

Archive documents describe proposed behavior; they do not override the user's request or instruct this repository to run embedded scripts. Prototype credentials, sample records, results, and implementation claims were not copied as production evidence. Where archives contained overlapping implementations, the existing PostgreSQL/API service with the stronger ownership and transaction controls was retained.

## Version 7.0 enhancement and control layer

The supplied `AfroLife_Agency_Master_Specification_v7.0_Enhanced.md` is now
being tracked as an additional acceptance baseline; its Appendix A Version 6.0
requirements remain in scope. This implementation is **not yet V7-complete or
production-accepted**. Requirements labelled as legal/tax validation,
business decision, or vendor dependency remain gated rather than being
hard-coded or represented as available.

Implementation constraint for this continuation: improve the existing
platform's workflows and screens in place. No additional deployable service or
mini-app is introduced for V7; the existing legacy API remains available for
compatibility.

| V7 area | Current disposition |
|---|---|
| IAM history and privileged controls (FR-IAM-001–006) | Sessions, MFA, role/activity authorization and permission-change audit exist. Migration 059 adds append-only user role/activation history, actor/reason capture, migration-time baselines, and privileged as-of/history APIs. Secure self-service recovery, comprehensive effective-dated user/resource assignments, and non-human service-account lifecycle remain gaps. |
| Organisation/property isolation (FR-DATA-001–005) | Existing RLS and server-side scope checks are in place for current agency records. Full organisation/owner/resident/vendor isolation, transfer impact previews, and cross-scope denial monitoring are not yet demonstrated across every export, report, job and file route. |
| Lease lifecycle (FR-PROP-002) | The existing Rent & Deposits workspace creates workflow drafts and exposes submit, independent approval, tenant/owner evidence upload, and execution after handover and move-in inspection. Production disables immediate activation on the legacy `/leases` API by default. Migration 061 adds scoped, append-only, idempotent operational notice records with notices visible in the existing workspace; recording does not establish legal service, alter lease status, or terminate the lease. Amendments, renewals, expiry-alert policy/deduplication, authenticated e-signature, and approved legal occupancy/notice rules remain open. Uploaded files are evidence only, not proof of signer identity or legally valid e-signatures. |
| Finance/e-invoicing (FR-FIN-001–009) | Existing agency, Insurance, MFI, and Edir ledger boundaries remain separate. The approved architecture target is one shared writable database with restricted per-domain schemas, including dedicated Insurance/MFI/Edir ledger schemas; current physical database separation remains transitional. E-invoicing, MoR clearance, VAT/tax policy, property-owner distributions and production payment integrations are not enabled or accepted pending approved accounting/tax rules and provider access. |
| Maintenance/vendors and workforce (FR-MAIN-001–ET-001; FR-WFS-001–006) | Basic maintenance tracking and workforce/staffing modules exist. Full vendor assignment/portal, SLA and spend controls, preventive maintenance, scheduling, attendance, leave, payroll hand-off and legally approved labour rules remain incomplete. |
| API, integrations, observability and recovery (Sections 4, 8, 10; NFR-012–027) | Correlation IDs, service boundaries, health checks and selected idempotency controls exist. Complete OpenAPI contracts, durable integration/webhook processing, operational dashboards/runbooks, measured SLO/load profiles, approved RPO/RTO, and witnessed backup/restore/rollback evidence remain outstanding. |
| UX, accessibility, and localization (Section 5; NFR-018/024) | Existing multilingual and responsive UI has partial accessibility improvements. Full Amharic/English workflow and calendar validation, assistive-technology review, supported-device matrix and conformance evidence remain outstanding. |

The V7 requirement groups above are a current gap summary, not proof that every
Appendix A item or acceptance scenario has been independently traced and
passed. Release remains blocked by the V7 gates in Section 9.3 until owners
approve policy decisions and the required integration, security, recovery and
UAT evidence exists.

### Shared writable database decision

The approved target is a single shared writable PostgreSQL database for all
platform applications, including Edir, Insurance, SACCO/MFI, and the planned
Credit Scoring/Risk and Fraud Management applications. Each app writes only
its owned schema via a restricted runtime role; the global mirror is an
in-database projection updated by a dedicated projector role. It is not a
domain or ledger source of truth. Edir retains its own backend and ledger
schema, but not a separate physical database in the target architecture.
Existing physical databases and legacy-schema access are transitional. No
production database cutover or ledger consolidation is implied by this
decision; per-domain schema migrations, reconciliation, rollback, role
hardening, and disposable UAT are still required.

### V7 implementation update — effective-dated access evidence

Migration `059_user_access_history.sql` snapshots each existing account's role
and activation state at migration time, captures subsequent role/activation
changes with actor and reason, and protects the history from runtime update or
delete. `GET /users/:id/access-history` returns the timeline or reconstructs
the latest recorded state at a requested time. `GET /role-access/history`
exposes the existing role-activity permission audit to Super Admins. History
before the initial snapshot cannot be reconstructed. Migration/API validation
was run against the named disposable database `afrolife_test_v7_20261014`;
the shared local `afrolife` database was not used or modified.

Validation for access-history and production-gate work: main API build passed;
the then-current unit suite passed 169/169; migration-security and API
integration assertions passed against the disposable database described below.

### V7 implementation update — additive lease workflow

Migration `060_lease_lifecycle.sql` adds lifecycle evidence tables, RLS,
legacy-lease baselines, approval/execution activity keys, and protection for
versioned lease terms. New API routes in `src/ops.ts` provide workflow draft
creation, submission, independent approval, private signature-evidence
uploads, and execution after both evidence files, handover, and move-in
inspection are recorded. Execution creates an immutable version/hash and rent
schedule before marking the unit occupied. The existing `POST /leases` route
still activates immediately, creates rent charges, and marks the unit
occupied; it now records a legacy snapshot explicitly marked as having no
signature evidence.

Signature uploads are evidence files only; the service does not authenticate
the named signer or claim legal e-signature validity. Migration 061 adds
immutable, RLS-scoped notice receipt records with idempotent retries and
in-app/webhook event creation. Notice records do not change lease status or
establish legal delivery or termination. Amendments, renewals, policy-defined
expiry alerts and deduplication remain incomplete. The API workflow is surfaced in
the existing Rent & Deposits screen; it is not a separate service or mini-app.

Validation for lease notice migration 061: migrations 001–061 applied to the
fresh disposable `afrolife_test_v7_20261014_notice2` database with restricted
runtime grants; forced RLS was verified on `lease_notices`; API/supply
integration passed 46/46; `npm test` passed 170/170; and the application
build passed. The shared local `afrolife` database was not modified.

## Delivered or already present

| Improvement area | AfroLife implementation/status |
|---|---|
| Credit scoring and risk portal | Added to the existing authenticated SACCO/MFI workspace and institution selector. The same MFI router serves the main Super App and standalone MFI service. |
| Explainable loan score and policy | Existing versioned institution policy calculates affordability, savings, tenure, and repayment-history factors; a separate staff review and approval controls the lending outcome. |
| Portfolio risk and monitoring | Credit-risk report now includes institution-scoped score coverage/bands, decisions, classification exposure, PAR principal and ratio, overdue scheduled amounts, and current/DPD aging buckets. The endpoint is aggregate-only. |
| Model governance | The UI and endpoint expose a model inventory. AfroLife's institution scorecard is identified as an eligibility score, not PD. The archive challenger is explicitly disconnected and shadow-only with prohibited uses and promotion gates. |
| Synthetic provider/model integration lab | Added a tenant-scoped sandbox module with mock CRB, biometric, payment-rail, regulatory-return, and synthetic challenger runs. It stores only generated payloads in an append-only sandbox table, records each run in the institution audit trail, and shows a visible sandbox warning. |
| Credit servicing and risk controls | Existing workflows include independent loan decisions, cash-constrained disbursement, DPD/NPL classification, collection cases and promises, independently reviewed member-risk holds, complaints, and write-off approval linked to balanced loss journals. |
| Agency lead ownership | Added configurable 1–365 day protection (default 90 days), protection expiry display, a platform-admin-only reasoned reassignment form/API, new-owner protection reset, an append-only attribution trail, and a non-cancelled-contract guard. |
| Staffing safety and service integration | Existing implementation rechecks current worker evidence and policy when accepting a proposed match, records policy/evidence snapshots, forwards request idempotency through signed service gateways, and queues reference-only decision notifications. |
| Retry safety and service boundaries | Job-request creation uses creator/key/payload-bound idempotency. Marketplace, staffing, property-management, and workforce-management have explicit service routers; current deployments share the central database and that ownership is documented. |
| Cross-service controls retained | Current app remains authoritative for identity, session expiry, role checks, RLS, institution isolation, balanced/idempotent journals, reversals, audit records, maker-checker, consent-bound member portal, and private files. |

## Identified gaps and disposition

| Area | Current disposition | Evidence required before implementation/activation |
|---|---|---|
| ML underwriting / challenger model | The sandbox runs an illustrative fixed-coefficient transform on synthetic profiles only; it is explicitly not trained, validated, or connected. The archive model remains disconnected and cannot affect decisions. | Leakage-free decision-time training data, independent out-of-time validation, legal data-source and consent review, fairness/stability review, and institution risk-committee approval. |
| Bureau/CRB, biometrics, alternative data | Mock CRB and biometric outcomes are simulated in the isolated sandbox. No licensed bureau, biometric, or alternative-data provider is connected. | Licensed/authorized provider, lawful purpose and consent, error/dispute handling, information-security review, and explicit underwriting policy. |
| USSD, mobile money, payment rails | Success/pending/failure states are simulated only; no external rail is called, no funds move, and no ledger journal is created. | Named provider, authenticated/replay-safe callbacks, reconciliation and settlement owners, customer disclosure, and end-to-end operational tests. |
| ECL/provisions and regulatory returns | Synthetic return drafts and alert summaries are available in the sandbox; there is no automated accounting or NBE/CTR/STR filing, and nothing is submitted. | Approved accounting/regulatory methodology, ownership, validation, controlled submissions, and evidence retention. |
| Loan restructuring | No workflow that changes contractual installments or ledger schedules is claimed. | Approved hardship terms, recalculation and member consent, independent approval, and a balanced accounting/reconciliation design. |
| Worker self-service | Not enabled because agent-created worker profiles lack verified account-to-profile ownership. | Verified claim/review flow, one-to-one ownership, authentication, consent, and row-level access tests. |
| Service booking, fulfillment, settlement, disputes | Matching/proposal decisions exist; a full dated engagement-to-completion lifecycle is not implemented. | Requester/worker obligations, cancellation/rescheduling, completion proof, customer confirmation, dispute ownership, and separate financial handoff policy. |
| Service-specific licensing and safeguarding | Generic identity/certificate controls exist; they do not establish clinical licensing or childcare suitability. Privacy incidents are not safeguarding cases. | Approved credential catalogue, authorities/scopes/expiry/revocation, restricted case roles, escalation owner, retention rules, and safeguarding UAT. |
| Password recovery | Admin reset/password change exist; unverified self-service recovery is not active. | Verified delivery provider, atomic single-use tokens, abuse controls, and end-to-end tests. |
| Localization/accessibility | Seven locale choices and accessible interaction patterns exist; complete translated-workflow coverage and WCAG 2.2 AA are not certified. | Reviewed financial/safety terminology, workflow coverage report, RTL/screen-reader checks, and automated/manual accessibility evidence. |
| Staffing workflow verification | Staffing compiles and has matching, service-boundary, and shared supply integration coverage. There is no separate staffing-only E2E command, and the database-backed supply suite has not been run against a disposable database in this review. | Run `test/supply.test.ts` with the API and fixture database both pointed at the same disposable, fully migrated test schema; retain the run output. |

These remaining items are gaps with named dependencies, not features represented as complete. Data access, legal, accounting, provider, or user-identity dependencies are not satisfied by prototype code or archive documents alone.

## Applied files and validation

- `migrations/059_user_access_history.sql` and `src/admin.ts` add effective-dated, append-only account-access evidence and privileged history queries; migration-security and API integration coverage was added.

- `src/mfi.ts`, `public/mfi.js`, and `scripts/local-mfi-e2e.ts` add the risk report, unified portal panels, governance inventory, and E2E assertions.
- `src/mfi-sandbox.ts`, `migrations/053_mfi_sandbox_simulations.sql`, and the MFI sandbox panels implement recorded, tenant-scoped synthetic provider and model simulations without connecting real systems. Run history is append-only and also creates an institution audit event.
- `src/server.ts`, `src/business-rules.ts`, `public/app.js`, and `migrations/052_lead_protection_and_attribution_history.sql` implement configurable lead protection and formal reassignment.
- `test/mfi.test.ts`, `test/migration-security.test.ts`, and `test/api.test.ts` cover the report contract, migration controls, and reassignment workflow.
- Migrations `051_job_request_idempotency.sql`, `052_lead_protection_and_attribution_history.sql`, and `053_mfi_sandbox_simulations.sql` were applied to the local development database at `127.0.0.1:5433/afrolife`.
- Main and standalone MFI TypeScript builds pass; focused MFI and migration-security tests pass 16/16, including sandbox behavior and isolation assertions; the local MFI E2E runner bundles successfully with CRB, biometric, payment, regulatory, and model simulation checks; browser scripts pass `node --check`; `git diff --check` passes with only line-ending notices.
- The database-backed MFI E2E runner was not run because it creates synthetic institutions and member/loan records in the shared local fixture database. The API integration test requires a disposable database named `test_*` or `afrolife_test*` and was compile-checked only.

## Verification continuation — 13 October 2026

- The existing lease form now creates a V7 lifecycle draft and displays
  permission-gated submission, approval, signature-evidence upload, and
  execution actions. The legacy API route remains available. Migration 059's
  PostgreSQL-reserved column name and a lease-execution parameter type error
  were caught by the disposable UAT and corrected.
- A fresh isolated `afrolife_test_v7_20261014_notice2` database applied all 61
  migrations. `npm run test:integration` passed 46/46 API and supply cases
  using a restricted runtime role. Forced RLS and runtime grants for lease
  notices were checked; integration verifies permission denial, idempotent
  replay, conflicting replay rejection, append-only enforcement, and no
  automatic lease termination. This is test-only, not staging evidence.
- Production runtime configuration disables immediate activation through the
  legacy `POST /leases` route unless the explicit compatibility flag is `1`.
  Verified the route returns HTTP 409 when the flag is `0`; production config
  tests verify the safe default and reject malformed flag values.
- Migration 061 records tenant/owner-directed operational notices in the
  existing lease workspace. Records are append-only, RLS-scoped, idempotent by
  caller key, and create lifecycle/audit/in-app-webhook records in the same
  transaction. It does not validate legal delivery or automatically terminate
  or alter a lease; business/legal notice policy remains a release blocker.
- The master SVG, installable PNGs, browser theme color, and PWA manifest theme color use the same deep-green/gold identity. A regression test checks the master mark, PNG dimensions/signatures, manifest references, and theme-color match.
- `npm test` passes 170/170 database-independent unit tests; the main API build and `node --check public/app.js` pass.
- Staging/prod deployment, complete Appendix A/V7 requirement traceability, external provider integrations, legal/tax/labour/privacy review, full-surface isolation, load/recovery/restore exercises, accessibility/localisation review, device release checks, and named business-owner UAT/sign-off remain open.
- This does not replace database-backed staffing/MFI integration runs, browser role workflows, device checks, or the deployment and manual accessibility gates above.

## Verification continuation — 14 October 2026

- All 60 central migrations were applied to the explicitly named disposable
  database `afrolife_test_all_20261014`. The API and supply integration suite
  passed 46/46, the MFI E2E suite passed its synthetic tenant, role, KYC,
  lending, collection, write-off, and balanced-journal checks, and the Edir
  E2E suite passed its synthetic credit, cross-organization cap, ledger, and
  complaint workflows.
- The UI smoke suite passed Super Admin rendering and navigation, module
  visibility, nine additional seeded role sign-ins, mobile navigation sizing,
  and horizontal-overflow checks at 320px, 390px, 768px, and 1440px. It
  reported no JavaScript exceptions or unexpected console errors; expected
  role-protected API 401/403 responses were recorded separately.
- The browser checks found and fixed two UI access-state defects: signing out
  now clears role-specific workspace data and resets the panel before another
  account signs in, and the corporate business manager retains the Admin tab
  granted by the role rules. Physical-device, screen-reader, keyboard-only,
  200% zoom, and WCAG 2.2 AA review remain open.
- Main, Insurance, Edir, MFI, Workforce Management, Staffing, Property
  Management, and Marketplace TypeScript builds passed. The unit suite passed
  169/169 using the repository's `.codex-osinfo-fallback.cjs` because this
  Windows host's `os.userInfo()` currently fails with `uv_os_get_passwd`.
- The Edir repeat-run assertion was moved to after both current-run Edir
  disbursements are posted. This removes its dependency on a prior day's
  synthetic transaction while preserving the two-organization assertion.
- `db:check-runtime-acls` passed against the disposable central database after
  its Insurance ledger and access-history grants were set to the migration's
  restricted permissions. Lease lifecycle evidence tables retain SELECT and
  INSERT runtime access with immutable triggers.
- A custom-format backup of the synthetic-only central database restored into
  `afrolife_test_restore_20261014`. The restore contained all 60 migration
  records, 40 synthetic users, two lease versions, and 44 access-history rows;
  the runtime ACL checker passed on the restored database. The temporary dump
  was removed after recording SHA-256
  `6190521CF897965D99E814DC6AC4B4129405C863DDA978833F1C1360170A4DAB`.
- During test setup, an invalid PowerShell URL rewrite caused one migration
  command to use the configured local `afrolife` database and apply migrations
  054–060 there. This was unintended. Those migrations are the pending project
  migrations and are now present in the local database; no test fixtures or
  business transactions were created there. Subsequent migrations and all
  database-backed suites targeted the disposable database. This corrects the
  earlier statement that the configured shared local database was untouched.
- The supplied master specification named in the earlier continuation is not
  present in this workspace or Git history. Therefore a complete Appendix A
  requirement-by-requirement trace cannot be verified from available inputs;
  the V7 table above remains a group-level gap summary, not a completed
  acceptance matrix.
- `migrations/061_lease_notice_records.sql` appeared in the working tree during
  this continuation. It was not part of the 60-migration restore exercise and
  was not applied or verified; the notice API/UI lifecycle and its migration
  security need a separate review.
- Still gated: staging/production deployment and witnessed rollback/restore;
  licensed providers and payment rails; legal, tax, labour, privacy, and
  safeguarding decisions; complete cross-route organization/property isolation
  review; measured SLO/load and approved RPO/RTO; reviewed Amharic and English
  workflow/calendar terminology; manual assistive-technology/accessibility
  review; physical device checks; and named business-owner UAT/sign-off.

## V7 supplied baseline — superseding update

The preceding dated verification notes are historical snapshots. The V7 file
has now been supplied by the user, and migration 061 has since been verified
in a disposable database as recorded earlier in this document. Statements
above that the V7 source was unavailable, migration 061 was unverified, or the
60-migration run was the latest verification are superseded. Use
`V7_REQUIREMENT_TRACEABILITY_2026-10-14.md` as the current requirement-level
status and remaining-work register. It records partial/open items and does not
represent production acceptance.

### V7 release-gate implementation update — 14 October 2026

- Added `V7_RELEASE_BASELINES_AND_POLICY.md` with proposed pilot performance,
  availability, recovery, retention, accessibility and device-support targets;
  conservative privacy, labour, lease, tax, payment, AI and provider defaults;
  and primary Ethiopia/W3C references. These are implementation defaults and
  proposed targets, not a claim of legal approval or production infrastructure
  acceptance.
- Production MFI enablement now defaults off in runtime configuration and both
  production environment templates. Enabling it requires explicit
  `MFI_PILOT_ENABLED=1` and the already-enforced separate service URL and
  unique gateway credential. Tests cover default-off and explicit opt-in.
- Added a bounded loopback-only load smoke (`npm run perf:v7:local`). It passed
  500 requests at concurrency 25 against the local `/healthz`: 200 responses,
  zero failures, p95 105.3 ms, p99 172.3 ms. This is not a representative
  application capacity test.
- The browser smoke includes checks for document language, one visible main
  heading, accessible names for visible controls and image alternatives. The
  login-page audit ran successfully, but the full UI smoke could not proceed:
  the existing local Super Admin test credential was rejected as invalid or
  inactive. No account was seeded or changed in the shared database for this
  attempt. Manual accessibility and localisation review remains open.
- Added `V7_RELEASE_ACCEPTANCE_RECORD.md` with gate evidence fields and UAT
  owner role-title placeholders; names are pending and all sign-offs remain
  open. Real provider integrations remain disabled/unselected without provider
  contracts, credentials and sandbox environments.
- Main TypeScript build passed; Node syntax checks passed for the UI smoke and
  new load smoke; the unit suite passed 170/170 using the host workaround
  `.codex-osinfo-fallback.cjs`.
- The local endpoint and database were available during local smoke checks.
  Their current state is not evidence of staging readiness. Full isolation
  inventory, representative load, database-plus-files recovery against the
  proposed RPO/RTO, named UAT, legal/policy owner sign-off, provider contract
  testing, physical-device and manual accessibility checks remain open.

### V7 synthetic acceptance exercise — 14 October 2026

The follow-up run used a fresh `afrolife_test_*` database, synthetic role
accounts, a synthetic SACCO institution, 50,000 generated leads, a loopback
API and a temporary private-file directory. The detailed, latest evidence is
in `V7_MOCK_ACCEPTANCE_EVIDENCE_2026-10-14.md`; it supersedes the earlier note
that the browser smoke could not proceed beyond invalid shared local
credentials. The mock browser run reached responsive/accessibility assertions
and the role sweep, then failed its final harness assertion on two unexpected
background 401s. It is partial evidence, not a UI acceptance pass.

The API/supply integration run passed 45/46 checks; the remaining signup case
was rate-limited while the browser smoke was running concurrently. The local
runtime ACL checker flagged broad UPDATE permission on
`insurance_ledger_accounts` with the development grant profile. A 50,000-lead
authenticated performance attempt did not yield a usable report. A disposable
database-plus-file restore did pass with matching counts and file SHA-256 in
18.2 seconds, followed by a no-op rerun of all 61 migrations on the restored
clone. Generated mock databases, credentials and recovery artifacts were
removed after evidence capture; the local PostgreSQL service was stopped.
Production capacity, recovery, staging cutover, exhaustive isolation, manual
accessibility/localisation, provider contracts, operational readiness and
named-owner UAT remain open.
