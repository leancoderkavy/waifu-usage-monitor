import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Session } from "../types";

const TOOL: Record<string, { name: string; color: string; icon: string }> = {
  codex: { name: "Codex", color: "#10a37f", icon: "✦" },
  claude: { name: "Claude Code", color: "#d97757", icon: "✺" },
  ollama: { name: "Ollama", color: "#3a3150", icon: "◉" },
};

/** Working = wrote to its log in the last 2 minutes. Idle = within 15. */
const WORKING = 120;
const IDLE = 15 * 60;

function ago(secs: number): string {
  if (secs < 60) return `${Math.max(0, Math.round(secs))}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ${Math.round((secs % 3600) / 60)}m ago`;
}

function kilo(n?: number | null): string | null {
  if (!n) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

function Row({ s, now, i }: { s: Session; now: number; i: number }) {
  const tool = TOOL[s.tool] ?? { name: s.tool, color: "#6b7896", icon: "•" };
  const idle = now - s.lastActive;
  const state = s.tool === "ollama" ? "loaded" : idle <= WORKING ? "working" : idle <= IDLE ? "idle" : "done";
  return (
    <motion.div
      className={`session ${state}`}
      style={{ "--brand": tool.color } as React.CSSProperties}
      layout
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: Math.min(i, 12) * 0.03 }}
    >
      <div className="session-icon">
        {tool.icon}
        {(state === "working" || state === "loaded") && (
          <motion.span
            className="session-pulse"
            animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
          />
        )}
      </div>
      <div className="session-main">
        <div className="session-top">
          <span className="model-chip">{s.model ?? "unknown model"}</span>
          {s.effort && <span className="effort-chip">{s.effort}</span>}
          {s.subagent && <span className="effort-chip sub">subagent</span>}
          <strong>{s.project ?? tool.name}</strong>
        </div>
        <small>
          {tool.name}
          {s.client && s.client !== tool.name ? ` · ${s.client}` : ""}
          {s.branch ? ` · ⎇ ${s.branch}` : ""}
          {kilo(s.contextTokens) ? ` · ${kilo(s.contextTokens)} ${s.tool === "ollama" ? "ctx window" : "ctx"}` : ""}
          {kilo(s.totalTokens) ? ` · ${kilo(s.totalTokens)} tokens total` : ""}
          {s.sizeBytes ? ` · ${(s.sizeBytes / 1e9).toFixed(1)} GB in memory` : ""}
        </small>
      </div>
      <span className={`session-state ${state}`}>{state === "loaded" ? "loaded" : ago(idle)}</span>
    </motion.div>
  );
}

export default function SessionsPanel({ sessions, loading }: { sessions: Session[]; loading: boolean }) {
  const [showEarlier, setShowEarlier] = useState(false);
  const now = Date.now() / 1000;

  const live = sessions.filter((s) => s.tool === "ollama" || now - s.lastActive <= IDLE);
  const earlier = sessions.filter((s) => s.tool !== "ollama" && now - s.lastActive > IDLE);
  const working = live.filter((s) => s.tool !== "ollama" && now - s.lastActive <= WORKING).length;

  // Models in use right now, busiest first.
  const models = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of live) if (s.model) m.set(s.model, (m.get(s.model) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [live]);

  return (
    <div className="sessions">
      <div className="sessions-summary">
        <div className="stat">
          <b>{working}</b>
          <span>working now</span>
        </div>
        <div className="stat">
          <b>{live.length - working}</b>
          <span>idle / loaded</span>
        </div>
        <div className="stat">
          <b>{sessions.length}</b>
          <span>last 24 h</span>
        </div>
        <div className="models-in-use">
          {models.map(([m, n]) => (
            <motion.span key={m} className="model-chip big" layout initial={{ scale: 0.7 }} animate={{ scale: 1 }}>
              {m} <i>×{n}</i>
            </motion.span>
          ))}
          {models.length === 0 && <span className="cal-empty">{loading ? "Scanning…" : "No models active in the last 15 min."}</span>}
        </div>
      </div>

      <h4 className="sessions-h">Active · last 15 min</h4>
      <AnimatePresence>
        {live.map((s, i) => (
          <Row key={s.id} s={s} now={now} i={i} />
        ))}
      </AnimatePresence>
      {live.length === 0 && !loading && <p className="cal-empty">Nothing running right now.</p>}

      <button className="sessions-h toggle" onClick={() => setShowEarlier((v) => !v)}>
        {showEarlier ? "▾" : "▸"} Earlier today · {earlier.length}
      </button>
      <AnimatePresence>
        {showEarlier &&
          earlier.slice(0, 60).map((s, i) => <Row key={s.id} s={s} now={now} i={i} />)}
      </AnimatePresence>
    </div>
  );
}
