# Tenant-local 30-minute projector deployment template

**State: not configured / not deployable today.** AfroLife does not yet ship a
tenant-local extractor, approved remote ingestion endpoint, or trusted
projector-health signal. This template is intentionally suspended and
references an operator-provided image that does not exist in this repository.
Do not resume it, substitute an ad-hoc exporter, or grant it a database URL.

Each tenant operator owns the projector, its local scheduler, and its data
source authorization. The projector must run inside that tenant's approved
environment and emit only the allowlisted aggregates in
`../projection-contract.ts`. The central platform has no direct tenant DB
connection, no tenant credentials, and no authority to execute projector jobs.

## Before enabling a tenant deployment

1. Obtain tenant change approval and confirm the deployment is bound to that
   tenant's own cloud/on-prem data plane. Cloud PostgreSQL and on-prem Patroni
   are not one HA cluster.
2. Implement and independently review a tenant-local source extractor that
   calculates approved aggregate metrics only. Do not export source records,
   PII, SQL text, connection details, or credentials.
3. Obtain an approved private, verified-TLS ingestion endpoint and short-lived,
   tenant-bound workload identity. The endpoint is not implemented by this
   repository today; do not reuse the central BI database credentials.
4. Configure tenant-side observability to attest configuration, schedule
   execution, last successful export, failed runs, and tenant identity. Data
   arrival in central BI is not sufficient proof of projector health.
5. Review query-pooling behavior for the tenant's connection pooler. In
   particular, do not depend on session state through PgBouncer transaction
   pooling.
6. Test with approved non-production aggregates; validate tenant binding,
   schema, UTC bucket boundaries, stale replay handling, retention, and
   failure/recovery behavior.
7. Only after the endpoint, identity, local health evidence, review, and
   operator sign-off exist, replace the placeholder image/command and
   deliberately set `suspend: false` in the tenant's own repository.

## Schedule contract

`cronjob.example.yaml` requests one run every 30 minutes in UTC and prevents
concurrent jobs. It is deliberately `suspend: true`. It is a scheduling
template, not a running scheduler. The scheduled run must label each bucket
with its exact UTC start instant (`:00` or `:30`), use only fixed catalog
metric keys, and make repeated input idempotent. The target cadence alone does
not establish health or completeness.

## Evidence and alerting

Keep evidence in the tenant's approved change/evidence system, not in central
tenant metadata. Record the deployment commit/image digest, tenant identity,
schedule, last successful/failed run, exported bucket timestamp, row counts
per allowlisted metric, validation outcome, and operator. Never record
credential values. Alert the tenant operator when a successful bucket has not
been produced within 60 minutes; central Global BI will still report its
observed import age and will not claim to know why data is absent.
