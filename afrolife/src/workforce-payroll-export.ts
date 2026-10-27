import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './core.js';
import { parseCsv } from './csv.js';

export const WORKFORCE_PAYROLL_EXPORT_COLUMNS = [
  'worker_id','worker_name','worker_type','billing_unit','contract_rate','payable_minutes','payable_hours',
  'shift_start','shift_end','policy_version',
] as const;

export function encryptPayrollExport(csv: string, key: Buffer, keyId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(csv, 'utf8'), cipher.final()]);
  const controlHash = createHash('sha256').update(csv, 'utf8').digest('hex');
  return {
    controlHash,
    payload: {
      version: 1,
      algorithm: 'AES-256-GCM',
      key_id: keyId,
      iv: iv.toString('base64'),
      auth_tag: cipher.getAuthTag().toString('base64'),
      control_hash: controlHash,
      ciphertext: encrypted.toString('base64'),
    },
  };
}

export function readPayrollExportCsv(
  encryptedPayload: unknown,
  key: Buffer,
  keyId: string,
  controlHash: string,
  rowCount: number,
) {
  const parsedPayload = z.object({
    version: z.literal(1),
    algorithm: z.literal('AES-256-GCM'),
    key_id: z.string(),
    iv: z.string(),
    auth_tag: z.string(),
    control_hash: z.string().regex(/^[0-9a-f]{64}$/),
    ciphertext: z.string(),
  }).strict().safeParse(encryptedPayload);
  if (!parsedPayload.success) throw new HttpError(409, 'Stored payroll export payload is malformed');
  const payload = parsedPayload.data;
  if (payload.key_id !== keyId) {
    throw new HttpError(409, 'This payroll export uses a different encryption key; configure its key before inspecting or retrying rows');
  }
  if (payload.control_hash !== controlHash) throw new HttpError(409, 'Payroll export control hash does not match its encrypted payload');
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.auth_tag, 'base64');
  if (iv.length !== 12 || authTag.length !== 16) throw new HttpError(409, 'Stored payroll export encryption metadata is malformed');

  let csv: string;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    csv = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new HttpError(409, 'Payroll export payload could not be authenticated with the configured encryption key');
  }
  if (createHash('sha256').update(csv, 'utf8').digest('hex') !== controlHash) {
    throw new HttpError(409, 'Payroll export payload failed its control-hash integrity check');
  }

  let rows: string[][];
  try {
    rows = parseCsv(csv);
  } catch {
    throw new HttpError(409, 'Payroll export payload contains malformed CSV');
  }
  if (rows.length !== rowCount + 1
      || rows[0]?.length !== WORKFORCE_PAYROLL_EXPORT_COLUMNS.length
      || !WORKFORCE_PAYROLL_EXPORT_COLUMNS.every((column, index) => rows[0][index] === column)
      || rows.slice(1).some((row) => row.length !== WORKFORCE_PAYROLL_EXPORT_COLUMNS.length)) {
    throw new HttpError(409, 'Payroll export rows do not match the stored export manifest');
  }
  return { csv, rows };
}
