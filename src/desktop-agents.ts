export interface Walker { x: number; y: number; vx: number; vy: number }

export function desktopSquad<T extends { id: string; tool: string; lastActive: number }>(sessions: T[], now: number): T[] {
  const seen = new Set<string>();
  return [...sessions].filter(s => (s.tool === "codex" || s.tool === "claude") && Number.isFinite(s.lastActive) && now - s.lastActive <= 900)
    .sort((a, b) => b.lastActive - a.lastActive || a.id.localeCompare(b.id))
    .filter(s => !seen.has(s.id) && !!seen.add(s.id)).slice(0, 12);
}

export function seedWalker(id: string, width: number, height: number): Walker {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return { x: (hash % 997) / 997 * Math.max(0, width), y: ((hash >>> 10) % 991) / 991 * Math.max(0, height),
    vx: (hash & 1 ? 1 : -1) * (22 + hash % 18), vy: (hash & 2 ? 1 : -1) * (12 + hash % 12) };
}

export function advanceWalker(w: Walker, seconds: number, width: number, height: number): Walker {
  const dt = Math.max(0, Math.min(1, seconds));
  const maxX = Math.max(0, width), maxY = Math.max(0, height);
  const x = Math.min(maxX, Math.max(0, w.x + w.vx * dt));
  const y = Math.min(maxY, Math.max(0, w.y + w.vy * dt));
  return { x, y, vx: x <= 0 ? Math.abs(w.vx) : x >= maxX ? -Math.abs(w.vx) : w.vx,
    vy: y <= 0 ? Math.abs(w.vy) : y >= maxY ? -Math.abs(w.vy) : w.vy };
}
