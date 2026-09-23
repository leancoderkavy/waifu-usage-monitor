import test from 'node:test';
import assert from 'node:assert/strict';
import { runsOutAt } from '../src/projection.ts';

const HOUR = 3600;
const meter = (usedPercent, elapsed, windowSecs = 5 * HOUR, now = 1_000_000) =>
  [{ key: 'm', label: 'm', unit: 'percent', usedPercent, windowSecs, resetsAt: now - elapsed + windowSecs }, now];

test('projects the run-out time from the average pace in the window', () => {
  // 60% used in 2h -> 40% left takes another 1h20m, well before the 3h reset.
  const [m, now] = meter(60, 2 * HOUR);
  assert.equal(runsOutAt(m, now), now + (40 / 60) * 2 * HOUR);
});

test('returns null when the pace lasts until the reset', () => {
  const [m, now] = meter(20, 2 * HOUR);
  assert.equal(runsOutAt(m, now), null);
});

test('returns null early in the window or with too little usage', () => {
  assert.equal(runsOutAt(...meter(50, 0.2 * HOUR)), null);
  assert.equal(runsOutAt(...meter(3, 2 * HOUR)), null);
});

test('returns null without reset info or when already exhausted', () => {
  assert.equal(runsOutAt({ key: 'm', label: 'm', unit: 'percent', usedPercent: 80 }), null);
  assert.equal(runsOutAt(...meter(100, 2 * HOUR)), null);
});
