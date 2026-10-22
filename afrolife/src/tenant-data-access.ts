import type { PoolClient } from 'pg';
import { HttpError } from './core.js';
import { EXCLUDED_TENANT_CAPABILITY_ROLES, type TenantDataCapability } from './platform-data-admin.js';

export interface TenantDataScope {
  tenant_id: string;
  tenant_key: string;
  display_name: string;
  hosting_mode: 'cloud' | 'on_premises';
  region: string | null;
  deployment_status: string;
  config_version: number;
  tenant_updated_at: Date | string;
  capabilities: TenantDataCapability[];
}

export async function getMyTenantDataScopes(
  client: PoolClient,
  userId: string,
): Promise<TenantDataScope[]> {
  const result = await client.query<TenantDataScope>(
    `SELECT t.id AS tenant_id,t.tenant_key,t.display_name,t.hosting_mode,t.region,
            t.deployment_status,t.config_version,t.updated_at AS tenant_updated_at,
            array_agg(DISTINCT g.capability ORDER BY g.capability) AS capabilities
     FROM platform_tenant_capability_grants g
     JOIN users u ON u.id=g.user_id
     JOIN platform_tenants t ON t.id=g.tenant_id
     WHERE g.user_id=$1
       AND u.active AND u.role <> ALL($2::text[])
       AND t.status='active'
     GROUP BY t.id,t.tenant_key,t.display_name,t.hosting_mode,t.region,
              t.deployment_status,t.config_version,t.updated_at
     ORDER BY t.display_name,t.id`,
    [userId, EXCLUDED_TENANT_CAPABILITY_ROLES],
  );
  return result.rows;
}

export async function getTenantDataScope(
  client: PoolClient,
  userId: string,
  tenantId: string,
): Promise<TenantDataScope | null> {
  const result = await client.query<TenantDataScope>(
    `SELECT t.id AS tenant_id,t.tenant_key,t.display_name,t.hosting_mode,t.region,
            t.deployment_status,t.config_version,t.updated_at AS tenant_updated_at,
            array_agg(DISTINCT g.capability ORDER BY g.capability) AS capabilities
     FROM platform_tenant_capability_grants g
     JOIN users u ON u.id=g.user_id
     JOIN platform_tenants t ON t.id=g.tenant_id
     WHERE g.user_id=$1 AND g.tenant_id=$2
       AND u.active AND u.role <> ALL($3::text[])
       AND t.status='active'
     GROUP BY t.id,t.tenant_key,t.display_name,t.hosting_mode,t.region,
              t.deployment_status,t.config_version,t.updated_at`,
    [userId, tenantId, EXCLUDED_TENANT_CAPABILITY_ROLES],
  );
  return result.rows[0] ?? null;
}

export function requireTenantDataCapability(
  scope: TenantDataScope,
  capability: TenantDataCapability,
): void {
  if (!scope.capabilities.includes(capability)) {
    throw new HttpError(403, `The ${capability.replaceAll('_', ' ')} capability is required for this tenant.`);
  }
}
