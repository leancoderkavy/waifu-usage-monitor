import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeIslandProvider } from '../src/island-summary.ts';

test('Claude summary keeps session allowance visible when weekly allowance is exhausted', () => {
  const reports = [{ provider: 'claude', ok: true, meters: [
    { key: 'session:all', label: '5-hour session', usedPercent: 20, unit: 'percent', windowSecs: 18000 },
    { key: 'weekly_all:all', label: 'Weekly (all models)', usedPercent: 100, unit: 'percent', windowSecs: 604800 },
    { key: 'weekly_scoped:Fable', label: 'Weekly · Fable', usedPercent: 100, unit: 'percent', windowSecs: 604800 },
  ] }];
  assert.deepEqual(summarizeIslandProvider(reports, 'claude'), {
    provider: 'claude', left: 0, limitLabel: 'Weekly (all models)', windowLabel: '7d',
    sessionLeft: 80, weeklyLeft: 0, account: null,
  });
});

test('unavailable Claude usage never becomes a false zero', () => {
  assert.deepEqual(summarizeIslandProvider([{ provider: 'claude', ok: false, meters: [] }], 'claude'), {
    provider: 'claude', left: null, limitLabel: null, windowLabel: null,
    sessionLeft: null, weeklyLeft: null, account: null,
  });
});

const meter = (key, usedPercent, windowSecs) => ({ key, label: key, usedPercent, unit: 'percent', windowSecs });

test('multiple accounts show the account with the most remaining allowance', () => {
  const reports = [
    { accountId: 'a', label: 'Work', provider: 'codex', ok: true, meters: [meter('primary', 90, 18000), meter('secondary', 40, 604800)] },
    { accountId: 'b', label: 'Personal', provider: 'codex', ok: true, meters: [meter('primary', 30, 18000), meter('secondary', 50, 604800)] },
    { accountId: 'c', label: 'Broken', provider: 'codex', ok: false, meters: [] },
  ];
  const summary = summarizeIslandProvider(reports, 'codex');
  assert.equal(summary.left, 50);
  assert.equal(summary.account, 'Personal');
});

test('multiple Claude accounts keep the chosen account session and weekly windows together', () => {
  const reports = [
    { accountId: 'a', label: 'One', provider: 'claude', ok: true, meters: [meter('five_hour', 10, 18000), meter('seven_day', 95, 604800)] },
    { accountId: 'b', label: 'Two', provider: 'claude', ok: true, meters: [meter('five_hour', 60, 18000), meter('seven_day', 20, 604800)] },
  ];
  assert.deepEqual(summarizeIslandProvider(reports, 'claude'), {
    provider: 'claude', left: 40, limitLabel: 'five_hour', windowLabel: '5h',
    sessionLeft: 40, weeklyLeft: 80, account: 'Two',
  });
});

test('multiple accounts with no data stay unavailable', () => {
  const reports = [
    { accountId: 'a', label: 'One', provider: 'claude', ok: false, meters: [] },
    { accountId: 'b', label: 'Two', provider: 'claude', ok: false, meters: [] },
  ];
  assert.equal(summarizeIslandProvider(reports, 'claude').left, null);
  assert.equal(summarizeIslandProvider(reports, 'claude').account, null);
});
