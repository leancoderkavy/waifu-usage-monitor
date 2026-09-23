import { motion } from "motion/react";
import type { SystemStats } from "../types";

export interface Sample {
  cpu: number;
  ram: number;
  gpu: number | null;
  vram: number | null;
}

const tone = (pct: number) => (pct >= 90 ? "#ff3b5c" : pct >= 70 ? "#ffb13d" : "#35c7e8");

function Ring({ label, pct, detail }: { label: string; pct: number | null; detail: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const value = pct ?? 0;
  return (
    <div className="ring">
      <svg viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={r} className="ring-track" />
        <motion.circle
          cx={50}
          cy={50}
          r={r}
          className="ring-fill"
          stroke={tone(value)}
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ type: "spring", stiffness: 60, damping: 16 }}
          transform="rotate(-90 50 50)"
        />
        <text x={50} y={50} className="ring-num">
          {pct == null ? "—" : `${Math.round(value)}%`}
        </text>
        <text x={50} y={66} className="ring-label">
          {label}
        </text>
      </svg>
      <small>{detail}</small>
    </div>
  );
}

/** Sparkline of the last samples, 0-100. */
function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${40 - ((v ?? 0) / 100) * 38}`);
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="spark">
      <polyline points={`0,40 ${pts.join(" ")} 100,40`} fill={`${color}22`} stroke="none" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function SystemPanel({ stats, history }: { stats: SystemStats | null; history: Sample[] }) {
  if (!stats) return <p className="cal-empty">Reading sensors…</p>;
  const ram = (stats.memUsedGb / stats.memTotalGb) * 100;
  const gpu = stats.gpus[0];
  const vram = gpu ? (gpu.memUsedMb / gpu.memTotalMb) * 100 : null;

  return (
    <div className="system">
      <div className="rings">
        <Ring label="CPU" pct={stats.cpu} detail={`${stats.cores.length} threads`} />
        <Ring label="RAM" pct={ram} detail={`${stats.memUsedGb.toFixed(1)} / ${stats.memTotalGb.toFixed(0)} GB`} />
        <Ring label="GPU" pct={gpu?.load ?? null} detail={gpu ? `${gpu.tempC ?? "?"}°C · ${Math.round(gpu.powerW ?? 0)} W` : "no NVIDIA GPU"} />
        <Ring
          label="VRAM"
          pct={vram}
          detail={gpu ? `${(gpu.memUsedMb / 1024).toFixed(1)} / ${(gpu.memTotalMb / 1024).toFixed(0)} GB` : "—"}
        />
      </div>

      <div className="spark-grid">
        {(
          [
            ["CPU", history.map((h) => h.cpu), "#3a7bff"],
            ["RAM", history.map((h) => h.ram), "#b36bff"],
            ["GPU", history.map((h) => h.gpu), "#10a37f"],
            ["VRAM", history.map((h) => h.vram), "#ff9f43"],
          ] as const
        ).map(([label, values, color]) => (
          <div key={label} className="spark-box">
            <span>{label} · last 2 min</span>
            <Spark values={[...values]} color={color} />
          </div>
        ))}
      </div>

      <div className="hw-names">
        <span>⚙ {stats.cpuName}</span>
        {gpu && <span>▣ {gpu.name}</span>}
        {stats.gpuNote && <span className="warn">{stats.gpuNote}</span>}
      </div>

      <h4 className="sessions-h">Cores</h4>
      <div className="cores">
        {stats.cores.map((c, i) => (
          <motion.i key={i} animate={{ backgroundColor: tone(c), opacity: 0.25 + (c / 100) * 0.75 }} title={`Thread ${i}: ${Math.round(c)}%`} />
        ))}
      </div>

      <h4 className="sessions-h">Heaviest processes</h4>
      <div className="procs">
        {stats.top.map((p) => (
          <div key={p.name} className="proc">
            <strong>{p.name}</strong>
            <span>{p.cpu.toFixed(1)}% CPU</span>
            <span>{p.memMb >= 1024 ? `${(p.memMb / 1024).toFixed(1)} GB` : `${Math.round(p.memMb)} MB`}</span>
            <span>{p.gpuMemMb ? `${(p.gpuMemMb / 1024).toFixed(1)} GB VRAM` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
