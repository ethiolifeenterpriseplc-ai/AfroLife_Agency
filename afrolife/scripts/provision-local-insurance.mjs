import { randomBytes } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

const envPath = process.env.AFROLIFE_ENV_FILE
  ?? join(process.env.LOCALAPPDATA ?? '', 'AfroLife', 'afrolife.env');
if (!process.env.AFROLIFE_ENV_FILE && !process.env.LOCALAPPDATA) {
  throw new Error('Set LOCALAPPDATA or AFROLIFE_ENV_FILE to the local AfroLife environment file');
}
const config = dotenv.parse(await readFile(envPath, 'utf8'));
const runtimeRole = 'afrolife_insurance_app';
const databaseName = 'afrolife_insurance';
const insuranceKeys = [
  'INSURANCE_DATABASE_URL',
  'INSURANCE_MIGRATION_DATABASE_URL',
  'INSURANCE_RUNTIME_DB_ROLE',
  'INSURANCE_GATEWAY_SECRET',
];
const configured = insuranceKeys.filter((key) => config[key]);

function localDatabaseUrl(value, key, expectedDatabase) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid PostgreSQL connection URL`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.port !== '5433'
    || decodeURIComponent(url.pathname.slice(1)) !== expectedDatabase
    || !url.username || !url.password) {
    throw new Error(`${key} must point to ${expectedDatabase} on the local AfroLife PostgreSQL port 5433`);
  }
  return url;
}

if (configured.length) {
  if (configured.length !== insuranceKeys.length) {
    throw new Error(`Local Insurance provisioning is partially configured (${configured.join(', ')}); inspect the local environment and database before continuing`);
  }
  const runtimeUrl = localDatabaseUrl(config.INSURANCE_DATABASE_URL, 'INSURANCE_DATABASE_URL', databaseName);
  const migrationUrl = localDatabaseUrl(config.INSURANCE_MIGRATION_DATABASE_URL, 'INSURANCE_MIGRATION_DATABASE_URL', databaseName);
  if (decodeURIComponent(runtimeUrl.username) !== runtimeRole
    || config.INSURANCE_RUNTIME_DB_ROLE !== runtimeRole
    || decodeURIComponent(migrationUrl.username) !== 'postgres'
    || config.INSURANCE_GATEWAY_SECRET.length < 32) {
    throw new Error('Existing local Insurance settings do not match the restricted local service configuration');
  }
  console.log('Local Insurance database credentials are already configured; continuing with schema migrations.');
} else {
  const mainUrl = localDatabaseUrl(config.MIGRATION_DATABASE_URL, 'MIGRATION_DATABASE_URL', 'afrolife');
  if (decodeURIComponent(mainUrl.username) !== 'postgres') {
    throw new Error('Local Insurance provisioning requires the existing local PostgreSQL migration owner');
  }
  const adminUrl = new URL(mainUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';
  adminUrl.hash = '';

  const runtimePassword = randomBytes(48).toString('hex');
  const gatewaySecret = randomBytes(48).toString('hex');
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  let roleCreated = false;
  let databaseCreated = false;
  await admin.connect();
  try {
    const existingRole = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [runtimeRole]);
    const existingDatabase = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName]);
    if (existingRole.rowCount || existingDatabase.rowCount) {
      throw new Error('A local Insurance role or database already exists without matching environment settings; refusing to overwrite it');
    }
    const createRole = (await admin.query(
      `SELECT format(
         'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
         $1::text, $2::text
       ) AS statement`,
      [runtimeRole, runtimePassword],
    )).rows[0].statement;
    await admin.query(createRole);
    roleCreated = true;
    const createDatabase = (await admin.query(
      "SELECT format('CREATE DATABASE %I OWNER %I CONNECTION LIMIT 20', $1::text, $2::text) AS statement",
      [databaseName, 'postgres'],
    )).rows[0].statement;
    await admin.query(createDatabase);
    databaseCreated = true;
  } catch (error) {
    if (roleCreated && !databaseCreated) {
      try {
        await admin.query('DROP ROLE IF EXISTS afrolife_insurance_app');
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Insurance role creation failed and its cleanup also failed');
      }
    }
    throw error;
  } finally {
    await admin.end();
  }

  const runtimeUrl = new URL(mainUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = runtimePassword;
  runtimeUrl.pathname = `/${databaseName}`;
  const migrationUrl = new URL(mainUrl);
  migrationUrl.pathname = `/${databaseName}`;
  migrationUrl.search = '';
  migrationUrl.hash = '';
  await appendFile(envPath, [
    '',
    '# Local-only independent Insurance ledger database. Keep this service off production traffic.',
    `INSURANCE_DATABASE_URL=${runtimeUrl.toString()}`,
    `INSURANCE_MIGRATION_DATABASE_URL=${migrationUrl.toString()}`,
    `INSURANCE_RUNTIME_DB_ROLE=${runtimeRole}`,
    `INSURANCE_GATEWAY_SECRET=${gatewaySecret}`,
    '',
  ].join('\n'), { encoding: 'utf8' });
  console.log(`Created isolated local Insurance database and restricted runtime role; settings are stored in ${envPath}.`);
}
