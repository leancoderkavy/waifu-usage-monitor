import test from 'node:test';
import assert from 'node:assert/strict';
import { playerState } from '../src/music-state.ts';

const song = (over = {}) => ({ connected: true, playing: true, key: 'k1', title: 'Song A', ...over });

test('stays the same across polls of the same song and play state', () => {
  assert.equal(playerState(song()), playerState(song()));
});

test('changes when the song, play state or connection changes', () => {
  const base = playerState(song());
  assert.notEqual(playerState(song({ key: 'k2', title: 'Song B' })), base);
  assert.notEqual(playerState(song({ playing: false })), base);
  assert.notEqual(playerState(song({ title: '' })), base);
  assert.notEqual(playerState(song({ connected: false })), base);
  assert.notEqual(playerState(null), base);
});
