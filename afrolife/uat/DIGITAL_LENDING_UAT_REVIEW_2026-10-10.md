# Digital lending workbook review and AfroLife validation cases

Workbook reviewed 10 October 2026; execution update 11 October 2026:
`Digital_Lending_Regulatory_Excellence_UAT (1).xlsx`.

The user has confirmed that the workbook's feature set applies to both AfroLife
SACCO and Edir products. Its historical Pass/Fail results remain disregarded;
the cases are requirements for implementation and independent validation
across both modules. Regulatory-specific values remain configurable and need
approved institutional policy before activation.

## Workbook coverage

All 15 worksheets were inspected. The source contains many formatted blank rows;
the populated row counts below exclude blank rows and include headers where
present.

| Worksheet | Populated rows | Review |
| --- | ---: | --- |
| Master UAT List | 236 | 235 case rows; historical status labels disregarded for AfroLife execution |
| Feedback on lending | 18 | 16 findings, plus title and column header |
| High Priority | 111 | Priority-filtered case view |
| Medium Priority | 88 | Priority-filtered case view |
| Low Priority | 38 | Priority-filtered case view |
| Administration & User Management | 18 | Module-filtered case view |
| Credit Scoring & AI Analysis | 50 | Module-filtered case view |
| Customer Support & Complaints | 5 | Module-filtered case view |
| General Lending Operations | 48 | Module-filtered case view |
| KYC & Identity Verification | 21 | Module-filtered case view |
| Ledger & Financial Management | 20 | Module-filtered case view |
| Loan Disbursement | 14 | Module-filtered case view |
| Loan Repayment & Management | 22 | Module-filtered case view |
| User Registration & Authentication | 9 | Module-filtered case view |
| Product Specific Rules & Config | 39 | Module-filtered case view |

The priority and module sheets reorganize cases from the master list; they are
not additional independent case counts. Historical status labels were ignored
when executing and reporting AfroLife validation.

## Findings relevant to AfroLife

The feedback sheet and master cases provide candidate scenarios to consider:
disbursement with pending KYC, a new loan while another is active, disbursement
before contract signing, repayment posting timing, and repayment splits among
principal/interest/penalties. Historical outcomes for those scenarios were
disregarded. The earlier narrower pilot scope is superseded by the user's
instruction: workbook features apply to both SACCO and Edir. Unsupported items
are tracked as implementation work, not out of scope.

The workbook also records cases for dynamic pricing, AI explanations and
recommendations, offline loan processing, mobile money, NBE submissions, AML
watchlists, collateral, cooling periods, and several specialized loan products.
These features are included in the requested scope. Where live third-party
connectivity or regulatory interpretation is required, implementation and
local validation must be distinguished from provider connectivity or approval.

## Implementation progress after scope confirmation

- Added shared validated loan product terms, exact-cent quotes, product
  eligibility checks, repayment frequency, pricing fields, collateral/LTV and
  documentation requirements in `src/lending-products.ts`.
- Added versioned SACCO product records with maker-checker review and loan
  product snapshots, eligibility checks, priced schedules and repayment
  allocation. Affordability now uses the priced installment. Added GL income
  accounts for interest, fees and penalties. Reversal processing restores
  installment interest and penalty allocations alongside principal.
- Added Edir versioned product create/read/review endpoints and captures the
  selected version and eligibility facts with each application. Approval
  rechecks product criteria and consent identifies the terms snapshot. Edir
  product activation still rejects nonzero pricing because its servicing
  ledger is principal-only; that remains a blocking capability gap.
- Added customer complaint intake and tracked investigation/resolution flows
  to SACCO and Edir, with unique tracking references, a 15-day default target,
  role-scoped access, tenant isolation and required resolution notes.
- Added independent member risk flags and active holds to both modules.
  Approved holds block new lending, loan acceptance and disbursement, and
  release requires a separate actor and reason.
- Added versioned, maker-checker daily disbursement caps for both modules and
  enforced them inside serialized posting workflows.
- Added institution-scoped finance reports for both SACCO and Edir: portfolio
  aging/PAR, date-bounded trial balance, and disbursement-versus-repayment
  reconciliation. Reports calculate from posted journals and contractual
  installments, exclude draft journals and paid/waived SACCO installments, and
  expose totals or missing posted journals for reconciliation review. Trial
  balances can also be downloaded as formula-safe CSV files.
- Added optional product settings for rejection and full-settlement cooldowns.
  Approved products can set the waiting period independently; both settings
  default to zero days. SACCO and Edir block new applications during the
  applicable period, and the shared date helper handles exact expiry boundaries.
- Added independently reviewed KYC states for SACCO and Edir members. Applications
  require verified KYC; Edir acceptance and both modules' disbursement posting
  paths recheck it. Existing members start as pending until an authorized
  reviewer records a decision. This is a manual review control, not an ID,
  sanctions-list, or biometric provider integration.
- Added private PDF/JPEG/PNG identity and loan document upload, audited download,
  independent document review, immutable evidence metadata and a verified
  national-ID prerequisite for KYC approval in both modules. KYC cannot be
  approved by the document reviewer or the member registrar. The Edir member
  loan-request form stays disabled until KYC verification; server-side checks
  remain authoritative.
- Edir member acceptance now stores the exact offer/product snapshot with a
  SHA-256 agreement reference. This binds the authenticated consent event to
  the terms record; it does not constitute a third-party digital signature.
- Added SACCO migration 047 and Edir migration v13 for loan document storage and
  independent review. Added SACCO migrations 048-049 for full-principal loan
  write-off, GL loss expense, waived installments, member credit holds, and
  database-enforced independent actor roles. Added Edir migration v14 and
  maker-checker write-off endpoint and servicing form with matching loss
  posting and schedule waiver logic. SACCO migrations 042-049 are applied to the isolated local
  database. Edir migrations v1-v14 are now applied to a dedicated local UAT
  database; database-backed validation has passed for synthetic membership and
  complaint workflows only. See the 11 October continuation below.
- On 11 October, the main and Edir TypeScript builds passed; the complete unit
  suite passed 118/118, including new document/KYC and write-off migration-security checks.
  The browser smoke passed at `http://localhost:3001/` across mobile, tablet,
  and desktop layouts with no browser runtime or console errors.
- The isolated SACCO MFI E2E journey passed at `http://127.0.0.1:3001` against
  the local fixture DB. It verified independent ID document review and KYC,
  KYC gating, maker-checker policy/product approvals, pricing snapshots,
  disbursement, repayment/reversal, NPL classification, collections, balanced
  journals, independent full-principal write-off with a loss journal, schedule
  waiver and future-lending hold, role authorization and tenant isolation.
  Result: 9 balanced journals and 83 audit events for the synthetic run. The runner
  used synthetic accounts and created a synthetic institution/member; no
  customer credentials were reset.
- The full workbook is not fully accepted or executed. SACCO database-backed
  checks now cover the local journey above; Edir remains code- and unit-checked
  only until its migration database is configured. External service, policy,
  and business-process cases below remain open.
- Workbook-wide implementation remains in progress. Remaining areas include
  Edir priced servicing, post-write-off recovery and suspense posting
  posting, regulatory report packs, external AML/KYC and national ID checks,
  credit bureau, SMS/mobile wallet/bank integrations, regulatory submissions,
  disaster recovery, collateral perfection, AI extraction/explanations, offline
  workflows, and specialized product variants. Several
  require provider credentials, business decisions or regulator-approved
  settings.

## Open workbook coverage

These entries are still open; they must not be counted as passed just because
related unit tests or adjacent workflows passed.

| Workbook area / case | Current state | Remaining work or dependency |
| --- | --- | --- |
| KYC-020 pending-KYC lending/disbursement gate | Implemented; passed in SACCO E2E; Edir code checked only | Run Edir database-backed case after its local migration target is configured |
| PRD-032 supporting-document upload/review | Implemented in both services; SACCO migration applied | Run Edir database-backed upload/review case after configuration; human identity authenticity remains a review decision |
| KYC-014/015/017 national-ID, biometric, AML/PEP/sanctions checks | Not integrated | Provider/API credentials, approved screening rules, consent and escalation process |
| Edir interest, fee, penalty and amortization servicing | Not implemented; Edir product activation remains principal-only | Extend Edir installment allocation, loan journal accounting and repayment workflows, then validate against its migrated database |
| FIN-015 write-off / post-write-off recovery; FIN-016 suspense | Full principal write-off implemented and passed in SACCO E2E; Edir write-off implemented and statically/build checked but not database validated; post-write-off recovery and suspense remain open | Edir database migration target, recovery treatment, and suspense ownership/aging controls |
| Regulatory/NBE reporting and submissions | General portfolio, trial-balance and reconciliation reports exist; regulatory returns are open | Approved return schemas, provisioning/reporting rules, and submission channel/credentials |
| Credit bureau, mobile wallet/bank rails, SMS/notifications | Not connected | Provider agreements, credentials, callback security, reconciliation and failure/reversal rules |
| SCR-023 AI explanations/recommendations and document extraction | Explainable deterministic affordability factors exist; AI/extraction cases are open | Approved model/data governance, explanation requirements, provider or model, and bias/quality validation |
| Collateral perfection, guarantor enforcement, offline lending, disaster recovery, specialized products | Not complete | Legal/product policy and operational workflows; offline sync and recovery require target infrastructure |

The workbook's 235 master cases have not each been executed against both
products. This review records the implementation and validation evidence above
without converting unrun, unconfigured, provider-dependent or policy-dependent
cases into passes.

## Additional AfroLife product and process validation cases

Run these with synthetic tenant data in the isolated UAT environment. Retain
tenant, actor/role, policy version, request/correlation ID, resulting record
IDs, and before/after state for each case. Do not treat unit tests as UAT
acceptance evidence.

| ID | Priority | Case and expected result |
| --- | --- | --- |
| AF-PRD-01 | High | Submit a credit policy change as maker and attempt self-activation; the system rejects self-approval and leaves the active policy unchanged. |
| AF-PRD-02 | High | Activate a new policy while an application is pending; verify the application retains the policy/version and affordability inputs used at submission, with no silent recalculation. |
| AF-PRD-03 | High | Submit applications immediately below, at, and above configured affordability and loan limits; verify deterministic boundary decisions and a persisted reason for each result. |
| AF-PRD-04 | High | Submit an application with missing, negative, malformed, or inconsistent declared income/expense/debt values; reject invalid values with field-specific errors and no partial application. |
| AF-PRC-01 | High | Attempt each loan transition out of order (review before submission, approval before independent review, disbursement before approval); reject the transition and preserve the prior state. |
| AF-PRC-02 | High | Repeat the same disbursement request with the same idempotency key and then with a conflicting payload; ensure the first operation is posted once and a conflicting replay is rejected. |
| AF-PRC-03 | High | Disburse at the approved amount with insufficient available cash, then retry after funding; reject without partial journal/schedule state, then allow one balanced disbursement. |
| AF-PRC-04 | High | Repay an installment, reverse it through an authorized independent reviewer, and inspect journal balance, outstanding principal, schedule recalculation, audit trail, and duplicate-reversal handling. |
| AF-PRC-05 | High | Attempt to close/reactivate a member with outstanding savings, share, or loan balances; enforce the documented lifecycle rule and retain an auditable decision. |
| AF-PRC-06 | High | Exercise collection ownership, promise-to-pay, overdue follow-up, and closure; verify a promise does not change balances and that closure requires the proper reviewer. |
| AF-SEC-01 | High | Replay member, loan, collection, and ledger identifiers across two institutions using borrower, teller, manager, and administrator roles; deny cross-tenant reads/writes and preserve no cross-tenant side effects. |
| AF-OPS-01 | Medium | Submit duplicate member/application requests and retry after a simulated timeout; verify idempotent outcomes and traceable audit/correlation records. |
| AF-OPS-02 | Medium | Create and review a risk-classification proposal; prevent the originator or disburser from approving it and verify the configured DPD band and effective date. |

The cases above extend process-boundary and failure-path coverage. They do not
claim coverage for interest-bearing products, KYC/AML provider integrations,
regulatory submissions, collateral, mobile money, or production disaster
recovery. Those need approved scope, integration credentials, and environment
entry criteria before execution.

## Independent execution against AfroLife

I ran these checks independently of every historical status in the workbook:

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Main app TypeScript build | PASS | `npm run build` exited 0 |
| Edir service TypeScript build | PASS | `npm run build:edir` exited 0 |
| Unit suite | PASS | 116 passed, 0 failed. A temporary Node startup shim worked around Windows `os.userInfo()` returning `ENOMEM` in `tsx`. |
| Browser UI smoke | PASS | Local app at `http://localhost:3001/`; Super Admin login, SACCO screens, mobile/tablet/desktop layouts, and no browser console/runtime errors |
| SACCO database migrations | PASS | Local migration runner applied pending 043-047; 042 was already recorded as applied |
| SACCO MFI end-to-end | PASS | Local app at `http://127.0.0.1:3001`, isolated fixture DB at `127.0.0.1:5433/afrolife`; synthetic workflow, 9 balanced journals and 83 audit events including full-principal write-off |
| Edir database migrations / E2E | PARTIAL PASS | All 14 migrations applied and 7 synthetic membership/complaint API cases passed on 11 October; remaining Edir lending flows are not accepted |
| HTTP integration suite | NOT RUN | Harness requires an explicitly configured disposable `TEST_DATABASE_URL`; no disposable integration target was confirmed |

### 11 October 2026 continuation: Edir database-backed UAT

The previous Edir database blocker is resolved for the isolated local UAT
target. `scripts/provision-local-edir.ps1` provisions the dedicated database
`afrolife_edir_uat` on local PostgreSQL port 5433 and a restricted runtime role
with neither superuser nor `BYPASSRLS` privileges. The environment is stored in
the local AfroLife environment file; no credentials are recorded here. All 14
Edir migrations applied successfully. This includes the corrected tenant-scoped
conflict target in migration 014 (`organization_id, code`).

`npm run build:edir` passed. The focused Edir/service migration and credit tests
passed 37/37. `npm run test:edir:e2e:local` then passed all 7 synthetic API
cases against the isolated local database:

- A verified-KYC member can request membership; the request remains pending.
- The requester cannot approve their own membership, and the failed attempt
  does not change the pending state; a separate authorized administrator can
  activate it.
- An active member can file a complaint that receives a tracking reference and
  future resolution target. Another member cannot read or manage it.
- Complaint closure without a resolution summary is rejected. Staff can move
  the complaint through investigation to resolution, and intake and resolution
  are audited.

The E2E journey exposed and fixed two defects before its passing run: complaint
intake used a row lock that required update permission and hid the membership
from an ordinary member; the complaint resolution SQL also needed an explicit
UUID cast for `resolved_by`. Regression assertions cover both fixes. The most
recent rerun passed all 7 cases. Its records are synthetic only; no production
or customer records were used.

This result validates membership and complaint API behavior only. It does not
accept the remaining Edir loan journeys. Edir KYC document upload/review,
application scoring and approval, offer acceptance, risk holds, disbursement
caps, repayment/write-off posting, and financial reports still need dedicated
database-backed UAT. Interest/fee/penalty servicing remains unimplemented for
Edir. The 235 workbook cases have not each been run against both products.

The execution table's Edir entry is a partial pass for the scope above; the
full Edir lending UAT remains incomplete.

The local MFI journey covered independent national-ID document review and KYC,
KYC gating, maker-checker policy and product approvals, pricing snapshots,
disbursement, repayment/reversal, NPL classification, collections, balanced
journals, audit events, role authorization and tenant isolation. Synthetic
accounts and records were used; no customer credentials were reset. The full
235-case workbook is not fully executed or accepted. No production or shared
customer records were used.

### 11 October 2026 continuation: Edir lending lifecycle and workbook trace

The remaining Edir lending API workflows were exercised against the isolated
local PostgreSQL database using synthetic identities and records. The expanded
journey passed 13 checks covering membership, KYC/document review, product and
policy maker-checker, application assessment/approval and idempotency, offer
acceptance and consent hash, disbursement cap enforcement, member savings
funding, partial repayment, full remaining-principal write-off, waived
installments, loss-journal posting, portfolio aging, trial balance,
reconciliation, complaint privacy and complaint resolution. The trial balance
was balanced at ETB 17,250.00 debit and credit; reconciliation found no missing
posted journals. Test output identified only synthetic records.

The database run exposed and fixed zero-value parsing errors for legitimate
zero debt, zero outstanding principal, empty daily totals and zero minimum
balances. It also exposed row-lock visibility conflicts in the KYC guards and
disbursement workflow, an atomic write-off trigger-order defect, a stale
duplicate pre-write-off constraint in the isolated database, and an invalid
portfolio aging query. Forward Edir migrations v15-v18 correct these defects;
the exact legacy constraint definitions were inspected before their narrowly
targeted removal. All four migrations were applied to the isolated UAT database.

The full unit suite now passes 123/123. Edir TypeScript no-emit type-check
passes. `npm run build:edir` could not replace files in the existing `dist`
directory because Windows returned EPERM for files held open; the source
type-check completed without emitting files. The Edir database journey does
not validate Edir interest, fee, penalty, external provider connectivity, or
production deployment.

The workbook copy found in Downloads, `YaYa_Digital_Lending_Regulatory_Excellence_UAT.xlsx`,
has the 15 expected worksheets and 235 populated Master UAT List cases. Its
historical status cells were kept separate from AfroLife execution evidence.
The case-level trace is in
`DIGITAL_LENDING_235_CASE_TRACE_2026-10-11.csv`: 9 cases directly pass against
executed UAT evidence, 9 are partial, and 217 remain open/unexecuted. These
totals do not claim completion of the 235-case workbook. The trace records each
case ID, case description, module, priority, historical status, AfroLife UAT
status and evidence or open reason. Open areas include third-party identity,
AML/PEP and bureau providers; NBE returns and approved policy rules; SMS, wallet
and bank rails; priced Edir servicing; suspense and post-write-off recovery;
offline/disaster recovery; AI extraction/explanation; collateral workflows;
and specialized lending products. Remaining non-provider cases still need
their individual acceptance scenarios executed.

One security access limitation remains: the KYC review endpoint permits a
platform administrator, but row-level security does not expose private identity
documents to that role. The UAT used two separately assigned compliance
reviewers, which validates the authorized compliance path. Automatic review
rejected broadening sensitive-document visibility to platform administrators
and other staff roles because that expands access to identity evidence. Any
change to that access policy needs explicit approval; this does not block the
tested compliance workflow.

The earlier SACCO/MFI database E2E result remains recorded above. A current
rerun was attempted on 11 October but stopped at the first login: the local
synthetic `super_admin` credential returned HTTP 401. The existing local test
credential file was left untouched; no user password or customer credential
was reset. The Edir UAT completed independently and passed.

### 11 October 2026 continuation: shared Edir frontend and tester APK

Architecture review confirmed that Edir uses the shared Super App frontend:
the main `public/app.js` imports and mounts `public/edir.js` in the common
workspace, under the shared session, header, navigation, language selector,
responsive layout, and PWA shell. Edir requests continue through the existing
`/api/v1/edir` gateway to the separately deployed Edir service. No Edir service
routes, database schema, or deployment boundary were changed for this frontend
integration. The shared workspace now labels the Edir page explicitly and hides
agency overview metrics while a user is inside a service workspace.

Both main-app and Edir TypeScript no-emit checks passed. The complete unit suite
passed 123/123. Capacitor synced the common PWA shell and Edir frontend into the
Android project, and the Android debug build succeeded. The installable internal
test artifact is `artifacts/AfroLife-Agency-1.0-debug.apk` (4,517,973 bytes),
SHA-256 `7DA554C67D221490621796A3DCE427E2DF9A7E19BDB874569771E5C7C0CEABCC`.
It uses the Android debug signing certificate; it is suitable for controlled
tester installation, not a store or public release. Release signing variables
are not configured in this environment, and no signed release APK was produced.

The shared public hostname `afrolife-agency.duckdns.org` resolves to
`196.189.145.142`, but read-only requests to both HTTP and HTTPS fail to open a
connection from this test environment (HTTP status 000). The single-origin
web/PWA architecture is in place in the application, but the public deployment
is not reachable in this check and is not ready to distribute as a public URL.

The local browser smoke test loaded the shared app login page, but timed out
waiting for the existing synthetic Super Admin sign-in. The local credential
file was not changed. This means the responsive authenticated Edir browser
checks remain unverified in this run; the Edir database-backed E2E remains the
current authenticated workflow evidence. The full workbook status is unchanged
at 9 pass, 9 partial, and 217 open/unexecuted. The APK build does not close any
of those database or provider-dependent workbook cases.

### 12 October 2026 readiness continuation

The controlled local checks were rerun without using production or customer data:

- Unit suite: PASS, 127/127.
- TypeScript no-emit checks: PASS for the main API, Edir, Insurance, and SACCO/MFI services.
- Browser JavaScript syntax, Capacitor/package JSON parsing, and `git diff --check`: PASS.
- Edir database-backed UAT: PASS, 13 scenarios against the isolated local UAT database. The run covered membership and independent KYC, maker-checker product/policy and loan decisions, consent, capped disbursement, repayment, write-off, balanced trial balance and reconciliation, and complaint privacy/resolution. Trial balance was ETB 22,250.00 on each side; no missing journals were reported. Records were synthetic.
- SACCO/MFI database-backed UAT: BLOCKED at local Super Admin login (HTTP 401). The synthetic credential file was not altered or regenerated.
- Local deployment readiness: FAIL. PostgreSQL on 127.0.0.1:5433 and API health are available, but WSL service inspection returned access denied and the local proxy did not serve this checkout's current release.
- Public endpoint: BLOCKED. `afrolife-agency.duckdns.org` resolves to 196.189.145.142, but TCP 80 and 443 are unreachable from this host.
- Android tester APK: the existing debug artifact checksum still matches the 11 October record. It is for controlled installation only; no release signing credentials are configured.

The workbook trace remains 9 PASS, 9 PARTIAL, and 217 OPEN/unexecuted of 235 cases. This rerun adds Edir execution evidence but does not convert the workbook to full acceptance. Public distribution remains blocked by public ingress/TLS, the MFI fixture login, incomplete workbook execution, and unsigned Android release configuration.

### 13 October 2026: Master specification API UAT continuation

The MFI credit-risk report returned HTTP 500 in the authenticated API journey.
Its score-band query grouped on a SELECT alias and then referenced that alias
inside an `ORDER BY CASE` expression, which PostgreSQL does not resolve as a
column in that expression. The query now derives score bands in a CTE before
aggregation and ordering; a focused regression assertion protects the query
shape.

Validation on the isolated local `afrolife_test_master_uat` database used the
restricted API runtime role and synthetic users/data only:

- Main API TypeScript build: PASS.
- Full unit suite: PASS, 162/162.
- Core and supply HTTP integration tests: PASS, 45/45.
- Authenticated SACCO/MFI API E2E: PASS. The journey verified institution and
  staff setup, independent KYC/document review, savings, loan product and
  policy maker-checker, affordability scoring, priced disbursement, repayment
  and reversal, NPL classification, collections, write-off, balanced journals,
  audit events, tenant isolation, and role authorization. It reported 9
  balanced journals and 88 audit events for the synthetic run.
- Migrations 001-058 had been applied to the disposable database before this
  run; no schema change was needed for the report-query correction.
- `git diff --check`: PASS (line-ending normalization warnings only).

This supersedes the 12 October SACCO/MFI fixture-login blocker for this local
API run. The API run does not establish full Master Specification acceptance.
The Edir API lifecycle was also rerun on the isolated
`afrolife_edir_uat` database using its restricted runtime role and synthetic
actors. All 13 scenarios passed: membership enrollment and independent
activation; KYC gate and document review; product/policy maker-checker;
application scoring, idempotency, approval and bound consent; per-institution
disbursement cap enforcement; partial repayment and write-off; complaint
privacy, resolution and audit. Its report checks showed a balanced trial
balance (ETB 24,750.00 on each side), zero missing posted journals, and six
disbursed loans in the accumulated synthetic UAT portfolio. This is principal-
only servicing; it does not accept interest-, fee- or penalty-bearing Edir
products.

The trace now refreshes evidence for KYC-004, FIN-015, and DSB-006 from this
execution. The case status totals remain 9 PASS, 9 PARTIAL, and 217 OPEN out
of 235; the workbook has not been rerun case-by-case. Full Edir financial
servicing for interest, fees and penalties,
external bureau/identity/AML integrations, regulator return submissions,
mobile-money/bank rails, collateral, offline/disaster recovery, AI
extraction/explanations, and specialized product workflows remain unaccepted
or provider/policy-dependent.

### 13 October 2026: Platform-wide Edir disbursement control

Addressed the workbook's DSB-002 platform-limit gap with forward-only Edir
migrations 019-020. The global daily cap is separate from (and cumulative
with) existing per-Edir caps. Only Super Admin/Global Admin can view or propose
it; changes require an independent platform administrator and a recorded
reason. The credit workspace exposes the proposal and review controls only to
those administrators. The posting guard serializes cap changes and disbursement
approvals, then checks the date's posted disbursements across organizations.
The cross-tenant aggregate runs through a narrowly scoped `SECURITY DEFINER`
function: its search path is fixed, PUBLIC execution is revoked, and it only
accepts a pending disbursement for the current Edir and an authorized reviewer.

The restricted-runtime Edir API E2E passed all 13 scenarios after migrations
019-020 were applied to `afrolife_edir_uat`. Its cap scenario verified that
tenant credit managers cannot read or approve platform limits, the maker
cannot self-approve, a low global cap rejects a posting, and an independent
platform approval of a higher cap permits the balanced posting. Per-Edir cap
rejection and revised-cap behavior also passed. Trial balance remained
balanced at ETB 28,750.00 on each side, with zero missing posted journals.
These are synthetic records only.

DSB-002 was PARTIAL at this execution point because a second synthetic Edir
with posted activity had not been provisioned.

### 13 October 2026: Two-Edir workbook validation continuation

The cross-tenant UAT identified a provisioning gap: newly onboarded Edirs did
not receive the ledger accounts required to post financial activity. Added
forward-only Edir migration v21 to backfill the standard seven-account chart
for existing non-umbrella Edirs and seed it transactionally for future Edir
onboarding. Runtime insert permission is constrained by the existing
umbrella-master RLS policy; PUBLIC execution of the fixed-search-path trigger
function is revoked.

The next E2E iteration exposed that credit-control routes were using
`SELECT ... FOR UPDATE` on member rows even for roles that can review risk
flags but do not have broad membership-update permission. Rather than widen
membership UPDATE RLS, migrations v22-v23 add a scoped, fixed-search-path
member credit-control lock. It authorizes only the member, platform admins,
and specified staff roles, checks the current Edir, and serializes risk
changes with application, acceptance, and disbursement checks. Migrations
v21-v23 were applied only to the disposable local `afrolife_edir_uat` database.

The expanded restricted-runtime API E2E passed 18 scenarios. It onboarded a
second synthetic Edir through the API, verified its chart of accounts, created
and KYC-verified a member, approved its credit product and policy, and posted
an independently approved ETB 1,000 disbursement. It then proved the
cross-Edir cap boundary: the current Edir's own posted total plus the next
ETB 1,000 was below the proposed platform cap, while the two-Edir aggregate
plus that operation exceeded it by one cent. Posting was rejected until an
independent platform reviewer approved the exact aggregate limit; the
subsequent journal balanced.

The same run asserted the disbursement principal, database posting date, and
borrower savings-account ID, and verified that an auditor can read application
and audit records but cannot create a credit policy. It completed the Edir
scenarios for ADM-004, ADM-005, DSB-002, DSB-008, and FIN-007. It also
verified that an independently approved suspicious-activity hold blocks
disbursement until separate release, and that a second loan cannot be approved
while the member's first loan is active.

The matching SACCO/MFI active-loan case was added to its local API UAT runner,
but the rerun stopped at Super Admin login with HTTP 401 before executing any
scenario. The synthetic credential file was left unchanged. DSB-011 therefore
remains PARTIAL until SACCO/MFI API UAT can execute the new assertion. Trial
balance in the Edir run was ETB 45,750.00 on each side with zero missing posted
journals. All generated records were synthetic.

The trace now contains **14 PASS, 7 PARTIAL, and 214 OPEN** out of 235 cases.
This closes the cross-Edir cap validation gap but does not accept unexecuted
cases. External identity, bureau and AML providers; regulatory returns;
bank/mobile-money rails; core-banking reconciliation; interest/fee/penalty
servicing policy; disaster recovery; and approved AI/data-governance controls
remain unaccepted pending their specific implementation, environment, or
institutional prerequisites.
