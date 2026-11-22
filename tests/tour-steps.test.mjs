import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveTourSteps, tourStepsKey } from '../src/tour-steps.ts';
import { musicTourSteps } from '../src/music-tour.ts';

const transportWords = /previous|play\/pause and next control|progress bar, or focus/i;
const onScreen = (...targets) => (t) => targets.includes(t);

test('opening resolves on-screen steps from the first step', () => {
  const r = resolveTourSteps(musicTourSteps(true), 0, onScreen('.music', '.music-controls'));
  assert.deepEqual(r.ready.map((s) => s.target), ['.music', '.music-controls']);
  assert.equal(r.index, 0);
});

test('disconnecting on the Controls step switches to the Open Apple Music guidance in place', () => {
  // Reader is on step 2 (Controls) when Apple Music disconnects: transport controls
  // leave the DOM and the card renders the Open Apple Music button instead.
  const r = resolveTourSteps(musicTourSteps(false), 1, onScreen('.music', '.music-open'));
  assert.deepEqual(r.ready.map((s) => s.target), ['.music', '.music-open']);
  assert.equal(r.index, 1);
  assert.equal(r.ready[r.index].title, 'Open Apple Music');
  for (const s of r.ready) assert.doesNotMatch(s.body, transportWords);
});

test('a song starting on the Open step switches to the transport guidance in place', () => {
  const r = resolveTourSteps(musicTourSteps(true), 1, onScreen('.music', '.music-controls'));
  assert.equal(r.index, 1);
  assert.equal(r.ready[r.index].target, '.music-controls');
  assert.match(r.ready[r.index].body, /Previous, play\/pause and next/);
});

test('missing targets are dropped and the index clamps to what remains', () => {
  const r = resolveTourSteps(musicTourSteps(false), 1, onScreen('.music'));
  assert.deepEqual(r.ready.map((s) => s.target), ['.music']);
  assert.equal(r.index, 0);
  const none = resolveTourSteps(musicTourSteps(false), 1, onScreen());
  assert.equal(none.ready.length, 0);
  assert.equal(none.index, 0);
});

test('the steps key tracks content, not array identity', () => {
  assert.equal(tourStepsKey(musicTourSteps(true)), tourStepsKey(musicTourSteps(true)));
  assert.notEqual(tourStepsKey(musicTourSteps(true)), tourStepsKey(musicTourSteps(false)));
});

test('FeatureTour re-resolves its steps when they change while open', () => {
  const src = readFileSync(new URL('../src/components/FeatureTour.tsx', import.meta.url), 'utf8');
  assert.match(src, /resolveTourSteps\(steps, index, exists\)/);
  assert.match(src, /\}, \[open, stepsKey\]\);/);
});
