import { z } from 'zod';
import { HttpError } from './core.js';

// ================= Marketplace configuration and product/service listings =================
export const ConfigScope = z.enum(['system','users','products','services','properties','rentals']);
const CatalogItem = z.object({ key: z.string().regex(/^[a-z0-9_]{2,40}$/), label: z.string().trim().min(2).max(80), enabled: z.boolean() }).strict();
const AccountType = z.enum(['worker','customer','agent','property_owner','property_vendor']);
const KycDocument = z.enum(['national_id','police_clearance']);
const KycMap = z.object({
  worker: z.array(KycDocument).min(1).max(2),
  customer: z.array(KycDocument).min(1).max(2),
  agent: z.array(KycDocument).min(1).max(2),
  property_owner: z.array(KycDocument).min(1).max(2),
  property_vendor: z.array(KycDocument).length(1).refine((documents) => documents.includes('national_id')),
}).strict();
const AccountTypeOption = z.object({ key: z.enum(['worker','customer','agent','property_owner']), label: z.string().trim().min(2).max(40), enabled: z.boolean() }).strict();

export const DEFAULT_KYC_REQUIREMENTS = Object.freeze({
  worker: Object.freeze(['national_id', 'police_clearance']),
  customer: Object.freeze(['national_id']),
  agent: Object.freeze(['national_id']),
  property_owner: Object.freeze(['national_id']),
  property_vendor: Object.freeze(['national_id']),
});

export function getKycRequirements(value: unknown) {
  return KycMap.parse(value ?? DEFAULT_KYC_REQUIREMENTS);
}

export function requiredKycDocuments(value: unknown, accountType: unknown) {
  return getKycRequirements(value)[AccountType.parse(accountType)];
}

export function validateMarketplaceConfig(scope: string, key: string, value: unknown) {
  if (scope === 'system') {
    if (key === 'enabled_domains') return z.array(z.enum(['products','services','equipment','properties'])).min(1).max(4).parse(value);
    if (key === 'moderation_required') return z.boolean().parse(value);
    if (key === 'image_max_bytes') return z.number().int().min(262144).max(20971520).parse(value);
    if (key === 'video_max_bytes') return z.number().int().min(1048576).max(104857600).parse(value);
    if (key === 'max_media_per_listing') return z.number().int().min(1).max(30).parse(value);
  }
  if (scope === 'users') {
    if (key === 'account_types') {
      const items = z.array(AccountTypeOption).min(1).max(4).parse(value);
      if (!items.some((item) => item.enabled)) throw new HttpError(422, 'At least one self-registration account type must remain enabled.');
      if (new Set(items.map((item) => item.key)).size !== items.length) throw new HttpError(422, 'Self-registration account types must be unique.');
      return items;
    }
    if (key === 'kyc_requirements') {
      const requirements = getKycRequirements(value);
      if (Object.values(requirements).some((docs) => !docs.includes('national_id'))) {
        throw new HttpError(422, 'Every account type must require a National ID for KYC.');
      }
      if (requirements.property_vendor.length !== 1) {
        throw new HttpError(422, 'Property-vendor KYC must require the account contact’s National ID only.');
      }
      if (!requirements.worker?.includes('national_id') || !requirements.worker?.includes('police_clearance')) throw new HttpError(422, 'Worker registration must keep both National ID and Police clearance requirements.');
      return requirements;
    }
  }
  if (scope === 'products' || scope === 'services') {
    if (key === 'categories') {
      const items = z.array(CatalogItem).min(1).max(100).parse(value);
      if (!items.some((item) => item.enabled)) throw new HttpError(422, 'Keep at least one enabled category.');
      if (new Set(items.map((item) => item.key)).size !== items.length) throw new HttpError(422, 'Category keys must be unique.');
      return items;
    }
  }
  if (scope === 'properties' && key === 'property_types') {
    const items = z.array(z.object({ key: z.enum(['apartment_building','house','commercial','land']), label: z.string().trim().min(2).max(80), enabled: z.boolean() }).strict()).min(1).max(4).parse(value);
    if (!items.some((item) => item.enabled)) throw new HttpError(422, 'Keep at least one enabled property type.');
    if (new Set(items.map((item) => item.key)).size !== items.length) throw new HttpError(422, 'Property types must be unique.');
    return items;
  }
  if (scope === 'rentals' && key === 'periods') {
    const items = z.array(z.object({ key: z.enum(['day','week','month','year']), label: z.string().trim().min(2).max(40), enabled: z.boolean() }).strict()).min(1).max(4).parse(value);
    if (!items.some((item) => item.enabled)) throw new HttpError(422, 'Keep at least one enabled rental period.');
    if (new Set(items.map((item) => item.key)).size !== items.length) throw new HttpError(422, 'Rental periods must be unique.');
    return items;
  }
  throw new HttpError(422, `Configuration key ${scope}.${key} cannot be changed here.`);
}

export async function loadMarketplaceConfig(c: import('pg').PoolClient) {
  const rows = await c.query('SELECT scope, config_key, config_value FROM marketplace_configuration ORDER BY scope, config_key');
  const config: Record<string, Record<string, unknown>> = {};
  for (const row of rows.rows) (config[row.scope] ??= {})[row.config_key] = row.config_value;
  return config;
}
