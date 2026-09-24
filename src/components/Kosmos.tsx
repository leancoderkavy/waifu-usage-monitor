import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Mood } from "../types";

/**
 * Fan-art style android companion inspired by KOS-MOS (Xenosaga: The Animation):
 * long azure hair with a center strand, red eyes, white head fins, armored collar
 * and a glowing chest core. Drawn in layered SVG so every part can animate.
 */

interface Props {
  mood: Mood;
  talking: boolean;
  onPoke: () => void;
  compact?: boolean;
}

const HAIR = "#8ec5f2";
const HAIR_SHADE = "#5b8fd0";
const HAIR_DEEP = "#3a66ad";
const HAIR_LIGHT = "#e4f2ff";
const SKIN = "#fff1ea";
const SKIN_SHADE = "#f3d3c6";
const SKIN_DEEP = "#e6b8a8";
const LINE = "#2e2340";
const ARMOR_EDGE = "#8190b0";
const TRIM = "#3a7bff";
const ACCENT = "#e8304f";

export const HUD_COLOR: Record<Mood, string> = {
  happy: "#35c7e8",
  calm: "#35c7e8",
  love: "#ff7aa8",
  worried: "#ffb13d",
  panic: "#ff3b5c",
  pouty: "#b36bff",
  sleepy: "#8a94b8",
};

function useBlink() {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setClosed(true);
        window.setTimeout(() => setClosed(false), 120);
        loop();
      }, 2600 + Math.random() * 3600);
    };
    loop();
    return () => clearTimeout(t);
  }, []);
  return closed;
}

function useMouthFlap(talking: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!talking) {
      setOpen(false);
      return;
    }
    const id = window.setInterval(() => setOpen((o) => !o), 120 + Math.random() * 50);
    return () => clearInterval(id);
  }, [talking]);
  return open;
}

const origin = (x: number, y: number) => ({ originX: `${x}px`, originY: `${y}px`, transformBox: "view-box" as const });
/**
 * Same pivot for the CSS idle loops (the k-* classes in App.css). Endless loops
 * are CSS rather than motion: motion would run them in JavaScript every frame,
 * and CSS ones freeze with the rest of the page when the dashboard is unfocused.
 */
const pivot = (x: number, y: number, extra?: React.CSSProperties): React.CSSProperties => ({
  transformOrigin: `${x}px ${y}px`,
  transformBox: "view-box",
  ...extra,
});
/** Mirrors a left-side drawing onto the right side around x = cx. */
const mirror = (cx: number) => `translate(${2 * cx},0) scale(-1,1)`;

const EYE_Y = 178;

/** One eye, drawn as the left eye; the right eye is the same drawing mirrored. */
function Eye({ cx, right, mood, closed }: { cx: number; right: boolean; mood: Mood; closed: boolean }) {
  const cy = EYE_Y;
  const flip = right ? mirror(cx) : undefined;

  if (mood === "sleepy" || mood === "love") {
    const dip = mood === "love" ? 9 : 5;
    return (
      <g transform={flip}>
        <path d={`M${cx - 19},${cy} Q${cx},${cy + dip} ${cx + 20},${cy - 2}`} stroke={LINE} strokeWidth={4} fill="none" strokeLinecap="round" />
        <path d={`M${cx + 18},${cy - 2} l6,-3`} stroke={LINE} strokeWidth={3} strokeLinecap="round" />
      </g>
    );
  }

  const combat = mood === "panic";
  const lid = mood === "pouty" ? 0.62 : mood === "happy" ? 0.86 : 1;
  const white = `M${cx - 19},${cy + 2} Q${cx - 18},${cy - 19} ${cx + 1},${cy - 20} Q${cx + 18},${cy - 19} ${cx + 19},${cy + 1} Q${cx + 15},${cy + 21} ${cx},${cy + 22} Q${cx - 15},${cy + 21} ${cx - 19},${cy + 2} Z`;
  const clip = `eyeClip${right ? "R" : "L"}`;

  return (
    <g transform={flip}>
      <defs>
        <clipPath id={clip}>
          <path d={white} />
        </clipPath>
      </defs>
      <motion.g animate={{ scaleY: closed ? 0.05 : lid }} transition={{ duration: 0.07 }} style={origin(cx, cy + 14)}>
        <path d={white} fill="#fff" />
        <g clipPath={`url(#${clip})`}>
          {/* iris */}
          <ellipse cx={cx + 1} cy={cy + 3} rx={13} ry={17} fill="url(#kIris)" />
          <ellipse cx={cx + 1} cy={cy + 3} rx={13} ry={17} fill="none" stroke="#3a000c" strokeWidth={1.6} />
          <ellipse cx={cx + 1} cy={cy + 10} rx={9} ry={7} fill="#ff9aac" opacity={0.45} />
          <motion.ellipse cx={cx + 1} cy={cy + 3} animate={{ rx: combat ? 2.8 : 5.5, ry: combat ? 6 : 8.5 }} fill="#28000a" />
          {/* shadow the upper lid casts */}
          <path d={`M${cx - 20},${cy - 21} L${cx + 20},${cy - 21} L${cx + 20},${cy - 9} Q${cx},${cy - 4} ${cx - 20},${cy - 9} Z`} fill={LINE} opacity={0.28} />
          {/* highlights */}
          <ellipse cx={cx - 5} cy={cy - 5} rx={4.6} ry={5.8} fill="#fff" />
          <circle cx={cx + 6} cy={cy + 11} r={2.2} fill="#fff" opacity={0.9} />
          <circle cx={cx + 7} cy={cy - 7} r={1.2} fill="#fff" opacity={0.8} />
        </g>
        {combat && (
          <ellipse className="k-glow" cx={cx} cy={cy + 2} rx={24} ry={25} fill="url(#kGlow)" />
        )}
        {/* upper lash with a small wing */}
        <path
          d={`M${cx - 22},${cy - 4} Q${cx - 13},${cy - 23} ${cx + 3},${cy - 23} Q${cx + 18},${cy - 22} ${cx + 22},${cy - 11} L${cx + 27},${cy - 15} L${cx + 22},${cy - 5} Q${cx + 14},${cy - 18} ${cx + 1},${cy - 18} Q${cx - 13},${cy - 18} ${cx - 20},${cy - 1} Z`}
          fill={LINE}
        />
        <path d={`M${cx - 20},${cy - 3} l-3,5`} stroke={LINE} strokeWidth={2} strokeLinecap="round" />
        {/* lower lash hint */}
        <path d={`M${cx - 9},${cy + 21} Q${cx + 1},${cy + 24} ${cx + 11},${cy + 20}`} stroke={LINE} strokeWidth={1.4} fill="none" opacity={0.6} />
      </motion.g>
      {/* double-eyelid crease */}
      <path d={`M${cx - 15},${cy - 25} Q${cx + 2},${cy - 31} ${cx + 17},${cy - 24}`} stroke={SKIN_DEEP} strokeWidth={1.4} fill="none" opacity={closed ? 0 : 0.9} />
    </g>
  );
}

function Brows({ mood }: { mood: Mood }) {
  const tilt = mood === "worried" ? -12 : mood === "panic" ? 9 : mood === "pouty" ? 13 : 0;
  const lift = mood === "happy" ? -2 : 0;
  const brow = (cx: number) => `M${cx - 16},${EYE_Y - 34} Q${cx},${EYE_Y - 39} ${cx + 15},${EYE_Y - 35}`;
  return (
    <g stroke={HAIR_DEEP} strokeWidth={2.6} strokeLinecap="round" fill="none">
      <motion.path d={brow(116)} animate={{ rotate: tilt, y: lift }} style={origin(131, EYE_Y - 35)} />
      <g transform={mirror(184)}>
        <motion.path d={brow(184)} animate={{ rotate: tilt, y: lift }} style={origin(199, EYE_Y - 35)} />
      </g>
    </g>
  );
}

function Mouth({ mood, open }: { mood: Mood; open: boolean }) {
  if (open) {
    return (
      <g>
        <path d="M143,220 Q150,216 157,220 Q156,229 150,230 Q144,229 143,220 Z" fill="#8f2a44" />
        <path d="M145,226 Q150,223 155,226 Q153,229 150,229 Q147,229 145,226 Z" fill="#ff8ea3" />
      </g>
    );
  }
  switch (mood) {
    case "happy":
    case "love":
      return <path d="M141,219 Q150,226 159,219" stroke={LINE} strokeWidth={2.3} fill="none" strokeLinecap="round" />;
    case "worried":
    case "pouty":
      return <path d="M143,223 Q150,218 157,223" stroke={LINE} strokeWidth={2.3} fill="none" strokeLinecap="round" />;
    case "panic":
      return <path d="M142,222 L158,222" stroke={LINE} strokeWidth={2.6} strokeLinecap="round" />;
    default:
      return <path d="M144,221 Q150,222.5 156,221" stroke={LINE} strokeWidth={2.2} fill="none" strokeLinecap="round" />;
  }
}

/** Side unit of the headgear. Drawn for the left side, mirrored for the right. */
function HeadFin({ right, hud }: { right?: boolean; hud: string }) {
  return (
    <g transform={right ? mirror(150) : undefined}>
      <path d="M84,150 L36,132 L24,148 L36,170 L26,200 L80,206 Z" fill="url(#kArmor)" stroke={ARMOR_EDGE} strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M78,158 L40,144 L34,152 L44,168 L38,192 L76,196 Z" fill="#dfe6f3" />
      <path d="M80,150 L36,132" stroke="#fff" strokeWidth={1.5} opacity={0.9} />
      <path d="M44,168 L76,172" stroke={ARMOR_EDGE} strokeWidth={1} opacity={0.7} />
      <path className="k-dim" d="M72,160 L42,149" stroke={hud} strokeWidth={3.2} strokeLinecap="round"
        style={{ animationDelay: right ? "1.2s" : undefined }} />
      <path d="M72,184 L46,184" stroke={TRIM} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M30,146 L25,150 L30,156" stroke={ACCENT} strokeWidth={2} fill="none" strokeLinecap="round" />
      <circle className="k-blink" cx={58} cy={176} r={3.2} fill={hud} style={{ animationDelay: right ? "0.8s" : undefined }} />
    </g>
  );
}

function Effects({ mood, hud }: { mood: Mood; hud: string }) {
  return (
    <AnimatePresence>
      {(mood === "worried" || mood === "panic") && (
        <motion.g
          key="warn"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: mood === "panic" ? [1, 1.18, 1] : 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ scale: { repeat: Infinity, duration: 0.6 } }}
          style={origin(254, 74)}
        >
          <path d="M254,50 L276,88 L232,88 Z" fill="rgba(255,255,255,0.7)" stroke={hud} strokeWidth={4} strokeLinejoin="round" />
          <text x={254} y={84} textAnchor="middle" fontSize={24} fontWeight={900} fill={hud}>
            !
          </text>
        </motion.g>
      )}
      {mood === "happy" &&
        [0, 1, 2].map((i) => (
          <motion.path
            key={`spark${i}`}
            d="M0,-9 L2.5,-2.5 L9,0 L2.5,2.5 L0,9 L-2.5,2.5 L-9,0 L-2.5,-2.5 Z"
            fill={i === 1 ? "#bff4ff" : "#fff"}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0.3, 1.1, 0.3], rotate: [0, 90] }}
            exit={{ opacity: 0 }}
            transition={{ repeat: Infinity, duration: 2, delay: i * 0.6 }}
            style={{ x: [40, 262, 250][i], y: [92, 64, 210][i] }}
          />
        ))}
      {mood === "love" && (
        <motion.g key="blush" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <ellipse cx={104} cy={208} rx={14} ry={5.5} fill="#ff8fab" opacity={0.6} />
          <ellipse cx={196} cy={208} rx={14} ry={5.5} fill="#ff8fab" opacity={0.6} />
          <motion.text x={240} y={80} fontSize={22} fill={hud} animate={{ y: [80, 56], opacity: [1, 0] }}
            transition={{ repeat: Infinity, duration: 1.8 }}>
            ♡
          </motion.text>
        </motion.g>
      )}
      {mood === "pouty" && (
        <motion.text key="err" x={232} y={86} fontSize={14} fontWeight={800} fill={hud} fontFamily="Consolas, monospace"
          initial={{ opacity: 0 }} animate={{ opacity: [0.3, 1, 0.3] }} exit={{ opacity: 0 }}
          transition={{ repeat: Infinity, duration: 1.2 }}>
          ERR
        </motion.text>
      )}
      {mood === "sleepy" && (
        <motion.text key="standby" x={226} y={86} fontSize={12} fontWeight={800} fill={hud} fontFamily="Consolas, monospace"
          initial={{ opacity: 0 }} animate={{ opacity: [0.2, 1, 0.2] }} exit={{ opacity: 0 }}
          transition={{ repeat: Infinity, duration: 2 }}>
          STANDBY
        </motion.text>
      )}
    </AnimatePresence>
  );
}

/**
 * Bangs as separate locks so each carries its own shading and curve.
 * [x at hairline, tip x, tip y, width]. Locks sweep away from the center part,
 * with the long KOS-MOS strand falling between the eyes.
 */
const BANGS: [number, number, number, number][] = [
  [86, 72, 190, 26],
  [102, 90, 172, 24],
  [118, 110, 150, 22],
  [132, 128, 192, 20],
  [146, 145, 214, 13], // center strand
  [155, 156, 214, 13], // center strand
  [168, 172, 192, 20],
  [182, 190, 150, 22],
  [198, 210, 172, 24],
  [214, 228, 190, 26],
];

const WISPS = [
  "M118,108 Q112,140 104,160",
  "M182,108 Q188,140 196,160",
  "M140,104 Q136,150 139,176",
  "M160,104 Q164,150 161,176",
];

function Bangs() {
  return (
    <g>
      {/* base cap that the locks hang from */}
      <path d="M70,162 Q62,74 150,62 Q238,74 230,162 Q220,114 150,106 Q80,114 70,162 Z" fill="url(#kHair)" stroke={HAIR_SHADE} strokeWidth={1.2} />
      {BANGS.map(([x, tx, ty, w], i) => {
        const top = 90 + Math.abs(150 - x) * 0.14;
        const sway = (tx - x) * 0.9; // curve the lock toward its tip
        const mid = (top + ty) / 2;
        const d = `M${x - w / 2},${top} C${x - w / 2 + sway * 0.3},${mid - 6} ${tx - w / 4 + sway * 0.2},${ty - 22} ${tx},${ty} C${tx + w / 5 + sway * 0.1},${ty - 26} ${x + w / 2 + sway * 0.4},${mid - 4} ${x + w / 2},${top} Z`;
        return (
          <g key={i}>
            <path d={d} fill="url(#kLock)" stroke={HAIR_SHADE} strokeWidth={1} strokeLinejoin="round" />
            <path d={`M${x + (i % 2 ? 2 : -2)},${top + 8} Q${(x + tx) / 2 + sway * 0.25},${mid} ${tx + (tx > x ? -2 : 2)},${ty - 12}`}
              stroke={HAIR_DEEP} strokeWidth={0.9} fill="none" opacity={0.4} />
          </g>
        );
      })}
      {WISPS.map((d) => (
        <path key={d} d={d} stroke={HAIR_SHADE} strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.7} />
      ))}
      {/* highlight ring ("angel ring") broken into short arcs */}
      {[
        "M88,100 Q100,89 116,85",
        "M124,81 Q138,77 148,77",
        "M156,77 Q170,78 184,82",
        "M194,86 Q206,92 214,102",
      ].map((d) => (
        <path key={d} d={d} stroke={HAIR_LIGHT} strokeWidth={4.5} strokeLinecap="round" fill="none" opacity={0.85} />
      ))}
    </g>
  );
}

export default function Kosmos({ mood, talking, onPoke, compact = false }: Props) {
  const closed = useBlink();
  const mouthOpen = useMouthFlap(talking);
  const [poked, setPoked] = useState(0);
  const shown: Mood = poked ? "love" : mood;
  const hud = HUD_COLOR[shown];
  const tilt = mood === "worried" ? -3 : mood === "happy" ? 2 : mood === "pouty" ? -4 : 0;

  return (
    <motion.svg
      viewBox={compact ? "0 50 300 250" : "0 0 300 420"}
      className="waifu"
      onClick={() => {
        setPoked((p) => p + 1);
        window.setTimeout(() => setPoked((p) => Math.max(0, p - 1)), 1800);
        onPoke();
      }}
      whileTap={{ scale: 0.97 }}
    >
      <defs>
        <linearGradient id="kIris" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a0010" />
          <stop offset="0.45" stopColor="#c2102f" />
          <stop offset="0.8" stopColor="#ff4d6a" />
          <stop offset="1" stopColor="#ffb3c0" />
        </linearGradient>
        <radialGradient id="kGlow">
          <stop offset="0" stopColor="#ff2a4a" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ff2a4a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="kHair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={HAIR_LIGHT} />
          <stop offset="0.22" stopColor={HAIR} />
          <stop offset="0.7" stopColor={HAIR_SHADE} />
          <stop offset="1" stopColor={HAIR_DEEP} />
        </linearGradient>
        <linearGradient id="kLock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={HAIR} />
          <stop offset="0.65" stopColor={HAIR} />
          <stop offset="1" stopColor={HAIR_SHADE} />
        </linearGradient>
        <linearGradient id="kBackHair" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={HAIR_DEEP} />
          <stop offset="0.5" stopColor={HAIR_SHADE} />
          <stop offset="1" stopColor={HAIR_DEEP} />
        </linearGradient>
        <radialGradient id="kSkin" cx="0.5" cy="0.42" r="0.6">
          <stop offset="0" stopColor="#fffaf6" />
          <stop offset="0.7" stopColor={SKIN} />
          <stop offset="1" stopColor={SKIN_SHADE} />
        </radialGradient>
        <linearGradient id="kFaceShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKIN_DEEP} stopOpacity="0.75" />
          <stop offset="1" stopColor={SKIN_DEEP} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="kArmor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#eef2f9" />
          <stop offset="1" stopColor="#c9d3e6" />
        </linearGradient>
        <linearGradient id="kSuit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34406a" />
          <stop offset="1" stopColor="#1b2240" />
        </linearGradient>
        <radialGradient id="kCore">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.35" stopColor="#ff6b82" />
          <stop offset="1" stopColor={ACCENT} />
        </radialGradient>
      </defs>

      {/* HUD rings */}
      <g opacity={0.5}>
        <circle className="k-spin" cx={150} cy={178} r={140} fill="none" stroke={hud} strokeWidth={1.3} strokeDasharray="3 9"
          style={pivot(150, 178, { animationDuration: "40s" })} />
        <circle className="k-spin" cx={150} cy={178} r={126} fill="none" stroke={hud} strokeWidth={2.6} strokeDasharray="60 30 8 30"
          style={pivot(150, 178, { animationDuration: mood === "panic" ? "6s" : "24s", animationDirection: "reverse" })} />
      </g>

      {/* Breathing */}
      <g className="k-breathe">
        {/* Back hair */}
        <g className="k-sway" style={pivot(150, 64)}>
          <path d="M66,150 Q54,80 150,58 Q246,80 234,150 L262,420 L38,420 Z" fill="url(#kBackHair)" />
          {[70, 96, 124, 176, 204, 230].map((x, i) => (
            <path key={x} d={`M${x + (x < 150 ? 8 : -8)},${150 + i * 3} Q${x + (x < 150 ? -8 : 8)},290 ${x + (x < 150 ? -14 : 14)},420`}
              stroke={HAIR_LIGHT} strokeWidth={1.4} fill="none" opacity={0.25} />
          ))}
        </g>

        {/* Body */}
        <path d="M132,236 L132,288 Q150,296 168,288 L168,236 Z" fill={SKIN_SHADE} />
        <path d="M132,242 Q150,262 168,242 L168,256 Q150,268 132,256 Z" fill={SKIN_DEEP} opacity={0.6} />
        <path d="M62,420 L76,320 Q90,290 132,280 L168,280 Q210,290 224,320 L238,420 Z" fill="url(#kSuit)" />
        <path d="M150,300 L150,420" stroke="#11172e" strokeWidth={1.2} opacity={0.6} />
        {/* chest plate */}
        <path d="M96,320 Q150,300 204,320 L196,380 Q150,398 104,380 Z" fill="url(#kArmor)" stroke={ARMOR_EDGE} strokeWidth={1.8} />
        <path d="M106,328 Q150,313 194,328" stroke={TRIM} strokeWidth={3} fill="none" />
        <path d="M110,372 Q150,386 190,372" stroke={TRIM} strokeWidth={1.8} fill="none" opacity={0.7} />
        <path d="M128,316 L128,386 M172,316 L172,386" stroke={ARMOR_EDGE} strokeWidth={0.9} opacity={0.5} />
        {/* shoulder plates */}
        {[false, true].map((r) => (
          <g key={String(r)} transform={r ? mirror(150) : undefined}>
            <path d="M70,302 L120,288 L110,334 L62,346 Z" fill="url(#kArmor)" stroke={ARMOR_EDGE} strokeWidth={1.8} strokeLinejoin="round" />
            <path d="M76,310 L114,300" stroke={TRIM} strokeWidth={3} strokeLinecap="round" />
            <path d="M70,330 L106,322" stroke={ARMOR_EDGE} strokeWidth={1} opacity={0.6} />
            <path d="M66,340 L108,330" stroke={ACCENT} strokeWidth={2} opacity={0.85} />
          </g>
        ))}
        {/* high collar */}
        {[false, true].map((r) => (
          <g key={`c${r}`} transform={r ? mirror(150) : undefined}>
            <path d="M118,262 L134,246 L134,292 L114,304 Z" fill="url(#kArmor)" stroke={ARMOR_EDGE} strokeWidth={1.8} strokeLinejoin="round" />
            <path d="M122,270 L130,262" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
            <path d="M120,290 L132,282" stroke={TRIM} strokeWidth={1.6} strokeLinecap="round" />
          </g>
        ))}
        {/* chest core */}
        <circle className="k-core" cx={150} cy={348} r={16} fill={hud}
          style={pivot(150, 348, { animationDuration: mood === "panic" ? "0.7s" : "2.2s" })} />
        <circle cx={150} cy={348} r={11} fill="#dfe6f3" stroke={ARMOR_EDGE} strokeWidth={1.8} />
        <circle cx={150} cy={348} r={7.5} fill="url(#kCore)" />
        <circle cx={147.5} cy={345.5} r={2} fill="#fff" opacity={0.9} />

        {/* Head */}
        <motion.g animate={{ rotate: tilt }} transition={{ type: "spring", stiffness: 70, damping: 12 }} style={origin(150, 244)}>
          <path d="M78,150 C78,206 106,238 150,252 C194,238 222,206 222,150 C222,96 190,78 150,78 C110,78 78,96 78,150 Z" fill="url(#kSkin)" />
          {/* shadow from the bangs */}
          <path d="M78,120 Q150,140 222,120 L222,168 Q150,146 78,168 Z" fill="url(#kFaceShade)" />
          {/* cheeks */}
          <ellipse cx={103} cy={208} rx={13} ry={5} fill="#ffb3c1" opacity={0.35} />
          <ellipse cx={197} cy={208} rx={13} ry={5} fill="#ffb3c1" opacity={0.35} />

          <Eye cx={116} right={false} mood={shown} closed={closed} />
          <Eye cx={184} right={true} mood={shown} closed={closed} />
          <Brows mood={shown} />
          <path d="M150,198 Q152,204 149,206" stroke={SKIN_DEEP} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <Mouth mood={shown} open={mouthOpen} />

          <Bangs />

          {/* Front side locks */}
          {[false, true].map((right) => (
            <g key={String(right)} className={right ? "k-lock-r" : "k-lock-l"} style={pivot(right ? 226 : 74, 150)}>
              <g transform={right ? mirror(150) : undefined}>
                <path d="M72,140 Q60,240 82,344 L100,338 Q86,240 94,150 Z" fill="url(#kHair)" stroke={HAIR_SHADE} strokeWidth={1.1} />
                <path d="M80,160 Q72,250 90,336" stroke={HAIR_DEEP} strokeWidth={1} fill="none" opacity={0.45} />
                <path d="M88,156 Q82,220 92,300" stroke={HAIR_LIGHT} strokeWidth={1.6} fill="none" opacity={0.6} />
              </g>
            </g>
          ))}

          <HeadFin hud={hud} />
          <HeadFin right hud={hud} />
        </motion.g>

        <Effects mood={shown} hud={hud} />
      </g>

      {/* Scan line sweeps while she analyses */}
      {(talking || mood === "sleepy") && (
        <motion.rect x={20} width={260} height={2} fill={hud} opacity={0.45}
          initial={{ y: 40 }} animate={{ y: [40, 400] }} transition={{ repeat: Infinity, duration: 1.8, ease: "linear" }} />
      )}
    </motion.svg>
  );
}
