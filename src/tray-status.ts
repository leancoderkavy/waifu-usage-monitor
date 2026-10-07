import type { Report } from "./types";

export type TrayStatus = "standby" | "working" | "warning" | "sign-in" | "rate-limited";

/** A tray mark is a summary of readings we actually have, not an invented limit. */
export function trayStatusFor(reports: Pick<Report, "ok" | "error" | "meters">[], warnAt: number): TrayStatus {
  const errors = reports.filter((report) => !report.ok).map((report) => report.error ?? "");
  if (errors.some((message) => /token_revoked|invalid_grant|saved login|sign in to this account|\b401\b/i.test(message))) {
    return "sign-in";
  }
  if (errors.some((message) => /\b429\b|rate.limit|too many requests/i.test(message))) {
    return "rate-limited";
  }
  const low = reports.some((report) => report.ok && report.meters.some((meter) =>
    (meter.unit === "percent" || (meter.limit ?? 0) > 0) && 100 - meter.usedPercent <= warnAt,
  ));
  return low ? "warning" : "standby";
}
