import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "./types";
import { advanceWalker, desktopSquad, poseAt, seedWalker, type Walker } from "./desktop-agents";
import Chibi from "./components/Chibi";
import "./DesktopAgents.css";

const CAST = { claude: ["sakura", "akane"], codex: ["yuki", "luna"] } as const;

function Figure({ session, resting, mount }: { session: Session; resting: boolean; mount: (node: HTMLDivElement | null) => void }) {
  const claude = session.tool === "claude";
  return <div ref={mount} className={`desktop-agent ${claude ? "claude" : "codex"}${resting ? " resting" : ""}`}>
    <Chibi who={CAST[claude ? "claude" : "codex"][session.subagent ? 1 : 0]} emblem={claude ? "✺" : "✦"} />
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
          node.style.transform = `translate3d(${x - 44}px, ${y - 110}px, 0) rotate(${angle}deg)`;
          node.style.setProperty("--angle", String(angle));
          // Upright tags are wide, so on the walls they need extra room to clear the head.
          node.style.setProperty("--tag-push", `${Math.abs(Math.sin(angle * Math.PI / 180)) * 52}px`);
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
