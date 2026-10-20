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
const databaseName = 'afrolife_accounting_local';
const runtimeRole = 'afrolife_accounting_app';
const accountingKeys = [
  'ACCOUNTING_DATABASE_URL',
  'ACCOUNTING_MIGRATION_DATABASE_URL',
  'ACCOUNTING_RUNTIME_DB_ROLE',
  'ACCOUNTING_AUTH_MODE',
  'ACCOUNTING_GATEWAY_SECRET',
  'ACCOUNTING_INGEST_SECRET',
  'ACCOUNTING_INGEST_SECRETS',
  'ACCOUNTING_SERVICE_URL',
];
const configured = accountingKeys.filter((key) => config[key]);

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
    throw new Error(`${key} must point to ${expectedDatabase} on local AfroLife PostgreSQL port 5433`);
  }
  return url;
}

if (configured.length) {
  if (configured.length !== accountingKeys.length) {
    throw new Error(`Local Accounting provisioning is partially configured (${configured.join(', ')}); inspect it before continuing`);
  }
  const runtimeUrl = localDatabaseUrl(config.ACCOUNTING_DATABASE_URL, 'ACCOUNTING_DATABASE_URL', databaseName);
  const migrationUrl = localDatabaseUrl(config.ACCOUNTING_MIGRATION_DATABASE_URL, 'ACCOUNTING_MIGRATION_DATABASE_URL', databaseName);
  const sourceSecrets = JSON.parse(config.ACCOUNTING_INGEST_SECRETS);
  if (decodeURIComponent(runtimeUrl.username) !== runtimeRole
    || config.ACCOUNTING_RUNTIME_DB_ROLE !== runtimeRole
    || decodeURIComponent(migrationUrl.username) !== 'postgres'
    || config.ACCOUNTING_AUTH_MODE !== 'gateway'
    || config.ACCOUNTING_SERVICE_URL !== 'http://127.0.0.1:3301'
    || config.ACCOUNTING_GATEWAY_SECRET.length < 32
    || config.ACCOUNTING_INGEST_SECRET.length < 32
    || sourceSecrets.afrolife_core !== config.ACCOUNTING_INGEST_SECRET) {
    throw new Error('Existing local Accounting settings do not match the isolated integrated configuration');
  }
  console.log('Local Accounting credentials are already configured; continuing with schema migrations.');
} else {
  const coreMigrationUrl = localDatabaseUrl(config.MIGRATION_DATABASE_URL, 'MIGRATION_DATABASE_URL', 'afrolife');
  if (decodeURIComponent(coreMigrationUrl.username) !== 'postgres') {
    throw new Error('Local Accounting provisioning requires the local PostgreSQL migration owner');
  }

  const adminUrl = new URL(coreMigrationUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';
  adminUrl.hash = '';

  const runtimePassword = randomBytes(48).toString('hex');
  const gatewaySecret = randomBytes(48).toString('hex');
  const ingestSecret = randomBytes(48).toString('hex');
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  let roleCreated = false;
  let databaseCreated = false;
  await admin.connect();
  try {
    const existingRole = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [runtimeRole]);
    const existingDatabase = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName]);
    if (existingRole.rowCount || existingDatabase.rowCount) {
      throw new Error('A local Accounting role or database already exists without matching environment settings; refusing to overwrite it');
    }
    const roleStatement = (await admin.query(
      `SELECT format(
         'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
         $1::text, $2::text
       ) AS statement`,
      [runtimeRole, runtimePassword],
    )).rows[0].statement;
    await admin.query(roleStatement);
    roleCreated = true;

    const databaseStatement = (await admin.query(
      "SELECT format('CREATE DATABASE %I OWNER %I CONNECTION LIMIT 20', $1::text, $2::text) AS statement",
      [databaseName, 'postgres'],
    )).rows[0].statement;
    await admin.query(databaseStatement);
    databaseCreated = true;

    const runtimeUrl = new URL(coreMigrationUrl);
    runtimeUrl.username = runtimeRole;
    runtimeUrl.password = runtimePassword;
    runtimeUrl.pathname = `/${databaseName}`;

    const migrationUrl = new URL(coreMigrationUrl);
    migrationUrl.pathname = `/${databaseName}`;
    migrationUrl.search = '';
    migrationUrl.hash = '';

    await appendFile(envPath, [
      '',
      '# Local-only, separate Accounting database and signed AfroLife gateway.',
      `ACCOUNTING_DATABASE_URL=${runtimeUrl.toString()}`,
      `ACCOUNTING_MIGRATION_DATABASE_URL=${migrationUrl.toString()}`,
      `ACCOUNTING_RUNTIME_DB_ROLE=${runtimeRole}`,
      'ACCOUNTING_AUTH_MODE=gateway',
      `ACCOUNTING_GATEWAY_SECRET=${gatewaySecret}`,
      `ACCOUNTING_INGEST_SECRET=${ingestSecret}`,
      `ACCOUNTING_INGEST_SECRETS=${JSON.stringify({ afrolife_core: ingestSecret })}`,
      'ACCOUNTING_SERVICE_URL=http://127.0.0.1:3301',
      '',
    ].join('\n'), { encoding: 'utf8' });
  } catch (error) {
    const cleanupErrors = [];
    if (databaseCreated) {
      try {
        await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (roleCreated) {
      try {
        await admin.query(`DROP ROLE ${runtimeRole}`);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length) {
      throw new AggregateError([error, ...cleanupErrors], 'Local Accounting setup failed and cleanup was incomplete');
    }
    throw error;
  } finally {
    await admin.end();
  }
  console.log(`Created the isolated local Accounting database and runtime role; credentials are stored in ${envPath}.`);
}
