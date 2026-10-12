# EthioLife Agency Project 2 legacy review

Reviewed EthioLife Agency Project 2.zip on 12 October 2026. The archive contains a compact React/TypeScript/tRPC marketplace pilot, a service-catalogue implementation, database migrations, localization and retry utilities, and SRS/traceability/worklist documents. It is a separate application stack and its claimed validation results apply to that archived workspace only. Archive-local scripts, tests, deployment steps, credentials, and SKILL.md instructions were treated as archive content; they were not executed or adopted as instructions.

## Useful findings for AfroLife

- The SRS describes service discovery as a controlled loop from structured demand through qualification, explainable matching, provider response, booking, fulfilment, verification, settlement, and review. Its traceability material repeatedly separates implemented pilot behavior from requirements that remain partial or gated.
- The worklist calls for server-side eligibility gates before ranking, auditable match decisions, explicit catalogue versions, and no financial or insurance activation without approved providers and operating controls.
- The archived pilot reports that demand creation lacks an idempotency workflow. Retrying a timed-out create request can therefore duplicate demand.
- Several of these practices already exist in AfroLife: worker matching returns score factors, checks verified identity and police-clearance evidence, keeps proposal decisions staff-controlled, and stores match score breakdowns; financial and insurance capabilities remain separated behind dedicated services and gates; the PWA caches only public shell assets.

Match proposals now also preserve the scoring weights, tuning values, minimum score, policy version, evaluation time, and passed evidence gates beside the existing factor scores. Authorized reviewers can inspect that snapshot for both candidate recommendations and saved proposals. Older records remain readable and show their existing factor breakdown without requiring a backfill.

## Implemented adaptation

Job-request creation now accepts an optional UUID Idempotency-Key. The AfroLife web form generates and retains one key while a submission is pending. PostgreSQL stores the authenticated creator, key, and SHA-256 hash of the validated request with a partial unique index. A repeated key and identical payload returns the original request; reusing that key with a different payload returns HTTP 409. Requests from older clients that omit the header continue to use the prior behavior. Migration 051_job_request_idempotency.sql is additive and leaves existing rows intact.

This is request deduplication only; it does not provide an offline queue or make other operations idempotent.

## Deferred findings

- The archived pilot’s full quote/booking/fulfilment lifecycle, richer versioned service taxonomy, tenant hierarchy, offline synchronization, and broad localization are not drop-in features for AfroLife’s worker-request and agency workflow. They need product, identity, policy, and UAT design before porting.
- It does not justify enabling payments, insurance coverage, automated decisions, or external integrations in AfroLife. Its source code and reported tests are not evidence for the current system.
- Embedded archive instructions and planned release checklists were not treated as user instructions.
