import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopSquad, advanceWalker, perimeter, poseAt, seedWalker } from '../src/desktop-agents.ts';

test('desktop only represents recent supported sessions, newest first, without duplicates', () => {
  const make = (id, age, tool = 'codex') => ({ id, tool, lastActive: 1000 - age });
  const input = [make('old', 901), make('a', 20), make('b', 0, 'claude'), make('a', 20), make('local', 0, 'ollama')];
  assert.deepEqual(desktopSquad(input, 1000).map(s => s.id), ['b', 'a']);
  assert.equal(input.length, 5);
  assert.equal(desktopSquad(Array.from({ length: 30 }, (_, i) => make(String(i), i)), 1000).length, 12);
});

test('poses stay on the screen border with feet against the nearest edge', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const total = perimeter(800, 600);
  for (let s = 0; s < total; s += 3.7) {
    const { x, y, angle } = poseAt(s, 800, 600);
    assert.ok(x >= -1e-6 && x <= 800 + 1e-6 && y >= -1e-6 && y <= 600 + 1e-6);
    const onEdge = near(y, 600) || near(x, 800) || near(y, 0) || near(x, 0);
    // Corners are rounded, so only straight stretches must touch an edge exactly.
    if (Number.isInteger(angle / 90)) assert.ok(onEdge, `pose ${s} off the border`);
  }
  assert.deepEqual(poseAt(100, 800, 600), { x: 136, y: 600, angle: 0 });
  assert.deepEqual(poseAt(total - 1 + total, 800, 600), poseAt(total - 1, 800, 600));
  const right = poseAt(800 - 72 + Math.PI * 18 + 50, 800, 600);
  assert.ok(near(right.x, 800) && right.angle === -90);
  const top = poseAt(800 + 600 - 4 * 36 + Math.PI * 36 + 50, 800, 600);
  assert.ok(near(top.y, 0) && top.angle === -180);
});

test('walking is continuous around corners and survives tiny or empty screens', () => {
  let previous = poseAt(0, 800, 600);
  for (let s = 0.5; s < perimeter(800, 600); s += 0.5) {
    const pose = poseAt(s, 800, 600);
    assert.ok(Math.hypot(pose.x - previous.x, pose.y - previous.y) < 0.51);
    previous = pose;
  }
  assert.deepEqual(poseAt(50, 0, 0), { x: 0, y: 0, angle: 0 });
  let walker = seedWalker('agent', 40, 30);
  for (let i = 0; i < 200; i++) walker = advanceWalker(walker, 1, 40, 30);
  assert.ok(walker.s >= 0 && walker.s < perimeter(40, 30));
  assert.equal(advanceWalker(walker, 1, 0, 0).s, 0);
});

test('seeds are stable per identity and movement time is capped after suspension', () => {
  assert.deepEqual(seedWalker('a', 800, 600), seedWalker('a', 800, 600));
  assert.notDeepEqual(seedWalker('a', 800, 600), seedWalker('b', 800, 600));
  const walker = { s: 300, dir: 1, speed: 40, pause: 0, rng: 7 };
  assert.deepEqual(advanceWalker(walker, 3600, 800, 600), advanceWalker(walker, 1, 800, 600));
  assert.deepEqual(advanceWalker({ ...walker, pause: 2 }, 0.5, 800, 600), { ...walker, pause: 1.5 });
  let w = seedWalker('wanderer', 800, 600), stops = 0, turns = 0;
  for (let i = 0; i < 3000; i++) {
    const next = advanceWalker(w, 1 / 30, 800, 600);
    if (next.pause > 0 && w.pause === 0) stops++;
    if (next.dir !== w.dir) turns++;
    w = next;
  }
  assert.ok(stops > 0 && turns > 0, 'walkers occasionally stop and turn around');
});
