import { z } from 'zod';

export const TENANT_DATA_CAPABILITIES = ['database_admin', 'analytics_admin'] as const;
export type TenantDataCapability = typeof TENANT_DATA_CAPABILITIES[number];
export const EXCLUDED_TENANT_CAPABILITY_ROLES = ['global_admin', 'super_admin', 'master_agent'] as const;
export const tenantCapabilitiesSchema = z.array(z.enum(TENANT_DATA_CAPABILITIES))
  .max(TENANT_DATA_CAPABILITIES.length)
  .refine((values) => new Set(values).size === values.length, 'Capabilities must be unique');
export const tenantOperatorRequestSchema = z.object({
  tenant_id: z.string().uuid(),
  request_type: z.enum(['migration_review', 'backup_restore_review', 'database_change_review']),
  summary: z.string().trim().min(10).max(1000)
    .refine((text) => !/\b(SELECT|INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b|:\/\/|password|secret|token|credential|postgres(ql)?/i.test(text),
      'Requests may not contain SQL, connection details, or credentials'),
  evidence_reference: z.string().trim().min(2).max(200).optional()
    .refine((text) => text === undefined || !/(password|secret|token|credential|:\/\/|postgres(ql)?)/i.test(text),
      'Evidence must be a non-secret reference, not a URL'),
}).strict();
