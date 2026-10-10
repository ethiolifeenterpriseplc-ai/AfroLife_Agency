# AfroLife service boundaries and extraction sequence

This document records the proposed ownership boundaries for the Super App. It
does not claim that every boundary is already an independently deployed
microservice. Keep the legacy Agency behavior intact while services are
extracted behind compatible APIs.

## Current deployment boundaries

| Domain | Current implementation | Data and operational boundary |
| --- | --- | --- |
| Identity and access | Central API authentication and account management | Owns users, credentials, MFA and server-side sessions. Services must not duplicate passwords or treat a client-supplied role as trusted identity. |
| Agency and shared operations | Routers mounted in `src/server.ts` | Co-deployed with the central API and central PostgreSQL schema; includes leads, workforce, contracts, Marketplace, rent, Admin, and privacy operations. |
| SACCO/MFI | `src/mfi.ts` mounted at `/mfi` | Pilot module in the central API and shared central database with institution scoping/RLS; not an independently deployed service. |
| AfroLife Edir | `services/afrolife-edir/` and its gateway | Separate service code and database/migration path; central identity is conveyed through a signed gateway assertion. Deployment and external production evidence remain separate release gates. |
| Insurance ledger | `services/insurance-ledger/` plus the legacy-compatible central route | Separate service code and dedicated-database migration path exist. The central API can still use its in-process ledger until data migration, reconciliation, rollback, and approval gates are met. |
| Privacy cases | `src/privacy.ts` | Co-deployed in the central API because requests are tied to central user identity and access policy; not a separate service today. |

## Ownership rules for extraction

- Each service owns its schema, migration account, restricted runtime account,
  backups, retention, health/readiness endpoint, and release pipeline.
- Cross-service access uses versioned HTTP contracts with authenticated
  service-to-service identity. Do not share database tables or give one
  service's runtime role access to another service's schema.
- Identity remains a central authority. Downstream services receive a signed,
  short-lived identity assertion and independently enforce their own
  authorization and tenant scope.
- Financial services own their ledger facts and idempotency keys. Cross-domain
  financial effects use explicit, reconcilable events or APIs; they must not
  write directly into another service's ledger.
- A service is not considered independently deployable until its API contract,
  schema ownership, migration/rollback strategy, operational alerts, restore
  test, compatibility test, and production role grants are verified.

## Safe extraction sequence

1. Stabilize and version the existing Edir and Insurance service contracts;
   finish isolated-database and reconciliation gates before switching traffic.
2. Keep identity as the shared control plane and extract one bounded domain at
   a time. The MFI/SACCO extraction requires an approved SRS release scope,
   stable institution/member/ledger ownership, and a migration/reconciliation
   design before code or data is moved.
3. Extract Agency domains only after mapping their shared contracts and data
   dependencies. Preserve existing endpoints during transition and verify
   parity before retiring any legacy route.
4. Keep shared privacy/identity administration centralized unless an approved
   ownership model defines how the central data subject, consent, retention,
   and incident workflows span independent services.

The current platform is therefore a hybrid modular system with two separate
service implementations, not yet a fully decomposed microservice estate.
Architecture changes must be gated by data ownership and compatibility tests,
not by moving files or splitting processes alone.
