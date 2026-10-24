import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransitionMaintenance, MAINTENANCE_TRANSITIONS, requiresMaintenanceReview } from '../src/maintenance-workflow.js';

test('maintenance lifecycle routes triage, assignment, work and independent review', () => {
  assert.deepEqual(MAINTENANCE_TRANSITIONS.open, ['triaged', 'cancelled']);
  assert.equal(canTransitionMaintenance('open', 'triaged'), true);
  assert.equal(canTransitionMaintenance('triaged', 'assigned'), true);
  assert.equal(canTransitionMaintenance('assigned', 'in_progress'), true);
  assert.equal(canTransitionMaintenance('in_progress', 'awaiting_review'), true);
  assert.equal(canTransitionMaintenance('awaiting_review', 'completed'), true);
  assert.equal(canTransitionMaintenance('awaiting_review', 'rework_required'), true);
  assert.equal(canTransitionMaintenance('rework_required', 'in_progress'), true);
});

test('maintenance lifecycle prevents skipping review and editing terminal states', () => {
  assert.equal(canTransitionMaintenance('open', 'assigned'), false);
  assert.equal(canTransitionMaintenance('in_progress', 'completed'), false);
  assert.equal(canTransitionMaintenance('awaiting_review', 'cancelled'), false);
  assert.equal(canTransitionMaintenance('completed', 'in_progress'), false);
  assert.equal(canTransitionMaintenance('done', 'in_progress'), false);
});

test('only completion decisions require independent review evidence', () => {
  assert.equal(requiresMaintenanceReview('completed'), true);
  assert.equal(requiresMaintenanceReview('rework_required'), true);
  assert.equal(requiresMaintenanceReview('awaiting_review'), false);
});
