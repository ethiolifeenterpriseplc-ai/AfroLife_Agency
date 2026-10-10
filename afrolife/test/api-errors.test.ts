import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, optionalApiFallback } from '../public/api-errors.js';

test('optional API reads fall back only for forbidden or unavailable endpoints', () => {
  const fallback = [];
  assert.equal(optionalApiFallback(new ApiError('Forbidden', 403), fallback), fallback);
  assert.equal(optionalApiFallback(new ApiError('Not found', 404), fallback), fallback);
});

test('optional API reads surface server, authentication, and network failures', () => {
  for (const error of [
    new ApiError('Unauthorized', 401),
    new ApiError('Service unavailable', 503),
    new TypeError('Network failed'),
  ]) {
    assert.throws(() => optionalApiFallback(error, []), (thrown) => thrown === error);
  }
});
