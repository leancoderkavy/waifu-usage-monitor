import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopSquad, edgeAt, perimeter, poseAt, strideAt, stripOrigin, STRIP } from '../src/desktop-agents.ts';

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
  assert.deepEqual(strideAt('agent', 2e9, 0, 0), { s: 0, dir: 1, idle: true });
});

test('strides are a pure function of the clock, so every edge window agrees', () => {
  const t = 1.79e9;
  assert.deepEqual(strideAt('a', t, 800, 600), strideAt('a', t, 800, 600));
  assert.notDeepEqual(strideAt('a', t, 800, 600), strideAt('b', t, 800, 600));
  let previous = strideAt('wanderer', t, 800, 600), stops = 0, turns = 0;
  const total = perimeter(800, 600);
  for (let i = 1; i < 30 * 120; i++) {
    const next = strideAt('wanderer', t + i / 30, 800, 600);
    const step = Math.min(Math.abs(next.s - previous.s), total - Math.abs(next.s - previous.s));
    assert.ok(step < 2, `jumped ${step}px in one frame`);
    if (next.idle && !previous.idle) stops++;
    if (next.dir !== previous.dir && !next.idle) turns++;
    assert.ok(next.s >= 0 && next.s < total);
    previous = next;
  }
  assert.ok(stops > 0 && turns > 0, 'companions stop to look around and walk back');
});

test('each point of the border belongs to exactly one strip, and figures fit inside it', () => {
  const [w, h] = [1920, 1040];
  const total = perimeter(w, h);
  const seen = new Set();
  for (let s = 0; s < total; s += 2) {
    const edge = edgeAt(s, w, h);
    seen.add(edge);
    const { x, y, angle } = poseAt(s, w, h);
    const [ox, oy] = stripOrigin(edge, w, h);
    const [sw, sh] = edge === 'bottom' || edge === 'top' ? [w, STRIP] : [STRIP, h];
    // The figure's head stands ~110px from its feet, pointing away from the edge.
    const rad = angle * Math.PI / 180, hx = x + Math.sin(rad) * 110, hy = y - Math.cos(rad) * 110;
    for (const [px, py] of [[x, y], [hx, hy]]) {
      assert.ok(px - ox >= -1 && px - ox <= sw + 1 && py - oy >= -1 && py - oy <= sh + 1, `${edge} strip misses ${s}`);
    }
  }
  assert.deepEqual([...seen].sort(), ['bottom', 'left', 'right', 'top']);
  assert.equal(edgeAt(10, w, h), 'bottom');
  assert.equal(edgeAt(total - 10, w, h), 'bottom');
  assert.deepEqual(stripOrigin('bottom', w, h), [0, h - STRIP]);
  assert.deepEqual(stripOrigin('right', w, h), [w - STRIP, 0]);
});
