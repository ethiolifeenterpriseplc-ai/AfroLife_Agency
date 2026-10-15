import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const mode = process.argv[2] ?? 'verify';
assert.ok(['capture', 'verify'].includes(mode), 'Usage: node scripts/property-restore-verify.mjs capture|verify');
const connectionString = mode === 'capture'
  ? process.env.AFROLIFE_CONTROL_DATABASE_URL?.trim()
  : process.env.AFROLIFE_RESTORE_DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error(mode === 'capture'
    ? 'AFROLIFE_CONTROL_DATABASE_URL must point to an isolated source test database.'
    : 'AFROLIFE_RESTORE_DATABASE_URL must point to an isolated restored test database.');
}
const target = new URL(connectionString);
const database = decodeURIComponent(target.pathname.replace(/^\/+/, ''));
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol), 'Restore target must be PostgreSQL.');
assert.ok(['localhost', '127.0.0.1', '::1'].includes(target.hostname),
  'Restore verification is restricted to loopback. Staging requires an approved, separately reviewed rehearsal.');
assert.ok(/^(?:test[_-]|afrolife[_-]test(?:[_-]|$))/i.test(database),
  'Restore target database must be named test_* or afrolife_test*; refusing a normal application database.');
if (process.env.DATABASE_URL) {
  const application = new URL(process.env.DATABASE_URL);
  assert.notEqual(`${target.hostname}:${target.port}/${database}`,
    `${application.hostname}:${application.port}/${decodeURIComponent(application.pathname.replace(/^\/+/, ''))}`,
    'Restore target must differ from DATABASE_URL.');
}
const expectedFile = process.env.AFROLIFE_RESTORE_EXPECTED_FILE?.trim();
if (mode === 'verify' && !expectedFile) {
  throw new Error('AFROLIFE_RESTORE_EXPECTED_FILE must point to signed pre-restore control totals.');
}
const expected = expectedFile ? JSON.parse(await readFile(expectedFile, 'utf8')) : null;
if (expected) {
  assert.equal(expected.mode, 'capture', 'Expected manifest must be unmodified output from capture mode.');
  assert.equal(expected.result, 'PASS', 'Expected manifest must have passed its source ledger-balance check.');
  assert.equal(typeof expected.target, 'string', 'Expected manifest must include its source target.');
  assert.notEqual(expected.target, `${target.hostname}:${target.port}/${database}`,
    'Restore target must differ from the database used to capture control totals.');
  assert.ok(Number.isInteger(expected.ledger?.transactions), 'Expected manifest must include ledger.transactions.');
  assert.ok(Array.isArray(expected.rent_transactions), 'Expected manifest must include rent_transactions rows.');
}

const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000, application_name: 'afrolife-property-restore-verification' });
try {
  const [ledger, rents] = await Promise.all([
    pool.query(`
      SELECT count(*)::int AS transactions,
             count(*) FILTER (WHERE debit_total <> credit_total)::int AS unbalanced_transactions,
             coalesce(sum(debit_total),0)::text AS debit_total,
             coalesce(sum(credit_total),0)::text AS credit_total
      FROM (
        SELECT txn_id, sum(debit) AS debit_total, sum(credit) AS credit_total
        FROM ledger_entries GROUP BY txn_id
      ) ledger_totals`),
    pool.query(`
      SELECT kind, status, count(*)::int AS records, coalesce(sum(amount),0)::text AS amount
      FROM rent_transactions
      GROUP BY kind,status ORDER BY kind,status`),
  ]);
  const actualLedger = ledger.rows[0];
  const actualRents = new Map(rents.rows.map((row) => [`${row.kind}:${row.status}`, row]));
  const mismatches = [];
  if (expected) {
    if (actualRents.size !== expected.rent_transactions.length) {
      mismatches.push(`rent_transactions group count: expected ${expected.rent_transactions.length}, got ${actualRents.size}`);
    }
    for (const field of ['transactions', 'debit_total', 'credit_total']) {
      if (String(actualLedger[field]) !== String(expected.ledger[field])) {
        mismatches.push(`ledger.${field}: expected ${expected.ledger[field]}, got ${actualLedger[field]}`);
      }
    }
    for (const row of expected.rent_transactions) {
      const actual = actualRents.get(`${row.kind}:${row.status}`);
      if (!actual || Number(actual.records) !== Number(row.records) || String(actual.amount) !== String(row.amount)) {
        mismatches.push(`rent_transactions ${row.kind}/${row.status}: expected ${JSON.stringify(row)}, got ${JSON.stringify(actual ?? null)}`);
      }
    }
  }
  const summary = {
    result: actualLedger.unbalanced_transactions === 0 && mismatches.length === 0 ? 'PASS' : 'FAIL',
    target: `${target.hostname}:${target.port}/${database}`,
    mode,
    operation: mode === 'capture' ? 'read-only pre-restore control-total capture' : 'read-only checks against an already restored disposable database',
    ledger: ledger.rows[0],
    rent_transactions: rents.rows,
    mismatches,
    note: 'Keep the capture output as pre-restore evidence. Verification compares totals and balances but does not prove recoverability or data correctness by itself.',
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.result === 'FAIL') process.exitCode = 1;
} finally {
  await pool.end();
}
