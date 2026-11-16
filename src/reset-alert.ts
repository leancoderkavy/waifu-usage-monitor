import type { Report } from "./types";

/** A meter's next reset the app is waiting on. `at` is unix seconds. */
export interface PendingReset {
  at: number;
  account: string;
  meter: string;
}

export type PendingResets = Record<string, PendingReset>;

/** Past this long after the reset time we assume the app was off and stay quiet. */
const STALE_SECS = 6 * 3600;

/**
 * Records each meter's upcoming reset from a fresh refresh. A meter whose reset
 * time moved forward replaces its entry, so a reset the app never saw due still
 * gets announced by `takeDueResets` on the next tick.
 */
export function trackResets(pending: PendingResets, reports: Report[]): PendingResets {
  const next: PendingResets = { ...pending };
  for (const r of reports) {
    if (!r.ok) continue;
    for (const m of r.meters) {
      if (!m.resetsAt) continue;
      const key = `${r.accountId}|${m.key}`;
      const prev = next[key];
      // Keep the earlier time when the provider's value only jitters by a minute or so.
      if (prev && prev.at > Date.now() / 1000 && Math.abs(prev.at - m.resetsAt) < 120) continue;
      next[key] = { at: m.resetsAt, account: r.label, meter: m.label };
    }
  }
  return next;
}

/** Splits off resets whose time has arrived; fresh ones are returned to announce. */
export function takeDueResets(pending: PendingResets, nowSecs: number): { due: PendingReset[]; pending: PendingResets } {
  const due: PendingReset[] = [];
  const rest: PendingResets = {};
  for (const [key, p] of Object.entries(pending)) {
    if (p.at > nowSecs) rest[key] = p;
    else if (nowSecs - p.at < STALE_SECS) due.push(p);
  }
  return { due, pending: rest };
}

/** Collapses several resets landing together into one line. */
export function resetText(due: PendingReset[], title: string): string {
  if (due.length === 1) return `${due[0].account} · ${due[0].meter} just reset, ${title}. Fresh allowance.`;
  const names = [...new Set(due.map((d) => d.account))];
  return `${due.length} limits just reset (${names.join(", ")}), ${title}. Fresh allowance.`;
}

/** Short two-note chime. Needs no audio file; silently skipped if audio is blocked. */
export function ding() {
  try {
    const ctx = new AudioContext();
    const t = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.16);
      osc.stop(t + i * 0.16 + 1);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* audio is optional */
  }
}
