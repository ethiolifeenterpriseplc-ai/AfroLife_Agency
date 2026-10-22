import test from 'node:test';
import assert from 'node:assert/strict';
import { isSamePaymentEvent } from '../src/webhooks.js';

const event = {
  event_id: 'provider-event-1',
  invoice_id: '00000000-0000-4000-8000-000000000001',
  amount: 1250.5,
  reference: 'BANK-REFERENCE-1',
};

test('payment event retries are idempotent only when payment details match', () => {
  const existing = {
    invoice_id: event.invoice_id,
    amount: '1250.50',
    reference: event.reference,
  };
  assert.equal(isSamePaymentEvent(existing, event), true);
  assert.equal(isSamePaymentEvent({ ...existing, invoice_id: '00000000-0000-4000-8000-000000000002' }, event), false);
  assert.equal(isSamePaymentEvent({ ...existing, amount: '1250.51' }, event), false);
  assert.equal(isSamePaymentEvent({ ...existing, reference: 'BANK-REFERENCE-2' }, event), false);
  assert.equal(isSamePaymentEvent({ ...existing, amount: 'invalid' }, event), false);
});
