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
const runtimeRole = 'afrolife_edir_uat_app';
const databaseName = 'afrolife_edir_uat';
const edirKeys = ['EDIR_DATABASE_URL', 'EDIR_MIGRATION_DATABASE_URL', 'EDIR_RUNTIME_DB_ROLE', 'EDIR_GATEWAY_SECRET'];
const configured = edirKeys.filter((key) => config[key]);

function localUrl(value, key, expectedDatabase) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${key} must be a valid PostgreSQL connection URL`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.port !== '5433'
    || decodeURIComponent(url.pathname.slice(1)) !== expectedDatabase
    || !url.username || !url.password) {
    throw new Error(`${key} must point to ${expectedDatabase} on local PostgreSQL port 5433`);
  }
  return url;
}

if (configured.length) {
  if (configured.length !== edirKeys.length) {
    throw new Error(`Local Edir provisioning is partially configured (${configured.join(', ')}); inspect the local environment and database before continuing`);
  }
  const runtimeUrl = localUrl(config.EDIR_DATABASE_URL, 'EDIR_DATABASE_URL', databaseName);
  const migrationUrl = localUrl(config.EDIR_MIGRATION_DATABASE_URL, 'EDIR_MIGRATION_DATABASE_URL', databaseName);
  if (decodeURIComponent(runtimeUrl.username) !== runtimeRole
    || config.EDIR_RUNTIME_DB_ROLE !== runtimeRole
    || decodeURIComponent(migrationUrl.username) !== 'postgres'
    || config.EDIR_GATEWAY_SECRET.length < 32) {
    throw new Error('Existing local Edir settings do not match the restricted UAT service configuration');
  }
  console.log('Local Edir UAT database credentials are already configured; continuing with schema migrations.');
} else {
  const mainUrl = localUrl(config.MIGRATION_DATABASE_URL, 'MIGRATION_DATABASE_URL', 'afrolife');
  if (decodeURIComponent(mainUrl.username) !== 'postgres') {
    throw new Error('Local Edir provisioning requires the existing local PostgreSQL migration owner');
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
    const role = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [runtimeRole]);
    const database = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName]);
    if (role.rowCount || database.rowCount) {
      throw new Error('An Edir UAT database or role already exists without matching environment settings; refusing to overwrite it');
    }
    await admin.query((await admin.query(
      `SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', $1::text, $2::text) AS statement`,
      [runtimeRole, runtimePassword],
    )).rows[0].statement);
    roleCreated = true;
    await admin.query((await admin.query(
      "SELECT format('CREATE DATABASE %I OWNER %I CONNECTION LIMIT 20', $1::text, $2::text) AS statement",
      [databaseName, 'postgres'],
    )).rows[0].statement);
    databaseCreated = true;
  } catch (error) {
    if (roleCreated && !databaseCreated) {
      try { await admin.query('DROP ROLE IF EXISTS afrolife_edir_uat_app'); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Edir UAT setup failed and role cleanup also failed'); }
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
    '# Local-only isolated AfroLife Edir UAT database. Never use for production traffic.',
    `EDIR_DATABASE_URL=${runtimeUrl.toString()}`,
    `EDIR_MIGRATION_DATABASE_URL=${migrationUrl.toString()}`,
    `EDIR_RUNTIME_DB_ROLE=${runtimeRole}`,
    `EDIR_GATEWAY_SECRET=${gatewaySecret}`,
    '',
  ].join('\n'), { encoding: 'utf8' });
  console.log(`Created isolated local Edir UAT database and restricted runtime role; settings stored in ${envPath}.`);
}
