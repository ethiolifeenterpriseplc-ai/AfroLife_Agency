import '../src/env.js';
import pg from 'pg';
import { buildInsuranceBrokerageDemoWorkflow } from '../src/insurance-brokerage-sandbox.js';

const connectionString = process.env.TEST_DATABASE_URL?.trim() || process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  throw new Error('TEST_DATABASE_URL or MIGRATION_DATABASE_URL must be configured for the local Insurance sandbox seed.');
}

const target = new URL(connectionString);
const databaseName = decodeURIComponent(target.pathname.replace(/^\/+/, ''));
const disposableDatabase = /^afrolife_test_[a-z0-9_-]+$/i.test(databaseName);
if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)
  || target.port !== '5433'
  || !(databaseName === 'afrolife' || disposableDatabase)) {
  throw new Error('Refusing to seed Insurance sandbox data outside local afrolife or afrolife_test_* on port 5433.');
}

const pool = new pg.Pool({ connectionString });
const client = await pool.connect();
const scenarioReference = 'SYN-DEMO-INSURANCE-TRAINING';
const scenarioRunId = '5c1c2f2a-9485-4c4f-b7e1-e2615cecb879';
try {
  const identity = (await client.query(`
    SELECT current_database() AS database, current_user AS database_user,
           host(inet_server_addr()) AS address, inet_server_port() AS port,
           (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
           (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses_rls
  `)).rows[0];
  const fixtureRole = disposableDatabase
    && /^afrolife_fixture_[a-z0-9_]+$/i.test(identity.database_user)
    && !identity.is_superuser && identity.bypasses_rls;
  const localMigrationOwner = databaseName === 'afrolife'
    && identity.database_user === 'postgres' && identity.is_superuser;
  if (!['127.0.0.1', '::1'].includes(identity.address) || Number(identity.port) !== 5433
    || (!fixtureRole && !localMigrationOwner)) {
    throw new Error(`Refusing to seed unexpected database identity: ${JSON.stringify(identity)}.`);
  }

  const migration = await client.query(
    "SELECT 1 FROM schema_migrations WHERE name = '069_insurance_brokerage_sandbox.sql'",
  );
  if (!migration.rowCount) {
    throw new Error('Apply the core migrations through 069 before seeding Insurance sandbox demo data.');
  }
  const actor = await client.query(
    `SELECT id FROM users
     WHERE active AND role='super_admin'
     ORDER BY created_at, id LIMIT 1`,
  );
  if (!actor.rowCount) {
    throw new Error('An active local Super Admin is required; no demo case was created.');
  }

  await client.query('BEGIN');
  const created = await client.query(
    `INSERT INTO insurance_brokerage_sandbox_cases (scenario_reference, created_by)
     VALUES ($1, $2)
     ON CONFLICT (scenario_reference) DO NOTHING
     RETURNING id, created_by`,
    [scenarioReference, actor.rows[0].id],
  );
  const scenario = created.rowCount
    ? created.rows[0]
    : (await client.query(
      `SELECT id, created_by FROM insurance_brokerage_sandbox_cases
       WHERE scenario_reference=$1 FOR UPDATE`,
      [scenarioReference],
    )).rows[0];
  if (!scenario || scenario.created_by !== actor.rows[0].id) {
    throw new Error('The existing synthetic demo case belongs to a different local account; no changes were made.');
  }

  const existingEvents = await client.query(
    `SELECT sequence_number, event_type
     FROM insurance_brokerage_sandbox_events
     WHERE case_id=$1 AND scenario_run_id=$2
     ORDER BY sequence_number`,
    [scenario.id, scenarioRunId],
  );
  const workflow = buildInsuranceBrokerageDemoWorkflow();
  if (existingEvents.rowCount) {
    const complete = existingEvents.rowCount === workflow.length
      && existingEvents.rows.every((event, index) =>
        event.sequence_number === index + 1 && event.event_type === workflow[index][0]);
    if (!complete) throw new Error('The existing synthetic demo run is incomplete or inconsistent; no events were changed.');
  } else {
    for (const [index, [eventType, eventData]] of workflow.entries()) {
      await client.query(
        `INSERT INTO insurance_brokerage_sandbox_events
           (case_id, scenario_run_id, sequence_number, actor_id, event_type, event_data)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [scenario.id, scenarioRunId, index + 1, actor.rows[0].id, eventType, JSON.stringify(eventData)],
      );
    }
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({
    mode: 'sandbox',
    sandbox_only: true,
    database: identity.database,
    case_id: scenario.id,
    scenario_reference: scenarioReference,
    event_count: workflow.length,
    already_seeded: existingEvents.rowCount > 0,
    production_activities_enabled: false,
  }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
