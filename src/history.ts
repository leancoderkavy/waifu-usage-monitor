import type { Announcement, Meter, Provider, Report, Sample } from "./types";

/**
 * Reset history for the calendar.
 *
 * A reset is spotted when a window's reset time jumps forward. If that happens
 * well before the old reset time, the provider reset limits early: a global
 * reset, or a banked reset credit if the bank shrank at the same moment.
 */

export type ResetKind = "scheduled" | "early" | "global" | "teaser" | "bank-used" | "bank-grant" | "bank-expiry" | "upcoming";

export interface ResetEvent {
  id: string;
  at: number; // unix seconds
  kind: ResetKind;
  accountId: string;
  provider: Provider;
  account: string;
  meter: string;
  /** "log" = rebuilt from Codex session logs, which don't record the account. */
  source?: "log";
  /** Announcement details, for global resets. */
  text?: string;
  url?: string;
  banked?: boolean;
  feed?: string;
  /** An early reset on your login that lines up with an announced global reset. */
  confirmed?: boolean;
}

interface Store {
  last: Record<string, Sample>;
  identity?: Record<string, string>;
  bank: Record<string, { available: number; earned?: number | null }>;
  events: ResetEvent[];
  backfilled: string[];
  announcements?: Announcement[];
  seen?: string[];
}

const KEY = "kosmos.history.v3";
const EARLY_SLACK = 15 * 60;
const SHORT_WINDOW = 12 * 3600;

function load(): Store {
  try {
    return { last: {}, bank: {}, events: [], backfilled: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { last: {}, bank: {}, events: [], backfilled: [] };
  }
}

function save(s: Store) {
  // Keep a year of events.
  const cutoff = Date.now() / 1000 - 366 * 86400;
  s.events = s.events.filter((e) => e.at >= cutoff);
  localStorage.setItem(KEY, JSON.stringify(s));
}

function push(s: Store, e: Omit<ResetEvent, "id">) {
  const id = `${e.accountId}|${e.meter}|${e.kind}|${Math.round(e.at / 3600)}`;
  if (!s.events.some((x) => x.id === id)) s.events.push({ ...e, id });
}

/** Compares two readings of one window. Returns the reset it implies, if any. */
function detect(prev: Sample, cur: Sample): { at: number; early: boolean } | null {
  if (prev.plan && cur.plan && prev.plan !== cur.plan) return null;
  if (prev.resetsAt && cur.resetsAt) {
    // Usage wiped inside the same window: the provider reset limits in place.
    if (Math.abs(cur.resetsAt - prev.resetsAt) < 3600) {
      const wiped = prev.used - cur.used >= 15 && cur.used <= prev.used * 0.25;
      return wiped ? { at: cur.t, early: true } : null;
    }
    // A real reset clears usage; a moved date alone is not one.
    if (cur.used > prev.used || cur.resetsAt < prev.resetsAt) return null;
    const early = cur.t < prev.resetsAt - EARLY_SLACK;
    return { at: early ? cur.t : prev.resetsAt, early };
  }
  // No reset times: a big drop in usage is the only signal.
  if (cur.used < prev.used - 5) return { at: cur.t, early: false };
  return null;
}

const tracked = (m: Meter) => m.unit === "percent" || (m.limit ?? 0) > 0;

function feed(
  s: Store,
  ctx: { accountId: string; provider: Provider; account: string; meter: string },
  cur: Sample,
  bankShrank = false,
) {
  const k = `${ctx.accountId}|${cur.key}`;
  const prev = s.last[k];
  s.last[k] = cur;
  if (!prev || cur.t <= prev.t) return;
  const hit = detect(prev, cur);
  if (!hit) return;
  const short = (cur.windowSecs ?? prev.windowSecs ?? 0) > 0 && (cur.windowSecs ?? prev.windowSecs)! < SHORT_WINDOW;
  if (!hit.early && short) return; // 5-hour windows roll over constantly; skip the noise.
  push(s, { ...ctx, at: hit.at, kind: hit.early ? (bankShrank ? "bank-used" : "early") : "scheduled" });
}

/** Folds a fresh refresh into history. Call once per refresh. */
export function recordReports(reports: Report[]) {
  const s = load();
  const now = Math.floor(Date.now() / 1000);
  s.identity ??= {};
  for (const r of reports) {
    if (!r.ok) continue;
    // Signed into a different account in the same folder: start fresh, not a reset.
    if (r.identity && s.identity[r.accountId] && s.identity[r.accountId] !== r.identity) {
      for (const k of Object.keys(s.last)) if (k.startsWith(`${r.accountId}|`)) delete s.last[k];
      delete s.bank[r.accountId];
    }
    if (r.identity) s.identity[r.accountId] = r.identity;
    let bankShrank = false;
    if (r.bank) {
      const prev = s.bank[r.accountId];
      if (prev) {
        const ctx = { accountId: r.accountId, provider: r.provider, account: r.label, meter: "Reset bank" };
        if (r.bank.available > prev.available || (r.bank.earned ?? 0) > (prev.earned ?? 0)) {
          push(s, { ...ctx, at: now, kind: "bank-grant" });
        }
        bankShrank = r.bank.available < prev.available;
      }
      s.bank[r.accountId] = { available: r.bank.available, earned: r.bank.earned };
      for (const c of r.bank.credits) {
        if (c.grantedAt)
          push(s, { accountId: r.accountId, provider: r.provider, account: r.label, meter: "Reset bank", at: c.grantedAt, kind: "bank-grant" });
      }
    }
    for (const m of r.meters) {
      if (!tracked(m)) continue;
      feed(
        s,
        { accountId: r.accountId, provider: r.provider, account: r.label, meter: m.label },
        { key: m.key, t: now, used: m.usedPercent, resetsAt: m.resetsAt, windowSecs: m.windowSecs, plan: r.plan },
        bankShrank,
      );
    }
  }
  save(s);
}

export function needsBackfill(accountId: string) {
  return !load().backfilled.includes(accountId);
}

/** Replays a local log (Codex sessions) to find resets from before the app existed. */
export function backfill(accountId: string, provider: Provider, account: string, samples: Sample[], folderKey?: string) {
  const s = load();
  const scratch: Store = { last: {}, bank: {}, events: [], backfilled: [] };
  for (const smp of samples) {
    // Codex logs mix every account used in this folder; the plan is the only
    // thing that tells them apart, so each plan gets its own track.
    const window = smp.windowSecs && smp.windowSecs >= 7 * 86400 ? "Weekly window" : "Usage window";
    const label = smp.plan ? `${window} (${smp.plan})` : window;
    feed(scratch, { accountId, provider, account, meter: label }, { ...smp, key: `${smp.plan ?? ""}:${smp.key}` });
  }
  for (const e of scratch.events) push(s, { ...e, source: "log" });
  s.backfilled.push(accountId);
  if (folderKey) s.backfilled.push(folderKey);
  save(s);
  return scratch.events.length;
}

/**
 * Saves the latest feed results. Returns announcements not seen before that
 * are recent enough to tell the user about.
 */
export function recordAnnouncements(list: Announcement[]): Announcement[] {
  const s = load();
  const first = s.seen === undefined;
  const seen = new Set(s.seen ?? []);
  const cutoff = Date.now() / 1000 - 3 * 86400;
  const fresh = list.filter((a) => !seen.has(a.id) && a.at >= cutoff);
  s.announcements = list;
  s.seen = [...seen, ...list.map((a) => a.id)];
  save(s);
  // On the very first fetch everything is "new"; still surface only the last 3 days.
  return first ? fresh.slice(0, 2) : fresh;
}

/** Early resets on your login within this window after an announcement count as that reset. */
const MATCH_BEFORE = 2 * 3600;
const MATCH_AFTER = 72 * 3600;

export function allEvents(reports: Report[]): ResetEvent[] {
  const store = load();
  const announced = store.announcements ?? [];
  const events: ResetEvent[] = store.events.map((e) =>
    e.kind === "early" &&
    announced.some(
      (a) => a.status === "confirmed" && a.provider === e.provider && e.at >= a.at - MATCH_BEFORE && e.at <= a.at + MATCH_AFTER,
    )
      ? { ...e, confirmed: true }
      : e,
  );
  for (const a of announced) {
    events.push({
      id: a.id,
      at: a.at,
      kind: a.status === "confirmed" ? "global" : "teaser",
      accountId: "",
      provider: a.provider,
      account: "",
      meter: a.resetType === "banked" ? "Banked reset for everyone" : "Limits reset for everyone",
      text: a.text,
      url: a.url,
      banked: a.resetType === "banked",
      feed: a.source,
    });
  }
  const now = Date.now() / 1000;
  // Future resets and bank expiries come straight from the latest reports.
  for (const r of reports) {
    if (!r.ok) continue;
    for (const m of r.meters) {
      if (!m.resetsAt || m.resetsAt < now) continue;
      if ((m.windowSecs ?? Infinity) < SHORT_WINDOW) continue;
      events.push({
        id: `up|${r.accountId}|${m.key}`,
        at: m.resetsAt,
        kind: "upcoming",
        accountId: r.accountId,
        provider: r.provider,
        account: r.label,
        meter: m.label,
      });
    }
    for (const c of r.bank?.credits ?? []) {
      if (c.expiresAt)
        events.push({
          id: `exp|${r.accountId}|${c.expiresAt}`,
          at: c.expiresAt,
          kind: "bank-expiry",
          accountId: r.accountId,
          provider: r.provider,
          account: r.label,
          meter: "Reset bank",
        });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

export const KIND_INFO: Record<ResetKind, { label: string; color: string; icon: string }> = {
  global: { label: "Global reset (announced)", color: "#e8304f", icon: "✦" },
  teaser: { label: "Global reset teased", color: "#f28a9c", icon: "✧" },
  early: { label: "Early reset (this login)", color: "#e89a1c", icon: "◇" },
  "bank-used": { label: "Bank reset used", color: "#2a58c4", icon: "◆" },
  "bank-grant": { label: "Free bank reset granted", color: "#e89a1c", icon: "✚" },
  "bank-expiry": { label: "Bank reset expires", color: "#9aa6bf", icon: "⌛" },
  scheduled: { label: "Scheduled reset", color: "#3a7bff", icon: "⟳" },
  upcoming: { label: "Upcoming reset", color: "#35c7e8", icon: "➤" },
};
