import type { Report, Settings } from "./types";

/**
 * What a status line is about, coarse enough that small drifts between checks
 * don't count: each meter's level plus which 10% band it sits in, and errors.
 * Same key as last time means a new line would say nothing new.
 */
export function statusKey(reports: Report[], s: Settings): string {
  const parts: string[] = [];
  for (const r of reports) {
    if (!r.ok) {
      parts.push(`${r.accountId}:error`);
      continue;
    }
    for (const m of r.meters.filter((m) => m.unit === "percent" || (m.limit ?? 0) > 0)) {
      const left = Math.max(0, 100 - m.usedPercent);
      const tag = left <= s.criticalAt ? "c" : left <= s.warnAt ? "w" : "ok";
      parts.push(`${r.accountId}|${m.key}|${tag}|${Math.floor(left / 10)}|${m.resetsAt ?? ""}`);
    }
    if (r.bank?.available) parts.push(`${r.accountId}:bank${r.bank.available}`);
  }
  return parts.sort().join(";");
}
