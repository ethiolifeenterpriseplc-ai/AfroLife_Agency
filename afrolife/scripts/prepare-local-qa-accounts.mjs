import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

const envPath = join(process.env.LOCALAPPDATA ?? '', 'AfroLife', 'afrolife.env');
if (!process.env.LOCALAPPDATA || !existsSync(envPath)) {
  throw new Error('Local AfroLife environment is required; run npm run db:local:setup first.');
}
const config = dotenv.parse(readFileSync(envPath, 'utf8'));
if (!config.MIGRATION_DATABASE_URL) {
  throw new Error('MIGRATION_DATABASE_URL is missing from the local AfroLife environment.');
}

const databaseUrl = new URL(config.MIGRATION_DATABASE_URL);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ''));
if (!['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname)
  || databaseUrl.port !== '5433' || databaseName !== 'afrolife'
  || decodeURIComponent(databaseUrl.username) !== 'postgres') {
  throw new Error('Refusing to modify QA users outside the local afrolife database on port 5433.');
}

const password = 'AfroLifeQA!2026';
const credentialPath = join(process.env.LOCALAPPDATA, 'AfroLife', 'local-test-users.txt');
const accounts = [
  ['LOCAL QA Super Admin One', 'super_admin', '+12025550101'],
  ['LOCAL QA Super Admin Two', 'super_admin', '+12025550102'],
  ['LOCAL QA Corporate Manager', 'corporate_business_manager', '+12025550103'],
  ['LOCAL QA Compliance', 'compliance', '+12025550104'],
  ['LOCAL QA Finance', 'finance', '+12025550105'],
  ['LOCAL QA Finance Manager', 'finance_manager', '+12025550106'],
  ['LOCAL QA Master Agent', 'master_agent', '+12025550107'],
  ['LOCAL QA Field Agent', 'field_agent', '+12025550108'],
  ['LOCAL QA Customer', 'customer', '+12025550109'],
  ['LOCAL QA Worker', 'worker', '+12025550110'],
  ['LOCAL QA Property Owner', 'property_owner', '+12025550111'],
  ['LOCAL QA Global Admin', 'global_admin', '+12025550112'],
].map(([name, role, phone]) => ({ name, role, phone }));

const pool = new pg.Pool({ connectionString: config.MIGRATION_DATABASE_URL });
const client = await pool.connect();
let committed = false;
try {
  const identity = (await client.query(`
    SELECT current_database() AS database, current_user AS database_user,
           host(inet_server_addr()) AS address, inet_server_port() AS port,
           (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS is_superuser
  `)).rows[0];
  if (identity.database !== 'afrolife' || identity.database_user !== 'postgres'
    || !identity.is_superuser || !['127.0.0.1', '::1'].includes(identity.address)
    || Number(identity.port) !== 5433) {
    throw new Error('Refusing to prepare test accounts: unexpected database identity.');
  }
  const migration = await client.query(
    "SELECT 1 FROM schema_migrations WHERE name='080_user_mini_app_access.sql'",
  );
  if (!migration.rowCount) throw new Error('Apply the complete local AfroLife migration set before preparing QA accounts.');

  await client.query('BEGIN');
  const seedAdmin = (await client.query(
    `SELECT id FROM users WHERE phone=$1 AND legal_name=$2 AND role='super_admin'`,
    ['+12025550101', 'LOCAL QA Super Admin One'],
  )).rows[0];
  if (!seedAdmin) {
    throw new Error('Expected existing reserved LOCAL QA Super Admin One account was not found.');
  }

  const hash = await bcrypt.hash(password, 12);
  const ids = new Map();
  for (const account of accounts) {
    let existing = (await client.query(
      'SELECT id, legal_name, role FROM users WHERE phone=$1 FOR UPDATE',
      [account.phone],
    )).rows[0];
    if (existing && (existing.legal_name !== account.name || existing.role !== account.role)) {
      throw new Error(`Reserved QA phone ${account.phone} belongs to an unexpected account; no changes were committed.`);
    }
    if (!existing) {
      const created = await client.query(
        `INSERT INTO users
           (legal_name, phone, email, role, password_hash, must_change_password, kyc_status, active, created_by)
         VALUES ($1,$2,$3,$4,$5,false,'verified',true,$6)
         RETURNING id`,
        [account.name, account.phone, `${account.role}@local-qa.example.test`, account.role, hash, seedAdmin.id],
      );
      existing = { id: created.rows[0].id, legal_name: account.name, role: account.role };
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, entity, entity_id, new_value)
         VALUES ($1,'local_test_user_seeded','user',$2,$3::jsonb)`,
        [seedAdmin.id, existing.id, JSON.stringify({ role: account.role, label: account.name })],
      );
    } else {
      await client.query(
        `UPDATE users SET password_hash=$2, active=true, must_change_password=false,
           failed_logins=0, locked_until=NULL WHERE id=$1`,
        [existing.id, hash],
      );
    }
    ids.set(account.phone, existing.id);
  }

  const profiles = await client.query(
    `SELECT user_id, mode FROM user_app_access_profiles
     WHERE user_id = ANY($1::uuid[])`,
    [[...ids.values()]],
  );
  const customAccess = new Set(profiles.rows.filter((row) => row.mode === 'custom').map((row) => row.user_id));
  const accountingRoles = ['global_admin', 'super_admin', 'corporate_business_manager', 'compliance', 'finance', 'finance_manager'];
  for (const account of accounts.filter(({ role }) => accountingRoles.includes(role))) {
    const userId = ids.get(account.phone);
    if (!customAccess.has(userId)) continue;
    const existingGrants = await client.query(
      'SELECT module_key FROM user_app_access_grants WHERE user_id=$1',
      [userId],
    );
    const previousModules = existingGrants.rows.map((row) => row.module_key).sort();
    if (previousModules.includes('accounting')) continue;
    await client.query(
      `INSERT INTO user_app_access_grants (user_id,module_key,assigned_by)
       VALUES ($1,'accounting',$2) ON CONFLICT DO NOTHING`,
      [userId, seedAdmin.id],
    );
    await client.query(
      `INSERT INTO user_app_access_audit
         (target_user_id,actor_id,previous_mode,new_mode,previous_modules,new_modules)
       VALUES ($1,$2,'custom','custom',$3::jsonb,$4::jsonb)`,
      [userId, seedAdmin.id, JSON.stringify(previousModules), JSON.stringify([...previousModules, 'accounting'].sort())],
    );
  }

  await client.query('COMMIT');
  committed = true;
} catch (error) {
  if (!committed) await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}

const contents = [
  'AfroLife local QA test accounts',
  'LOCAL DEVELOPMENT ONLY. Synthetic accounts for testing. Never use on staging or production.',
  'Universal local test password: AfroLifeQA!2026',
  'Role | Login phone | Password',
  ...accounts.map(({ role, phone }) => `${role} | ${phone} | ${password}`),
  '',
  'Accounts are reset to this test password each time the local QA preparation command runs.',
].join('\n');
if (process.platform === 'win32') {
  const account = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`;
  if (existsSync(credentialPath)) {
    execFileSync('icacls.exe', [credentialPath, '/inheritance:r', '/grant:r', `${account}:(M)`, '*S-1-5-18:(F)', '*S-1-5-32-544:(F)'], { stdio: 'ignore' });
  }
}
writeFileSync(credentialPath, contents, { encoding: 'utf8', mode: 0o600 });
if (process.platform === 'win32') {
  const account = `${process.env.USERDOMAIN ?? ''}\\${process.env.USERNAME ?? ''}`;
  execFileSync('icacls.exe', [credentialPath, '/inheritance:r', '/grant:r', `${account}:(R)`, '*S-1-5-18:(F)', '*S-1-5-32-544:(F)'], { stdio: 'ignore' });
}
console.log(`Prepared ${accounts.length} local QA role accounts. Credentials are stored outside the repository at ${credentialPath}.`);
