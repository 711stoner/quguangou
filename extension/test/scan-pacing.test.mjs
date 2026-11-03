import test from 'node:test';
import assert from 'node:assert/strict';
import { recentlyRateLimited, cursorPacingWindow, domPacingWindow, shouldClearRecoveryCount, advertisedRetryAfterMs } from '../lib/scan-pacing.js';
test('cursor requests are paced and include sustained breaks', () => {
  assert.deepEqual(cursorPacingWindow(1), [7000, 10500]);
  assert.deepEqual(cursorPacingWindow(5), [14000, 22000]);
  assert.deepEqual(cursorPacingWindow(18), [35000, 50000]);
  assert.deepEqual(cursorPacingWindow(18, true), [60000, 85000]);
  assert.ok(cursorPacingWindow(2, true)[0] > cursorPacingWindow(2)[0]);
});
test('DOM scrolling also slows down after recent limit', () => {
  assert.deepEqual(domPacingWindow(false), [1750, 2850]);
  assert.deepEqual(domPacingWindow(false, true), [3000, 4500]);
  assert.ok(domPacingWindow(true)[0] > domPacingWindow(false)[0]);
});
test('429 breaker is not erased by reading a few more users', () => {
  const now=2_000_000_000;
  assert.ok(recentlyRateLimited(now-5000,now));
  assert.equal(shouldClearRecoveryCount(now-5000,now),false);
  assert.equal(shouldClearRecoveryCount(now-7_300_000,now),true);
});
test('retry-after is sanitized and capped', () => {
  assert.equal(advertisedRetryAfterMs('HTTP_429 RETRY_AFTER_MS=123456'),123456);
  assert.equal(advertisedRetryAfterMs('HTTP_429 RETRY_AFTER_MS=999999999'),86400000);
  assert.equal(advertisedRetryAfterMs('HTTP_429'),0);
});
