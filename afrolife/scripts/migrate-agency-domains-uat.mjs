import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

const targetDefinitions = [
  { domain: 'workforce-management', database: 'afrolife_worker_management', kind: 'workers' },
  { domain: 'staffing', database: 'afrolife_staffing', kind: 'staffing' },
  { domain: 'property-management', database: 'afrolife_property_management', kind: 'properties' },
  { domain: 'marketplace', database: 'afrolife_marketplace', kind: 'marketplace' },
];
const maxDomainRows = 12;
const dryRun = process.argv.includes('--dry-run');
const localEnvironment = path.join(process.env.LOCALAPPDATA ?? '', 'AfroLife', 'afrolife.env');
if (!process.env.LOCALAPPDATA || !fs.existsSync(localEnvironment)) {
  throw new Error(`Local AfroLife environment file not found: ${localEnvironment}`);
}

const environment = dotenv.parse(fs.readFileSync(localEnvironment));
if (!environment.MIGRATION_DATABASE_URL) {
  throw new Error('MIGRATION_DATABASE_URL is required in the local environment file.');
}

const sourceUrl = new URL(environment.MIGRATION_DATABASE_URL);
if (sourceUrl.protocol !== 'postgres:' && sourceUrl.protocol !== 'postgresql:') {
  throw new Error('The UAT source must use a PostgreSQL connection.');
}
if (sourceUrl.hostname !== '127.0.0.1' || sourceUrl.port !== '5433' || sourceUrl.pathname !== '/afrolife') {
  throw new Error('Refusing UAT migration: source must be exactly 127.0.0.1:5433/afrolife.');
}
if (!sourceUrl.username || !sourceUrl.password) {
  throw new Error('MIGRATION_DATABASE_URL must contain local migration credentials.');
}

const connection = {
  host: sourceUrl.hostname,
  port: Number(sourceUrl.port),
  user: decodeURIComponent(sourceUrl.username),
  password: decodeURIComponent(sourceUrl.password),
  connectionTimeoutMillis: 5000,
  application_name: 'afrolife-anonymized-uat-migration',
};
const source = new pg.Client({
  ...connection,
  database: 'afrolife',
  options: '-c statement_timeout=15000',
});
const phoneFor = (index) => `+2519${String(index % 100_000_000).padStart(8, '0')}`;

async function readRows(client, table, limit = null) {
  const suffix = limit === null ? '' : ' LIMIT $1';
  const values = limit === null ? [] : [limit];
  return (await client.query(`SELECT * FROM public.${table} ORDER BY created_at DESC${suffix}`, values)).rows;
}

async function readTable(client, table, idColumn, ids, limit = null) {
  if (!ids.length) return [];
  const suffix = limit === null ? '' : ' ORDER BY created_at DESC LIMIT $2';
  const values = limit === null ? [ids] : [ids, limit];
  return (await client.query(`SELECT * FROM public.${table} WHERE ${idColumn} = ANY($1)${suffix}`, values)).rows;
}

async function readTerritories(client) {
  const result = await client.query(`
    WITH RECURSIVE hierarchy AS (
      SELECT territory.*, 0 AS depth, ARRAY[territory.id] AS ancestry
      FROM public.territories territory
      WHERE territory.parent_id IS NULL
      UNION ALL
      SELECT child.*, parent.depth + 1, parent.ancestry || child.id
      FROM public.territories child
      JOIN hierarchy parent ON parent.id = child.parent_id
      WHERE NOT child.id = ANY(parent.ancestry)
    )
    SELECT id, parent_id, level, name
    FROM hierarchy
    ORDER BY depth, id`);
  const sourceCount = Number((await client.query('SELECT count(*) FROM public.territories')).rows[0].count);
  if (result.rows.length !== sourceCount) {
    throw new Error('The source territory tree contains a cycle or orphan; refusing an incomplete UAT copy.');
  }
  return result.rows;
}

async function readAgentAncestors(client, seedIds) {
  if (!seedIds.length) return [];
  const agents = (await client.query(`
    WITH RECURSIVE ancestry AS (
      SELECT agent.id, agent.parent_id, agent.territory_id, agent.agent_type,
             agent.created_at, agent.service_specialization, 0 AS depth,
             ARRAY[agent.id] AS path, false AS is_cycle
      FROM public.agents agent
      WHERE agent.id = ANY($1::uuid[])
      UNION ALL
      SELECT parent.id, parent.parent_id, parent.territory_id, parent.agent_type,
             parent.created_at, parent.service_specialization, child.depth + 1,
             child.path || parent.id, parent.id = ANY(child.path)
      FROM public.agents parent
      JOIN ancestry child ON child.parent_id = parent.id
      WHERE child.depth < 32 AND NOT child.is_cycle
    )
    SELECT DISTINCT ON (id) id, parent_id, territory_id, agent_type,
           created_at, service_specialization, depth, path, is_cycle
    FROM ancestry
    ORDER BY id, depth DESC`, [seedIds])).rows;
  if (agents.some((agent) => agent.is_cycle || (agent.depth === 32 && agent.parent_id))) {
    throw new Error('The source agent hierarchy contains a cycle or exceeds the supported depth.');
  }
  agents.sort((left, right) => right.depth - left.depth);
  return agents;
}

function references(rows, fields) {
  return rows.flatMap((row) => fields.map((field) => row[field]).filter(Boolean));
}

async function pseudonymizedUsers(client, ids, secretHash) {
  if (!ids.length) return [];
  const ancestry = await client.query(`
    WITH RECURSIVE creator_chain AS (
      SELECT id, created_by, 0 AS depth, ARRAY[id] AS path
      FROM public.users
      WHERE id = ANY($1::uuid[])
      UNION ALL
      SELECT parent.id, parent.created_by, child.depth + 1, child.path || parent.id
      FROM public.users parent
      JOIN creator_chain child ON child.created_by = parent.id
      WHERE child.depth < 32 AND NOT parent.id = ANY(child.path)
    )
    SELECT id, max(depth) AS depth
    FROM creator_chain
    GROUP BY id`, [ids]);
  const userDepths = new Map(ancestry.rows.map((row) => [row.id, Number(row.depth)]));
  const completeIds = ancestry.rows.map((row) => row.id);
  const users = (await client.query(`
    SELECT id, role, territory_id, created_at, created_by
    FROM public.users
    WHERE id = ANY($1::uuid[])`, [completeIds])).rows;
  users.sort((left, right) => userDepths.get(right.id) - userDepths.get(left.id));
  return users.map((user, index) => ({
    id: user.id,
    legal_name: `UAT ${String(user.role).replaceAll('_', ' ')} ${index + 1}`,
    phone: phoneFor(index + 1),
    email: `uat-user-${index + 1}@invalid.example`,
    role: user.role,
    territory_id: user.territory_id,
    created_at: user.created_at,
    created_by: user.created_by,
    password_hash: secretHash,
    must_change_password: true,
    kyc_status: 'uploaded',
    active: false,
    whatsapp_opt_in: false,
    mfa_enabled: false,
    mfa_secret: null,
    failed_logins: 0,
    locked_until: null,
    mfa_last_step: -1,
  }));
}

async function collectDataset(client, kind, secretHash) {
  const territories = await readTerritories(client);
  let workers = [];
  let leads = [];
  let requests = [];
  let properties = [];
  let units = [];
  let listings = [];

  if (kind === 'workers' || kind === 'staffing') {
    workers = await readRows(client, 'workers', maxDomainRows);
  }
  if (kind === 'staffing') {
    requests = (await client.query(`
      SELECT * FROM public.job_requests
      ORDER BY created_at DESC
      LIMIT $1`, [maxDomainRows])).rows;
    leads = await readTable(client, 'leads', 'id', requests.map((row) => row.lead_id));
  }
  if (kind === 'properties') {
    properties = await readRows(client, 'properties', maxDomainRows);
    units = await readTable(client, 'property_units', 'property_id', properties.map((row) => row.id), maxDomainRows);
    leads = await readTable(client, 'leads', 'id', properties.map((row) => row.owner_lead_id).filter(Boolean));
  }
  if (kind === 'marketplace') {
    listings = await readRows(client, 'marketplace_listings', maxDomainRows);
  }

  const agents = await readAgentAncestors(client, [
    ...references(workers, ['source_agent_id']),
    ...references(leads, ['source_agent_id']),
    ...references(requests, ['source_agent_id']),
    ...references(properties, ['source_agent_id']),
    ...references(listings, ['source_agent_id']),
  ]);
  const userIds = [...new Set([
    ...agents.map((agent) => agent.id),
    ...references(leads, ['created_by', 'updated_by']),
    ...references(workers, ['created_by', 'updated_by']),
    ...references(requests, ['created_by', 'updated_by']),
    ...references(properties, ['owner_user_id', 'created_by']),
    ...references(listings, ['seller_user_id', 'created_by']),
  ])];
  const users = await pseudonymizedUsers(client, userIds, secretHash);

  let safeWorkers = workers.map((worker, index) => ({
    id: worker.id,
    name: `UAT Worker ${index + 1}`,
    phone: phoneFor(1000 + index),
    national_id: `UAT-NID-${String(index + 1).padStart(6, '0')}`,
    sector: 'general',
    skills: ['general'],
    languages: ['am'],
    experience_years: index % 5 + 1,
    rate_expected: 100 + index * 25,
    availability: 'immediate',
    verification: 'uploaded',
    territory_id: worker.territory_id,
    source_agent_id: worker.source_agent_id,
    created_at: worker.created_at,
  }));
  let safeLeads = leads.map((lead, index) => ({
    id: lead.id,
    lead_type: lead.lead_type,
    name: `UAT Customer ${index + 1}`,
    phone: phoneFor(2000 + index),
    source_agent_id: lead.source_agent_id,
    status: lead.status,
    created_at: lead.created_at,
  }));
  const safeRequests = requests.map((request, index) => ({
    id: request.id,
    lead_id: request.lead_id,
    sector: 'general',
    skills_required: ['general'],
    languages_required: ['am'],
    min_experience: 0,
    rate_offered: 500 + index * 50,
    territory_id: request.territory_id,
    source_agent_id: request.source_agent_id,
    status: request.status,
    created_at: request.created_at,
    idempotency_user_id: null,
    idempotency_key: null,
    payload_hash: null,
  }));
  const safeProperties = properties.map((property, index) => {
    const territory = territories.find((item) => item.id === property.territory_id);
    return {
      id: property.id,
      address: `UAT Property ${index + 1}, ${territory?.name ?? 'Ethiopia'}`,
      ptype: property.ptype,
      territory_id: property.territory_id,
      owner_lead_id: property.owner_lead_id,
      source_agent_id: property.source_agent_id,
      status: property.status,
      created_at: property.created_at,
      created_by: property.created_by,
      owner_user_id: property.owner_user_id,
      description: 'An anonymized property record for local UAT.',
      listing_mode: property.listing_mode,
      sale_price: property.listing_mode === 'sale' ? 100_000 + index * 10_000 : null,
      rent_period: property.rent_period,
    };
  });
  const safeUnits = units.map((unit, index) => ({
    id: unit.id,
    property_id: unit.property_id,
    unit_no: `UAT-${index + 1}`,
    floor: unit.floor,
    ptype: unit.ptype,
    rent: unit.rent === null ? null : 1_000 + index * 250,
    occupancy: 'vacant',
    created_at: unit.created_at,
  }));
  const safeListings = listings.map((listing, index) => ({
    id: listing.id,
    seller_user_id: listing.seller_user_id,
    source_agent_id: listing.source_agent_id,
    created_by: listing.created_by,
    domain: listing.domain,
    category_key: listing.category_key,
    title: `UAT Marketplace Listing ${index + 1}`,
    description: 'An anonymized marketplace record for local UAT.',
    transaction_mode: listing.transaction_mode,
    price: listing.price === null ? null : 2_000 + index * 500,
    rent_period: listing.rent_period,
    condition: listing.condition,
    territory_id: listing.territory_id,
    status: 'draft',
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: listing.created_at,
    updated_at: listing.updated_at,
  }));

  return {
    territories: territories.map(({ id, parent_id, level, name }) => ({ id, parent_id, level, name })),
    users,
    agents: agents.map((agent) => ({
      id: agent.id,
      parent_id: agent.parent_id,
      territory_id: agent.territory_id,
      agent_type: agent.agent_type,
      created_at: agent.created_at,
      service_specialization: 'workforce_property',
    })),
    leads: safeLeads,
    workers: safeWorkers,
    requests: safeRequests,
    properties: safeProperties,
    units: safeUnits,
    listings: safeListings,
  };
}

async function insertRows(client, table, rows) {
  if (!rows.length) return 0;
  const allowed = new Set((await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1`, [table])).rows.map((row) => row.column_name));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const missingColumns = columns.filter((column) => !allowed.has(column));
  if (missingColumns.length) {
    throw new Error(`The ${table} UAT target schema is missing required columns: ${missingColumns.join(', ')}.`);
  }
  if (!columns.includes('id')) throw new Error(`The ${table} table has no expected id column.`);
  const assignments = columns.filter((column) => column !== 'id')
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(', ');
  for (const row of rows) {
    const values = columns.map((column) => row[column] ?? null);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    await client.query(
      `INSERT INTO public."${table}" (${columns.map((column) => `"${column}"`).join(', ')})
       VALUES (${placeholders})
       ON CONFLICT ("id") DO UPDATE SET ${assignments}`,
      values,
    );
  }
  return rows.length;
}

async function validateDatasetSchema(client, dataset) {
  const tables = {
    territories: dataset.territories,
    users: dataset.users,
    agents: dataset.agents,
    leads: dataset.leads,
    workers: dataset.workers,
    job_requests: dataset.requests,
    properties: dataset.properties,
    property_units: dataset.units,
    marketplace_listings: dataset.listings,
  };
  const availableTables = new Set((await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)).rows.map((row) => row.table_name));
  for (const [table, rows] of Object.entries(tables)) {
    if (!availableTables.has(table)) throw new Error(`The UAT target is missing the ${table} table.`);
    if (!rows.length) continue;
    const availableColumns = new Set((await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`, [table])).rows.map((row) => row.column_name));
    const missingColumns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
      .filter((column) => !availableColumns.has(column));
    if (missingColumns.length) {
      throw new Error(`The ${table} UAT target schema is missing required columns: ${missingColumns.join(', ')}.`);
    }
  }
}

async function ensureTargetEmpty(client) {
  const hasMigrationMarker = await client.query(`
    SELECT to_regclass('public.agency_domain_uat_migration') IS NOT NULL AS is_present`);
  if (hasMigrationMarker.rows[0].is_present) {
    const previous = await client.query(
      "SELECT 1 FROM public.agency_domain_uat_migration WHERE migration_key = 'anonymized-uat-v1'",
    );
    if (previous.rowCount) return true;
  }
  for (const table of ['users', 'agents', 'leads', 'workers', 'job_requests', 'matches', 'properties', 'property_units', 'marketplace_listings']) {
    const count = Number((await client.query(`SELECT count(*) FROM public.${table}`)).rows[0].count);
    if (count > 0) {
      throw new Error(`Target already contains ${table} data; refusing UAT import rather than merging unknown records.`);
    }
  }
  return false;
}

async function verifyExcludedTablesAreEmpty(client) {
  for (const table of [
    'documents',
    'user_documents',
    'contract_documents',
    'property_photos',
    'marketplace_media',
    'mfi_loan_documents',
    'audit_logs',
    'mfi_audit_logs',
    'notifications',
  ]) {
    const relation = await client.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
    if (!relation.rows[0].name) continue;
    const count = Number((await client.query(`SELECT count(*) FROM public.${table}`)).rows[0].count);
    if (count !== 0) throw new Error(`Unexpected ${table} rows found in the UAT target.`);
  }
}

async function verifyCopiedRows(client, dataset, secretHash) {
  const tables = {
    territories: dataset.territories,
    users: dataset.users,
    agents: dataset.agents,
    leads: dataset.leads,
    workers: dataset.workers,
    job_requests: dataset.requests,
    properties: dataset.properties,
    property_units: dataset.units,
    marketplace_listings: dataset.listings,
  };
  for (const [table, rows] of Object.entries(tables)) {
    if (!rows.length) continue;
    const ids = rows.map((row) => row.id);
    const result = await client.query(`SELECT count(*) FROM public."${table}" WHERE id = ANY($1)`, [ids]);
    if (Number(result.rows[0].count) !== ids.length) {
      throw new Error(`UAT verification failed: not all expected ${table} rows are present.`);
    }
  }
  const assertPredicate = async (table, rows, predicate, values = []) => {
    if (!rows.length) return;
    const ids = rows.map((row) => row.id);
    const result = await client.query(
      `SELECT count(*) FROM public."${table}" WHERE id = ANY($1) AND NOT (${predicate})`,
      [ids, ...values],
    );
    if (Number(result.rows[0].count) !== 0) {
      throw new Error(`UAT privacy verification failed for ${table}; refusing to commit the target transaction.`);
    }
  };
  await assertPredicate(
    'users',
    dataset.users,
    `active = false AND mfa_enabled = false AND mfa_secret IS NULL
     AND must_change_password = true AND email ~ '^uat-user-[0-9]+@invalid[.]example$'
     AND legal_name LIKE 'UAT %' AND password_hash = $2`,
    [secretHash],
  );
  await assertPredicate(
    'agents',
    dataset.agents,
    `service_specialization = 'workforce_property'`,
  );
  await assertPredicate(
    'workers',
    dataset.workers,
    `name LIKE 'UAT Worker %' AND phone LIKE '+2519%' AND national_id LIKE 'UAT-NID-%'
     AND sector = 'general' AND skills = ARRAY['general']::text[]
     AND languages = ARRAY['am']::text[] AND verification = 'uploaded'
     AND rate_expected BETWEEN 100 AND 375`,
  );
  await assertPredicate(
    'leads',
    dataset.leads,
    `name LIKE 'UAT Customer %' AND phone LIKE '+2519%'`,
  );
  await assertPredicate(
    'job_requests',
    dataset.requests,
    `sector = 'general' AND skills_required = ARRAY['general']::text[]
     AND languages_required = ARRAY['am']::text[] AND rate_offered BETWEEN 500 AND 1050
     AND idempotency_user_id IS NULL AND idempotency_key IS NULL AND payload_hash IS NULL`,
  );
  await assertPredicate(
    'properties',
    dataset.properties,
    `address LIKE 'UAT Property %' AND description = 'An anonymized property record for local UAT.'`,
  );
  await assertPredicate(
    'property_units',
    dataset.units,
    `unit_no LIKE 'UAT-%' AND occupancy = 'vacant'
     AND (rent IS NULL OR rent BETWEEN 1000 AND 3750)`,
  );
  await assertPredicate(
    'marketplace_listings',
    dataset.listings,
    `title LIKE 'UAT Marketplace Listing %'
     AND description = 'An anonymized marketplace record for local UAT.' AND status = 'draft'
     AND (price IS NULL OR price BETWEEN 2000 AND 7500)`,
  );
}

async function migrateTarget(definition, secretHash) {
  const target = new pg.Client({
    ...connection,
    database: definition.database,
    options: '-c statement_timeout=15000',
  });
  await target.connect();
  try {
    if (dryRun) {
      await target.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const isRerun = await ensureTargetEmpty(target);
      await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      let dataset;
      try {
        dataset = await collectDataset(source, definition.kind, secretHash);
        await validateDatasetSchema(target, dataset);
        if (!isRerun) await verifyExcludedTablesAreEmpty(target);
        await source.query('COMMIT');
        await target.query('COMMIT');
      } catch (error) {
        await source.query('ROLLBACK');
        await target.query('ROLLBACK');
        throw error;
      }
      const counts = Object.fromEntries([
        ['territories', dataset.territories],
        ['users', dataset.users],
        ['agents', dataset.agents],
        ['leads', dataset.leads],
        ['workers', dataset.workers],
        ['job_requests', dataset.requests],
        ['properties', dataset.properties],
        ['property_units', dataset.units],
        ['marketplace_listings', dataset.listings],
      ].map(([table, rows]) => [table, rows.length]));
      console.log(JSON.stringify({ mode: 'dry-run', domain: definition.domain, target: definition.database, copiedRows: counts }));
      return;
    }
    await target.query('BEGIN');
    const isRerun = await ensureTargetEmpty(target);
    await target.query(`
      CREATE TABLE IF NOT EXISTS public.agency_domain_uat_migration (
        migration_key text PRIMARY KEY,
        source_database text NOT NULL,
        imported_at timestamptz NOT NULL,
        copied_rows jsonb NOT NULL
      )`);
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      const dataset = await collectDataset(source, definition.kind, secretHash);
      await validateDatasetSchema(target, dataset);
      const counts = {};
      const copy = async (table, rows) => {
        counts[table] = await insertRows(target, table, rows);
      };
      await copy('territories', dataset.territories);
      await copy('users', dataset.users);
      await copy('agents', dataset.agents);
      await copy('leads', dataset.leads);
      await copy('workers', dataset.workers);
      await copy('job_requests', dataset.requests);
      await copy('properties', dataset.properties);
      await copy('property_units', dataset.units);
      await copy('marketplace_listings', dataset.listings);
      await verifyCopiedRows(target, dataset, secretHash);
      await target.query(`
        INSERT INTO public.agency_domain_uat_migration
          (migration_key, source_database, imported_at, copied_rows)
        VALUES ('anonymized-uat-v1', 'afrolife', now(), $1::jsonb)
        ON CONFLICT (migration_key) DO UPDATE
        SET source_database = EXCLUDED.source_database,
            imported_at = EXCLUDED.imported_at,
            copied_rows = EXCLUDED.copied_rows`, [JSON.stringify(counts)]);
      if (!isRerun) await verifyExcludedTablesAreEmpty(target);
      await target.query('COMMIT');
      await source.query('COMMIT');
      console.log(JSON.stringify({ domain: definition.domain, target: definition.database, copiedRows: counts }));
    } catch (error) {
      await source.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    await target.query('ROLLBACK');
    throw error;
  } finally {
    await target.end();
  }
}

const userSecretHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
try {
  await source.connect();
  for (const definition of targetDefinitions) {
    await migrateTarget(definition, userSecretHash);
  }
  console.log('UAT migration complete. No credentials, MFA secrets, ledgers, audit logs, notifications, document records, or media files were copied.');
} finally {
  await source.end().catch(() => {});
}
