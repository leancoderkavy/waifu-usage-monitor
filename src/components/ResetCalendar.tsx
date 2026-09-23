import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { KIND_INFO, type ResetEvent, type ResetKind } from "../history";
import { PROVIDERS } from "../types";
import ProviderIcon from "./ProviderIcon";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Kinds that matter most sort first so their dot shows when a day is busy. */
const RANK: ResetKind[] = ["global", "teaser", "early", "bank-used", "bank-grant", "bank-expiry", "scheduled", "upcoming"];

interface Props {
  events: ResetEvent[];
  feedErrors: string[];
  /** Validates and saves an X post. Resolves to an error message, or null on success. */
  onAddPost: (url: string) => Promise<string | null>;
}

export default function ResetCalendar({ events, feedErrors, onAddPost }: Props) {
  const today = new Date();
  const [postUrl, setPostUrl] = useState("");
  const [postMsg, setPostMsg] = useState<string | null>(null);
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [dir, setDir] = useState(0);
  const [selected, setSelected] = useState<string>(dayKey(today));

  const byDay = useMemo(() => {
    const m = new Map<string, ResetEvent[]>();
    for (const e of events) {
      const k = dayKey(new Date(e.at * 1000));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    for (const list of m.values()) list.sort((a, b) => RANK.indexOf(a.kind) - RANK.indexOf(b.kind));
    return m;
  }, [events]);

  const cells = useMemo(() => {
    const first = new Date(cursor);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const counts = useMemo(() => {
    const c: Partial<Record<ResetKind, number>> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  const move = (n: number) => {
    setDir(n);
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  };

  const dayEvents = byDay.get(selected) ?? [];
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="icon-btn" onClick={() => move(-1)}>
          ◀
        </button>
        <AnimatePresence mode="popLayout" custom={dir}>
          <motion.h3
            key={monthLabel}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
          >
            {monthLabel}
          </motion.h3>
        </AnimatePresence>
        <button className="icon-btn" onClick={() => move(1)}>
          ▶
        </button>
        <button
          className="btn ghost small"
          onClick={() => {
            setDir(0);
            setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
            setSelected(dayKey(today));
          }}
        >
          Today
        </button>
      </div>

      <form
        className="cal-import"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!postUrl.trim()) return;
          setPostMsg("Checking post…");
          const error = await onAddPost(postUrl);
          setPostMsg(error ?? "Added. It shows on the calendar as an announced global reset.");
          if (!error) setPostUrl("");
        }}
      >
        <input
          value={postUrl}
          placeholder="Paste an x.com reset post from @claudeai, @thsottiaux, @cursor_ai, @xai…"
          onChange={(e) => setPostUrl(e.target.value)}
        />
        <button className="btn small" type="submit">
          Add post
        </button>
      </form>
      {postMsg && <p className="cal-msg">{postMsg}</p>}
      {feedErrors.length > 0 && <p className="cal-msg warn">Feed trouble: {feedErrors.join(" · ")}</p>}

      <div className="cal-legend">
        {(Object.keys(KIND_INFO) as ResetKind[]).map((k) => (
          <span key={k} style={{ "--c": KIND_INFO[k].color } as React.CSSProperties}>
            {KIND_INFO[k].label}
            {counts[k] ? <b>{counts[k]}</b> : null}
          </span>
        ))}
      </div>

      <div className="cal-grid-wrap">
        <div className="cal-grid cal-names">
          {DAY_NAMES.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <AnimatePresence mode="popLayout" custom={dir}>
          <motion.div
            key={cursor.toISOString()}
            className="cal-grid"
            initial={{ opacity: 0, x: dir * 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -60 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            {cells.map((d, i) => {
              const k = dayKey(d);
              const evs = byDay.get(k) ?? [];
              const out = d.getMonth() !== cursor.getMonth();
              const isToday = k === dayKey(today);
              const top = evs[0]?.kind;
              return (
                <motion.button
                  key={k}
                  className={`cal-day ${out ? "out" : ""} ${isToday ? "today" : ""} ${selected === k ? "sel" : ""} ${top ? `has ${top}` : ""}`}
                  style={top ? ({ "--c": KIND_INFO[top].color } as React.CSSProperties) : undefined}
                  aria-label={`${d.toLocaleDateString()}: ${evs.length ? evs.map((event) => `${PROVIDERS[event.provider].name} ${KIND_INFO[event.kind].label}`).join(", ") : "No resets"}`}
                  onClick={() => setSelected(k)}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.008 }}
                  whileHover={{ scale: 1.08 }}
                >
                  <span>{d.getDate()}</span>
                  <div className="cal-dots">
                    {evs.slice(0, 4).map((e) => (
                      <motion.span
                        key={e.id}
                        className="cal-provider-mark"
                        style={{ "--c": KIND_INFO[e.kind].color } as React.CSSProperties}
                        title={`${PROVIDERS[e.provider].name} · ${KIND_INFO[e.kind].label}`}
                        animate={e.kind === "global" || e.kind === "bank-grant" || e.confirmed ? { scale: [1, 1.5, 1] } : undefined}
                        transition={{ repeat: Infinity, duration: 1.4 }}
                      ><ProviderIcon provider={e.provider} /></motion.span>
                    ))}
                  </div>
                  {(top === "global" || top === "bank-grant") && (
                    <motion.div
                      className="cal-burst"
                      animate={{ scale: [0.6, 1.4], opacity: [0.6, 0] }}
                      transition={{ repeat: Infinity, duration: 1.8 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="cal-list">
        <AnimatePresence mode="wait">
          <motion.div key={selected} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {dayEvents.length === 0 && <p className="cal-empty">No resets logged on this day.</p>}
            {dayEvents.map((e, i) => (
              <motion.div
                key={e.id}
                className="cal-event"
                style={{ "--c": KIND_INFO[e.kind].color } as React.CSSProperties}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <span className="cal-event-icon" title={PROVIDERS[e.provider].name}><ProviderIcon provider={e.provider} /></span>
                <div>
                  <strong>
                    {KIND_INFO[e.kind].label}
                    {e.banked && <em className="banked">BANKED</em>}
                  </strong>
                  <small>
                    {e.account || PROVIDERS[e.provider].name} · {e.meter} ·{" "}
                    {new Date(e.at * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </small>
                  {e.confirmed && <small className="cal-ok">✓ Matches an announced global reset</small>}
                  {e.source === "log" && e.kind === "early" && !e.confirmed && (
                    <small className="cal-src">From Codex logs. Could also be a switch to another account on the same plan.</small>
                  )}
                  {e.text && <p className="cal-text">“{e.text.length > 220 ? `${e.text.slice(0, 220)}…` : e.text}”</p>}
                  {e.url && (
                    <button className="cal-link" onClick={() => openUrl(e.url!)}>
                      Open post ↗ <span>via {e.feed}</span>
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
