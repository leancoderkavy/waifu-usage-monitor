import { PROVIDERS, type Account, type Meter, type Mood, type Report, type Session, type Settings, type SystemStats } from "./types";

export const remaining = (m: Meter) => Math.max(0, 100 - m.usedPercent);

/** Reports without the meters the user hid on each card. */
export function withoutHidden(reports: Report[], accounts: Account[]): Report[] {
  const hidden = new Map(accounts.map((a) => [a.id, new Set(a.hiddenMeters ?? [])]));
  return reports.map((r) => {
    const h = hidden.get(r.accountId);
    return h?.size ? { ...r, meters: r.meters.filter((m) => !h.has(m.key)) } : r;
  });
}

/** A meter only counts toward her mood when it has a real limit behind it. */
const hasLimit = (m: Meter) => m.unit === "percent" || (m.limit ?? 0) > 0;

export function formatReset(resetsAt?: number | null): string | null {
  if (!resetsAt) return null;
  const secs = resetsAt - Date.now() / 1000;
  if (secs <= 0) return "resetting now";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

export interface Worst {
  report: Report;
  meter: Meter;
  left: number;
}

export function worstMeter(reports: Report[]): Worst | null {
  let worst: Worst | null = null;
  for (const report of reports) {
    if (!report.ok) continue;
    for (const meter of report.meters) {
      if (!hasLimit(meter)) continue;
      const left = remaining(meter);
      if (!worst || left < worst.left) worst = { report, meter, left };
    }
  }
  return worst;
}

export function moodFor(reports: Report[], s: Settings): Mood {
  if (reports.length === 0) return "calm";
  const worst = worstMeter(reports);
  const anyError = reports.some((r) => !r.ok);
  if (!worst) return anyError ? "pouty" : "calm";
  if (worst.left <= s.criticalAt) return "panic";
  if (worst.left <= s.warnAt) return "worried";
  if (anyError) return "pouty";
  if (worst.left >= 70) return "happy";
  return "calm";
}

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

const name = (r: Report) => r.label || PROVIDERS[r.provider].short;

/** Plain fact about one meter. Also the grounding text for the LLM. */
export function describe(r: Report, m: Meter): string {
  const left = Math.round(remaining(m));
  const reset = formatReset(m.resetsAt);
  return `${name(r)} ${m.label} at ${left}% remaining${reset ? `, restores in ${reset}` : ""}`;
}

/** The line she says right after a refresh. */
export function summaryLine(reports: Report[], s: Settings): string {
  const t = s.userTitle;
  if (reports.length === 0) {
    return `${s.waifuName} online. No accounts registered, ${t}. Add an account and I will begin monitoring.`;
  }
  const mood = moodFor(reports, s);
  const worst = worstMeter(reports);
  const broken = reports.filter((r) => !r.ok);

  if (!worst) {
    return broken.length
      ? `Unable to establish a link with ${broken.map(name).join(", ")}. Please verify the credentials.`
      : "All systems nominal. No limits are currently in effect.";
  }
  const detail = describe(worst.report, worst.meter);
  switch (mood) {
    case "panic":
      return pick([
        `Warning. ${detail}. Reserve depletion is imminent. I recommend switching accounts, ${t}.`,
        `Alert. ${detail}. Continuing at this rate will exhaust the limit.`,
      ]);
    case "worried":
      return pick([
        `Caution, ${t}. ${detail}. I recommend conserving large requests.`,
        `Reserve level is declining. ${detail}. Monitoring closely.`,
      ]);
    case "pouty":
      return `Link failure with ${broken.map(name).join(", ")}. All other systems nominal.`;
    case "happy":
      return pick([
        `All reserves nominal. Lowest reading: ${detail}. You may proceed, ${t}.`,
        `Status green across all accounts. Lowest: ${detail}.`,
        `Sufficient capacity confirmed. ${detail}. ...I will be here if you need me.`,
      ]);
    default:
      return pick([`Status report. Tightest reserve: ${detail}.`, `Observation continuing. ${detail}.`]);
  }
}

/** Lines for clicking her or idle chatter. Walks through every meter. */
export function chatterLines(reports: Report[], s: Settings): string[] {
  const lines: string[] = [];
  for (const r of reports) {
    if (!r.ok) {
      lines.push(`${name(r)} reports an error: ${r.error?.slice(0, 90) ?? "unknown"}`);
      continue;
    }
    for (const m of r.meters) {
      if (hasLimit(m)) lines.push(`${describe(r, m)}.`);
    }
    if (r.bank && r.bank.available > 0) {
      lines.push(`${name(r)} holds ${r.bank.available} banked reset${r.bank.available > 1 ? "s" : ""}. Use them wisely, ${s.userTitle}.`);
    }
    if (r.note) lines.push(`${name(r)}: ${r.note}`);
  }
  lines.push(
    `I am ${s.waifuName}. My directive is to monitor your usage limits, ${s.userTitle}.`,
    "Hydration levels unknown. I recommend drinking water.",
    "...I believe the appropriate expression here is a smile.",
  );
  return lines;
}

/** What she says about running sessions. */
export function sessionLine(sessions: Session[]): string | null {
  const now = Date.now() / 1000;
  const working = sessions.filter((s) => s.tool !== "ollama" && now - s.lastActive <= 120);
  if (working.length === 0) return null;
  const counts = new Map<string, number>();
  for (const s of working) if (s.model) counts.set(s.model, (counts.get(s.model) ?? 0) + 1);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const projects = new Set(working.map((s) => s.project).filter(Boolean)).size;
  return `${working.length} session${working.length > 1 ? "s" : ""} active across ${projects} project${projects === 1 ? "" : "s"}.${
    top ? ` Primary model: ${top[0]}.` : ""
  }`;
}

/** A hardware remark when something is running hot or full. */
export function hardwareLine(s: SystemStats | null): string | null {
  if (!s) return null;
  const g = s.gpus[0];
  const ram = Math.round((s.memUsedGb / s.memTotalGb) * 100);
  if (g?.tempC && g.tempC >= 83) return `Thermal warning. GPU core at ${g.tempC}°C. I recommend checking your cooling.`;
  if (ram >= 90) return `Memory pressure high: ${ram}% of RAM in use. Closing idle sessions would help.`;
  if (g && g.load >= 95) return `GPU at ${Math.round(g.load)}% load, ${g.tempC ?? "?"}°C. The local models are working hard.`;
  return `Systems check: CPU ${Math.round(s.cpu)}%, RAM ${ram}%${g ? `, GPU ${Math.round(g.load)}%` : ""}. All within tolerance.`;
}

export const PET_LINES = [
  "Physical contact detected. No damage sustained.",
  "...Is there a problem?",
  "I do not understand the purpose of that action. ...But I do not dislike it.",
  "That is not an efficient use of your time.",
  "Acknowledged.",
];

export function alertLine(r: Report, m: Meter, critical: boolean): string {
  return critical ? `Warning. ${describe(r, m)}. Reserve nearly depleted.` : `Caution. ${describe(r, m)}.`;
}

/**
 * Everything the LLM may say, as plain facts, most urgent first with a status tag.
 * Thresholds stay out: small models read them as readings. The Rust side rejects
 * any number in the reply that isn't in here.
 */
export function llmFacts(reports: Report[], s: Settings): string {
  const rows: { left: number; line: string }[] = [];
  const errors: string[] = [];
  for (const r of reports) {
    if (!r.ok) {
      errors.push(`[ERROR] ${name(r)}: cannot connect.`);
      continue;
    }
    for (const m of r.meters.filter(hasLimit)) {
      const left = remaining(m);
      const tag = left <= s.criticalAt ? "CRITICAL" : left <= s.warnAt ? "LOW" : "OK";
      rows.push({ left, line: `[${tag}] ${describe(r, m)}.` });
    }
    if (r.bank?.available) rows.push({ left: 101, line: `[INFO] ${name(r)} has ${r.bank.available} banked resets.` });
  }
  rows.sort((a, b) => a.left - b.left);
  const lines = [...rows.map((x) => x.line), ...errors];
  return ["Status, most urgent first:", ...lines, "Report the first line, and the second too if it is also CRITICAL or LOW."].join("\n");
}

export function llmSystem(s: Settings): string {
  return [
    `You are ${s.waifuName}, the combat android from Xenosaga, now monitoring AI usage limits for ${s.userTitle}.`,
    "Speak calmly and formally, like a precise android. Short sentences. Rare hints of warmth.",
    "Reply with 1-2 sentences, under 40 words.",
    "Copy account names, percentages and times exactly from the status list. Never invent, round or combine numbers.",
    "No emoji, no stage directions, no quotes. Never mention the list, lines, items or tags; just state the facts.",
    `Example: "Warning. Cursor Included usage is at 0% remaining. It restores in 19d 6h. I recommend switching accounts, ${s.userTitle}."`,
  ].join(" ");
}
