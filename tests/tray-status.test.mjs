import test from 'node:test';
import assert from 'node:assert/strict';
import { trayStatusFor } from '../src/tray-status.ts';

const ok = (usedPercent) => ({ ok: true, meters: [{ key: 'weekly', unit: 'percent', usedPercent }] });
const error = (message) => ({ ok: false, error: message, meters: [] });

test('tray status uses real usage and never treats missing readings as healthy limits', () => {
  assert.equal(trayStatusFor([], 25), 'standby');
  assert.equal(trayStatusFor([ok(40)], 25), 'standby');
  assert.equal(trayStatusFor([ok(78)], 25), 'warning');
  assert.equal(trayStatusFor([error('unavailable')], 25), 'standby');
});

test('revoked and expired saved logins ask for sign-in', () => {
  assert.equal(trayStatusFor([error('HTTP 401 token_revoked')], 25), 'sign-in');
  assert.equal(trayStatusFor([error('HTTP 400 invalid_grant')], 25), 'sign-in');
  assert.equal(trayStatusFor([error('saved login expired. Sign in to this account in Claude Code once')], 25), 'sign-in');
});

test('rate limits receive a separate icon; sign-in takes priority when both occur', () => {
  assert.equal(trayStatusFor([error('HTTP 429 Too Many Requests')], 25), 'rate-limited');
  assert.equal(trayStatusFor([error('HTTP 429'), error('HTTP 401 token_revoked'), ok(90)], 25), 'sign-in');
});
