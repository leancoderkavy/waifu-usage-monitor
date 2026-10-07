import test from 'node:test';
import assert from 'node:assert/strict';
import { statusKey } from '../src/status-key.ts';

const s = { warnAt: 25, criticalAt: 10 };
const report = (usedPercent, ok = true) => [{ accountId: 'a1', ok, meters: [
  { key: 'session:all', label: '5-hour session', usedPercent, unit: 'percent', resetsAt: '2026-09-24T12:00:00Z' },
] }];

test('small drift between checks keeps the same key, so no new line', () => {
  assert.equal(statusKey(report(41, true), s), statusKey(report(44), s));
});

test('crossing a 10% band or a threshold changes the key', () => {
  assert.notEqual(statusKey(report(48), s), statusKey(report(52), s));
  assert.notEqual(statusKey(report(74), s), statusKey(report(76), s));
});

test('a new reset window or an error changes the key', () => {
  const later = [{ ...report(41)[0], meters: [{ ...report(41)[0].meters[0], resetsAt: '2026-09-24T17:00:00Z' }] }];
  assert.notEqual(statusKey(report(41), s), statusKey(later, s));
  assert.notEqual(statusKey(report(41), s), statusKey(report(41, false), s));
});
