import { useCallback, useEffect, useRef, useState } from "react";
import { api, type NowPlaying } from "../api";
import { usePageVisible } from "../hooks/usePageVisible";
import FeatureTour, { tourSeen, type TourStep } from "./FeatureTour";
import "./MusicPlayer.css";

const TOUR_ID = "music-player";
const TOUR_VERSION = 1;
const STEPS: TourStep[] = [
  {
    target: ".music",
    title: "Apple Music",
    body: "Your Apple Music now-playing card lives beside her. Open the Apple Music app and start a song; it appears here with artwork.",
  },
  {
    target: ".music-controls",
    title: "Controls",
    body: "Previous, play/pause and next control Apple Music directly. Click the progress bar to jump within the song. Replay this tour with the ? button.",
  },
];

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Apple Music now-playing card with transport controls, read from the Windows media session. */
export default function MusicPlayer({ active }: { active: boolean }) {
  const visible = usePageVisible() && active;
  const [np, setNp] = useState<NowPlaying | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tour, setTour] = useState(false);
  const keyRef = useRef<string | null>(null);
  const tourChecked = useRef(false);

  const poll = useCallback(async () => {
    try {
      const n = await api.mediaNow(keyRef.current);
      keyRef.current = n.key || null;
      if (n.artwork) setArt(n.artwork);
      else if (!n.key) setArt(null);
      setNp(n);
      setPos(n.positionMs);
    } catch (e) {
      console.warn("media poll failed", e);
    }
  }, []);

  // Poll while the dashboard is shown; the card is idle (no timers) otherwise.
  useEffect(() => {
    if (!visible) return;
    void poll();
    const id = window.setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [visible, poll]);

  // Advance the bar between polls while playing.
  useEffect(() => {
    if (!visible || !np?.playing) return;
    const id = window.setInterval(() => setPos((p) => Math.min(p + 500, np.durationMs || p + 500)), 500);
    return () => clearInterval(id);
  }, [visible, np?.playing, np?.key, np?.durationMs]);

  // First eligible visit: card is on screen, this tour version not yet seen.
  useEffect(() => {
    if (!visible || !np || tourChecked.current) return;
    tourChecked.current = true;
    if (!tourSeen(TOUR_ID, TOUR_VERSION)) setTimeout(() => setTour(true), 600);
  }, [visible, np]);

  const run = async (action: "toggle" | "next" | "prev") => {
    setError(null);
    try {
      await api.mediaControl(action);
      setTimeout(poll, 250);
    } catch (e) {
      setError(String(e));
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!np?.durationMs) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ms = Math.round(((e.clientX - r.left) / r.width) * np.durationMs);
    setPos(ms);
    api.mediaControl("seek", ms).catch((err) => setError(String(err)));
  };

  const pct = np?.durationMs ? Math.min(100, (pos / np.durationMs) * 100) : 0;
  const connected = !!np?.connected;
  const idle = connected && !np?.title;

  return (
    <>
      <div className={`music${np?.playing ? " playing" : ""}`} aria-label="Apple Music player">
        <div className="music-head">
          <span>♪ APPLE MUSIC</span>
          <button className="music-help" onClick={() => setTour(true)} title="Replay the player tour" aria-label="Replay the music player tour">
            ?
          </button>
        </div>
        {connected && !idle ? (
          <>
            <div className="music-body">
              <div className="music-art" style={art ? { backgroundImage: `url(${art})` } : undefined} aria-hidden />
              <div className="music-meta">
                <strong title={np!.title}>{np!.title}</strong>
                <span title={np!.artist}>{np!.artist || "Unknown artist"}</span>
              </div>
            </div>
            <div className="music-bar" onClick={seek} role="slider" aria-label="Song position" aria-valuemin={0} aria-valuemax={np!.durationMs} aria-valuenow={pos}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="music-times">
              <span>{clock(pos)}</span>
              <span>{clock(np!.durationMs)}</span>
            </div>
            <div className="music-controls">
              <button onClick={() => run("prev")} disabled={!np!.canPrev} aria-label="Previous song">
                ⏮
              </button>
              <button className="main" onClick={() => run("toggle")} aria-label={np!.playing ? "Pause" : "Play"}>
                {np!.playing ? "⏸" : "▶"}
              </button>
              <button onClick={() => run("next")} disabled={!np!.canNext} aria-label="Next song">
                ⏭
              </button>
            </div>
          </>
        ) : (
          <div className="music-empty">
            <p>{idle ? "Apple Music is open. Pick a song." : np ? "Apple Music isn't playing." : "Looking for Apple Music…"}</p>
            <div className="music-controls">
              <button className="wide" onClick={() => api.openAppleMusic().catch((e) => setError(String(e)))}>
                Open Apple Music
              </button>
            </div>
          </div>
        )}
        {error && <p className="music-error">{error}</p>}
      </div>
      <FeatureTour id={TOUR_ID} version={TOUR_VERSION} steps={STEPS} open={tour} onClose={() => setTour(false)} />
    </>
  );
}
