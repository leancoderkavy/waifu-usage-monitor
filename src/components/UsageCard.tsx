import { AnimatePresence, motion } from "motion/react";
import { formatReset, remaining } from "../dialogue";
import { PROVIDERS, type Account, type Meter, type Report, type Settings } from "../types";

interface Props {
  account: Account;
  report?: Report;
  loading: boolean;
  settings: Settings;
  index: number;
  onEdit: () => void;
  onToggleMeter: (key: string, hide: boolean) => void;
}

function tone(left: number, s: Settings) {
  if (left <= s.criticalAt) return "critical";
  if (left <= s.warnAt) return "warn";
  return "good";
}

function MeterRow({ meter, settings, delay, onHide }: { meter: Meter; settings: Settings; delay: number; onHide: () => void }) {
  const hasLimit = meter.unit === "percent" || (meter.limit ?? 0) > 0;
  const left = remaining(meter);
  const reset = formatReset(meter.resetsAt);
  const t = hasLimit ? tone(left, settings) : "good";

  return (
    <div className={`meter ${t}`}>
      <div className="meter-head">
        <span className="meter-label">
          {meter.label}
          <button className="meter-hide" onClick={onHide} title="Hide this meter. It stops counting toward alerts.">
            –
          </button>
        </span>
        <span className="meter-left">{hasLimit ? `${Math.round(left)}% left` : "no cap"}</span>
      </div>
      <div className="meter-track">
        <motion.div
          className="meter-fill"
          initial={{ width: 0 }}
          animate={{ width: `${hasLimit ? left : 100}%` }}
          transition={{ type: "spring", stiffness: 60, damping: 16, delay }}
        >
          <span className="meter-heart">◆</span>
        </motion.div>
      </div>
      <div className="meter-foot">
        <span />
        {reset && <span>⟳ {reset}</span>}
      </div>
    </div>
  );
}

export default function UsageCard({ account, report, loading, settings, index, onEdit, onToggleMeter }: Props) {
  const p = PROVIDERS[account.provider];
  const hidden = new Set(account.hiddenMeters ?? []);
  const shown = report?.meters.filter((m) => !hidden.has(m.key)) ?? [];
  const tucked = report?.meters.filter((m) => hidden.has(m.key)) ?? [];
  return (
    <motion.div
      className={`card ${report && !report.ok ? "card-error" : ""}`}
      style={{ "--brand": p.color, "--brand-glow": p.glow } as React.CSSProperties}
      layout
      initial={{ opacity: 0, y: 30, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 200, damping: 20, delay: index * 0.06 }}
      whileHover={{ y: -4 }}
    >
      <div className="card-head">
        <motion.div
          className="card-icon"
          animate={loading ? { rotate: 360 } : { rotate: 0 }}
          transition={loading ? { repeat: Infinity, duration: 1.2, ease: "linear" } : {}}
        >
          {p.icon}
        </motion.div>
        <div className="card-title">
          <strong>{account.label || p.name}</strong>
          <small>{report?.identity ?? p.name}</small>
        </div>
        {report?.signedIn === false && (
          <span className="login-badge saved" title="Checked with a saved login. You're signed in to another account in this app right now.">
            saved
          </span>
        )}
        {report?.plan && <span className="plan">{report.plan}</span>}
        <button className="icon-btn" onClick={onEdit} title="Edit account">
          ✎
        </button>
      </div>

      {!report && <div className="card-empty">{loading ? "Checking…" : "Not checked yet"}</div>}
      {report && !report.ok && <div className="card-err">⚠ {report.error}</div>}
      <AnimatePresence initial={false}>
        {report?.ok &&
          shown.map((m, i) => (
            <motion.div
              key={m.key}
              className="meter-wrap"
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <MeterRow meter={m} settings={settings} delay={index * 0.06 + i * 0.1} onHide={() => onToggleMeter(m.key, true)} />
            </motion.div>
          ))}
      </AnimatePresence>
      {report?.ok && tucked.length > 0 && (
        <div className="hidden-meters">
          <span>Hidden:</span>
          {tucked.map((m) => (
            <button key={m.key} onClick={() => onToggleMeter(m.key, false)} title="Show this meter again">
              + {m.label}
            </button>
          ))}
        </div>
      )}
      {report?.bank && (
        <div className={`bank ${report.bank.available ? "has" : ""}`}>
          ◆ Reset bank: {report.bank.available} available
          {report.bank.earned != null && ` · ${report.bank.earned} earned total`}
        </div>
      )}
      {report?.note && <div className="card-note">▸ {report.note}</div>}
    </motion.div>
  );
}
