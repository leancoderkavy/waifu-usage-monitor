import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, loadSettings } from "./api";
import { formatReset, remaining, runsOutAt, withoutHidden } from "./dialogue";
import { PROVIDERS, type Account, type Provider, type Report, type SystemStats } from "./types";
import { summarizeIslandProvider } from "./island-summary";
import Character from "./components/Character";
import { waifuById } from "./waifus";
import { useCustomAsset } from "./hooks/useCustomAsset";
import "./Island.css";

// A still bust, not the 3D model: the portrait is small and remounts on every hover.
const BUILT_IN_FLAT = <img className="island-portrait-art" src="/models/kosmos_bust.png" alt="" draggable={false} />;

const providerOrder: Provider[] = ["codex", "claude", "cursor", "openai", "grokbot", "xai"];
const shortName: Record<Provider, string> = { codex: "Codex", claude: "Claude", cursor: "Cursor", openai: "OpenAI", grokbot: "Grok", xai: "xAI" };

type Gauge = { key: string; label: string; pct: number; detail: string; hot: boolean };

/** CPU, RAM, GPU and VRAM as percentages. `hot` uses the same limits as the dashboard's hardware lines. */
function systemGauges(s: SystemStats): Gauge[] {
  const ram = (s.memUsedGb / s.memTotalGb) * 100;
  const gauges: Gauge[] = [
    { key: "cpu", label: "CPU", pct: s.cpu, detail: `${s.cores.length} threads`, hot: s.cpu >= 90 },
    { key: "ram", label: "RAM", pct: ram, detail: `${s.memUsedGb.toFixed(1)} / ${s.memTotalGb.toFixed(0)} GB`, hot: ram >= 90 },
  ];
  const g = s.gpus[0];
  if (g) {
    const vram = (g.memUsedMb / g.memTotalMb) * 100;
    const warm = (g.tempC ?? 0) >= 83;
    gauges.push(
      { key: "gpu", label: "GPU", pct: g.load, detail: g.tempC == null ? g.name : `${g.tempC}°C`, hot: g.load >= 95 || warm },
      { key: "vram", label: "VRAM", pct: vram, detail: `${(g.memUsedMb / 1024).toFixed(1)} / ${(g.memTotalMb / 1024).toFixed(0)} GB`, hot: vram >= 95 },
    );
  }
  return gauges;
}

const gaugeColor = (gauge: Gauge) => gauge.hot ? "#ff687e" : gauge.pct >= 75 ? "#ffbd69" : "#35c7e8";

export default function Island() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [sys, setSys] = useState<SystemStats | null>(null);
  const [settings, setSettings] = useState(loadSettings);
  const avatar = useCustomAsset("avatar", settings.customAssets?.avatar);

  // The dashboard saves settings to localStorage; pick up name and art changes live.
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === null || e.key.endsWith("settings")) setSettings(loadSettings());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const synced = await api.syncLogins();
      setAccounts(synced.accounts);
      setReports(await api.refreshAll());
      setLastChecked(new Date());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, Math.max(1, settings.refreshMinutes) * 60_000);
    const unlisten = listen("tray-refresh", refresh);
    return () => {
      window.clearInterval(timer);
      void unlisten.then((fn) => fn());
    };
  }, [refresh, settings.refreshMinutes]);

  // Hardware: a coarse 5 s pulse when expanded; collapsed only needs the hot pill, so 20 s.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await api.systemStats();
        if (alive) setSys(next);
      } catch (e) {
        console.warn("system stats failed", e);
      }
    };
    void load();
    const timer = window.setInterval(load, expanded ? 5000 : 20_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [expanded]);

  const hardware = useMemo(() => sys && systemGauges(sys), [sys]);
  const hot = hardware?.filter((gauge) => gauge.hot) ?? [];

  const visible = useMemo(() => withoutHidden(reports, accounts), [reports, accounts]);
  const summaries = useMemo(() => providerOrder.flatMap((provider) => {
    const group = visible.filter((report) => report.provider === provider);
    if (!group.length) return [];
    return [summarizeIslandProvider(group, provider)];
  }), [visible]);
  const lowest = Math.min(100, ...summaries.flatMap(({ left }) => left == null ? [] : [left]));
  const mood = lowest <= settings.criticalAt ? "panic" : lowest <= settings.warnAt ? "worried" : "calm";

  const resize = (next: boolean) => {
    if (next === expanded) return;
    setExpanded(next);
    void api.setIslandExpanded(next);
  };

  return (
    <div
      className="island-canvas"
      onMouseEnter={() => resize(true)}
      onMouseLeave={(event) => {
        // WebView2 can send a leave while the native window grows. The pointer
        // is still over the original strip, so keep the island open.
        if (event.clientX >= 0 && event.clientX < window.innerWidth && event.clientY >= 0 && event.clientY < 54) return;
        resize(false);
      }}
    >
      <section className={`island ${expanded ? "island-open" : ""}`} aria-label="LLM usage island">
        <div className="island-strip">
          <img className="island-mark" src={avatar ?? waifuById(settings.waifu).avatar} alt="" aria-hidden="true" draggable={false} />
          <span className="island-title">{settings.waifuName}</span>
          <div className="island-summary" aria-label="Lowest remaining allowance by provider">
            {summaries.length ? summaries.map(({ provider, left, limitLabel, windowLabel, sessionLeft, weeklyLeft }) => {
              const showClaudeWindows = provider === "claude" && sessionLeft != null && weeklyLeft != null;
              const description = showClaudeWindows
                ? `Claude: ${Math.round(sessionLeft)}% remaining in 5-hour session; ${Math.round(weeklyLeft)}% remaining weekly`
                : `${PROVIDERS[provider].name}: ${left == null ? "usage unavailable" : `${Math.round(left)}% remaining on ${limitLabel}`}`;
              return <span className="island-pill" key={provider} title={description} aria-label={description}>
                <i style={{ background: PROVIDERS[provider].color }} />
                <b>{shortName[provider]}</b>
                {showClaudeWindows ? <>
                  <span className="island-window">5h <strong>{Math.round(sessionLeft)}%</strong></span>
                  <span aria-hidden="true">·</span>
                  <span className="island-window">7d <strong className={weeklyLeft <= 10 ? "island-danger" : ""}>{Math.round(weeklyLeft)}%</strong></span>
                </> : <>
                  <strong className={left != null && left <= 10 ? "island-danger" : ""}>{left == null ? "—" : `${Math.round(left)}%`}</strong>
                  {windowLabel && <small aria-hidden="true">{windowLabel}</small>}
                </>}
              </span>;
            }) : <span className="island-placeholder">{loading ? "Checking limits…" : "No accounts yet"}</span>}
            {hot.length > 0 && (
              <span className="island-pill island-hot" title={hot.map((g) => `${g.label} ${Math.round(g.pct)}% (${g.detail})`).join("; ")}>
                <b>⚠</b>
                {hot.map((g) => <span className="island-window" key={g.key}>{g.label} <strong className="island-danger">{Math.round(g.pct)}%</strong></span>)}
              </span>
            )}
          </div>
          <span className="island-chevron" aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
        </div>

        {expanded && (
          <div className="island-details">
            <header className="island-head">
              <div><span className="island-eyebrow">{settings.waifuName} // USAGE MONITOR</span><h1>Your limits</h1><p>{lastChecked ? `Updated ${lastChecked.toLocaleTimeString()}` : "Waiting for first scan"}</p></div>
              <div className="island-actions">
                <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh usage">{loading ? "Checking…" : "↻ Refresh"}</button>
                <button type="button" onClick={() => void api.showDashboard()}>Open dashboard ↗</button>
              </div>
            </header>
            {error && <p className="island-error" role="alert">{error}</p>}
            {hardware && (
              <div className="island-system" aria-label="System usage">
                {hardware.map((gauge) => (
                  <div className={`island-gauge ${gauge.hot ? "island-gauge-hot" : ""}`} key={gauge.key} title={gauge.detail}>
                    <div><span>{gauge.label}</span><strong>{Math.round(gauge.pct)}%</strong></div>
                    <div className="island-track"><span style={{ width: `${Math.min(100, gauge.pct)}%`, background: gaugeColor(gauge) }} /></div>
                    <small>{gauge.detail}</small>
                  </div>
                ))}
              </div>
            )}
            <div className="island-content">
              <aside className="island-portrait" aria-hidden="true">
                <div className="island-portrait-ring" />
                <div className="island-portrait-avatar">
                  <Character settings={{ ...settings, character3d: false }} mood={mood} talking={false} onPoke={() => {}} flat={BUILT_IN_FLAT} />
                </div>
                <span>{mood === "panic" ? "CRITICAL" : mood === "worried" ? "CAUTION" : "NOMINAL"}</span>
                <small>SYSTEM ONLINE</small>
              </aside>
              <div className="island-list">
              {visible.map((report) => (
                <article className="island-account" key={report.accountId}>
                  <div className="island-account-head">
                    <span className="island-provider-dot" style={{ background: PROVIDERS[report.provider].color }} />
                    <strong>{report.label}</strong>
                    {report.identity && <small>{report.identity}</small>}
                  </div>
                  {!report.ok && <p className="island-error">{report.error || "Usage unavailable"}</p>}
                  {report.ok && report.meters.filter((m) => m.unit === "percent" || (m.limit ?? 0) > 0).map((meter) => {
                    const left = remaining(meter);
                    const out = runsOutAt(meter);
                    return <div className="island-meter" key={meter.key}>
                      <div><span>{meter.label}</span><strong>{Math.round(left)}% left</strong></div>
                      <div className="island-track"><span style={{ width: `${left}%`, background: left <= 10 ? "#ff687e" : left <= 25 ? "#ffbd69" : PROVIDERS[report.provider].color }} /></div>
                      {meter.resetsAt && <small>Resets in {formatReset(meter.resetsAt)}{out && <b className="island-eta"> · runs out in ~{formatReset(out)} at this pace</b>}</small>}
                    </div>;
                  })}
                </article>
              ))}
              {!visible.length && !loading && <p className="island-empty">Open dashboard to add an account.</p>}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
