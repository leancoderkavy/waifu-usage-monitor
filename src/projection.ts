import type { Meter } from "./types";

/**
 * When the meter hits 100% if usage keeps the average pace of the current window.
 * Null when it won't run out before the reset, or there is too little data to say.
 */
export function runsOutAt(m: Meter, now = Date.now() / 1000): number | null {
  if (!m.resetsAt || !m.windowSecs || m.usedPercent < 5 || m.usedPercent >= 100) return null;
  const elapsed = now - (m.resetsAt - m.windowSecs);
  // The first tenth of a window is too noisy to extrapolate from.
  if (elapsed < m.windowSecs * 0.1) return null;
  const out = now + ((100 - m.usedPercent) / m.usedPercent) * elapsed;
  return out < m.resetsAt ? out : null;
}
