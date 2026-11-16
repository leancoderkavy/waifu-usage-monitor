import test from 'node:test';
import assert from 'node:assert/strict';
import { trackResets, takeDueResets, resetText } from '../src/reset-alert.ts';

const now = Math.floor(Date.now() / 1000);
const report = (resetsAt, id = 'a') => ({
  ok: true,
  accountId: id,
  label: 'Claude Max',
  meters: [{ key: 'weekly', label: 'Weekly', unit: 'percent', usedPercent: 50, resetsAt }],
});

test('tracks upcoming resets and ignores failed reports', () => {
  const p = trackResets({}, [report(now + 600), { ok: false, accountId: 'b', meters: [] }]);
  assert.deepEqual(Object.keys(p), ['a|weekly']);
});

test('keeps the entry when the reset time only jitters', () => {
  const p = trackResets({}, [report(now + 600)]);
  assert.equal(trackResets(p, [report(now + 630)])['a|weekly'].at, now + 600);
});

test('a reset that arrives is returned once and removed', () => {
  const p = trackResets({}, [report(now + 600)]);
  assert.equal(takeDueResets(p, now + 300).due.length, 0);
  const t = takeDueResets(p, now + 601);
  assert.equal(t.due.length, 1);
  assert.deepEqual(t.pending, {});
});

test('resets long past (app was off) stay quiet', () => {
  const p = trackResets({}, [report(now - 86400)]);
  assert.equal(takeDueResets(p, now).due.length, 0);
});

test('an expired reset time repeated by a later refresh is announced only once', () => {
  const at = now + 60;
  const armed = trackResets({}, [report(at)], now);
  const first = takeDueResets(armed, at + 5);
  assert.equal(first.due.length, 1);
  // The provider still reports the same, now past, reset time on the next refresh.
  const rearmed = trackResets(first.pending, [report(at)], at + 10);
  assert.equal(takeDueResets(rearmed, at + 20).due.length, 0);
  assert.deepEqual(rearmed, {});
});

test('a new future reset after an announced one is still tracked', () => {
  const at = now + 60;
  const first = takeDueResets(trackResets({}, [report(at)], now), at + 5);
  const next = trackResets(first.pending, [report(at + 7 * 86400)], at + 10);
  assert.equal(next['a|weekly'].at, at + 7 * 86400);
});

test('text names one reset or groups several', () => {
  const one = [{ at: 1, account: 'Claude Max', meter: 'Weekly' }];
  assert.match(resetText(one, 'Senpai'), /Claude Max · Weekly just reset/);
  assert.match(resetText([...one, { at: 2, account: 'Codex', meter: '5h' }], 'Senpai'), /2 limits just reset/);
});
