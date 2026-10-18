import '../../src/env.js';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { assertProjectionTenant, validateGlobalBiProjectionBatch } from './projection-contract.js';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Provide the path to a validated aggregate-only Global BI projection JSON file');
const parsed = validateGlobalBiProjectionBatch(JSON.parse(await readFile(inputPath, 'utf8')));
assertProjectionTenant(parsed, process.env.GLOBAL_BI_PROJECTOR_TENANT_ID);
const generatedAt = new Date(parsed.generatedAt);

const connectionString = process.env.GLOBAL_BI_INGEST_DATABASE_URL;
if (!connectionString) throw new Error('GLOBAL_BI_INGEST_DATABASE_URL must be configured for the projection importer');
if (process.env.DATABASE_URL) {
  const target = (value: string) => {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}:${url.port || '5432'}${url.pathname}`;
  };
  if (target(connectionString) === target(process.env.DATABASE_URL)) {
    throw new Error('GLOBAL_BI_INGEST_DATABASE_URL must not point to the operational database');
  }
}
const pool = new pg.Pool({ connectionString, application_name: 'afrolife-global-bi-projector' });
const client = await pool.connect();
try {
  const role = (await client.query(
    `SELECT r.rolsuper,r.rolbypassrls,
            has_table_privilege(current_user,'public.global_bi_aggregates','SELECT') AS can_read,
            has_table_privilege(current_user,'public.global_bi_aggregates','INSERT') AS can_insert,
            has_table_privilege(current_user,'public.global_bi_aggregates','UPDATE') AS can_update,
            has_table_privilege(current_user,'public.global_bi_aggregates','DELETE') AS can_delete,
            has_table_privilege(current_user,'public.global_bi_metric_catalog','SELECT') AS catalog_can_read,
            has_table_privilege(current_user,'public.global_bi_metric_catalog','INSERT') AS catalog_can_insert,
            has_schema_privilege(current_user,'public','CREATE') AS can_create_in_public
     FROM pg_roles r WHERE r.rolname=current_user`,
  )).rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || !role.can_read || !role.can_insert
    || !role.can_update || !role.can_delete || !role.catalog_can_read
    || role.catalog_can_insert || role.can_create_in_public) {
    throw new Error('Global BI projector role must be non-owner, non-superuser, and limited to aggregate-table writes');
  }
  const owned = (await client.query(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind IN ('r','p')
       AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
     LIMIT 1`,
  )).rows[0];
  if (owned) throw new Error(`Global BI projector role owns table ${owned.relname}`);
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.service','global_bi_projector',true)");
  let imported = 0;
  let ignoredStale = 0;
  for (const row of parsed.projections) {
    const result = await client.query(
      `INSERT INTO global_bi_aggregates
         (tenant_id,metric_key,source_service,period_start,period_end,metric_value,unit,currency,projected_at)
       SELECT $1,c.metric_key,c.source_service,$3::date,$4::date,$5::numeric,c.unit,$6,$7::timestamptz
       FROM global_bi_metric_catalog c WHERE c.metric_key=$2
       ON CONFLICT (tenant_id,metric_key,period_start,currency)
       DO UPDATE SET period_end=EXCLUDED.period_end,metric_value=EXCLUDED.metric_value,
                     projected_at=EXCLUDED.projected_at
       WHERE EXCLUDED.projected_at > global_bi_aggregates.projected_at`,
      [parsed.tenantId, row.metricKey, row.periodStart, row.periodEnd, row.value, row.currency ?? '', generatedAt],
    );
    if (result.rowCount) {
      imported += result.rowCount;
    } else {
      const existing = await client.query(
        `SELECT projected_at FROM global_bi_aggregates
         WHERE tenant_id=$1 AND metric_key=$2 AND period_start=$3::date AND currency=$4`,
        [parsed.tenantId, row.metricKey, row.periodStart, row.currency ?? ''],
      );
      if (!existing.rowCount) throw new Error(`Projection metric ${row.metricKey} is missing from the Global BI catalog`);
      ignoredStale += 1;
    }
  }
  await client.query(
    `DELETE FROM global_bi_aggregates
     WHERE period_start < date_trunc('month',current_date - interval '12 months')::date`,
  );
  await client.query('COMMIT');
  console.log(`Imported ${imported} aggregate projection(s); ignored ${ignoredStale} unchanged or stale replay(s)`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
