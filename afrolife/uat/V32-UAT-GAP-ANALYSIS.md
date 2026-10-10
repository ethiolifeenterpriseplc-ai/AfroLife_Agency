# Version 32 UAT gap analysis

Reviewed against `ETHIOLIFE_AFROLIFE_V32_End_to_End_UAT_Test_Plan_and_Test_Cases.docx`
and the current AfroLife implementation notes on 10 October 2026. This is a
readiness and traceability review, not a UAT acceptance record. A code or unit
test check does not replace execution of the case in its configured UAT
environment with retained evidence.

## Priority 0: resolve before production acceptance

| UAT area | Current evidence | Importance and next action |
| --- | --- | --- |
| `UAT-E2E-001` to `005`, demand, provider, engagement, fulfilment | The application has agency, demand, matching, contract and rent workflows, but the current local run did not execute the complete customer-to-provider-to-settlement journey. | Execute the representative journeys in UAT and capture request, match, booking, fulfilment, audit and final-state IDs. Treat unexecuted portions as BLOCKED, not PASS. |
| `UAT-FIN-004` to `008`, payment, idempotency, refunds, ledger and reconciliation | Project notes state that provider settlement and payment webhooks are not enabled. The MFI, Edir and Insurance ledgers are separate accounting modules; their unit checks do not establish marketplace payment processing. | Keep marketplace settlement gated until a provider sandbox, approved fee/commission rules, idempotent callbacks, reversal/reconciliation procedures and finance sign-off exist. Do not infer fee or settlement policy from the UAT document. |
| `UAT-TEN-001/002`, tenant isolation | Unit checks cover selected module-specific row-level security rules. This turn did not execute API-level cross-tenant access attempts. | Run positive and negative cross-tenant requests for each relevant API and role; retain both outcomes and database/runtime-role evidence. |
| `UAT-SEC-001` to `004`, authentication, authorization, audit and maker-checker | The local unit suite covers MFA, roles, privacy and selected maker-checker rules. Live session, audit and API authorization evidence remains unverified in this run. | Execute the cases with provisioned roles, including self-review denial, session revocation, privileged access, and audit-record verification. |
| `UAT-LEGAL-001` to `003` and controlled finance configuration | The project documentation identifies legal, licensing, funding, provider, and approved-policy decisions as prerequisites. | Require documented activation approval for each country, tenant and regulated service. Keep benefits, insurance, payment products and unapproved commission rules inactive until owners approve their exact terms. |
| `UAT-NFR-001` to `006`, security verification and disaster recovery | Build success and unit tests do not demonstrate performance targets, security review, monitoring, backup restore or DR. Existing project notes list independent security review and restore rehearsal as outstanding. | Set approved NFR targets, then retain load, security, alerting, backup and restore evidence before production sign-off. |

## Important functional coverage to complete

- `UAT-MAT-001/002`: matching calculations have unit coverage for eligibility factors and explainable scores. The UAT still needs to prove that hard constraints cannot be bypassed and that the decision/audit record persists for a real request.
- `UAT-API-001` to `003` and `UAT-EVT-001/002`: standardized API errors have unit coverage. Protected-request controls, duplicate critical operations, event correlation, retries and recovery need configured integration evidence.
- `UAT-OFF-001` to `003`: the PWA service-worker unit test checks static shell caching. It does not prove safe offline drafts, prohibited booking/payment behavior, conflict resolution or synchronization.
- `UAT-LNG-001` to `005`, `UAT-UI-001/002`, and `UAT-MOB-001` to `003`: verify translated operational workflows, RTL and Ethiopic rendering, accessibility, deep links and physical-device behavior. Existing static text or responsive styling is not sufficient evidence for these end-to-end cases.
- `UAT-EDR-001/002`, `UAT-MED-001`, `UAT-NOT-001`, `UAT-CHAT-001`, `UAT-TRU-*`, and workforce cases: distinguish supported pilot workflows from planned or legally gated capabilities, and record each actual end-to-end result. The README specifically says pension and insurance selections record interest only; they do not activate contributions, matching or coverage.

## Defect fixed during this review

When a pending applicant replaces a rejected sign-up document, the API updates
the existing `user_documents` row. It now returns that row's ID rather than a
new, nonexistent ID. The API integration test asserts that the returned ID
matches the retained document record. This preserves client/server identity
consistency for follow-up review.

## Execution status for this review

- Main TypeScript build: PASS.
- Insurance service build: PASS.
- Edir service build: PASS.
- Database-independent unit suite: 93 PASS, 0 FAIL.
- Database/API end-to-end UAT: BLOCKED in this environment because the local
  API did not start without the required `JWT_SECRET`. No UAT case is marked
  accepted based on the unit suite.

The UAT entry criteria also require approved test data, business configuration,
integrations and role ownership. A case that depends on a missing environment
or control input remains BLOCKED until that dependency is provided.
