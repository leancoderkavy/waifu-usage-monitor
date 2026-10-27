import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "./types";
import { advanceWalker, desktopSquad, seedWalker, type Walker } from "./desktop-agents";
import "./DesktopAgents.css";

function Figure({ session, resting }: { session: Session; resting: boolean }) {
  const node = useRef<HTMLDivElement>(null);
  const walker = useRef<Walker | null>(null);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, previous = 0;
    const draw = (time: number) => {
      const width = Math.max(0, innerWidth - 144), height = Math.max(0, innerHeight - 170);
      walker.current ??= seedWalker(session.id, width, height);
      if (time - previous >= 1000 / 30) {
        const dt = previous ? (time - previous) / 1000 : 0;
        walker.current = advanceWalker(walker.current, motion.matches || resting ? 0 : dt, width, height);
        previous = time;
        const { x, y, vx } = walker.current;
        if (node.current) {
          node.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          node.current.style.setProperty("--facing", vx < 0 ? "-1" : "1");
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [session.id, resting]);
  const claude = session.tool === "claude";
  return <div ref={node} className={`desktop-agent ${claude ? "claude" : "codex"}${resting ? " resting" : ""}`}>
    <div className="agent-figure" aria-hidden="true">
      <span className="agent-shadow" />
      <span className="agent-leg left" /><span className="agent-leg right" />
      <span className="agent-arm left" /><span className="agent-arm right" />
      <span className="agent-body"><b>{claude ? "✺" : "✦"}</b></span>
      <img className="agent-head" src={`/waifus/${claude ? "sakura" : "yuki"}/avatar.png`} alt="" draggable={false} />
    </div>
    <div className="agent-caption"><strong>{session.project || session.tool}{session.subagent ? " · sub" : ""}</strong>
      <small>{claude ? "Claude" : "Codex"} · {resting ? "resting" : "recent activity"}</small>
      <small>{session.model || "Model unknown"}</small></div>
  </div>;
}

/** Native window ignores cursor events, including over the figures themselves. */
export default function DesktopAgents() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => {
    document.documentElement.classList.add("desktop-agents-window");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const scan = async () => {
      try {
        const result = await invoke<Session[]>("list_sessions");
        if (!cancelled) setSessions(result);
      } catch {
        // Failed observations must not leave stale agents walking indefinitely.
        if (!cancelled) setSessions([]);
      }
      if (!cancelled) { setNow(Date.now() / 1000); timer = setTimeout(scan, 10_000); }
    };
    void scan();
    return () => { cancelled = true; clearTimeout(timer); document.documentElement.classList.remove("desktop-agents-window"); };
  }, []);
  return <div className="desktop-agent-world" aria-label="Desktop agents, activity inferred from local session logs">
    {desktopSquad(sessions, now).map(s => <Figure key={s.id} session={s} resting={now - s.lastActive > 120} />)}
  </div>;
}
