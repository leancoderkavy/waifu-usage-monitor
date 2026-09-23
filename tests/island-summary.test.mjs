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
    sessionLeft: 80, weeklyLeft: 0,
  });
});

test('unavailable Claude usage never becomes a false zero', () => {
  assert.deepEqual(summarizeIslandProvider([{ provider: 'claude', ok: false, meters: [] }], 'claude'), {
    provider: 'claude', left: null, limitLabel: null, windowLabel: null,
    sessionLeft: null, weeklyLeft: null,
  });
});
