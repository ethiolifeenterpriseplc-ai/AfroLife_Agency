import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAgencyDomainDatabaseReady, type AgencyDomain } from '../src/domain-database-readiness.js';

function databaseFor(
  tables: string[],
  rlsTables: string[],
  privileges = {
    can_read_auth_secrets: false,
    can_create_schema: false,
    can_access_financial_data: false,
  },
) {
  return {
    async query(_sql: string, values: unknown[]) {
      if (values.length === 0) {
        return { rows: [privileges] };
      }
      const required = values[0] as string[];
      return {
        rows: required.map((table_name) => ({
          table_name,
          missing: !tables.includes(table_name),
          rls_enabled: rlsTables.includes(table_name),
        })),
      };
    },
  };
}

const completeSchemas: Record<AgencyDomain, { tables: string[]; rls: string[] }> = {
  'worker-management': {
    tables: ['agents', 'audit_logs', 'documents', 'notifications', 'territories', 'users', 'workers'],
    rls: ['agents', 'documents', 'workers'],
  },
  staffing: {
    tables: ['agents', 'audit_logs', 'config_rules', 'documents', 'job_requests', 'leads', 'matches', 'notifications', 'territories', 'users', 'workers'],
    rls: ['agents', 'documents', 'job_requests', 'leads', 'matches', 'workers'],
  },
  'property-management': {
    tables: ['agents', 'audit_logs', 'leads', 'marketplace_configuration', 'maintenance_requests', 'notifications', 'properties', 'property_photos', 'property_units', 'rent_charges', 'tenants', 'territories', 'users', 'user_signups', 'leases'],
    rls: ['agents', 'marketplace_configuration', 'maintenance_requests', 'properties', 'property_photos', 'property_units', 'rent_charges', 'leases'],
  },
  marketplace: {
    tables: ['agents', 'audit_logs', 'marketplace_configuration', 'marketplace_listings', 'marketplace_media', 'notifications', 'territories', 'users', 'user_signups'],
    rls: ['agents', 'marketplace_configuration', 'marketplace_listings', 'marketplace_media'],
  },
};

for (const [domain, schema] of Object.entries(completeSchemas) as [AgencyDomain, typeof completeSchemas[AgencyDomain]][]) {
  test(`${domain} database readiness accepts its required tables and RLS policies`, async () => {
    await assertAgencyDomainDatabaseReady(domain, databaseFor(schema.tables, schema.rls));
  });
}

test('database readiness rejects missing service tables', async () => {
  await assert.rejects(
    assertAgencyDomainDatabaseReady('worker-management', databaseFor(['users'], [])),
    /missing tables:.*workers/,
  );
});

test('database readiness rejects missing row-level security', async () => {
  await assert.rejects(
    assertAgencyDomainDatabaseReady('marketplace', databaseFor(completeSchemas.marketplace.tables, ['agents'])),
    /RLS is disabled:.*marketplace_listings/,
  );
});

for (const [description, privileges] of [
  ['authentication secrets', { can_read_auth_secrets: true }],
  ['schema creation', { can_create_schema: true }],
  ['financial data', { can_access_financial_data: true }],
] as const) {
  test(`database readiness rejects service roles with access to ${description}`, async () => {
    const database = databaseFor(
      completeSchemas.marketplace.tables,
      completeSchemas.marketplace.rls,
      { can_read_auth_secrets: false, can_create_schema: false, can_access_financial_data: false, ...privileges },
    );
    await assert.rejects(
      assertAgencyDomainDatabaseReady('marketplace', database),
      /privileges outside its service boundary/,
    );
  });
}
