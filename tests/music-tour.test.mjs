import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { musicTourSteps } from '../src/music-tour.ts';

const transportWords = /previous|play\/pause and next control|progress bar, or focus/i;

test('without a song the tour explains Open Apple Music, not missing transport controls', () => {
  const steps = musicTourSteps(false);
  assert.deepEqual(steps.map((s) => s.target), ['.music', '.music-open']);
  for (const s of steps) assert.doesNotMatch(s.body, transportWords);
  assert.match(steps[1].body, /opens Apple Music/);
});

test('with a song the tour introduces transport controls and the seekable bar', () => {
  const steps = musicTourSteps(true);
  assert.deepEqual(steps.map((s) => s.target), ['.music', '.music-controls']);
  assert.match(steps[1].body, /Previous, play\/pause and next/);
  assert.match(steps[1].body, /arrow keys/);
});

test('the Open Apple Music button carries the tour target class', () => {
  const src = readFileSync(new URL('../src/components/MusicPlayer.tsx', import.meta.url), 'utf8');
  assert.match(src, /<button className="wide music-open"[^\n]*\n\s*Open Apple Music\s*<\/button>/);
});
