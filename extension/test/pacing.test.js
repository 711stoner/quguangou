import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reserveAttempt } from '../lib/pacing.js';

test('twenty attempts require a full cooldown; persisted quota survives task changes', () => {
  let state = {};
  for (let i = 0; i < 20; i++) {
    const result = reserveAttempt(state, i * 15_000);
    assert.equal(result.allowed, true);
    state = JSON.parse(JSON.stringify(result.state));
  }
  assert.equal(reserveAttempt(state, state.cooldownUntil - 1).allowed, false);
  const next = reserveAttempt(state, state.cooldownUntil);
  assert.equal(next.allowed, true);
  assert.equal(next.state.count, 1);
});

test('attempts are separated by at least fifteen seconds', () => {
  const first = reserveAttempt({}, 1000);
  assert.equal(reserveAttempt(first.state, 15_999).allowed, false);
  assert.equal(reserveAttempt(first.state, 16_000).allowed, true);
});
