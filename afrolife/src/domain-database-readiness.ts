export type AgencyDomain = 'worker-management' | 'staffing' | 'property-management' | 'marketplace';

type DatabaseMetadata = {
  table_name: string;
  missing: boolean;
  rls_enabled: boolean;
  can_read_auth_secrets?: boolean;
  can_create_schema?: boolean;
  can_access_financial_data?: boolean;
};

type Queryable = {
  query(sql: string, values: unknown[]): Promise<{ rows: DatabaseMetadata[] }>;
};

const domainTables: Record<AgencyDomain, { required: string[]; rowLevelSecurity: string[] }> = {
  'worker-management': {
    required: ['agents', 'audit_logs', 'documents', 'notifications', 'territories', 'users', 'workers'],
    rowLevelSecurity: ['agents', 'documents', 'workers'],
  },
  staffing: {
    required: [
      'agents', 'audit_logs', 'config_rules', 'documents', 'job_requests', 'leads',
      'matches', 'notifications', 'territories', 'users', 'workers',
    ],
    rowLevelSecurity: ['agents', 'documents', 'job_requests', 'leads', 'matches', 'workers'],
  },
  'property-management': {
    required: [
      'agents', 'audit_logs', 'leads', 'marketplace_configuration', 'maintenance_requests',
      'notifications', 'properties', 'property_photos', 'property_units', 'rent_charges',
      'tenants', 'territories', 'users', 'user_signups', 'leases',
    ],
    rowLevelSecurity: ['agents', 'marketplace_configuration', 'maintenance_requests', 'properties', 'property_photos', 'property_units', 'rent_charges', 'leases'],
  },
  marketplace: {
    required: [
      'agents', 'audit_logs', 'marketplace_configuration', 'marketplace_listings',
      'marketplace_media', 'notifications', 'territories', 'users', 'user_signups',
    ],
    rowLevelSecurity: ['agents', 'marketplace_configuration', 'marketplace_listings', 'marketplace_media'],
  },
};

export async function assertAgencyDomainDatabaseReady(domain: AgencyDomain, database: Queryable): Promise<void> {
  const requirements = domainTables[domain];
  const result = await database.query(
    `SELECT requested.table_name,
            to_regclass(format('%I.%I', 'public', requested.table_name)) IS NULL AS missing,
            coalesce(relation.relrowsecurity, false) AS rls_enabled
     FROM unnest($1::text[]) AS requested(table_name)
     LEFT JOIN pg_class relation
       ON relation.oid = to_regclass(format('%I.%I', 'public', requested.table_name))`,
    [requirements.required],
  );
  const rowByTable = new Map(result.rows.map((row) => [row.table_name, row]));
  const missing = requirements.required.filter((table) => rowByTable.get(table)?.missing !== false);
  const unprotected = requirements.rowLevelSecurity.filter((table) => rowByTable.get(table)?.rls_enabled !== true);
  if (missing.length || unprotected.length) {
    const problems = [
      ...(missing.length ? [`missing tables: ${missing.join(', ')}`] : []),
      ...(unprotected.length ? [`RLS is disabled: ${unprotected.join(', ')}`] : []),
    ];
    throw new Error(`${domain} database schema is not ready (${problems.join('; ')})`);
  }

  const privileges = await database.query(
    `SELECT
       (has_column_privilege(current_user, 'public.users', 'password_hash', 'SELECT')
         OR has_column_privilege(current_user, 'public.users', 'mfa_secret', 'SELECT')) AS can_read_auth_secrets,
       has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema,
       EXISTS (
         SELECT 1 FROM pg_class relation
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
           AND (relation.relname LIKE 'mfi_%' OR relation.relname LIKE 'insurance_ledger_%')
           AND (has_table_privilege(current_user, relation.oid, 'SELECT')
             OR has_table_privilege(current_user, relation.oid, 'INSERT')
             OR has_table_privilege(current_user, relation.oid, 'UPDATE')
             OR has_table_privilege(current_user, relation.oid, 'DELETE'))
       ) AS can_access_financial_data`,
    [],
  );
  const unsafe = privileges.rows[0];
  if (!unsafe || unsafe.can_read_auth_secrets || unsafe.can_create_schema || unsafe.can_access_financial_data) {
    throw new Error(`${domain} database role has privileges outside its service boundary`);
  }
}
