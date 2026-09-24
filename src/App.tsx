import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { api, loadSettings, loadWatchedPosts, saveSettings, saveWatchedPosts } from "./api";
import {
  alertLine,
  chatterLines,
  llmFacts,
  llmSystem,
  moodFor,
  petLines,
  announcementLine,
  bootLine,
  sessionLine,
  hardwareLine,
  withoutHidden,
  remaining,
  summaryLine,
  worstMeter,
} from "./dialogue";
import { allEvents, backfill, needsBackfill, recordAnnouncements, recordReports } from "./history";
import type { Account, Mood, Report, Session, Settings, SystemStats } from "./types";
import { HUD_COLOR } from "./components/Kosmos";
import Character from "./components/Character";
import { waifuById } from "./waifus";
import SpeechBubble from "./components/SpeechBubble";
import DataMotes from "./components/DataMotes";
import { FOCUSED_FPS, useFrameBudget, usePageVisible } from "./hooks/usePageVisible";
import TitleBar from "./components/TitleBar";
import UsageCard from "./components/UsageCard";
import AccountEditor from "./components/AccountEditor";
import SettingsPanel from "./components/SettingsPanel";
import ResetCalendar from "./components/ResetCalendar";
import SessionsPanel from "./components/SessionsPanel";
import SystemPanel, { type Sample as SysSample } from "./components/SystemPanel";
import "./App.css";

// three.js is large; load the 3D character only when it is shown.

const ALERTED_KEY = "kosmos.alerted";
const FEED_MINUTES = 15;
const LLM_OFFERED_KEY = "kosmos.llmOffered";

// Voice playback (ElevenLabs or the local Kokoro server): one reused <audio>, plus a
// small cache of recent lines so repeated chatter does not spend credits or CPU.
const TTS_CACHE_MAX = 20;
const ttsCache = new Map<string, ArrayBuffer>();
let ttsAudio: HTMLAudioElement | null = null;
let ttsUrl: string | null = null;
let ttsSeq = 0;

function stopAudio() {
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.removeAttribute("src");
  }
  if (ttsUrl) {
    URL.revokeObjectURL(ttsUrl);
    ttsUrl = null;
  }
}

/** Plays one line from a TTS engine, through the cache. `key` names engine + voice + text. */
async function speakClip(key: string, mime: string, fetch: () => Promise<ArrayBuffer>, seq: number) {
  let buf = ttsCache.get(key);
  if (buf) {
    ttsCache.delete(key); // refresh LRU position
  } else {
    buf = await fetch();
  }
  ttsCache.set(key, buf);
  while (ttsCache.size > TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value!);
  if (seq !== ttsSeq) return; // a newer line started meanwhile
  stopAudio();
  ttsAudio ??= new Audio();
  ttsUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
  ttsAudio.src = ttsUrl;
  await ttsAudio.play();
}

function speak(text: string, s?: Settings) {
  const seq = ++ttsSeq;
  stopAudio();
  window.speechSynthesis?.cancel();
  const clean = text.replace(/[♡♥✧…]/g, " ").trim();
  const fallback = (e: unknown) => {
    console.warn(`${s?.voiceEngine} TTS failed, using system voice:`, e);
    if (seq === ttsSeq) speakSystem(clean);
  };
  if (s?.voiceEngine === "elevenlabs" && s.elevenVoiceId && clean) {
    const key = `eleven|${s.elevenVoiceId}|${s.elevenModel}|${clean}`;
    speakClip(key, "audio/mpeg", () => api.elevenLabsSpeak(clean, s.elevenVoiceId, s.elevenModel), seq).catch(fallback);
    return;
  }
  if (s?.voiceEngine === "local" && clean) {
    const voice = s.localVoice || waifuById(s.waifu).voice;
    const key = `local|${voice}|${clean}`;
    speakClip(key, "audio/wav", () => api.localTtsSpeak(s.localTtsUrl, voice, clean), seq).catch(fallback);
    return;
  }
  speakSystem(clean);
}

function speakSystem(text: string) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  u.voice =
    voices.find((v) => /aria|jenny|zira|female/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
  // Level, slightly synthetic delivery.
  u.pitch = 1.15;
  u.rate = 0.95;
  synth.speak(u);
}

async function notify(title: string, body: string) {
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === "granted";
  if (ok) sendNotification({ title, body });
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

type Tab = "accounts" | "sessions" | "system" | "calendar";

export default function App() {
  // Hidden to the tray: pause CSS and motion animations.
  const visible = usePageVisible();
  const fps = useFrameBudget();
  // Unfocused: decorations freeze until she has your attention again.
  const focused = fps === FOCUSED_FPS;
  // Hidden for a while (or never opened yet): drop the 3D model, its WebGL
  // context and the particle canvas. Alerts and refreshes keep running;
  // everything comes back when the window shows.
  const [dormant, setDormant] = useState(() => document.hidden);
  useEffect(() => {
    if (visible) {
      setDormant(false);
      return;
    }
    const t = window.setTimeout(() => setDormant(true), 30_000);
    return () => clearTimeout(t);
  }, [visible]);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [line, setLine] = useState(() => bootLine(loadSettings()));
  const [talking, setTalking] = useState(false);
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<Tab>("accounts");
  const [historyTick, setHistoryTick] = useState(0);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sys, setSys] = useState<SystemStats | null>(null);
  const [sysHistory, setSysHistory] = useState<SysSample[]>([]);
  const sysRef = useRef<SystemStats | null>(null);
  sysRef.current = sys;
  const sessionsRef = useRef<Session[]>([]);
  sessionsRef.current = sessions;
  const chatterIdx = useRef(0);
  const accountsRef = useRef<Account[]>([]);
  accountsRef.current = accounts;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const say = useCallback((text: string) => {
    setLine(text);
    if (settingsRef.current.voice) speak(text, settingsRef.current);
  }, []);

  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  };

  /** Fires one notification per meter per threshold per reset window. */
  const checkAlerts = useCallback(
    (rs: Report[]) => {
      const s = settingsRef.current;
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
    },
    [say],
  );

  /** Template line right away is too eager when an LLM is on; try it first, fall back fast. */
  const sayStatus = useCallback(
    async (rs: Report[]) => {
      const s = settingsRef.current;
      if (s.llm) {
        try {
          say(await withTimeout(api.llmLine(s.llmUrl, s.llmModel, llmSystem(s), llmFacts(rs, s)), 30000));
          return;
        } catch (e) {
          console.warn("LLM line rejected, using template:", e);
        }
      }
      say(summaryLine(rs, s));
    },
    [say],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // New sign-ins become new cards before anything is checked.
      const synced = await api.syncLogins();
      setAccounts(synced.accounts);
      for (const a of synced.added) {
        const s = settingsRef.current;
        const text = `New account detected: ${a.label}. Adding it to monitoring, ${s.userTitle}.`;
        if (s.notify) notify(s.waifuName, text);
        say(text);
      }
      const rs = await api.refreshAll();
      setReports(rs);
      setLastChecked(new Date());
      recordReports(rs);
      setHistoryTick((t) => t + 1);
      const visible = withoutHidden(rs, synced.accounts);
      if (!checkAlerts(visible)) sayStatus(visible);
      const worst = worstMeter(visible);
      api.setTrayTooltip(
        worst
          ? `${settingsRef.current.waifuName}: lowest is ${worst.report.label} ${worst.meter.label} at ${Math.round(worst.left)}%`
          : `${settingsRef.current.waifuName} is monitoring your limits`,
      );
    } catch (e) {
      say(`System fault: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [checkAlerts, say, sayStatus]);

  /** Pulls announced global resets and speaks up about new ones. */
  const pullFeeds = useCallback(async () => {
    try {
      const res = await api.globalResets(loadWatchedPosts());
      setFeedErrors(res.errors);
      const fresh = recordAnnouncements(res.announcements);
      setHistoryTick((t) => t + 1);
      const s = settingsRef.current;
      for (const a of fresh) {
        if (s.notify) notify(`${s.waifuName} · Global reset`, announcementLine(a, s));
      }
      if (fresh[0]) say(announcementLine(fresh[0], s));
    } catch (e) {
      setFeedErrors([String(e)]);
    }
  }, [say]);

  const addPost = async (url: string): Promise<string | null> => {
    try {
      const a = await api.inspectPost(url);
      const posts = loadWatchedPosts();
      if (!posts.some((p) => p.includes(a.id.replace("x:", "")))) saveWatchedPosts([...posts, a.url]);
      await pullFeeds();
      return null;
    } catch (e) {
      return String(e);
    }
  };

  /**
   * Turns the local voice on the first time Ollama with the model is found, and
   * loads the model into memory so the first real line isn't a 20-45 s cold start.
   */
  const prepareVoice = useCallback(async () => {
    const s = settingsRef.current;
    if (!(await api.llmAvailable(s.llmUrl, s.llmModel))) return;
    if (!s.llm && !localStorage.getItem(LLM_OFFERED_KEY)) {
      localStorage.setItem(LLM_OFFERED_KEY, "1");
      const next = { ...s, llm: true };
      setSettingsState(next);
      saveSettings(next);
      settingsRef.current = next;
      say(`Local voice module detected: ${s.llmModel}. Language synthesis online.`);
    }
    if (settingsRef.current.llm) {
      api.llmLine(s.llmUrl, s.llmModel, "Reply with one word.", "Say ready.").catch(() => {});
    }
  }, [say]);

  /** Rebuilds past resets from local logs, once per account. */
  const runBackfill = useCallback(async (accs: Account[]) => {
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
    if (found) setHistoryTick((t) => t + 1);
  }, []);

  useEffect(() => {
    api
      .listAccounts()
      .then((accs) => {
        setAccounts(accs);
        runBackfill(accs);
      })
      .then(prepareVoice)
      .then(refresh)
      .then(pullFeeds)
      .catch((e) => say(`Unable to read the account registry: ${e}`));
    const feedTimer = window.setInterval(pullFeeds, FEED_MINUTES * 60_000);
    const un = listen("tray-refresh", () => refresh());
    return () => {
      clearInterval(feedTimer);
      un.then((f) => f());
    };
  }, [refresh, runBackfill, pullFeeds, prepareVoice, say]);

  useEffect(() => {
    const id = window.setInterval(refresh, settings.refreshMinutes * 60_000);
    return () => clearInterval(id);
  }, [refresh, settings.refreshMinutes]);

  // Sessions refresh every 10 s while the tab is open, otherwise once a minute.
  // Skipped while the dashboard is hidden to the tray.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      setSessionsLoading(true);
      try {
        const list = await api.listSessions();
        if (alive) setSessions(list);
      } finally {
        if (alive) setSessionsLoading(false);
      }
    };
    load();
    const id = window.setInterval(load, tab === "sessions" ? 10_000 : 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tab]);

  // Hardware: every 2 s with the process list on the System tab (history covers
  // 2 min), every 10 s without it otherwise, and not at all while hidden.
  useEffect(() => {
    let alive = true;
    const onSystem = tab === "system";
    const load = async () => {
      if (document.hidden) return;
      try {
        const s = await api.systemStats(onSystem);
        if (!alive) return;
        setSys(s);
        const g = s.gpus[0];
        setSysHistory((h) =>
          [
            ...h,
            {
              cpu: s.cpu,
              ram: (s.memUsedGb / s.memTotalGb) * 100,
              gpu: g ? g.load : null,
              vram: g ? (g.memUsedMb / g.memTotalMb) * 100 : null,
            },
          ].slice(-60),
        );
      } catch (e) {
        console.warn("system stats failed", e);
      }
    };
    load();
    const id = window.setInterval(load, onSystem ? 2000 : 10_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", load);
    };
  }, [tab]);

  // Idle chatter: walk through each meter every so often.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden || loading) return;
      const lines = chatterLines(withoutHidden(reports, accountsRef.current), settingsRef.current);
      const busy = sessionLine(sessionsRef.current, settingsRef.current);
      if (busy) lines.push(busy);
      const hw = hardwareLine(sysRef.current, settingsRef.current);
      if (hw) lines.push(hw);
      say(lines[chatterIdx.current++ % lines.length]);
    }, 45_000);
    return () => clearInterval(id);
  }, [reports, loading, say]);

  const visibleReports = useMemo(() => withoutHidden(reports, accounts), [reports, accounts]);
  const mood: Mood = loading && reports.length === 0 ? "sleepy" : moodFor(visibleReports, settings);
  const byId = useMemo(() => new Map(reports.map((r) => [r.accountId, r])), [reports]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = useMemo(() => allEvents(reports), [reports, historyTick]);

  const poke = () => {
    if (Math.random() < 0.35) {
      const pets = petLines(settings);
      say(pets[Math.floor(Math.random() * pets.length)]);
    } else {
      const lines = chatterLines(visibleReports, settings);
      say(lines[chatterIdx.current++ % lines.length]);
    }
  };

  const setHidden = async (a: Account, key: string, hide: boolean) => {
    const hiddenMeters = hide ? [...new Set([...(a.hiddenMeters ?? []), key])] : (a.hiddenMeters ?? []).filter((k) => k !== key);
    setAccounts(await api.saveAccount({ ...a, hiddenMeters }));
  };

  const saveAccount = async (a: Account, secret?: string) => {
    const accs = await api.saveAccount(a, secret);
    setAccounts(accs);
    runBackfill(accs);
    say(`Registration confirmed. Now monitoring ${a.label}.`);
    refresh();
  };

  const hud = HUD_COLOR[mood];
  // One number can't sum up several providers, so the header just counts accounts by state.
  const accountStates = visibleReports.map((r) => {
    if (!r.ok) return "error";
    const lows = r.meters.filter((m) => m.unit === "percent" || (m.limit ?? 0) > 0).map(remaining);
    const min = lows.length ? Math.min(...lows) : 100;
    return min <= settings.criticalAt ? "critical" : min <= settings.warnAt ? "low" : "ok";
  });
  const countOf = (k: string) => accountStates.filter((x) => x === k).length;

  return (
    <MotionConfig reducedMotion={focused ? "user" : "always"}>
    <div className={`app mood-${mood}${visible ? "" : " paused"}${visible && !focused ? " idle" : ""}`} style={{ "--hud": hud } as React.CSSProperties}>
      {!dormant && <DataMotes color={hud} density={mood === "panic" ? 60 : 36} fps={fps} />}
      <TitleBar name={settings.waifuName} />
      <main>
        <section className="stage">
          <div className="hud-label">
            <span>{settings.waifuName} // STATUS</span>
            {sys && (
              <span className="hud-hw">
                CPU {Math.round(sys.cpu)}% · RAM {Math.round((sys.memUsedGb / sys.memTotalGb) * 100)}%
                {sys.gpus[0] && ` · GPU ${Math.round(sys.gpus[0].load)}% · ${sys.gpus[0].tempC ?? "?"}°C`}
              </span>
            )}
            <b>{mood === "panic" ? "CRITICAL" : mood === "worried" ? "CAUTION" : mood === "pouty" ? "LINK ERROR" : mood === "sleepy" ? "STANDBY" : "NOMINAL"}</b>
          </div>
          <SpeechBubble name={settings.waifuName} text={line} onTyping={setTalking} />
          {!dormant && <Character settings={settings} mood={mood} talking={talking} onPoke={poke} />}
          <div className="nameplate">
            <span>{settings.waifuName}</span>
            <small>usage monitor unit</small>
          </div>
        </section>

        <section className="panel">
          <header className="hero">
            <div>
              <h1>Usage</h1>
              <p className="hero-counts">
                {accounts.length === 0 ? (
                  "Add an account to begin"
                ) : (
                  <>
                    <span>{accounts.length} accounts</span>
                    {countOf("ok") > 0 && <span className="ok">{countOf("ok")} ok</span>}
                    {countOf("low") > 0 && <span className="low">{countOf("low")} low</span>}
                    {countOf("critical") > 0 && <span className="critical">{countOf("critical")} critical</span>}
                    {countOf("error") > 0 && <span className="critical">{countOf("error")} error</span>}
                  </>
                )}
              </p>
            </div>
            <div className="hero-actions">
              <motion.button className="btn primary" whileTap={{ scale: 0.92 }} onClick={refresh} disabled={loading}>
                <motion.span
                  style={{ display: "inline-block" }}
                  animate={loading ? { rotate: 360 } : { rotate: 0 }}
                  transition={loading ? { repeat: Infinity, duration: 0.9, ease: "linear" } : {}}
                >
                  ⟳
                </motion.span>{" "}
                {loading ? "Scanning…" : "Refresh"}
              </motion.button>
              <motion.button className="btn" whileTap={{ scale: 0.92 }} onClick={() => setEditing("new")}>
                ＋ Add account
              </motion.button>
              <motion.button className="btn ghost" whileTap={{ scale: 0.92 }} onClick={() => setShowSettings(true)}>
                ⚙
              </motion.button>
            </div>
          </header>


          <nav className="tabs">
            {(
              [
                ["accounts", "Accounts"],
                ["sessions", "Sessions"],
                ["system", "System"],
                ["calendar", "Reset calendar"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
                {label}
                {tab === k && <motion.div layoutId="tab-underline" className="tab-underline" />}
              </button>
            ))}
          </nav>

          <AnimatePresence mode="wait">
            {tab === "system" ? (
              <motion.div
                key="system"
                className="calendar-wrap"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
              >
                <SystemPanel stats={sys} history={sysHistory} />
              </motion.div>
            ) : tab === "sessions" ? (
              <motion.div
                key="sessions"
                className="calendar-wrap"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
              >
                <SessionsPanel sessions={sessions} loading={sessionsLoading} />
              </motion.div>
            ) : tab === "accounts" ? (
              <motion.div
                key="accounts"
                className="cards"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <AnimatePresence>
                  {accounts.map((a, i) => (
                    <UsageCard
                      key={a.id}
                      account={a}
                      report={byId.get(a.id)}
                      loading={loading}
                      settings={settings}
                      index={i}
                      onEdit={() => setEditing(a)}
                      onToggleMeter={(key, hide) => setHidden(a, key, hide)}
                    />
                  ))}
                </AnimatePresence>
                {accounts.length === 0 && (
                  <motion.button
                    className="card card-add"
                    onClick={() => setEditing("new")}
                  >
                    ＋ Add your first account
                  </motion.button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="calendar"
                className="calendar-wrap"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <ResetCalendar events={events} feedErrors={feedErrors} onAddPost={addPost} />
              </motion.div>
            )}
          </AnimatePresence>
          <footer>
            {lastChecked && `Last scan ${lastChecked.toLocaleTimeString()} · every ${settings.refreshMinutes} min`}
            {settings.llm && ` · voice: ${settings.llmModel}`}
          </footer>
        </section>
      </main>

      <AnimatePresence>
        {editing && (
          <AccountEditor
            key="editor"
            initial={editing === "new" ? undefined : editing}
            onSave={saveAccount}
            onRestored={(accs) => {
              setAccounts(accs);
              refresh();
            }}
            onDelete={
              editing === "new"
                ? undefined
                : async () => {
                    setAccounts(await api.deleteAccount(editing.id));
                    setReports((rs) => rs.filter((r) => r.accountId !== editing.id));
                    say("Account removed from monitoring.");
                  }
            }
            onClose={() => setEditing(null)}
          />
        )}
        {showSettings && (
          <SettingsPanel
            key="settings"
            settings={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
            onTestVoice={() =>
              speak(`${settings.waifuName} online. I will monitor your usage, ${settings.userTitle}.`, settings)
            }
            onTestLlm={async () => {
              try {
                say(await api.llmLine(settings.llmUrl, settings.llmModel, llmSystem(settings), llmFacts(visibleReports, settings)));
                return "Connected. She is speaking with the model now.";
              } catch (e) {
                return String(e);
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
