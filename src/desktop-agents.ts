/** Distance along the screen border, walking direction, and a deterministic RNG for idle stops. */
export interface Walker { s: number; dir: 1 | -1; speed: number; pause: number; rng: number }
/** Foot point in window pixels, and rotation in degrees so the feet press against the nearest edge. */
export interface Pose { x: number; y: number; angle: number }

export function desktopSquad<T extends { id: string; tool: string; lastActive: number }>(sessions: T[], now: number): T[] {
  const seen = new Set<string>();
  return [...sessions].filter(s => (s.tool === "codex" || s.tool === "claude") && Number.isFinite(s.lastActive) && now - s.lastActive <= 900)
    .sort((a, b) => b.lastActive - a.lastActive || a.id.localeCompare(b.id))
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

function random(state: number): [number, number] {
  const next = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return [next / 4294967296, next];
}

export function seedWalker(id: string, width: number, height: number): Walker {
  const value = hash(id);
  return { s: (value % 9973) / 9973 * perimeter(width, height), dir: value & 1 ? 1 : -1,
    speed: 30 + value % 14, pause: 0, rng: value || 1 };
}

/** Walks the loop, sometimes stopping to look around or turning back. */
export function advanceWalker(w: Walker, seconds: number, width: number, height: number): Walker {
  const dt = Math.max(0, Math.min(1, seconds));
  const total = perimeter(width, height);
  if (dt === 0 || total <= 0) return { ...w, s: total > 0 ? ((w.s % total) + total) % total : 0 };
  if (w.pause > 0) return { ...w, pause: Math.max(0, w.pause - dt) };
  let [roll, rng] = random(w.rng);
  let { dir, pause } = w;
  if (roll < 0.06 * dt) {
    let length;
    [length, rng] = random(rng);
    pause = 1.2 + length * 2.4;
  } else if (roll < 0.09 * dt) dir = dir === 1 ? -1 : 1;
  const s = (((w.s + dir * w.speed * dt) % total) + total) % total;
  return { s, dir, speed: w.speed, pause, rng };
}
