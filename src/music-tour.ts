import type { TourStep } from "./components/FeatureTour";

const CARD: TourStep = {
  target: ".music",
  title: "Apple Music",
  body: "Your Apple Music now-playing card lives beside her. Open the Apple Music app and start a song; it appears here with artwork.",
};

const TRANSPORT: TourStep = {
  target: ".music-controls",
  title: "Controls",
  body: "Previous, play/pause and next control Apple Music directly. Click the progress bar, or focus it and use the arrow keys, to jump within the song. Replay this tour with the ? button.",
};

const OPEN: TourStep = {
  target: ".music-open",
  title: "Open Apple Music",
  body: "Nothing is playing yet. This button opens Apple Music; once a song starts, the card shows play/pause, skip and a progress bar you can seek. Replay this tour with the ? button.",
};

/**
 * Tour steps for what the card actually shows: transport controls only exist
 * while a song is loaded, so other states explain the Open Apple Music button.
 */
export function musicTourSteps(hasSong: boolean): TourStep[] {
  return [CARD, hasSong ? TRANSPORT : OPEN];
}
