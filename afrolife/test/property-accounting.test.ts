import test from 'node:test';
import assert from 'node:assert/strict';
import { PROPERTY_CHART_OF_ACCOUNTS, propertyPeriodCloseCheck } from '../src/property-accounting.js';
import { toCsv } from '../src/csv.js';

test('property chart template preserves legacy ledger labels and stays draft pending Finance approval', () => {
  assert.equal(PROPERTY_CHART_OF_ACCOUNTS.status, 'draft_requires_finance_signoff');
  assert.deepEqual(
    PROPERTY_CHART_OF_ACCOUNTS.accounts.map((account) => account.name),
    ['Cash', 'Rent Receivable', 'Tenant Deposit Liability', 'Owner Funds Payable', 'Rental Revenue'],
  );
  assert.equal(new Set(PROPERTY_CHART_OF_ACCOUNTS.accounts.map((account) => account.code)).size, 5);
  assert.ok(PROPERTY_CHART_OF_ACCOUNTS.notes.some((note) => note.includes('IFRS 16')));
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
