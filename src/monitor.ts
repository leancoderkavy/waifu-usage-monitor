import { emitTo, listen } from "@tauri-apps/api/event";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { api, loadSettings, loadWatchedPosts, saveSettings } from "./api";
import {
  alertLine,
  announcementLine,
  bootLine,
  llmFacts,
  llmSystem,
  remaining,
  summaryLine,
  withoutHidden,
  worstMeter,
} from "./dialogue";
import { statusKey } from "./status-key";
import { backfill, needsBackfill, recordAnnouncements, recordReports } from "./history";
import type { Account, Report } from "./types";
import { speak } from "./voice";

/*
 * The background work: checking usage, alerts, notifications, her voice,
 * global-reset feeds and the reset history. It runs in the island, which is
 * always open, so the dashboard is only a view and can be closed while hidden
 * to free its memory. The dashboard gets state patches over STATE_EVENT and
 * asks for things over REQUEST_EVENT.
 */

export interface MonitorState {
  accounts: Account[];
  reports: Report[];
  loading: boolean;
  checkedAt: number | null;
  error: string | null;
  feedErrors: string[];
  /** Her latest line. */
  line: string;
  /** Bumped whenever the reset history in localStorage changes. */
  historyVersion: number;
}

export type MonitorRequest =
  /** Send the whole state (the dashboard just opened). */
  | { kind: "sync" }
  /** Check usage now; also picks up added, edited or removed accounts. */
  | { kind: "refresh" }
  /** Pull global reset announcements now. */
  | { kind: "feeds" }
  /** Say a line: shown in the bubble and spoken if the voice is on. */
  | { kind: "say"; text: string };

export const STATE_EVENT = "monitor:state";
export const REQUEST_EVENT = "monitor:request";

/** From the dashboard to the monitor in the island. */
export const requestMonitor = (r: MonitorRequest) => emitTo("island", REQUEST_EVENT, r).catch(() => {});

const ALERTED_KEY = "kosmos.alerted";
const FEED_MINUTES = 15;
const LLM_OFFERED_KEY = "kosmos.llmOffered";

async function notify(title: string, body: string) {
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === "granted";
  if (ok) sendNotification({ title, body });
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/** Starts the checks and timers. `onChange` gets every new state; returns a stop function. */
export function startMonitor(onChange: (s: MonitorState) => void): () => void {
  let state: MonitorState = {
    accounts: [],
    reports: [],
    loading: false,
    checkedAt: null,
    error: null,
    feedErrors: [],
    line: bootLine(loadSettings()),
    historyVersion: 0,
  };
  let stopped = false;

  /** Patches go to the dashboard as-is, so a new line never overwrites fresher accounts there. */
  const publish = (patch: Partial<MonitorState>) => {
    if (stopped) return;
    state = { ...state, ...patch };
    onChange(state);
    void emitTo("main", STATE_EVENT, patch).catch(() => {});
  };
  const historyChanged = () => publish({ historyVersion: state.historyVersion + 1 });

  const say = (text: string) => {
    publish({ line: text });
    const s = loadSettings();
    if (s.voice) speak(text, s);
  };

  /** Fires one notification per meter per threshold per reset window. */
  const checkAlerts = (rs: Report[]) => {
    const s = loadSettings();
    const alerted: Record<string, true> = JSON.parse(localStorage.getItem(ALERTED_KEY) ?? "{}");
    let spoke = false;
    for (const r of rs) {
      if (!r.ok) continue;
      for (const m of r.meters) {
        if (m.unit !== "percent" && !(m.limit && m.limit > 0)) continue;
        const left = remaining(m);
        const level = left <= s.criticalAt ? "critical" : left <= s.warnAt ? "warn" : null;
        if (!level) continue;
        const key = `${r.accountId}|${m.key}|${m.resetsAt ?? "none"}|${level}`;
        if (alerted[key]) continue;
        alerted[key] = true;
        const text = alertLine(r, m, level === "critical", s);
        if (s.notify) notify(`${s.waifuName}`, text);
        if (!spoke) {
          say(text);
          spoke = true;
        }
      }
    }
    localStorage.setItem(ALERTED_KEY, JSON.stringify(alerted));
    return spoke;
  };

  /** Template line right away is too eager when an LLM is on; try it first, fall back fast. */
  let lastStatusKey = "";
  const sayStatus = async (rs: Report[], force: boolean) => {
    const s = loadSettings();
    // Timed checks stay quiet (no LLM call, no voice) until something actually changed.
    const key = statusKey(rs, s);
    if (!force && key === lastStatusKey) return;
    lastStatusKey = key;
    if (s.llm) {
      try {
        say(await withTimeout(api.llmLine(s.llmUrl, s.llmModel, llmSystem(s), llmFacts(rs, s)), 30000));
        return;
      } catch (e) {
        console.warn("LLM line rejected, using template:", e);
      }
    }
    say(summaryLine(rs, s));
  };

  /** Rebuilds past resets from local logs, once per account. */
  const runBackfill = async (accs: Account[]) => {
    let found = 0;
    const done = new Set<string>();
    for (const a of accs) {
      const folder = a.codexHome?.trim() || "default";
      if (a.provider !== "codex" || done.has(folder)) continue;
      done.add(folder);
      if (!needsBackfill(a.id) || !needsBackfill(`folder:${folder}`)) continue;
      try {
        found += backfill(a.id, a.provider, a.label, await api.accountHistory(a.id), `folder:${folder}`);
      } catch (e) {
        console.warn("backfill failed", e);
      }
    }
    if (found) historyChanged();
  };

  let refreshTimer = 0;
  const refresh = async (manual = false) => {
    if (state.loading) return;
    window.clearTimeout(refreshTimer);
    try {
      // Reload first: the dashboard may have just added, edited or removed one.
      publish({ loading: true, accounts: await api.listAccounts() });
      // New sign-ins become new cards before anything is checked.
      const synced = await api.syncLogins();
      publish({ accounts: synced.accounts });
      for (const a of synced.added) {
        const s = loadSettings();
        const text = `New account detected: ${a.label}. Adding it to monitoring, ${s.userTitle}.`;
        if (s.notify) notify(s.waifuName, text);
        say(text);
      }
      void runBackfill(synced.accounts);
      const rs = await api.refreshAll();
      recordReports(rs);
      publish({ reports: rs, checkedAt: Date.now(), error: null, historyVersion: state.historyVersion + 1 });
      const shown = withoutHidden(rs, synced.accounts);
      if (!checkAlerts(shown)) void sayStatus(shown, manual);
      const worst = worstMeter(shown);
      const name = loadSettings().waifuName;
      void api.setTrayTooltip(
        worst
          ? `${name}: lowest is ${worst.report.label} ${worst.meter.label} at ${Math.round(worst.left)}%`
          : `${name} is monitoring your limits`,
      );
    } catch (e) {
      publish({ error: String(e) });
      say(`System fault: ${e}`);
    } finally {
      publish({ loading: false });
      // Re-read each time so a changed interval in Settings applies to the next check.
      if (!stopped) refreshTimer = window.setTimeout(() => void refresh(), Math.max(1, loadSettings().refreshMinutes) * 60_000);
    }
  };

  /** Pulls announced global resets and speaks up about new ones. */
  const pullFeeds = async () => {
    try {
      const res = await api.globalResets(loadWatchedPosts());
      const fresh = recordAnnouncements(res.announcements);
      publish({ feedErrors: res.errors, historyVersion: state.historyVersion + 1 });
      const s = loadSettings();
      for (const a of fresh) {
        if (s.notify) notify(`${s.waifuName} · Global reset`, announcementLine(a, s));
      }
      if (fresh[0]) say(announcementLine(fresh[0], s));
    } catch (e) {
      publish({ feedErrors: [String(e)] });
    }
  };

  /**
   * Turns the local voice on the first time Ollama with the model is found, and
   * loads the model into memory so the first real line isn't a 20-45 s cold start.
   */
  const prepareVoice = async () => {
    const s = loadSettings();
    if (!(await api.llmAvailable(s.llmUrl, s.llmModel))) return;
    if (!s.llm && !localStorage.getItem(LLM_OFFERED_KEY)) {
      localStorage.setItem(LLM_OFFERED_KEY, "1");
      saveSettings({ ...s, llm: true });
      say(`Local voice module detected: ${s.llmModel}. Language synthesis online.`);
    }
    if (loadSettings().llm) {
      api.llmLine(s.llmUrl, s.llmModel, "Reply with one word.", "Say ready.").catch(() => {});
    }
  };

  const unlisteners = [
    listen("tray-refresh", () => void refresh(true)),
    listen<MonitorRequest>(REQUEST_EVENT, ({ payload: r }) => {
      if (r.kind === "sync") void emitTo("main", STATE_EVENT, state).catch(() => {});
      else if (r.kind === "refresh") void refresh(true);
      else if (r.kind === "feeds") void pullFeeds();
      else if (r.kind === "say") say(r.text);
    }),
  ];

  const feedTimer = window.setInterval(pullFeeds, FEED_MINUTES * 60_000);
  prepareVoice()
    .catch(() => {})
    .then(() => refresh())
    .then(pullFeeds);

  return () => {
    stopped = true;
    window.clearTimeout(refreshTimer);
    window.clearInterval(feedTimer);
    for (const u of unlisteners) void u.then((f) => f());
  };
}
