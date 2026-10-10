import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { privacyIncidentChangeDetails, privacyRequestChangeDetails } from '../src/privacy-audit.js';

const migration = readFileSync(new URL('../migrations/037_global_admin_privacy_access.sql', import.meta.url), 'utf8');

test('global administrators receive the same privacy oversight RLS access as platform administrators', () => {
  for (const policy of [
    'personal_data_requests_read',
    'personal_data_requests_update',
    'privacy_incidents_read',
    'privacy_incidents_create',
    'privacy_incidents_update',
    'privacy_case_events_read',
    'privacy_case_events_create',
  ]) {
    const policySql = migration.split(`CREATE POLICY ${policy}`)[1]?.split(';')[0] ?? '';
    assert.match(policySql, /global_admin/);
  }
});

test('privacy oversight remains restricted to privacy staff rather than finance-only users', () => {
  for (const policy of ['personal_data_requests_read', 'privacy_incidents_read', 'privacy_incidents_update', 'privacy_case_events_read']) {
    const policySql = migration.split(`CREATE POLICY ${policy}`)[1]?.split(';')[0] ?? '';
    assert.doesNotMatch(policySql, /finance/);
  }
});

test('privacy request update events show status and assignment changes without copying response text', () => {
  const details = privacyRequestChangeDetails(
    { status: 'received', assigned_to: null, response: null },
    { status: 'completed', assigned_to: 'staff-id', response: 'Sensitive response body' },
  );
  assert.deepEqual(details.before, { status: 'received', assigned_to: null });
  assert.deepEqual(details.after, { status: 'completed', assigned_to: 'staff-id' });
  assert.equal(details.response_changed, true);
  assert.equal(details.response_length, 'Sensitive response body'.length);
  assert.doesNotMatch(JSON.stringify(details), /Sensitive response body/);
});

test('privacy incident update events identify changed sensitive fields without storing their contents', () => {
  const details = privacyIncidentChangeDetails(
    { status: 'open', assigned_to: null, containment_actions: null, outcome: null },
    { status: 'contained', assigned_to: 'staff-id', containment_actions: 'Confidential containment details', outcome: 'Private closure details' },
  );
  assert.equal(details.before.status, 'open');
  assert.equal(details.after.status, 'contained');
  assert.equal(details.containment_changed, true);
  assert.equal(details.outcome_changed, true);
  assert.doesNotMatch(JSON.stringify(details), /Confidential containment details|Private closure details/);
});
