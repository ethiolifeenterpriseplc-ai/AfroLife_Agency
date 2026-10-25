import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationRetryDelaySeconds } from '../src/dispatch.js';

test('notification retries use bounded exponential backoff', () => {
  assert.equal(notificationRetryDelaySeconds(1), 15);
  assert.equal(notificationRetryDelaySeconds(2), 30);
  assert.equal(notificationRetryDelaySeconds(8), 1920);
  assert.equal(notificationRetryDelaySeconds(9), 3600);
  assert.equal(notificationRetryDelaySeconds(12), 3600);
  assert.throws(() => notificationRetryDelaySeconds(0), RangeError);
  assert.throws(() => notificationRetryDelaySeconds(1.5), RangeError);
});
