import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';

export interface RuntimeConfig {
  isProduction: boolean;
  mfiPilotEnabled: boolean;
  sessionIdleTimeoutMinutes: number;
  legacyImmediateLeasesEnabled: boolean;
}

type Environment = Record<string, string | undefined>;

const isPlaceholder = (value: string) => /^(replace|change|example|your[_-])/i.test(value);

export function sessionIdleTimeoutMinutes(env: Environment): number {
  const timeout = Number(env.SESSION_IDLE_TIMEOUT_MINUTES ?? 30);
  if (!Number.isInteger(timeout) || timeout < 5 || timeout > 480) {
    throw new Error('SESSION_IDLE_TIMEOUT_MINUTES must be an integer between 5 and 480');
  }
  return timeout;
}

export function legacyImmediateLeasesEnabled(env: Environment): boolean {
  const setting = env.LEGACY_IMMEDIATE_LEASES_ENABLED;
  if (setting !== undefined && !['0', '1'].includes(setting)) {
    throw new Error('LEGACY_IMMEDIATE_LEASES_ENABLED must be 0 or 1');
  }
  return setting === undefined ? env.NODE_ENV !== 'production' : setting === '1';
}

function validateInsuranceServiceCutover(env: Environment) {
  const serviceUrl = env.INSURANCE_SERVICE_URL?.trim();
  const readiness = env.INSURANCE_SERVICE_CUTOVER_READY;
  if (readiness !== undefined && !['0', '1'].includes(readiness)) {
    throw new Error('INSURANCE_SERVICE_CUTOVER_READY must be 0 or 1');
  }
  if (serviceUrl && readiness !== '1') {
    throw new Error('INSURANCE_SERVICE_CUTOVER_READY=1 is required before enabling the Insurance service gateway');
  }
  if (readiness === '1' && !serviceUrl) {
    throw new Error('INSURANCE_SERVICE_URL is required when Insurance service cutover readiness is enabled');
  }
}

const agencyServiceCutovers = [
  {
    label: 'Workforce Management',
    url: 'WORKER_MANAGEMENT_SERVICE_URL',
    secret: 'WORKER_MANAGEMENT_GATEWAY_SECRET',
    readiness: 'WORKER_MANAGEMENT_SERVICE_CUTOVER_READY',
  },
  {
    label: 'Staffing',
    url: 'STAFFING_SERVICE_URL',
    secret: 'STAFFING_GATEWAY_SECRET',
    readiness: 'STAFFING_SERVICE_CUTOVER_READY',
  },
  {
    label: 'Property Management',
    url: 'PROPERTY_MANAGEMENT_SERVICE_URL',
    secret: 'PROPERTY_MANAGEMENT_GATEWAY_SECRET',
    readiness: 'PROPERTY_MANAGEMENT_SERVICE_CUTOVER_READY',
  },
  {
    label: 'Marketplace',
    url: 'MARKETPLACE_SERVICE_URL',
    secret: 'MARKETPLACE_GATEWAY_SECRET',
    readiness: 'MARKETPLACE_SERVICE_CUTOVER_READY',
  },
] as const;

function validateServiceOrigin(env: Environment, key: string, label: string): string {
  const value = env[key]?.trim();
  if (!value || isPlaceholder(value)) throw new Error(`${key} must be configured for the ${label} service`);
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid service origin`);
  }
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password
    || (origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(origin.hostname))) {
    throw new Error(`${key} must be an HTTPS origin or a loopback HTTP origin`);
  }
  return value;
}

function validateAgencyServiceCutovers(env: Environment) {
  for (const service of agencyServiceCutovers) {
    const serviceUrl = env[service.url]?.trim();
    const readiness = env[service.readiness];
    if (readiness !== undefined && !['0', '1'].includes(readiness)) {
      throw new Error(`${service.readiness} must be 0 or 1`);
    }
    if (serviceUrl && readiness !== '1') {
      throw new Error(`${service.readiness}=1 is required before enabling the ${service.label} service gateway`);
    }
    if (readiness === '1' && !serviceUrl) {
      throw new Error(`${service.url} is required when ${service.readiness} is enabled`);
    }
    if (!serviceUrl) continue;

    validateServiceOrigin(env, service.url, service.label);
    const secret = env[service.secret]?.trim();
    if (!secret || secret.length < 32 || isPlaceholder(secret)) {
      throw new Error(`${service.secret} must be a unique, non-placeholder secret of at least 32 characters when the ${service.label} service gateway is enabled`);
    }
    const otherGatewaySecrets = [
      { url: 'EDIR_SERVICE_URL', secret: 'EDIR_GATEWAY_SECRET' },
      { url: 'INSURANCE_SERVICE_URL', secret: 'INSURANCE_GATEWAY_SECRET' },
      { url: 'MFI_SERVICE_URL', secret: 'MFI_GATEWAY_SECRET' },
      ...agencyServiceCutovers
        .filter((other) => other.url !== service.url)
        .map((other) => ({ url: other.url, secret: other.secret })),
    ].filter((other) => env[other.url]?.trim()).map((other) => other.secret);
    if (otherGatewaySecrets.some((key) => env[key]?.trim() === secret)) {
      throw new Error(`${service.secret} must be unique across enabled service gateways`);
    }
  }
}

function productionConfig(env: Environment, idleTimeout: number): RuntimeConfig {
  const allowLegacyImmediateLeases = legacyImmediateLeasesEnabled(env);
  const requiredSecret = (key: 'JWT_SECRET' | 'MFA_ENC_KEY') => {
    const value = env[key]?.trim();
    if (!value || value.length < 32 || isPlaceholder(value)) {
      throw new Error(`${key} must be a unique, non-placeholder secret of at least 32 characters in production`);
    }
    return value;
  };

  const jwtSecret = requiredSecret('JWT_SECRET');
  const mfaKey = requiredSecret('MFA_ENC_KEY');
  if (jwtSecret === mfaKey) throw new Error('JWT_SECRET and MFA_ENC_KEY must be different in production');
  if (env.REQUIRE_MFA_FOR_STAFF !== '1') throw new Error('REQUIRE_MFA_FOR_STAFF=1 is required in production');

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl || isPlaceholder(databaseUrl) || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error('DATABASE_URL must point to the restricted PostgreSQL runtime role in production');
  }
  let database: URL;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL in production');
  }
  if (!database.username || !database.password || !database.pathname || database.pathname === '/') {
    throw new Error('DATABASE_URL must include a database name and runtime credentials in production');
  }
  const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(database.hostname);
  if (!isLocalDatabase && database.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('Remote production PostgreSQL connections must use sslmode=verify-full');
  }

  const origins = (env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  if (!origins.length) throw new Error('CORS_ORIGINS must list the exact trusted HTTPS origins in production');
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGINS must contain only exact HTTPS origins in production');
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin !== origin ||
      /^(?:[^.]+\.)*example\.(?:com|org|net)$/i.test(parsed.hostname)
    ) {
      throw new Error('CORS_ORIGINS must contain only exact, non-placeholder HTTPS origins in production');
    }
  }

  const storage = env.FILE_STORAGE_DIR?.trim();
  if (!storage || !(isAbsolute(storage) || win32.isAbsolute(storage))) {
    throw new Error('FILE_STORAGE_DIR must be an absolute, persistent private-storage path in production');
  }
  const publicDirectory = resolve('public');
  const storageDirectory = resolve(storage);
  const pathToStorage = relative(publicDirectory, storageDirectory);
  const storageIsPublic = pathToStorage === '' || (!pathToStorage.startsWith(`..${sep}`) && pathToStorage !== '..');
  if (storageIsPublic) throw new Error('FILE_STORAGE_DIR must not be inside the public web directory');

  if (!env.TRUST_PROXY?.trim() || /^(?:true|\*)$/i.test(env.TRUST_PROXY.trim())) {
    throw new Error('TRUST_PROXY must name the actual trusted proxy hop count or subnet in production');
  }
  const limit = Number(env.LOGIN_RATE_LIMIT ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('LOGIN_RATE_LIMIT must be an integer between 1 and 1000');
  }
  const pilotSetting = env.MFI_PILOT_ENABLED ?? '0';
  if (!['0', '1'].includes(pilotSetting)) throw new Error('MFI_PILOT_ENABLED must be 0 or 1');
  const mfiPilotEnabled = pilotSetting === '1';
  if (mfiPilotEnabled) {
    validateServiceOrigin(env, 'MFI_SERVICE_URL', 'SACCO/MFI');
    const secret = env.MFI_GATEWAY_SECRET?.trim();
    if (!secret || secret.length < 32 || isPlaceholder(secret)) {
      throw new Error('MFI_GATEWAY_SECRET must be a unique, non-placeholder secret of at least 32 characters in production');
    }
  }
  if (!env.INSURANCE_SERVICE_URL?.trim() || env.INSURANCE_SERVICE_CUTOVER_READY !== '1') {
    throw new Error('Production requires the separate Insurance service and INSURANCE_SERVICE_CUTOVER_READY=1; the in-process ledger is disabled');
  }
  validateServiceOrigin(env, 'INSURANCE_SERVICE_URL', 'Insurance');
  const insuranceSecret = env.INSURANCE_GATEWAY_SECRET?.trim();
  if (!insuranceSecret || insuranceSecret.length < 32 || isPlaceholder(insuranceSecret)) {
    throw new Error('INSURANCE_GATEWAY_SECRET must be a unique, non-placeholder secret of at least 32 characters in production');
  }
  return {
    isProduction: true,
    mfiPilotEnabled,
    sessionIdleTimeoutMinutes: idleTimeout,
    legacyImmediateLeasesEnabled: allowLegacyImmediateLeases,
  };
}

export function loadRuntimeConfig(env: Environment): RuntimeConfig {
  validateInsuranceServiceCutover(env);
  validateAgencyServiceCutovers(env);
  const idleTimeout = sessionIdleTimeoutMinutes(env);
  if (env.NODE_ENV === 'production') return productionConfig(env, idleTimeout);
  return {
    isProduction: false,
    mfiPilotEnabled: env.MFI_PILOT_ENABLED === undefined ? true : env.MFI_PILOT_ENABLED === '1',
    sessionIdleTimeoutMinutes: idleTimeout,
    legacyImmediateLeasesEnabled: legacyImmediateLeasesEnabled(env),
  };
}
