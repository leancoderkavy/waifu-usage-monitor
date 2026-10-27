import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopSquad, advanceWalker, seedWalker } from '../src/desktop-agents.ts';

test('desktop only represents recent supported sessions, newest first, without duplicates', () => {
  const make = (id, age, tool = 'codex') => ({ id, tool, lastActive: 1000 - age });
  const input = [make('old', 901), make('a', 20), make('b', 0, 'claude'), make('a', 20), make('local', 0, 'ollama')];
  assert.deepEqual(desktopSquad(input, 1000).map(s => s.id), ['b', 'a']);
  assert.equal(input.length, 5);
  assert.equal(desktopSquad(Array.from({ length: 30 }, (_, i) => make(String(i), i)), 1000).length, 12);
});

test('walkers bounce at every edge and stay within resized or tiny screens', () => {
  let walker = seedWalker('agent', 800, 600);
  for (let i = 0; i < 500; i++) {
    walker = advanceWalker(walker, 1, 800, 600);
    assert.ok(walker.x >= 0 && walker.x <= 800);
    assert.ok(walker.y >= 0 && walker.y <= 600);
  }
  const edge = advanceWalker({ x: 799, y: 599, vx: 40, vy: 30 }, 1, 800, 600);
  assert.ok(edge.vx < 0 && edge.vy < 0);
  const tiny = advanceWalker(walker, 1, 0, 0);
  assert.equal(tiny.x, 0);
  assert.equal(tiny.y, 0);
});

test('seeds are stable per identity and movement time is capped after suspension', () => {
  assert.deepEqual(seedWalker('a', 800, 600), seedWalker('a', 800, 600));
  assert.notDeepEqual(seedWalker('a', 800, 600), seedWalker('b', 800, 600));
  const walker = { x: 300, y: 300, vx: 40, vy: 20 };
  assert.deepEqual(advanceWalker(walker, 3600, 800, 600), advanceWalker(walker, 1, 800, 600));
});
