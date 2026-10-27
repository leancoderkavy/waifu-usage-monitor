import { useEffect, useId, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "./types";
import { advanceWalker, desktopSquad, poseAt, seedWalker, type Walker } from "./desktop-agents";
import "./DesktopAgents.css";

const AVATARS = { claude: ["sakura", "akane"], codex: ["yuki", "luna"] } as const;

function Figure({ session, resting, mount }: { session: Session; resting: boolean; mount: (node: HTMLDivElement | null) => void }) {
  const clip = useId();
  const claude = session.tool === "claude";
  const avatar = AVATARS[claude ? "claude" : "codex"][session.subagent ? 1 : 0];
  return <div ref={mount} className={`desktop-agent ${claude ? "claude" : "codex"}${resting ? " resting" : ""}`}>
    <svg className="agent-art" viewBox="0 0 72 96" aria-hidden="true">
      <defs><clipPath id={clip}><circle cx="36" cy="27" r="16" /></clipPath></defs>
      <ellipse className="agent-shadow" cx="36" cy="93" rx="17" ry="3" />
      <g className="agent-bob">
        <g className="agent-leg back"><rect x="35" y="64" width="8" height="21" rx="4" /><path className="boot" d="M34 83h10a4 4 0 0 1 4 4v1H34z" /></g>
        <g className="agent-arm back"><rect x="43" y="47" width="7" height="19" rx="3.5" /><circle className="hand" cx="46.5" cy="66" r="3.2" /></g>
        <path className="agent-coat" d="M27 45q9-5 18 0l4 22q-13 5-26 0z" />
        <path className="agent-trim" d="M30 45q6 5 12 0M36 49v17" />
        <text className="agent-emblem" x="41" y="61">{claude ? "✺" : "✦"}</text>
        <g className="agent-leg front"><rect x="29" y="64" width="8" height="21" rx="4" /><path className="boot" d="M28 83h10a4 4 0 0 1 4 4v1H28z" /></g>
        <g className="agent-arm front"><rect x="22" y="47" width="7" height="19" rx="3.5" /><circle className="hand" cx="25.5" cy="66" r="3.2" /></g>
        <g className="agent-head">
          <circle className="agent-halo" cx="36" cy="27" r="18" />
          <image href={`/waifus/${avatar}/avatar.png`} x="20" y="11" width="32" height="32" clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
          {claude
            ? <path className="agent-gear" d="M36 3l2 4 4.5.5-3.3 3 .9 4.4L36 12.7l-4.1 2.2.9-4.4-3.3-3L34 7z" />
            : <g className="agent-gear"><path d="M19 28a17 17 0 0 1 34 0" fill="none" /><rect x="16" y="24" width="6" height="10" rx="3" /><rect x="50" y="24" width="6" height="10" rx="3" /></g>}
        </g>
      </g>
      <text className="agent-z" x="52" y="10">z</text>
    </svg>
    <div className="agent-tag">
      <i className="agent-dot" />
      <span><strong>{session.project || session.tool}{session.subagent ? " · sub" : ""}</strong>
        <small>{session.model || (claude ? "Claude" : "Codex")}</small></span>
    </div>
  </div>;
}

/** Native window ignores cursor events, including over the figures themselves. */
export default function DesktopAgents() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [now, setNow] = useState(Date.now() / 1000);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const walkers = useRef(new Map<string, Walker>());
  const restingIds = useRef(new Set<string>());
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
  // One animation loop for the whole squad; React only re-renders when the session list changes.
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, previous = 0;
    const draw = (time: number) => {
      if (time - previous >= 1000 / 30) {
        const dt = previous ? (time - previous) / 1000 : 0;
        previous = time;
        const width = innerWidth, height = innerHeight;
        for (const [id, node] of nodes.current) {
          const still = motion.matches || restingIds.current.has(id);
          const walker = advanceWalker(walkers.current.get(id) ?? seedWalker(id, width, height), still ? 0 : dt, width, height);
          walkers.current.set(id, walker);
          const { x, y, angle } = poseAt(walker.s, width, height);
          node.style.transform = `translate3d(${x - 36}px, ${y - 96}px, 0) rotate(${angle}deg)`;
          node.style.setProperty("--angle", String(angle));
          node.style.setProperty("--facing", String(walker.dir));
          node.classList.toggle("idle", !still && walker.pause > 0);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  const squad = desktopSquad(sessions, now);
  restingIds.current = new Set(squad.filter(s => now - s.lastActive > 120).map(s => s.id));
  // Keep positions across re-renders; forget agents that left the squad.
  for (const id of walkers.current.keys()) if (!squad.some(s => s.id === id)) walkers.current.delete(id);
  return <div className="desktop-agent-world" aria-label="Desktop agents, activity inferred from local session logs">
    {squad.map(s => <Figure key={s.id} session={s} resting={restingIds.current.has(s.id)}
      mount={node => { if (node) nodes.current.set(s.id, node); else nodes.current.delete(s.id); }} />)}
  </div>;
}
