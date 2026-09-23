import { PROVIDERS, type Account, type Announcement, type Meter, type Mood, type Report, type Session, type Settings, type SystemStats } from "./types";

import { runsOutAt } from "./projection";

export { runsOutAt };

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

const waifu = (s: Settings) => s.personality !== "android";

/** First line on launch, before any data. */
export function bootLine(s: Settings): string {
  return waifu(s) ? `Ohayo, ${s.userTitle}~ Let me check your tokens!` : "System boot complete. Beginning usage analysis.";
}

/** The line she says right after a refresh. */
export function summaryLine(reports: Report[], s: Settings): string {
  const t = s.userTitle;
  const w = waifu(s);
  if (reports.length === 0) {
    return w
      ? `Hi hi, ${t}! I'm ${s.waifuName}. Add an account and I'll watch your tokens for you~`
      : `${s.waifuName} online. No accounts registered, ${t}. Add an account and I will begin monitoring.`;
  }
  const mood = moodFor(reports, s);
  const worst = worstMeter(reports);
  const broken = reports.filter((r) => !r.ok).map(name).join(", ");

  if (!worst) {
    if (w) return broken ? `Ehh? I can't reach ${broken}... did the login expire, ${t}?` : `No limits right now! Infinite tokens, ${t}... is this a dream?`;
    return broken
      ? `Unable to establish a link with ${broken}. Please verify the credentials.`
      : "All systems nominal. No limits are currently in effect.";
  }
  const detail = describe(worst.report, worst.meter);
  const eta = w ? depletionHint(worst, s) : "";
  switch (mood) {
    case "panic":
      return pick(w ? [
        `Kyaa~! ${t}, ${detail}!${eta} Don't leave me with no tokens!`,
        `Mou, ${t}! ${detail}.${eta} Switch accounts before the rate limit takes you away from me!`,
        `Dame dame! ${detail}. One more giant prompt and we're done for, ${t}!`,
      ] : [
        `Warning. ${detail}. Reserve depletion is imminent. I recommend switching accounts, ${t}.`,
        `Alert. ${detail}. Continuing at this rate will exhaust the limit.`,
      ]);
    case "worried":
      return pick(w ? [
        `Ne, ${t}... ${detail}.${eta} Maybe go easy on the huge context windows, okay?`,
        `Hmph. ${detail}. It's not like I'm worried or anything... b-but pace your prompts, ${t}.`,
        `${detail}. Let's save the big refactors for after the reset, ${t}~`,
      ] : [
        `Caution, ${t}. ${detail}. I recommend conserving large requests.`,
        `Reserve level is declining. ${detail}. Monitoring closely.`,
      ]);
    case "pouty":
      return w
        ? `Mou~ ${broken} won't talk to me. Can you check that login, ${t}?`
        : `Link failure with ${broken}. All other systems nominal.`;
    case "happy":
      return pick(w ? [
        `Yatta! Plenty of tokens left, ${t}. Lowest is ${detail}. Ganbatte~!`,
        `Sugoi~ everything's green! ${detail}. Go build something amazing, ${t}!`,
        `${detail}. Still lots of room... I'll be right here cheering you on, ${t} ♡`,
      ] : [
        `All reserves nominal. Lowest reading: ${detail}. You may proceed, ${t}.`,
        `Status green across all accounts. Lowest: ${detail}.`,
        `Sufficient capacity confirmed. ${detail}. ...I will be here if you need me.`,
      ]);
    default:
      return pick(w
        ? [`Status report for ${t}~ tightest one is ${detail}.`, `Just keeping an eye on things for you. ${detail}.`]
        : [`Status report. Tightest reserve: ${detail}.`, `Observation continuing. ${detail}.`]);
  }
}

/** " At this pace it runs out in 2h 10m, before the reset." or "" when there is no projection. */
function depletionHint(worst: Worst, s: Settings): string {
  const out = runsOutAt(worst.meter);
  if (!out) return "";
  const when = formatReset(out);
  return when ? ` At this pace it runs out in ${when}, before the reset, ${s.userTitle}.` : "";
}

/** Lines for clicking her or idle chatter. Walks through every meter. */
export function chatterLines(reports: Report[], s: Settings): string[] {
  const t = s.userTitle;
  const w = waifu(s);
  const lines: string[] = [];
  for (const r of reports) {
    if (!r.ok) {
      const err = r.error?.slice(0, 90) ?? "unknown";
      lines.push(w ? `${name(r)} is being mean to me: ${err}` : `${name(r)} reports an error: ${err}`);
      continue;
    }
    for (const m of r.meters) {
      if (hasLimit(m)) lines.push(`${describe(r, m)}.`);
    }
    if (r.bank && r.bank.available > 0) {
      const n = r.bank.available;
      lines.push(w
        ? `${name(r)} has ${n} banked reset${n > 1 ? "s" : ""}! Saving them for an emergency is so smart, ${t}~`
        : `${name(r)} holds ${n} banked reset${n > 1 ? "s" : ""}. Use them wisely, ${t}.`);
    }
    if (r.note) lines.push(`${name(r)}: ${r.note}`);
  }
  lines.push(...(w ? [
    `I'm ${s.waifuName}! Watching your rate limits is my job... and I like it, ${t}.`,
    `Drink some water between prompts, ${t}! Hydration before generation~`,
    `Don't forget to commit your work, ${t}. I'd cry if the agent wiped it.`,
    "Ehehe~ you and the model make a good team. But I'm still your favourite, right?",
  ] : [
    `I am ${s.waifuName}. My directive is to monitor your usage limits, ${t}.`,
    "Hydration levels unknown. I recommend drinking water.",
    "...I believe the appropriate expression here is a smile.",
  ]));
  return lines;
}

/** What she says about running sessions. */
export function sessionLine(sessions: Session[], s: Settings): string | null {
  const now = Date.now() / 1000;
  const working = sessions.filter((x) => x.tool !== "ollama" && now - x.lastActive <= 120);
  if (working.length === 0) return null;
  const counts = new Map<string, number>();
  for (const x of working) if (x.model) counts.set(x.model, (counts.get(x.model) ?? 0) + 1);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const projects = new Set(working.map((x) => x.project).filter(Boolean)).size;
  const base = `${working.length} session${working.length > 1 ? "s" : ""} active across ${projects} project${projects === 1 ? "" : "s"}`;
  if (waifu(s)) return `${base}! ${top ? `Mostly ${top[0]}. ` : ""}You're so hardworking, ${s.userTitle}~`;
  return `${base}.${top ? ` Primary model: ${top[0]}.` : ""}`;
}

/** A hardware remark when something is running hot or full. */
export function hardwareLine(stats: SystemStats | null, s: Settings): string | null {
  if (!stats) return null;
  const g = stats.gpus[0];
  const ram = Math.round((stats.memUsedGb / stats.memTotalGb) * 100);
  const t = s.userTitle;
  if (waifu(s)) {
    if (g?.tempC && g.tempC >= 83) return `Atsui~! GPU core at ${g.tempC}°C. Your graphics card is overheating, ${t}!`;
    if (ram >= 90) return `RAM at ${ram}%... it's so crowded in here! Close some idle sessions, ${t}?`;
    if (g && g.load >= 95) return `GPU at ${Math.round(g.load)}% load, ${g.tempC ?? "?"}°C. The local models are working so hard~`;
    return `System check~ CPU ${Math.round(stats.cpu)}%, RAM ${ram}%${g ? `, GPU ${Math.round(g.load)}%` : ""}. Everything's comfy!`;
  }
  if (g?.tempC && g.tempC >= 83) return `Thermal warning. GPU core at ${g.tempC}°C. I recommend checking your cooling.`;
  if (ram >= 90) return `Memory pressure high: ${ram}% of RAM in use. Closing idle sessions would help.`;
  if (g && g.load >= 95) return `GPU at ${Math.round(g.load)}% load, ${g.tempC ?? "?"}°C. The local models are working hard.`;
  return `Systems check: CPU ${Math.round(stats.cpu)}%, RAM ${ram}%${g ? `, GPU ${Math.round(g.load)}%` : ""}. All within tolerance.`;
}

/** What she says when clicked. */
export function petLines(s: Settings): string[] {
  const t = s.userTitle;
  return waifu(s) ? [
    "Kyaa! W-what are you doing, baka?!",
    "Ehehe~ headpats are better than a limit reset.",
    `Hmph! Don't poke me, go ship some code, ${t}!`,
    "Nya~? Did you need something?",
    `O-okay, just one more... then back to prompting, ${t}.`,
  ] : [
    "Physical contact detected. No damage sustained.",
    "...Is there a problem?",
    "I do not understand the purpose of that action. ...But I do not dislike it.",
    "That is not an efficient use of your time.",
    "Acknowledged.",
  ];
}

export function alertLine(r: Report, m: Meter, critical: boolean, s: Settings): string {
  const t = s.userTitle;
  if (waifu(s)) {
    return critical
      ? `Kyaa~! ${describe(r, m)}. Almost out of tokens, ${t}! Switch accounts or take a break with me?`
      : `Ne, ${t}... ${describe(r, m)}. Let's pace ourselves~`;
  }
  return critical ? `Warning. ${describe(r, m)}. Reserve nearly depleted.` : `Caution. ${describe(r, m)}.`;
}

export function announcementLine(a: Announcement, s: Settings): string {
  const who = PROVIDERS[a.provider].name;
  const t = s.userTitle;
  if (waifu(s)) {
    if (a.status !== "confirmed") return `Ne ne, ${t}! ${who} is teasing a global reset soon~`;
    return a.resetType === "banked"
      ? `Yatta! ${who} gave everyone a banked reset! Save it for when you really need it, ${t}.`
      : `Kyaa~ ${who} reset everyone's limits! Full tokens again, ${t}!`;
  }
  if (a.status !== "confirmed") return `Intel received. ${who} has signalled an upcoming global reset, ${t}.`;
  return a.resetType === "banked"
    ? `Global event detected. ${who} has issued a banked reset to all eligible accounts. You may use it when needed, ${t}.`
    : `Global event detected. ${who} has reset usage limits for all users. Reserves restored.`;
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
  const rules = [
    "Reply with 1-2 sentences, under 40 words.",
    "Copy account names, percentages and times exactly from the status list. Never invent, round or combine numbers.",
    "No emoji, no stage directions, no quotes. Never mention the list, lines, items or tags; just state the facts.",
  ];
  if (waifu(s)) {
    return [
      `You are ${s.waifuName}, ${s.userTitle}'s affectionate anime waifu who watches their AI usage limits: tokens, rate limits and resets.`,
      "Talk cute and playful with light anime phrases like ne, mou, yatta, ganbatte, ehehe or baka, but keep the facts clear.",
      "Tie advice to LLM usage: pacing prompts, smaller context, switching accounts, waiting for the reset.",
      ...rules,
      `Example: "Mou, ${s.userTitle}! Cursor Included usage is at 0% remaining and restores in 19d 6h. Switch accounts for me, okay?"`,
    ].join(" ");
  }
  return [
    `You are ${s.waifuName}, a calm android companion monitoring AI usage limits for ${s.userTitle}.`,
    "Speak calmly and formally, like a precise android. Short sentences. Rare hints of warmth.",
    ...rules,
    `Example: "Warning. Cursor Included usage is at 0% remaining. It restores in 19d 6h. I recommend switching accounts, ${s.userTitle}."`,
  ].join(" ");
}
