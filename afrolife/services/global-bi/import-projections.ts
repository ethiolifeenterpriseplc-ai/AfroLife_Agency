import '../../src/env.js';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { validateGlobalBiProjectionBatch } from './projection-contract.js';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Provide the path to a validated aggregate-only Global BI projection JSON file');
const parsed = validateGlobalBiProjectionBatch(JSON.parse(await readFile(inputPath, 'utf8')));
const generatedAt = new Date(parsed.generatedAt);

const connectionString = process.env.GLOBAL_BI_INGEST_DATABASE_URL;
if (!connectionString) throw new Error('GLOBAL_BI_INGEST_DATABASE_URL must be configured for the projection importer');
const pool = new pg.Pool({ connectionString, application_name: 'afrolife-global-bi-projector' });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.service','global_bi_projector',true)");
  let imported = 0;
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
    imported += result.rowCount ?? 0;
  }
  await client.query(
    `DELETE FROM global_bi_aggregates
     WHERE period_start < date_trunc('month',current_date - interval '12 months')::date`,
  );
  await client.query('COMMIT');
  console.log(`Imported ${imported} aggregate projection(s)`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
