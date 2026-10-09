import './env.js';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { normalizePhone } from './phone.js';

const name = process.env.SEED_ADMIN_NAME?.trim();
const phone = process.env.SEED_ADMIN_PHONE;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!name || !phone || !password) {
  throw new Error('Set SEED_ADMIN_NAME, SEED_ADMIN_PHONE, and SEED_ADMIN_PASSWORD before seeding');
}
if (Buffer.byteLength(password, 'utf8') > 72 || password.length < 12) {
  throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters and at most 72 UTF-8 bytes');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const normalized = normalizePhone(phone);
if (!normalized) throw new Error('SEED_ADMIN_PHONE must be a valid Ethiopian phone number');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const exists = await pool.query('SELECT 1 FROM users WHERE phone = $1', [normalized]);
  if (exists.rowCount) throw new Error('An account with SEED_ADMIN_PHONE already exists');
  await pool.query(
    `INSERT INTO users (legal_name, phone, role, kyc_status, active, password_hash, must_change_password)
     VALUES ($1,$2,'super_admin','verified',true,$3,false)`,
    [name, normalized, await bcrypt.hash(password, 12)],
  );
  console.log(`Created initial Super Admin for ${normalized}`);
} finally {
  await pool.end();
}
