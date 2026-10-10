import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';

export interface RuntimeConfig {
  isProduction: boolean;
  mfiPilotEnabled: boolean;
  sessionIdleTimeoutMinutes: number;
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

function productionConfig(env: Environment, idleTimeout: number): RuntimeConfig {
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
  const pilotSetting = env.MFI_PILOT_ENABLED ?? '1';
  if (!['0', '1'].includes(pilotSetting)) throw new Error('MFI_PILOT_ENABLED must be 0 or 1');
  return { isProduction: true, mfiPilotEnabled: pilotSetting === '1', sessionIdleTimeoutMinutes: idleTimeout };
}

export function loadRuntimeConfig(env: Environment): RuntimeConfig {
  validateInsuranceServiceCutover(env);
  const idleTimeout = sessionIdleTimeoutMinutes(env);
  if (env.NODE_ENV === 'production') return productionConfig(env, idleTimeout);
  return {
    isProduction: false,
    mfiPilotEnabled: env.MFI_PILOT_ENABLED === undefined ? true : env.MFI_PILOT_ENABLED === '1',
    sessionIdleTimeoutMinutes: idleTimeout,
  };
}
