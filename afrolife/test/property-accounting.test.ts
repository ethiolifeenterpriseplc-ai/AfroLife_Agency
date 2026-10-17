import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROPERTY_CHART_OF_ACCOUNTS, propertyPeriodCloseCheck } from '../src/property-accounting.js';
import { toCsv } from '../src/csv.js';

test('property chart template preserves legacy ledger labels and stays draft pending Finance approval', () => {
  assert.equal(PROPERTY_CHART_OF_ACCOUNTS.status, 'draft_requires_finance_signoff');
  assert.deepEqual(
    PROPERTY_CHART_OF_ACCOUNTS.accounts.map((account) => account.name),
    ['Cash', 'Rent Receivable', 'Accounts Payable', 'Tenant Deposit Liability', 'Owner Funds Payable', 'Rental Revenue', 'Maintenance Expense'],
  );
  assert.equal(new Set(PROPERTY_CHART_OF_ACCOUNTS.accounts.map((account) => account.code)).size, 7);
  assert.ok(PROPERTY_CHART_OF_ACCOUNTS.notes.some((note) => note.includes('IFRS 16')));
});

test('vendor bills and payments require separate maker-checker reconciliations before Accounting outbox events post', async () => {
  const migration = await readFile(new URL('../migrations/075_property_maintenance_accounting.sql', import.meta.url), 'utf8');
  const accessMigration = await readFile(new URL('../migrations/077_property_finance_maintenance_read.sql', import.meta.url), 'utf8');
  const vendorRoutes = await readFile(new URL('../src/property-vendor-accounting.ts', import.meta.url), 'utf8');
  assert.match(vendorRoutes, /property-vendor-bills\/:id\/decision/);
  assert.match(vendorRoutes, /property-vendor-payments\/:id\/reconcile/);
  assert.match(vendorRoutes, /bill\.recorded_by===req\.user!\.id/);
  assert.match(vendorRoutes, /bill\.payment_recorded_by===req\.user!\.id/);
  assert.match(vendorRoutes, /source_account_code:'maintenance_expense'/);
  assert.match(vendorRoutes, /source_account_code:'accounts_payable'/);
  assert.match(vendorRoutes, /source_account_code:'cash'/);
  assert.match(migration, /CHECK \(approved_by IS NULL OR approved_by <> recorded_by\)/);
  assert.match(migration, /CHECK \(payment_reconciled_by IS NULL OR payment_reconciled_by <> payment_recorded_by\)/);
  assert.match(migration, /ALTER TABLE property_vendor_bills FORCE ROW LEVEL SECURITY/);
  assert.match(accessMigration, /property_maintenance_finance_read ON maintenance_requests FOR SELECT/);
});

test('property period close is ready only when all report-only checks are clear', () => {
  assert.deepEqual(propertyPeriodCloseCheck({
    period: '2026-10',
    pendingReceipts: 0,
    unpaidRentCharges: 0,
    unbalancedLedgerTransactions: 0,
  }), {
    period: '2026-10',
    pending_receipts: 0,
    unpaid_rent_charges: 0,
    unbalanced_ledger_transactions: 0,
    ready_for_finance_review: true,
    evidence_only: true,
  });
  assert.equal(propertyPeriodCloseCheck({
    period: '2026-10',
    pendingReceipts: 1,
    unpaidRentCharges: 0,
    unbalancedLedgerTransactions: 0,
  }).ready_for_finance_review, false);
});

test('owner statement CSV protects text values and exports reconciliation columns', () => {
  const csv = toCsv([{
    address: '=HYPERLINK("https://example.invalid")',
    rent_reconciled: '1250.00',
    deposit_refunded: '0.00',
  }], ['address', 'rent_reconciled', 'deposit_refunded']);
  assert.match(csv, /'=/);
  assert.match(csv, /rent_reconciled,deposit_refunded/);
});
