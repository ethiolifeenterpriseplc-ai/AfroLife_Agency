# Global BI service

Global BI is a separate, read-only analytics service. It reads only its
dedicated projection database; it never connects to tenant operational
databases. Tenant data planes remain authoritative and independently operated.
The central platform holds deployment metadata and approved aggregate
projections only.

## Scope and access

- Global BI analytics and projector-status metadata are **Global Admin only**.
  Super Admin, Finance, Analytics Admin, and Database Admin accounts do not
  receive this cross-tenant view. There is no tenant-filtered projection query
  route today.
- Dashboard data contains a strict, versioned allowlist of aggregate metrics.
  It does not expose tenant IDs/names, users, customer/member details, account or
  transaction rows, credentials, SQL, or operational database endpoints.
- Global Admin assigns tenant-scoped Database Admin and Analytics Admin
  capabilities on the central control plane. Active eligible assignees can
  open a self-service workspace for only their own active tenant assignments.
  The workspace exposes deployment metadata and checklists, never database
  endpoints, credentials, raw records, or direct tenant connections.
- The self-service `/platform/my-data/:tenantId/analytics` route requires that
  caller's `analytics_admin` grant for the exact tenant. It currently returns
  an explicit projector-not-connected state and no metrics; it does not proxy
  Global BI. Database Admin requests are similarly checked against the exact
  tenant and `database_admin` grant, then recorded for operator review only.
  A forced-RLS self-read policy exposes capability rows only where
  `user_id=app_user_id()` (or to Global Admin).
- Migration, backup/restore, and database-change actions in the control plane
  create immutable operator requests only. No SQL, migration, backup, restore,
  or direct database operation is executed by the central application.
- Central tenant metadata is not a unified database control plane. Managed
  cloud PostgreSQL and on-premises Patroni remain separate data planes; the
  feature does not introduce FDW user mappings, Trino, Airflow, broad service
  accounts, or cross-database connectivity.

## Grain, cadence, retention, and status

The current projection contract uses exact **30-minute UTC buckets** and
targets an update every 30 minutes. The API supports 30-minute-aligned UTC
filters over at most 31 days. Stored aggregates are retained for 13 months.
Metric-level flow/snapshot semantics remain declared in `catalog.ts`.

There is currently **no production source extractor, tenant-local projector,
central ingestion endpoint, or configured tenant scheduler**. The status API
therefore reports `projectorConfiguration: not_configured`,
`schedulerConfiguration: not_configured`, and
`tenantProjectorHealth: unconfirmed`. It can report the latest aggregate import
timestamp and whether data was recently observed, but that is not evidence of
projector health, expected tenant coverage, or a successfully configured
30-minute schedule. An empty projection store is reported as
`projectionState: not_configured`; old data is `stale`; recent arrival is
`recent_projection_observed` and still explicitly unconfirmed.

Do not use synthetic values. Do not mark the schedule configured or healthy
until each tenant operator has deployed and verified its tenant-local projector
and a trusted, private, verified-TLS ingestion/health contract exists.
`projector/` contains an intentionally suspended deployment template and an
operator rollout checklist; it is not an executable extractor or a live
scheduler.

## Dedicated Global BI database

Provision a separate PostgreSQL database for Global BI, not the central
operational database and not any tenant database. Use different migration,
query-only, and projector roles. Configure
`GLOBAL_BI_MIGRATION_DATABASE_URL`, `GLOBAL_BI_DATABASE_URL`, and
`GLOBAL_BI_INGEST_DATABASE_URL` through the existing secret manager. Never put
credential values in the app, a tenant deployment manifest, projection file,
audit record, or control-plane reference.

Apply Global BI schema with `npm run migrate:global-bi`, then build with
`npm run build:global-bi` and start with `npm run start:global-bi`. Migration
002 adds the 30-minute aggregate table and restricts legacy monthly aggregates
to Global Admin. Existing migration 001 is immutable and its monthly rows are
not used by the 30-minute dashboard. The service refuses to start if the
runtime query role is a superuser, table owner, has BYPASSRLS, or has writes.
The projector/import role is separate from the query role and may write only
to the aggregate projection tables.

The central API's follow-up migration 095 adds the capability assignee's
own-row SELECT policy without widening Global Admin write policies. Apply it
through the normal migration process before enabling this self-service panel.

Keep the service private behind the central identity gateway and verified TLS.
Use the existing gateway-secret mechanism; do not invent or distribute
long-lived tenant database credentials. The central platform must not connect
to tenant databases. Any future ingestion interface requires its own approved
short-lived identity, transport authentication, tenant binding, and security
review before deployment.

## Aggregate projection contract

The strict batch contract is defined in `projection-contract.ts`. Each record
contains only a tenant deployment UUID, generation time, allowlisted metric
key, exact UTC bucket start, numeric aggregate value, and optional ISO currency.
Extra fields are rejected. The tenant UUID must match the projector
deployment's `GLOBAL_BI_PROJECTOR_TENANT_ID`, and a bucket cannot be in the
future, outside the retention window, or later than its generation timestamp.
Counts are integers; currency must match the catalog definition.

Example contract shape only — placeholder values below are intentionally
invalid and must not be imported:

```json
{
  "tenantId": "<tenant deployment UUID>",
  "generatedAt": "<UTC generation timestamp>",
  "projections": [
    {
      "metricKey": "finance.posted_journals",
      "bucketStart": "<UTC bucket start at :00 or :30>",
      "value": "<count>"
    },
    {
      "metricKey": "finance.posted_volume",
      "bucketStart": "<UTC bucket start at :00 or :30>",
      "value": "<amount>",
      "currency": "<ISO 4217 code>"
    }
  ]
}
```

The existing importer is a controlled operator utility requiring the separate
Global BI projector database role; it is not a supported tenant-to-central
ingestion endpoint. Do not give its database URL or credentials to tenant
operators. Until a trusted ingestion service and tenant-side extraction are
implemented, imports and scheduled updates are not configured.

## Operator review checklists

These checks are performed and evidenced by the tenant operator through the
tenant's normal operational process. Control-plane requests only record the
request; they do not run any checklist step.

### Migration review

1. Confirm the tenant's change approval, maintenance window, and target
   deployment identity.
2. Compare the release migration manifest and checksums to the approved
   baseline; investigate all drift before proceeding.
3. Confirm a tenant-local backup and a restore-tested recovery point.
4. Apply migrations only using that tenant's authorized operator and migration
   runner; do not use central credentials or cross-tenant links.
5. Capture before/after schema version, readiness checks, migration logs, and
   operator sign-off in the tenant's approved evidence store.
6. Record any rollback decision and verification independently.

### Backup and restore review

1. Confirm tenant-local backup policy, encryption, retention, and recovery
   objectives.
2. Record the most recent successful backup timestamp and a non-secret
   evidence reference.
3. Restore to an isolated environment controlled by the tenant operator.
4. Verify database integrity and application-level checks without connecting
   that environment to production.
5. Record restore duration, validation results, RPO/RTO evidence, and operator
   sign-off in the tenant evidence store.

## Central API

The central API proxies
`GET /api/v1/global-bi/dashboard?from=<ISO-UTC>&to=<ISO-UTC>` and
`GET /api/v1/global-bi/status` only after Global Admin authorization. Dashboard
filters must align to 30-minute UTC boundaries and span no more than 31 days.
The response aggregates across projection rows without returning tenant
identifiers. Status reports observed data; it never asserts a tenant scheduler
is configured or healthy.
