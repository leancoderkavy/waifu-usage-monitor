import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "./types";
import { callSpots, dashAt, desktopSquad, edgeAt, perimeter, poseAt, strideAt, stripOrigin, waitingOn, type Edge, type Waiting } from "./desktop-agents";
import { PERSONAS, pose, voiceLine, type Mode } from "./personas";
import Chibi, { type ChibiId } from "./components/Chibi";
import "./DesktopAgents.css";

const CAST = { claude: ["sakura", "akane"], codex: ["yuki", "luna"] } as const;

/** Claude sessions get Sakura or Akane, Codex sessions Yuki or Luna; the same session always gets the same one. */
export function castOf(session: Pick<Session, "id" | "tool">): ChibiId {
  let value = 7;
  for (const char of session.id) value = (value * 33 + char.charCodeAt(0)) % 65521;
  return CAST[session.tool === "claude" ? "claude" : "codex"][value % 2];
}

const MARK: Record<string, string> = { question: "?", approval: "!", done: "✓", stopped: "×" };
const KIND: Record<string, string> = { question: "Question", approval: "Needs approval?", done: "Ready for follow-up", stopped: "Stopped" };

function ago(seconds: number) {
  const m = Math.max(0, Math.round(seconds / 60));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

function Figure({ session, who, waiting, now, resting, mount }: {
  session: Session; who: ChibiId; waiting: Waiting | null; now: number; resting: boolean; mount: (node: HTMLDivElement | null) => void;
}) {
  const claude = session.tool === "claude";
  const name = session.project || session.tool;
  return <div ref={mount} className={`desktop-agent ${who} ${claude ? "claude" : "codex"}${resting ? " resting" : ""}`}>
    <Chibi who={who} emblem={claude ? "✺" : "✦"} />
    <div className="agent-tag">
      <i className="agent-dot" />
      <span><strong>{name}{session.subagent ? " · sub" : ""}</strong>
        <small>{session.model || (claude ? "Claude" : "Codex")}</small></span>
    </div>
    {waiting && <div className={`agent-bubble kind-${waiting.kind}`} role="status">
      <b><i aria-hidden="true">{MARK[waiting.kind] ?? "!"}</i>{voiceLine(who, waiting.kind, session.id + waiting.since)}</b>
      <p>{waiting.summary}</p>
      <small>{PERSONAS[who].name} · {KIND[waiting.kind] ?? "Waiting"} · {name} · {ago(now - waiting.since)}</small>
    </div>}
  </div>;
}

/** Movement and limb poses update this often; DesktopAgents.css has no animations of its own. */
const FPS = 15;
/** The island bar (src-tauri/src/lib.rs `set_island_expanded`): companions on the top edge pass behind it. */
const ISLAND = { width: 860, height: 54 };

interface Plan { who: ChibiId; asleep?: number; call?: { since: number; to: number } }

/**
 * One strip per screen edge (src-tauri/src/desktop_agents.rs). Every strip computes the
 * whole squad from the clock but only draws companions currently on its own edge, so an
 * empty strip never repaints. Native windows ignore cursor events entirely.
 *
 * A session waiting on you sends its companion running to a spot on the floor, where she
 * calls for you with a speech bubble summarising what the agent said.
 */
export default function DesktopAgents({ edge }: { edge: Edge }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [now, setNow] = useState(Date.now() / 1000);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const plans = useRef(new Map<string, Plan>());
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
    const poses = new Map<HTMLDivElement, string>();
    const world = document.querySelector<HTMLElement>(".desktop-agent-world");
    let lastClip = "";
    // A plain timer, not requestAnimationFrame: between ticks the page has nothing to do.
    const draw = () => {
      // The strip sits inside the monitor's work area, which screen.avail* describes.
      const width = screen.availWidth, height = screen.availHeight, total = perimeter(width, height);
      const [ox, oy] = stripOrigin(edge, width, height);
      if (world && edge === "top") {
        const left = Math.round(innerWidth / 2 - ISLAND.width / 2 - 6), right = left + ISLAND.width + 12;
        const clip = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left}px 0, ${right}px 0, ${right}px ${ISLAND.height + 2}px, ${left}px ${ISLAND.height + 2}px, ${left}px 0)`;
        if (clip !== lastClip) { lastClip = clip; world.style.clipPath = clip; }
      }
      const clock = Date.now() / 1000, still = motion.matches;
      for (const [id, node] of nodes.current) {
        const plan = plans.current.get(id);
        if (!plan) continue;
        const pace = PERSONAS[plan.who].pace;
        let stride, mode: Mode, state = "";
        if (plan.call) {
          // Run over from wherever she was when the agent started waiting; reduced motion skips the run.
          const from = strideAt(id, plan.call.since, width, height, pace).s;
          const dash = dashAt(from, plan.call.to, total, still ? Infinity : clock - plan.call.since);
          stride = dash;
          mode = dash.arrived < 0 ? "dash" : still ? "still" : "call";
          state = dash.arrived < 0 ? "dashing" : "calling";
          // The bubble pops in with a little overshoot as she lands.
          const k = Math.min(1, Math.max(0, dash.arrived) / 0.35);
          const pop = (k >= 1 ? 1 : 0.6 + 0.4 * k + 0.12 * Math.sin(k * Math.PI)).toFixed(2);
          if (node.style.getPropertyValue("--pop") !== pop) node.style.setProperty("--pop", pop);
        } else {
          // Dozing companions stay where they nodded off; reduced motion pins them in place.
          stride = strideAt(id, still ? 0 : plan.asleep ?? clock, width, height, pace);
          mode = plan.asleep != null ? "asleep" : still ? "still" : stride.idle ? "idle" : "walk";
        }
        const here = edgeAt(stride.s, width, height) === edge;
        if (shown.get(node) !== here) {
          shown.set(node, here);
          node.style.display = here ? "" : "none";
        }
        if (!here) continue;
        const { x, y, angle } = poseAt(stride.s, width, height);
        const transform = `translate(${Math.round(x - ox - 44)}px, ${Math.round(y - oy - 110)}px) rotate(${Math.round(angle)}deg)`;
        if (node.style.transform !== transform) node.style.transform = transform;
        // Unchanged poses (standing, waiting, dozing between z's) skip the style write and the repaint.
        const posed = pose(plan.who, id, clock, mode);
        const key = posed.map(([, value]) => value).join("|");
        if (poses.get(node) !== key) {
          poses.set(node, key);
          for (const [name, value] of posed) node.style.setProperty(name, value);
        }
        // These restyle the name tag and bubble too, so only write them when they change (corners, turns, arrivals).
        const k = Math.abs(Math.sin(angle * Math.PI / 180)).toFixed(2);
        const props = `${Math.round(angle)}|${k}|${stride.dir}|${state}`;
        if (styled.get(node) !== props) {
          styled.set(node, props);
          node.style.setProperty("--angle", String(Math.round(angle)));
          node.style.setProperty("--k", k);
          node.style.setProperty("--facing", String(stride.dir));
          node.classList.toggle("dashing", state === "dashing");
          node.classList.toggle("calling", state === "calling");
        }
      }
    };
    draw();
    const timer = window.setInterval(draw, 1000 / FPS);
    return () => window.clearInterval(timer);
  }, [edge]);
  const squad = desktopSquad(sessions, now);
  const waiting = new Map(squad.flatMap(s => { const w = waitingOn(s, now); return w ? [[s.id, w] as const] : []; }));
  const order = [...waiting].sort((a, b) => a[1].since - b[1].since || a[0].localeCompare(b[0])).map(([id]) => id);
  const spots = callSpots(order, screen.availWidth, screen.availHeight);
  plans.current = new Map(squad.map(s => {
    const w = waiting.get(s.id);
    const plan: Plan = { who: castOf(s) };
    if (w) plan.call = { since: w.since, to: spots.get(s.id) ?? 0 };
    else if (now - s.lastActive > 120) plan.asleep = s.lastActive + 120;
    return [s.id, plan];
  }));
  return <div className="desktop-agent-world" aria-label="Desktop agents, activity inferred from local session logs">
    {squad.map(s => {
      const plan = plans.current.get(s.id)!;
      return <Figure key={s.id} session={s} who={plan.who} waiting={waiting.get(s.id) ?? null} now={now} resting={plan.asleep != null}
        mount={node => { if (node) nodes.current.set(s.id, node); else nodes.current.delete(s.id); }} />;
    })}
  </div>;
}
