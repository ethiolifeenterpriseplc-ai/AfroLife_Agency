import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '/etc/afrolife/runtime.env' });

const credentialFile = process.env.AFROLIFE_UAT_CREDENTIALS;
if (!credentialFile) throw new Error('Set AFROLIFE_UAT_CREDENTIALS to the protected local UAT credential file.');
if (!process.env.DATABASE_URL) throw new Error('The local 8080 runtime database URL is required.');

const dbUrl = new URL(process.env.DATABASE_URL);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '5432' || dbUrl.pathname !== '/afrolife_linux') {
  throw new Error('Refusing to seed accounts: this tool only targets afrolife_linux on local 127.0.0.1:5432.');
}

const reserved = [
  ['super_admin_1', 'super_admin', '+12025550101'],
  ['super_admin_2', 'super_admin', '+12025550102'],
  ['corporate_business_manager', 'corporate_business_manager', '+12025550103'],
  ['compliance', 'compliance', '+12025550104'],
  ['finance', 'finance', '+12025550105'],
  ['finance_manager', 'finance_manager', '+12025550106'],
  ['master_agent', 'master_agent', '+12025550107'],
  ['field_agent', 'field_agent', '+12025550108'],
  ['customer', 'customer', '+12025550109'],
  ['worker', 'worker', '+12025550110'],
  ['property_owner', 'property_owner', '+12025550111'],
];
const names = {
  super_admin_2: 'LOCAL QA Super Admin Two',
  corporate_business_manager: 'LOCAL QA Corporate Manager',
  compliance: 'LOCAL QA Compliance',
  finance: 'LOCAL QA Finance',
  finance_manager: 'LOCAL QA Finance Manager',
  master_agent: 'LOCAL QA Master Agent',
  field_agent: 'LOCAL QA Field Agent',
  customer: 'LOCAL QA Customer',
  worker: 'LOCAL QA Worker',
  property_owner: 'LOCAL QA Property Owner',
};

const rows = readFileSync(credentialFile, 'utf8').split(/\r?\n/)
  .filter((line) => /^\w+ \| \+120255501\d{2} \| /.test(line))
  .map((line) => line.split('|').map((part) => part.trim()));
if (rows.length !== reserved.length) throw new Error('Credential file must contain exactly the 11 reserved local UAT accounts.');
const credentials = new Map(rows.map(([role, phone, password]) => [phone, { role, password }]));
for (const [, role, phone] of reserved) {
  const credential = credentials.get(phone);
  if (!credential || credential.role !== role || credential.password.length < 12 || Buffer.byteLength(credential.password) > 72) {
    throw new Error(`Missing or invalid protected credential row for ${role}.`);
  }
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  const identity = (await client.query(`
    SELECT current_database() AS database, current_user AS database_user,
           host(inet_server_addr()) AS address, inet_server_port() AS port
  `)).rows[0];
  if (identity.database !== 'afrolife_linux' || identity.database_user !== 'afrolife_runtime'
    || identity.address !== '127.0.0.1' || Number(identity.port) !== 5432) {
    throw new Error(`Refusing to seed accounts: unexpected database identity ${JSON.stringify(identity)}.`);
  }

  const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name = '067_global_admin_release_approval_role.sql'");
  if (!applied.rowCount) throw new Error('The expected local 8080 schema migration was not found.');
  const admin = (await client.query(
    "SELECT id FROM users WHERE phone = '+12025550101' AND role = 'super_admin' AND active",
  )).rows[0];
  if (!admin) throw new Error('The already provisioned local 8080 Super Admin is missing or inactive.');
  const occupied = (await client.query(
    'SELECT phone, role FROM users WHERE phone = ANY($1::text[]) AND phone <> $2',
    [reserved.map(([, , phone]) => phone), '+12025550101'],
  )).rows;
  if (occupied.length) throw new Error(`Reserved UAT account numbers are already in use (${occupied.map((row) => `${row.phone}:${row.role}`).join(', ')}); nothing was created.`);
  const territory = (await client.query(
    "SELECT id FROM territories WHERE level = 'sub_city' AND name = 'Bole' ORDER BY id LIMIT 1",
  )).rows[0];
  if (!territory) throw new Error('The local starter Bole territory is missing.');

  await client.query('BEGIN');
  await client.query(
    "SELECT set_config('app.user_id',$1,true), set_config('app.role','super_admin',true)",
    [admin.id],
  );
  const ids = new Map([['super_admin_1', admin.id]]);
  for (const [key, role, phone] of reserved.slice(1)) {
    const password = credentials.get(phone).password;
    const result = await client.query(
      `INSERT INTO users (legal_name, phone, email, role, territory_id, password_hash,
                          must_change_password, kyc_status, active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,false,'verified',true,$7)
       RETURNING id`,
      [names[key], phone, `${key}@example.test`, role,
        ['master_agent', 'field_agent'].includes(role) ? territory.id : null,
        await bcrypt.hash(password, 12), admin.id],
    );
    ids.set(key, result.rows[0].id);
    if (role === 'master_agent') {
      await client.query(
        "INSERT INTO agents (id,agent_type,parent_id,territory_id) VALUES ($1,'master',NULL,$2)",
        [result.rows[0].id, territory.id],
      );
    } else if (role === 'field_agent') {
      await client.query(
        "INSERT INTO agents (id,agent_type,parent_id,territory_id) VALUES ($1,'field',$2,$3)",
        [result.rows[0].id, ids.get('master_agent'), territory.id],
      );
    }
  }

  for (const [key, role] of reserved.slice(1).filter(([, role]) =>
    ['master_agent', 'field_agent', 'customer', 'worker', 'property_owner'].includes(role))) {
    const accountType = ['master_agent', 'field_agent'].includes(role) ? 'agent' : role;
    await client.query(
      `INSERT INTO user_signups
         (user_id,account_type,requested_plan,payment_status,agent_type,territory_id,
          parent_agent_id,status,reviewed_by,reviewed_at)
       VALUES ($1,$2,$3,'not_required',$4,$5,$6,'approved',$7,now())`,
      [ids.get(key), accountType,
        ['agent', 'property_owner'].includes(accountType) ? 'free' : null,
        accountType === 'agent' ? (role === 'master_agent' ? 'master' : 'field') : null,
        accountType === 'agent' ? territory.id : null,
        role === 'field_agent' ? ids.get('master_agent') : null,
        admin.id],
    );
  }

  for (const [key, role] of reserved.slice(1)) {
    await client.query(
      `INSERT INTO audit_logs (actor_id,action,entity,entity_id,new_value)
       VALUES ($1,'local_test_user_seeded','user',$2,$3::jsonb)`,
      [admin.id, ids.get(key), JSON.stringify({ role, label: names[key] })],
    );
  }
  await client.query('COMMIT');
  console.log(`Created ${reserved.length - 1} additional local UAT accounts for the 8080 environment.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
