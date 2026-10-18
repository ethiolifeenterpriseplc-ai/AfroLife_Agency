# Global BI service

Global BI is a separate, read-only analytics service. It never reads a tenant's
operational database. Tenant source systems must first produce approved,
secret-free monthly aggregates and send the strict projection file to the
separate BI database through the trusted projector role.

## Access and data limits

- The dashboard API allows `global_admin`, `super_admin`, `finance`, and
  `finance_manager`; app-level user assignments and deployment allowlists are
  additionally enforced by the central gateway.
- The dashboard returns cross-tenant totals only. It does not return tenant IDs,
  names, users, members, customers, journal rows, account details, or source
  records.
- The projection importer accepts only the fixed metric catalog, tenant UUID,
  calendar-month periods, numeric aggregate values, optional currency, and a
  generation timestamp. Unknown fields (including PII) are rejected.
- The query DB role has `SELECT` only. The separate projector DB role has
  aggregate-table writes and cannot access tenant operational data.
- The API and importer limit queries and stored periods to 13 calendar months.
  The projector removes expired aggregate periods during import.
- No source extractor, hourly scheduler, or production data reconciliation is
  included yet. Until tenant projectors are approved and deployed, Global BI is
  an empty/unconfigured dashboard; do not add synthetic values.

## Setup

1. Provision a dedicated PostgreSQL database named for Global BI; it must not
   be the central operational database or any tenant database.
2. Create separate migration, query-only, and projector roles. Configure
   `GLOBAL_BI_MIGRATION_DATABASE_URL`, `GLOBAL_BI_DATABASE_URL`, and
   `GLOBAL_BI_INGEST_DATABASE_URL` from `.env.example`.
3. Apply the schema with `npm run migrate:global-bi`. The service refuses to
   start if its runtime role is a superuser, owns tables, can bypass RLS, or can
   write to the aggregate table.
4. Set `GLOBAL_BI_GATEWAY_SECRET` in this service and the matching
   `GLOBAL_BI_GATEWAY_SECRET` / service URL / cutover flag in the central API.
   Keep this service on a private network behind the central identity gateway.
5. Build with `npm run build:global-bi`; start with `npm run start:global-bi`.

## Projection contract

The trusted tenant-side projector creates one JSON file per tenant/hour. The
file is loaded only through `npm run import:global-bi -- <path-to-json>` using
the projector database role. `tenantId` must come from that tenant's verified
deployment configuration, not user input.

```json
{
  "tenantId": "00000000-0000-4000-8000-000000000001",
  "generatedAt": "2026-10-14T12:00:00.000Z",
  "projections": [
    {
      "metricKey": "finance.posted_journals",
      "periodStart": "2026-10-01",
      "periodEnd": "2026-10-31",
      "value": "24"
    },
    {
      "metricKey": "finance.posted_volume",
      "periodStart": "2026-10-01",
      "periodEnd": "2026-10-31",
      "value": "42150.00",
      "currency": "ETB"
    }
  ]
}
```

The importer rejects extra fields, unsupported metrics, invalid periods,
stale writes, non-aggregate shapes, and currency/unit mismatches. It is
idempotent by tenant, metric, period, and currency. Flow metrics sum over the
selected window; snapshot metrics use the latest available monthly value per
tenant. Metric keys and units are declared in `catalog.ts`.

| Metric | Source | Unit | Temporal aggregation |
| --- | --- | --- | --- |
| `finance.posted_journals` | Accounting | count | flow |
| `finance.pending_journals` | Accounting | count | snapshot |
| `finance.posted_volume` | Accounting | currency | flow |
| `workforce.workers_registered` | Workforce Management | count | flow |
| `staffing.engagements_completed` | Staffing | count | flow |
| `property.listings_created` | Property Management | count | flow |
| `marketplace.orders_completed` | Marketplace | count | flow |
| `edir.members_registered` | Edir | count | flow |
| `mfi.loan_disbursements` | SACCO / MFI | currency | flow |
| `insurance.policies_issued` | Insurance | count | flow |

## Central API

The central API proxies `GET /api/v1/global-bi/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD`
using the signed universal identity. The service validates the signature and
role again. `from` defaults to the first day of the month 12 months before the
current month; `to` defaults to today. Requests outside the 13-month window are
rejected. The response includes aggregate metrics, monthly trend points,
reporting-tenant count, and the oldest projection timestamp in the result.
