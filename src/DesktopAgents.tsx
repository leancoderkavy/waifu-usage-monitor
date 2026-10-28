import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "./types";
import { desktopSquad, edgeAt, poseAt, strideAt, stripOrigin, type Edge } from "./desktop-agents";
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

/** Movement and limb poses update this often; DesktopAgents.css has no animations of its own. */
const FPS = 15;
/** The island bar (src-tauri/src/lib.rs `set_island_expanded`): companions on the top edge pass behind it. */
const ISLAND = { width: 860, height: 54 };

type Mode = "walk" | "idle" | "still" | "asleep";

/** Limb pose custom properties for one tick: a walk cycle, an idle look-around and wave, or a doze. */
export function pose(id: string, clock: number, mode: Mode): [string, string][] {
  let offset = 0;
  for (const char of id) offset = (offset * 31 + char.charCodeAt(0)) % 997;
  const t = clock + offset / 97, turn = Math.PI * 2;
  const eye = (t % 4.2) < 0.15 ? "0.1" : "1";
  const set = (swing: number, bob: number, nod: number, wave: number, eyes: string, doze = 0): [string, string][] => [
    ["--swing", swing.toFixed(1)], ["--bob", bob.toFixed(1)], ["--nod", nod.toFixed(1)],
    ["--wave", wave.toFixed(0)], ["--eye", eyes], ["--doze", doze.toFixed(2)],
  ];
  if (mode === "asleep") return set(0, 0, -10, 0, "0.12", (t / 2.4) % 1);
  if (mode === "still") return set(0, 0, 0, 0, eye);
  if (mode === "idle") return set(0, -0.5 + 0.5 * Math.sin(t * 4), 9 * Math.sin(t * turn / 2.4), 167 + 17 * Math.sin(t * turn), eye);
  const phase = t * turn / 0.64;
  return set(22 * Math.sin(phase), -1.5 * Math.abs(Math.sin(phase)), 2.5 * Math.sin(phase), 0, eye);
}

/**
 * One strip per screen edge (src-tauri/src/desktop_agents.rs). Every strip computes the
 * whole squad from the clock but only draws companions currently on its own edge, so an
 * empty strip never repaints. Native windows ignore cursor events entirely.
 */
export default function DesktopAgents({ edge }: { edge: Edge }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [now, setNow] = useState(Date.now() / 1000);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const frozen = useRef(new Map<string, number>());
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
      if (!cancelled) { setNow(Date.now() / 1000); timer = setTimeout(scan, 15_000); }
    };
    void scan();
    return () => { cancelled = true; clearTimeout(timer); document.documentElement.classList.remove("desktop-agents-window"); };
  }, []);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const shown = new Map<HTMLDivElement, boolean>();
    const styled = new Map<HTMLDivElement, string>();
    const world = document.querySelector<HTMLElement>(".desktop-agent-world");
    let lastClip = "";
    // A plain timer, not requestAnimationFrame: between ticks the page has nothing to do.
    const draw = () => {
      // The strip sits inside the monitor's work area, which screen.avail* describes.
      const width = screen.availWidth, height = screen.availHeight;
      const [ox, oy] = stripOrigin(edge, width, height);
      if (world && edge === "top") {
        const left = Math.round(innerWidth / 2 - ISLAND.width / 2 - 6), right = left + ISLAND.width + 12;
        const clip = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left}px 0, ${right}px 0, ${right}px ${ISLAND.height + 2}px, ${left}px ${ISLAND.height + 2}px, ${left}px 0)`;
        if (clip !== lastClip) { lastClip = clip; world.style.clipPath = clip; }
      }
      const clock = Date.now() / 1000, still = motion.matches;
      for (const [id, node] of nodes.current) {
        // Dozing companions stay where they nodded off; reduced motion pins them in place.
        const asleep = frozen.current.get(id);
        const stride = strideAt(id, still ? 0 : asleep ?? clock, width, height);
        const here = edgeAt(stride.s, width, height) === edge;
        if (shown.get(node) !== here) {
          shown.set(node, here);
          node.style.display = here ? "" : "none";
        }
        if (!here) continue;
        const { x, y, angle } = poseAt(stride.s, width, height);
        node.style.transform = `translate(${Math.round(x - ox - 44)}px, ${Math.round(y - oy - 110)}px) rotate(${Math.round(angle)}deg)`;
        const mode = asleep != null ? "asleep" : still ? "still" : stride.idle ? "idle" : "walk";
        for (const [name, value] of pose(id, clock, mode)) node.style.setProperty(name, value);
        // These restyle the name tag too, so only write them when they change (corners, turns).
        const k = Math.abs(Math.sin(angle * Math.PI / 180)).toFixed(2);
        const props = `${Math.round(angle)}|${k}|${stride.dir}`;
        if (styled.get(node) !== props) {
          styled.set(node, props);
          node.style.setProperty("--angle", String(Math.round(angle)));
          node.style.setProperty("--k", k);
          node.style.setProperty("--facing", String(stride.dir));
        }
      }
    };
    draw();
    const timer = window.setInterval(draw, 1000 / FPS);
    return () => window.clearInterval(timer);
  }, [edge]);
  const squad = desktopSquad(sessions, now);
  const resting = squad.filter(s => now - s.lastActive > 120);
  frozen.current = new Map(resting.map(s => [s.id, s.lastActive + 120]));
  return <div className="desktop-agent-world" aria-label="Desktop agents, activity inferred from local session logs">
    {squad.map(s => <Figure key={s.id} session={s} resting={frozen.current.has(s.id)}
      mount={node => { if (node) nodes.current.set(s.id, node); else nodes.current.delete(s.id); }} />)}
  </div>;
}
