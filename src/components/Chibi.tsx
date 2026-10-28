import { useId } from "react";

/** Chibi model sheets drawn from the portraits in public/waifus. */
export type ChibiId = "sakura" | "yuki" | "akane" | "luna";

interface Look {
  hair: [string, string, string]; // base, shade, shine
  eyes: [string, string];         // iris top, iris bottom
  skin: string;
  top: [string, string];          // outfit, outfit shade
  legs: string;
  shoes: string;
  long: boolean;
}

const LOOKS: Record<ChibiId, Look> = {
  sakura: { hair: ["#f7a8c4", "#e07aa0", "#ffe0ec"], eyes: ["#2f8a3c", "#9be37a"], skin: "#ffe7da",
    top: ["#fff1a8", "#f6b3d1"], legs: "#ffe7da", shoes: "#f27aa6", long: true },
  yuki: { hair: ["#e4e8f0", "#aab3c6", "#ffffff"], eyes: ["#3b6fb0", "#a9d6ff"], skin: "#fff0e6",
    top: ["#f6f7fb", "#cfd4e2"], legs: "#7d8496", shoes: "#6d4c3d", long: true },
  akane: { hair: ["#d63a2f", "#9e1f1a", "#ff8a6e"], eyes: ["#b5560f", "#ffc24a"], skin: "#ffe5d6",
    top: ["#3b2c2a", "#251b1a"], legs: "#1f1a22", shoes: "#2a1d1a", long: false },
  luna: { hair: ["#a98bdc", "#7457b3", "#e2d4ff"], eyes: ["#7a3fc4", "#e0a8ff"], skin: "#fbe9e4",
    top: ["#26232e", "#16141c"], legs: "#2b2240", shoes: "#3a3150", long: false },
};

const INK = "#3a2433";

function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.45 : r;
    return `${(x + Math.cos(a) * d).toFixed(2)},${(y + Math.sin(a) * d).toFixed(2)}`;
  }).join(" ");
  return <polygon points={points} fill={fill} stroke="#b07a10" strokeWidth=".5" strokeLinejoin="round" />;
}

function Snowflake({ x, y }: { x: number; y: number }) {
  return <g stroke="#7cc8ff" strokeWidth="1.1" strokeLinecap="round">
    {[0, 60, 120].map(a => <line key={a} x1={x - 3} y1={y} x2={x + 3} y2={y} transform={`rotate(${a} ${x} ${y})`} />)}
  </g>;
}

function Eye({ cx, sleepy, id }: { cx: number; sleepy: boolean; id: string }) {
  return <g>
    <ellipse cx={cx} cy={39.5} rx={4.2} ry={sleepy ? 3.4 : 5.2} fill={`url(#${id}-iris)`} />
    <ellipse cx={cx} cy={sleepy ? 40.4 : 40.2} rx={1.9} ry={sleepy ? 1.8 : 2.6} fill={INK} opacity=".85" />
    <circle cx={cx - 1.4} cy={sleepy ? 38.8 : 37.2} r={1.5} fill="#fff" />
    <circle cx={cx + 1.5} cy={42} r={.7} fill="#fff" opacity=".9" />
    {sleepy
      ? <path d={`M${cx - 5} 37.2h10`} stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
      : <path d={`M${cx - 5} 35.4Q${cx} 32.6 ${cx + 5} 35.4`} fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />}
  </g>;
}

/** Layered so the walk cycle can swing limbs, hair and blink independently (see DesktopAgents.css). */
export default function Chibi({ who, emblem }: { who: ChibiId; emblem: string }) {
  const id = useId().replace(/:/g, "");
  const look = LOOKS[who];
  const [hair, shade, shine] = look.hair;
  const line = { stroke: INK, strokeWidth: 1.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  const leg = (x: number, cls: string) => <g className={`agent-leg ${cls}`}>
    <rect x={x - 3.2} y={74} width={6.4} height={18} rx={3} fill={look.legs} {...line} />
    {who === "sakura" && <rect x={x - 3.2} y={86} width={6.4} height={5} fill="#fff" />}
    {who === "luna" && <path d={`M${x - 3.2} 80h6.4M${x - 3.2} 84h6.4M${x - 3.2} 88h6.4`} stroke="#9d7be0" strokeWidth="1.6" />}
    <path d={`M${x - 4} 90.5h7a4 4 0 0 1 4 4V97h-11z`} fill={look.shoes} {...line} />
  </g>;
  const arm = (x: number, cls: string, sleeve: string) => <g className={`agent-arm ${cls}`}>
    <rect x={x - 3} y={54} width={6} height={15} rx={3} fill={sleeve} {...line} />
    <circle cx={x} cy={69.5} r={2.8} fill={look.skin} {...line} />
  </g>;

  return <svg className="agent-art" viewBox="0 0 80 100" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-iris`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={look.eyes[0]} /><stop offset="1" stopColor={look.eyes[1]} />
      </linearGradient>
      <linearGradient id={`${id}-hair`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={hair} /><stop offset="1" stopColor={shade} />
      </linearGradient>
      <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1">
        {who === "sakura"
          ? <><stop offset="0" stopColor="#fff1a8" /><stop offset=".5" stopColor="#bdf0b0" /><stop offset="1" stopColor="#f6b3d1" /></>
          : <><stop offset="0" stopColor={look.top[0]} /><stop offset="1" stopColor={look.top[1]} /></>}
      </linearGradient>
    </defs>
    <ellipse className="agent-shadow" cx="40" cy="97.5" rx="16" ry="2.6" />
    <g className="agent-bob">
      {/* Hair that falls behind the body. */}
      {who === "yuki" && <path className="agent-hair-back" d="M19 30C16 52 18 70 21 82Q40 88 59 82C62 70 64 52 61 30Z" fill={`url(#${id}-hair)`} {...line} />}
      {who === "sakura" && <>
        <path className="agent-tail left" d="M22 46C15 56 15 68 19 78Q22 74 24 70C23 62 25 54 27 48Z" fill={`url(#${id}-hair)`} {...line} />
        <path className="agent-tail right" d="M58 46C65 56 65 68 61 78Q58 74 56 70C57 62 55 54 53 48Z" fill={`url(#${id}-hair)`} {...line} />
      </>}
      {!look.long && <path d="M20 30C19 42 21 50 25 54H55C59 50 61 42 60 30Z" fill={shade} {...line} />}

      {leg(44, "back")}
      {arm(50, "back", look.top[1])}

      {/* Outfit. */}
      <path className="agent-coat" d="M30 53Q40 49 50 53L54 76Q40 80 26 76Z" fill={`url(#${id}-top)`} {...line} />
      {who === "sakura" && <><path d="M34 53l6 7 6-7" fill="#fff" {...line} /><path d="M37 60v7M43 60v7" stroke="#fff" strokeWidth="1" /></>}
      {who === "yuki" && <path d="M33 53q7 5 14 0v-4q-7 3-14 0z" fill="#fff" {...line} />}
      {who === "akane" && <>
        <path d="M34 53l6 10 6-10z" fill="#fff" {...line} />
        <path d="M39 55h2l1 8-2 3-2-3z" fill="#d63a2f" stroke="#7a1410" strokeWidth=".6" />
        <path d="M27 72Q40 76 53 72L55 80Q40 84 25 80Z" fill="#6b2020" {...line} />
      </>}
      {who === "luna" && <><path d="M33 53q7 6 14 0" fill="none" stroke="#3d3848" strokeWidth="3" /><path d="M37 56v8M43 56v8" stroke="#cfc7e6" strokeWidth=".9" /></>}
      <text className="agent-emblem" x="47.5" y="71">{emblem}</text>

      {leg(36, "front")}
      {arm(30, "front", look.top[0])}

      {/* Head. */}
      <g className="agent-head">
        <rect x="37" y="48" width="6" height="6" fill={look.skin} {...line} />
        {who === "sakura" && <g>
          <path d="M27 52Q40 60 53 52" fill="none" stroke="#e8f4ff" strokeWidth="2.6" />
          <circle cx="27.5" cy="52.5" r="3.6" fill="#fff" {...line} /><circle cx="27.5" cy="52.5" r="1.8" fill="#8fe0e6" />
          <circle cx="52.5" cy="52.5" r="3.6" fill="#fff" {...line} /><circle cx="52.5" cy="52.5" r="1.8" fill="#8fe0e6" />
        </g>}
        <path d="M22 30C22 45 30 51.5 40 51.5S58 45 58 30C58 20 50 16 40 16S22 20 22 30Z" fill={look.skin} {...line} />
        <g className="agent-eyes"><Eye cx={33} sleepy={who === "luna"} id={id} /><Eye cx={47} sleepy={who === "luna"} id={id} /></g>
        <ellipse cx="29" cy="45" rx="3" ry="1.5" fill="#ff8fa8" opacity={who === "akane" ? .75 : .45} />
        <ellipse cx="51" cy="45" rx="3" ry="1.5" fill="#ff8fa8" opacity={who === "akane" ? .75 : .45} />
        {who === "sakura" && <path d="M37.2 45.4q2.8 2.6 5.6 0" fill="#c4415e" {...line} strokeWidth="1" />}
        {who === "yuki" && <path d="M38.4 46q1.6 1 3.2 0" fill="none" {...line} strokeWidth="1" />}
        {who === "akane" && <path d="M38 46.4q1-1 2 0t2 0" fill="none" {...line} strokeWidth="1" />}
        {who === "luna" && <path d="M38.6 46.2h2.8" {...line} strokeWidth="1" />}
        {who === "yuki" && <g fill="#ffffff22" stroke="#8a8f9e" strokeWidth=".9">
          <circle cx="33" cy="39.5" r="6.2" /><circle cx="47" cy="39.5" r="6.2" /><path d="M39.2 39q.8-.8 1.6 0" fill="none" />
        </g>}

        {/* Bangs and side locks. */}
        <g className="agent-hair">
          <path d="M18.5 37C17 18 27 9.5 40 9.5S63 18 61.5 37L59 37Q57.5 31 55 28.5Q53.5 32.5 50.5 32Q48.5 28 46 25.5Q44.5 30.5 41 31Q39.5 27 37 25.5Q35.5 30 31.5 31Q30 28 27.5 26.5Q26.5 31 23.5 32Q22 33 21 37Z"
            fill={`url(#${id}-hair)`} {...line} />
          <path className="agent-lock left" d={look.long ? "M19 30Q17 46 22 56Q25 46 24.5 34Z" : "M19 30Q17 44 21 52Q25 52 26 50Q24 44 24.5 34Z"} fill={hair} {...line} />
          <path className="agent-lock right" d={look.long ? "M61 30Q63 46 58 56Q55 46 55.5 34Z" : "M61 30Q63 44 59 52Q55 52 54 50Q56 44 55.5 34Z"} fill={hair} {...line} />
          <path d="M26 19Q40 13 54 19" fill="none" stroke={shine} strokeWidth="2.2" strokeLinecap="round" opacity=".8" />
          <path d="M39 10q3-3 1-5.5" fill="none" stroke={shade} strokeWidth="1.6" strokeLinecap="round" />
        </g>
        {who === "akane" && <>
          <path d="M28.5 31l5.5 1.6M51.5 31l-5.5 1.6" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          <g transform="translate(20 18) rotate(-20)"><path d="M0 0l-7-4v8zM0 0l7-4v8z" fill="#4a3346" stroke="#8a7090" strokeWidth="1" strokeLinejoin="round" /><circle r="1.8" fill="#1d1a20" /></g>
        </>}
        {who === "sakura" && <>
          <path d="M18 52l-4 2 2 3 4-3zM62 52l4 2-2 3-4-3z" fill="#6fd6d0" {...line} strokeWidth=".8" />
        </>}
        {who === "yuki" && <><Snowflake x={26.5} y={22} /><Snowflake x={53.5} y={22} /></>}
        {who === "luna" && <>
          <path d="M19 30Q19 8 40 8T61 30" fill="none" stroke="#1d1a26" strokeWidth="2.6" />
          <path d="M22 17l1-11 9 6z" fill="#1d1a26" {...line} /><path d="M24 14l.6-5.4 4.4 3z" fill="#c78bff" className="agent-glow" />
          <path d="M58 17l-1-11-9 6z" fill="#1d1a26" {...line} /><path d="M56 14l-.6-5.4-4.4 3z" fill="#c78bff" className="agent-glow" />
          <circle cx="18.5" cy="34" r="4.4" fill="#1d1a26" {...line} /><circle cx="18.5" cy="34" r="2.2" fill="#c78bff" className="agent-glow" />
          <circle cx="61.5" cy="34" r="4.4" fill="#1d1a26" {...line} /><circle cx="61.5" cy="34" r="2.2" fill="#c78bff" className="agent-glow" />
          <Star x={31} y={23} r={2.6} fill="#ffd34d" /><Star x={51} y={26} r={2} fill="#ffd34d" />
        </>}
      </g>
    </g>
    <text className="agent-z" x="60" y="10">z</text>
  </svg>;
}
