/** Distance along the screen border, walking direction, and whether the companion has stopped. */
export interface Stride { s: number; dir: 1 | -1; idle: boolean }
export type Edge = "bottom" | "right" | "top" | "left";
/** Overlay strip thickness in CSS pixels; must match `STRIP` in src-tauri/src/desktop_agents.rs. */
export const STRIP = 200;
/** Foot point in window pixels, and rotation in degrees so the feet press against the nearest edge. */
export interface Pose { x: number; y: number; angle: number }

export interface Waiting { kind: string; summary: string; since: number }
/** A tool call with no result yet looks like a permission prompt only after this long; most tools finish sooner. */
export const APPROVAL_AFTER = 90;
/** A companion waiting on you stays on screen this long after the agent went quiet. */
export const WAIT_WINDOW = 2 * 3600;

type Seen = { id: string; tool: string; lastActive: number; subagent?: boolean; attention?: Waiting | null };

/** What the session is waiting on you for, if anything. Subagents report to their parent, not to you. */
export function waitingOn(session: Seen, now: number): Waiting | null {
  const a = session.attention;
  if (!a || session.subagent || !Number.isFinite(a.since) || now - a.since > WAIT_WINDOW) return null;
  if (a.kind === "approval" && now - a.since < APPROVAL_AFTER) return null;
  return a;
}

/** Recent sessions, plus older ones still waiting on you; those come first so they always get a figure. */
export function desktopSquad<T extends Seen>(sessions: T[], now: number): T[] {
  const seen = new Set<string>();
  const waits = (s: T) => waitingOn(s, now) ? 0 : 1;
  return [...sessions].filter(s => (s.tool === "codex" || s.tool === "claude") && Number.isFinite(s.lastActive)
      && (now - s.lastActive <= 900 || waits(s) === 0))
    .sort((a, b) => waits(a) - waits(b) || b.lastActive - a.lastActive || a.id.localeCompare(b.id))
    .filter(s => !seen.has(s.id) && !!seen.add(s.id)).slice(0, 12);
}

const CORNER = 36;

function corner(width: number, height: number) {
  return Math.max(0, Math.min(CORNER, width / 2, height / 2));
}

/** Rounded-rectangle loop: bottom (left→right), right wall (up), top (right→left), left wall (down). */
export function perimeter(width: number, height: number): number {
  const w = Math.max(0, width), h = Math.max(0, height), r = corner(w, h);
  return 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
}

export function poseAt(distance: number, width: number, height: number): Pose {
  const w = Math.max(0, width), h = Math.max(0, height), r = corner(w, h);
  const total = perimeter(w, h);
  if (total <= 0) return { x: 0, y: 0, angle: 0 };
  let s = ((distance % total) + total) % total;
  const arc = Math.PI * r / 2;
  // [length, start x, start y, dx, dy, angle] for straights; arcs carry their centre.
  const straights: [number, number, number, number, number, number][] = [
    [w - 2 * r, r, h, 1, 0, 0], [h - 2 * r, w, h - r, 0, -1, -90],
    [w - 2 * r, w - r, 0, -1, 0, -180], [h - 2 * r, 0, r, 0, 1, -270],
  ];
  const centres: [number, number][] = [[w - r, h - r], [w - r, r], [r, r], [r, h - r]];
  for (let i = 0; i < 4; i++) {
    const [length, x, y, dx, dy, angle] = straights[i];
    if (s <= length) return { x: x + dx * s, y: y + dy * s, angle };
    s -= length;
    if (s <= arc || i === 3) {
      const t = arc > 0 ? Math.min(1, s / arc) : 1;
      const a = angle - 90 * t, rad = a * Math.PI / 180;
      // A figure rotated by `a` has its feet pointing along (-sin a, cos a).
      return { x: centres[i][0] - Math.sin(rad) * r, y: centres[i][1] + Math.cos(rad) * r, angle: a };
    }
    s -= arc;
  }
  return { x: r, y: h, angle: 0 };
}

function hash(id: string) {
  let value = 2166136261;
  for (const char of id) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value;
}

/**
 * Where a companion is at a given clock time. Each one repeats its own loop: walk on,
 * stop to look around, walk back a little, stop again. Being a pure function of the
 * clock keeps the separate edge windows in agreement without talking to each other.
 */
export function strideAt(id: string, seconds: number, width: number, height: number, pace = 1): Stride {
  const total = perimeter(width, height);
  if (total <= 0) return { s: 0, dir: 1, idle: true };
  const v = hash(id);
  const speed = (30 + v % 14) * pace;
  const on = 14 + (v >>> 3) % 12, back = 4 + (v >>> 7) % 6;
  const rest = 1.5 + (v >>> 11) % 20 / 10, pause = 1 + (v >>> 15) % 15 / 10;
  const loop = on + rest + back + pause;
  const sign = v & 1 ? 1 : -1;
  // Measured from a recent epoch so long uptimes keep full float precision.
  const t = Math.max(0, seconds - 1.7e9) + (v >>> 19) % 1000 / 1000 * loop;
  const cycles = Math.floor(t / loop), r = t - cycles * loop;
  let walked: number, dir: 1 | -1 = sign, idle = false;
  if (r < on) walked = r;
  else if (r < on + rest) { walked = on; idle = true; }
  else if (r < on + rest + back) { walked = on - (r - on - rest); dir = sign === 1 ? -1 : 1; }
  else { walked = on - back; idle = true; }
  const start = (v % 9973) / 9973 * total;
  const travelled = ((cycles * (on - back) + walked) * speed) % total;
  return { s: (((start + sign * travelled) % total) + total) % total, dir, idle };
}

/** Spacing of the spots on the floor where waiting companions stand, wide enough for a speech bubble. */
export const SPOT = 236;

/**
 * Where on the bottom edge (as a border distance) each waiting companion stands, right to left
 * from near the tray. `ids` is in priority order; each keeps a hashed spot unless taken, so one
 * companion leaving does not shuffle the others.
 */
export function callSpots(ids: string[], width: number, height: number): Map<string, number> {
  const r = corner(width, height), floor = Math.max(0, width - 2 * r);
  const slots = Math.max(1, Math.floor((floor - 150) / SPOT) + 1);
  const taken = new Set<number>(), spots = new Map<string, number>();
  for (const id of ids) {
    let slot = hash(id) % slots;
    for (let i = 0; i < slots && taken.has(slot); i++) slot = (slot + 1) % slots;
    taken.add(slot);
    spots.set(id, Math.max(0, floor - 150 - slot * SPOT));
  }
  return spots;
}

/** Running from `from` to `to` the short way round the border, easing in to land. */
export function dashAt(from: number, to: number, total: number, elapsed: number): Stride & { arrived: number } {
  if (total <= 0) return { s: 0, dir: 1, idle: true, arrived: 0 };
  const forward = (((to - from) % total) + total) % total, dist = Math.min(forward, total - forward);
  const dir: 1 | -1 = forward <= total - forward ? 1 : -1;
  const duration = Math.min(9, Math.max(1.2, dist / 240));
  const p = Math.min(1, Math.max(0, elapsed / duration)), eased = 1 - (1 - p) * (1 - p);
  return { s: (((from + dir * dist * eased) % total) + total) % total, dir, idle: p >= 1, arrived: p >= 1 ? elapsed - duration : -1 };
}

/** Which strip draws a companion: each edge owns its straight run and the nearer half of each corner. */
export function edgeAt(distance: number, width: number, height: number): Edge {
  const w = Math.max(0, width), h = Math.max(0, height), r = corner(w, h);
  const total = perimeter(w, h);
  const s = total > 0 ? ((distance % total) + total) % total : 0;
  const arc = Math.PI * r / 2, across = w - 2 * r, up = h - 2 * r;
  const ends = [across + arc / 2, across + arc + up + arc / 2, 2 * across + 2 * arc + up + arc / 2, total - arc / 2];
  return s < ends[0] || s >= ends[3] ? "bottom" : s < ends[1] ? "right" : s < ends[2] ? "top" : "left";
}

/** Top-left corner of an edge's strip within the work area. */
export function stripOrigin(edge: Edge, width: number, height: number): [number, number] {
  return edge === "bottom" ? [0, Math.max(0, height - STRIP)] : edge === "right" ? [Math.max(0, width - STRIP), 0] : [0, 0];
}
