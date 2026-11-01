import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const TOUR_KEY = "kosmos.desktop-agents-tour.v2";
function introductionPending() {
  try { return localStorage.getItem(TOUR_KEY) !== "seen"; } catch { return true; }
}

export default function DesktopAgentControls() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guide, setGuide] = useState(introductionPending);
  const replay = useRef<HTMLButtonElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const replayed = useRef(false);
  useEffect(() => {
    let cancelled = false;
    invoke<boolean>("desktop_agents_enabled").then(value => { if (!cancelled) setEnabled(value); })
      .catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { if (guide && replayed.current) dismiss.current?.focus(); }, [guide]);
  const closeGuide = () => {
    setGuide(false);
    try { localStorage.setItem(TOUR_KEY, "seen"); } catch { /* The control remains usable. */ }
    if (replayed.current) replay.current?.focus();
  };
  return <section aria-label="Desktop agent companions" style={{ margin: "18px 0", padding: 12, border: "1px solid var(--edge)", borderRadius: 10 }}>
    <h3 style={{ marginTop: 0 }}>Desktop agents</h3>
    <label className="check"><input type="checkbox" checked={enabled === true} disabled={enabled === null || busy}
      onChange={async e => {
        const value = e.target.checked;
        setBusy(true); setError("");
        try { await invoke("set_desktop_agents", { enabled: value }); setEnabled(value); }
        catch (e) { setError(String(e)); }
        finally { setBusy(false); }
      }} />Show walking characters across the desktop</label>
    <p className="help">Click through figures to use your apps. Up to 12 recent Claude/Codex sessions appear on the monitor containing the usage island. Figures rest after 2 minutes without log activity and leave after 15 minutes. When an agent asks a question, finishes, stops, or seems stuck on a tool for 90 seconds, its companion runs to the bottom of the screen and calls you with a speech bubble for up to 2 hours.</p>
    <button ref={replay} type="button" className="btn small ghost" aria-expanded={guide} aria-controls="desktop-agent-guide"
      onClick={() => { replayed.current = true; setGuide(true); }}>Desktop agents guide</button>
    {guide && enabled !== null && <aside id="desktop-agent-guide" aria-label="Desktop agents introduction"
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); closeGuide(); } }}>
      <p className="help"><strong>Your agents, on your desktop.</strong> Start a Claude Code or Codex session, then enable the checkbox above. Sakura (genki) or Akane (tsundere) represents a Claude session; Yuki (kuudere) or Luna (dreamy) represents Codex. Each walks, idles and talks in her own style. Labels identify the project and model. Recent log activity is an estimate of work, not proof a process is running. Reduced motion keeps figures still.</p>
      <p className="help"><strong>New: they call you.</strong> A companion waiting on you runs to the bottom edge and shows a speech bubble: what the agent needs (question, approval, follow-up, stopped) and a one-line summary of its last message. Reply in that session and the bubble clears on the next scan (about 15 seconds). “Needs approval?” is a guess from a tool call with no result yet.</p>
      <p className="help">Hide them here or from the tray’s “Show / hide desktop agents” menu. Replay this introduction with “Desktop agents guide”.</p>
      <button ref={dismiss} type="button" className="btn small" onClick={closeGuide}>Got it / Skip</button>
    </aside>}
    {error && <p role="alert" className="card-err">{error}</p>}
  </section>;
}
