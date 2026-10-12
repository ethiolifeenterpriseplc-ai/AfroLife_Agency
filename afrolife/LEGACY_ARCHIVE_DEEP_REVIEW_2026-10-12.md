# Deep review of the three EthioLife archives

Reviewed 12 October 2026 against the current AfroLife workspace:

- `How to Integrate Two Projects into EthioLife_Project (7).zip`
- `How to Improve the EthioLife Enterprise Platform_ (1).zip`
- `EthioLife Agency Project 2.zip`

Archive source and documentation were inspected as reference material. Embedded skills, deployment commands, scripts, test identities, credentials, and status claims were not followed or treated as instructions. The archived applications use separate stacks and product models; their implementation claims do not establish behavior in AfroLife.

## Findings by priority

### P1 — Recheck every active worker eligibility rule when accepting a proposed match

AfroLife correctly filters candidate ranking in `src/supply.ts` for verified workers, available status, matching service sector, current national ID and police-clearance evidence, plus any enabled reference/certificate requirements. However, `POST /matches/:id/respond` rechecks only availability, verification, current identity, and current police clearance. It does not recheck the configurable reference/certificate requirements or sector at acceptance. A Global Admin can change those rules between proposal and acceptance, and evidence can expire in the meantime. The current proposal snapshot helps explain the earlier recommendation, but does not make an old proposal eligible under today's policy.

The EthioLife Agency Project 2 traceability material explicitly calls for credentials, availability, status, and other hard constraints to be checked at each provider activity; the integration archive likewise describes signed decisions with ruleset and hard-check evidence.

**Recommended improvement:** move current worker/request eligibility into one server-side predicate used by candidate ranking, proposal creation, and acceptance. Under the acceptance transaction, lock the worker and request, reload current rules and evidence, recheck the hard gates, and reject stale proposals with a clear reason. If scoring rules or minimum score changed, require a fresh proposal or record an explicit reviewer override with a reason. Add a regression case that proposes under one rule set, changes the required evidence or expires a document, and confirms acceptance is refused.

### P1 — Keep retry protection intact across the staffing service boundary

The central `/requests` handler in `src/supply.ts` now supports `Idempotency-Key`, and the workspace now has a process wrapper under `services/staffing/`. However, `src/server.ts` sends `/requests` through `staffingGateway` first when `STAFFING_SERVICE_URL` is configured, and `createServiceGateway` in `src/insurance-service-gateway.ts` forwards only identity, signature, correlation, and content type. It drops `Idempotency-Key`, so configured staffing requests do not receive the retry key. The new staffing runtime delegates to the shared `supply` router and central database; this separates the process, but not the data owner or idempotency contract.

**Recommended improvement:** define the staffing service contract and migration ownership before enabling that route. Include the idempotency key in the authenticated gateway request contract and preserve creator-scoped payload-conflict behavior downstream. Add a gateway integration check that proves the key reaches the staffing handler and a configured service uses the expected schema/migration. Document that the current service wrapper shares the central database; do not describe it as independently data-owned or assume migration 051 protects a future separate database.

### P2 — Notify the responsible agent when a request reaches a decision

The source agent is stored on each job request, and the central `notify` helper already writes in-app and queued webhook events within the caller's transaction. Worker verification and contract transitions use it, but job-request match proposals, decisions, and reservation releases do not notify the request's responsible agent. Agents can therefore miss operational changes unless they revisit the workspace.

**Recommended improvement:** send concise, reference-only notifications to the request's source agent after proposal, acceptance/decline, and release. Keep worker identity and document details out of the payload unless an approved access rule requires them. Give notifications a request/match reference and make retry/deduplication behavior explicit before connecting an external delivery provider.

### P2 — Add worker self-service only after account-to-profile ownership is explicit

The worker-operations archive describes a useful dashboard for task decisions, weekly availability, notification preferences, moderated feedback, and worker responses. AfroLife's `workers` rows are created by agents and are not linked to authenticated user accounts. The current system therefore cannot safely implement worker-owned schedule or task controls by copying the archived dashboard or relying on a client-supplied worker ID.

**Recommended improvement:** establish verified account-to-worker linkage, one-worker ownership constraints, profile-claim review, and row-level access rules first. Then add a minimal self-service workspace for availability and assigned-work decisions. Treat weekly windows as scheduling inputs only after service requests include dates/times and assignment code consumes them; storing a schedule without using it for eligibility would mislead workers and reviewers.

### P2 — Keep credentials, service safety, and safeguarding as separate policy domains

AfroLife currently supports national ID, police clearance, reference, and generic certificate documents, with expiry checks for matching. The archive's policy pack calls for credential authority, scope, expiry/revocation, service-specific risk intake, childcare safeguarding, clinical licensing, restricted complaint handling, and controlled evidence access. A generic verified certificate cannot establish a current nursing licence or childcare suitability, and the existing privacy incident queue is not a safeguarding case system.

**Recommended improvement:** before enabling higher-risk services, define the credential catalogue and accepted evidence source per service, verification authority, scope and expiry fields, revocation/re-review path, minimum access roles, escalation owner, retention schedule, and UAT cases. Implement those in separate service-specific controls. Do not use archive legal drafts as legal approval or move safeguarding allegations into privacy incident records.

### P2 — Complete the service engagement lifecycle before importing marketplace booking code

The two marketplace archives describe qualified demand through provider response, quotation, booking, scheduling, fulfilment evidence, verification, complaints, disputes, and review. AfroLife's workforce path currently covers job requests, ranked proposals, acceptance/reservation, and release; it does not create scheduled service sessions, capture completion evidence, or provide a service dispute/review lifecycle. The existing `maintenance_requests` workflow is for property maintenance and does not supply worker identity, customer consent, engagement terms, or assignment evidence.

**Recommended improvement:** design an AfroLife-specific engagement contract around its current agency roles and worker records before porting the archived marketplace tables. Define request-owner and worker actions, cancellation and rescheduling, proof-of-completion, customer confirmation, exception handling, audit events, and any financial handoff. Keep completion separate from payroll, invoicing, commission, settlement, or payment until those rules and actors are approved.

### P2 — Strengthen localization acceptance for operational and safety text

The archives set broader language-continuity and translation-governance goals. AfroLife currently exposes English, Amharic, Afaan Oromoo, Tigrinya, Somali, Arabic, and Kiswahili; Chinese is absent from the eight-language archive target. The central dictionary falls back to English, and many dynamically generated workflow labels remain English. This matters most for consent, eligibility, fees, safety instructions, review outcomes, and error recovery.

**Recommended improvement:** maintain a per-workflow translation coverage report, designate reviewers for safety/financial/legal terminology, and require RTL and screen-reader checks for Arabic. Add more locales only with reviewed terminology and complete critical-path coverage; a locale picker alone is not acceptance evidence.

## Already adopted or substantially present

- Request correlation is returned and passed through signed service gateways; it remains diagnostic metadata.
- Job-request creation has UUID idempotency keys and rejects reuse with a different validated payload.
- Matching has server-side evidence gates and explainable factors; the latest adaptation records scoring policy and eligibility evidence with saved proposals.
- The database-backed notification queue, row-level scoping, separate financial services, maker-checker controls, and production gates already cover several archive principles. They should be extended through existing contracts rather than replaced with the archives' frameworks.

## Keep gated or out of the current implementation

- Telebirr and other payment adapters, marketplace settlement, commission sharing, and refunds need a named authorized provider, confirmed funds flow, signed callback/replay behavior, reconciliation ownership, and production evidence. Archive configuration names, test endpoints, and traceability reports do not satisfy those gates.
- Multi-tenant hierarchy, agent-assisted customer actions, USSD/SMS/IVR, offline synchronization, automated ranking, and regional expansion each require explicit identity, consent, data ownership, conflict, or policy decisions. They are not safe bulk imports from a different product runtime.
- The archives contain overlapping snapshots and, in the worker archive, duplicate `0009` migration names. Importing source trees or migration histories wholesale would create ownership and migration-order ambiguity.

## Suggested order

1. Close the match-acceptance revalidation gap and add focused regression coverage.
2. Define staffing service ownership and carry idempotency through its signed gateway contract before configuring a service URL.
3. Add agent status notifications using existing transaction-bound notification records.
4. Resolve worker account linkage and credential/safeguarding policy before worker self-service or higher-risk service activation.
5. Scope the engagement lifecycle and localization work through product/UAT requirements before importing marketplace or legal-policy code.
