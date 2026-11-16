import type { NowPlaying } from "./api";

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
