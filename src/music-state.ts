import type { NowPlaying } from "./api";

/** Native polling omits artwork for an unchanged key; cache only that song. */
export function playerArtwork(previous: string | null, previousKey: string | null, next: Pick<NowPlaying, "connected" | "title" | "key" | "artwork">): string | null {
  if (!next.connected || !next.title || !next.key) return null;
  if (next.artwork) return next.artwork;
  return next.key === previousKey ? previous : null;
}

/**
 * Identity of what the player card is showing: connection, song and play state.
 * A control error belongs to the state it was raised in, so the card clears it
 * when this changes (new song, Apple Music closed, playback started elsewhere).
 */
export function playerState(np: Pick<NowPlaying, "connected" | "playing" | "key" | "title"> | null): string {
  if (!np) return "none";
  if (!np.connected) return "disconnected";
  if (!np.title) return "idle";
  return `${np.key}|${np.title}|${np.playing ? "playing" : "paused"}`;
}
