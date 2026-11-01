import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVAL_AFTER, SPOT, WAIT_WINDOW, callSpots, dashAt, desktopSquad, perimeter, waitingOn } from '../src/desktop-agents.ts';
import { PERSONAS, pose, voiceLine } from '../src/personas.ts';

const wait = (kind, since) => ({ kind, summary: 'x', since });

test('only top-level sessions with a recent wait call for the user; pending tools need time first', () => {
  const now = 10_000;
  const s = (attention, extra = {}) => ({ id: 'a', tool: 'claude', lastActive: now, attention, ...extra });
  assert.equal(waitingOn(s(wait('done', now - 5)), now)?.kind, 'done');
  assert.equal(waitingOn(s(wait('approval', now - APPROVAL_AFTER + 1)), now), null);
  assert.equal(waitingOn(s(wait('approval', now - APPROVAL_AFTER)), now)?.kind, 'approval');
  assert.equal(waitingOn(s(wait('question', now - WAIT_WINDOW - 1)), now), null);
  assert.equal(waitingOn(s(wait('question', now), { subagent: true }), now), null);
  assert.equal(waitingOn(s(null), now), null);
});

test('waiting sessions outlast the 15 minute window and come first', () => {
  const now = 100_000;
  const quiet = { id: 'quiet', tool: 'codex', lastActive: now - 3600, attention: wait('question', now - 3600) };
  const gone = { id: 'gone', tool: 'codex', lastActive: now - 3600 };
  const busy = { id: 'busy', tool: 'claude', lastActive: now };
  assert.deepEqual(desktopSquad([busy, gone, quiet], now).map(s => s.id), ['quiet', 'busy']);
});

test('call spots are distinct floor positions that survive others leaving', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const spots = callSpots(ids, 2560, 1400);
  const values = [...spots.values()];
  assert.equal(new Set(values).size, ids.length);
  for (const v of values) assert.ok(v >= 0 && v <= 2560 - 72);
  for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) assert.ok(Math.abs(values[i] - values[j]) >= SPOT - 1e-9);
  assert.equal(callSpots(['a'], 2560, 1400).get('a'), spots.get('a'));
});

test('dash takes the short way round and lands on the spot', () => {
  const total = perimeter(1000, 800);
  const back = dashAt(50, total - 50, total, 0.1);
  assert.equal(back.dir, -1);
  assert.ok(back.arrived < 0);
  const done = dashAt(50, 500, total, 60);
  assert.ok(Math.abs(done.s - 500) < 1e-9 && done.arrived > 0 && done.idle);
  assert.equal(dashAt(50, 500, total, Infinity).s, 500);
});

test('each persona poses every property and keeps one voice line per wait', () => {
  for (const who of Object.keys(PERSONAS)) {
    for (const mode of ['walk', 'dash', 'idle', 'still', 'asleep', 'call']) {
      const props = pose(who, 'id-1', 1_793_000_000.5, mode);
      assert.equal(props.length, 13);
      for (const [, value] of props) assert.ok(Number.isFinite(Number(value)), `${who} ${mode}`);
    }
    assert.equal(voiceLine(who, 'question', 'k1'), voiceLine(who, 'question', 'k1'));
    assert.ok(PERSONAS[who].voice.done.includes(voiceLine(who, 'mystery', 'k2')));
  }
});
