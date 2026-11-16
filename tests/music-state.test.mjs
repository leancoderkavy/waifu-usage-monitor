import test from 'node:test';
import assert from 'node:assert/strict';
import { playerState, playerArtwork } from '../src/music-state.ts';

const song = (over = {}) => ({ connected: true, playing: true, key: 'k1', title: 'Song A', ...over });

test('clears previous artwork when a different song has none', () => {
  assert.equal(playerArtwork('cover-a', 'k1', song({ key: 'k2', artwork: null })), null);
});

test('retains artwork omitted by same-song polling and accepts replacement artwork', () => {
  assert.equal(playerArtwork('cover-a', 'k1', song({ artwork: null })), 'cover-a');
  assert.equal(playerArtwork('cover-a', 'k1', song({ artwork: 'cover-b' })), 'cover-b');
});

test('clears cached artwork when idle or disconnected', () => {
  assert.equal(playerArtwork('cover-a', 'k1', song({ title: '', artwork: null })), null);
  assert.equal(playerArtwork('cover-a', 'k1', song({ connected: false, artwork: null })), null);
});

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
