// Generates a 5K (5120x2880) anime-style KOS-MOS fan-art wallpaper as SVG.
// Usage: node wallpaper/kosmos-wallpaper.mjs > wallpaper/kosmos-5k.svg
// The character reuses the palette and proportions of src/components/Kosmos.tsx.

const W = 5120;
const H = 2880;

const HAIR = "#8cc4f0";
const HAIR_DARK = "#4a7fc0";
const HAIR_LIGHT = "#e4f3ff";
const SKIN = "#fdf0ea";
const SKIN_SHADE = "#efcfc6";
const LINE = "#2e2645";
const ARMOR_EDGE = "#8e9bb8";
const TRIM = "#3a7bff";
const ACCENT = "#e8304f";
const HUD = "#35c7e8";

// Deterministic RNG so every render is identical.
let seed = 20260922;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const f = (n) => n.toFixed(1);

// Character placement: local 300x420 space scaled up, anchored to the bottom edge.
const S = 6.6;
const TX = 2330;
const TY = H - 420 * S + 30;
const HEAD = { x: TX + 150 * S, y: TY + 165 * S };

function stars() {
  let out = "";
  const tints = ["#ffffff", "#ffffff", "#ffffff", "#cfe9ff", "#ffd6e6", "#bff4ff"];
  for (let i = 0; i < 2200; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = Math.pow(rnd(), 3) * 3.6 + 0.6;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${pick(tints)}" opacity="${f(0.25 + rnd() * 0.75)}"/>`;
  }
  return out;
}

function sparkle(x, y, size, color, opacity = 1) {
  const s = size;
  const t = s * 0.18;
  return `<g transform="translate(${f(x)},${f(y)})" opacity="${opacity}">
    <circle r="${f(s * 0.9)}" fill="url(#softGlow)" opacity="0.7"/>
    <path d="M0,${-s} L${t},${-t} L${s},0 L${t},${t} L0,${s} L${-t},${t} L${-s},0 L${-t},${-t} Z" fill="${color}"/>
  </g>`;
}

function bigSparkles() {
  let out = "";
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W;
    const y = rnd() * H * 0.85;
    if (x < 2400 && y > 850 && y < 1760) continue; // keep the title clean
    out += sparkle(x, y, 10 + rnd() * 34, pick(["#ffffff", "#d6f6ff", "#ffe3ee"]), f(0.5 + rnd() * 0.5));
  }
  return out;
}

function bokeh() {
  let out = "";
  for (let i = 0; i < 60; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 20 + rnd() * 110;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${pick([HUD, "#ff7aa8", "#8cc4f0", "#b36bff"])}" opacity="${f(0.04 + rnd() * 0.1)}"/>`;
  }
  return out;
}

function hudRings() {
  const { x, y } = HEAD;
  let ticks = "";
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const r1 = 1240;
    const r2 = i % 10 === 0 ? 1300 : 1265;
    ticks += `<line x1="${f(x + Math.cos(a) * r1)}" y1="${f(y + Math.sin(a) * r1)}" x2="${f(x + Math.cos(a) * r2)}" y2="${f(y + Math.sin(a) * r2)}"/>`;
  }
  let hexes = "";
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 700 + rnd() * 900;
    const hx = x + Math.cos(a) * d;
    const hy = y + Math.sin(a) * d * 0.8;
    const r = 18 + rnd() * 40;
    const pts = [0, 1, 2, 3, 4, 5]
      .map((k) => `${f(hx + Math.cos((k * Math.PI) / 3) * r)},${f(hy + Math.sin((k * Math.PI) / 3) * r)}`)
      .join(" ");
    hexes += `<polygon points="${pts}" opacity="${f(0.25 + rnd() * 0.5)}"/>`;
  }
  return `
  <g fill="none" stroke="${HUD}" filter="url(#glowSm)">
    <circle cx="${x}" cy="${y}" r="1040" stroke-width="6" stroke-dasharray="380 90 40 90" opacity="0.55"/>
    <circle cx="${x}" cy="${y}" r="1120" stroke-width="3" stroke-dasharray="14 40" opacity="0.5"/>
    <circle cx="${x}" cy="${y}" r="1380" stroke-width="2" opacity="0.25"/>
    <g stroke-width="3" opacity="0.45">${ticks}</g>
    <path d="M${x - 1520},${y} A1520,1520 0 0 1 ${x},${y - 1520}" stroke-width="10" stroke="#ff7aa8" opacity="0.35" stroke-linecap="round"/>
    <g stroke-width="3" opacity="0.6">${hexes}</g>
  </g>
  <g font-family="Consolas, 'Cascadia Mono', monospace" font-size="34" fill="${HUD}" opacity="0.75" letter-spacing="6">
    <text x="${x + 900}" y="${y - 700}">KOS-MOS // SYNC 98.7%</text>
    <text x="${x + 900}" y="${y - 650}" opacity="0.6">HILBERT EFFECT : ACTIVE</text>
    <text x="${x + 900}" y="${y - 600}" opacity="0.6">R-CORE OUTPUT ▮▮▮▮▮▮▮▮▯ 92%</text>
  </g>`;
}

function planet() {
  return `
  <g>
    <circle cx="700" cy="3900" r="1650" fill="url(#atmo)"/>
    <circle cx="700" cy="3900" r="1450" fill="url(#planet)"/>
    <ellipse cx="700" cy="3900" rx="2300" ry="330" transform="rotate(-14 700 3900)" fill="none" stroke="#9fd8ff" stroke-width="10" opacity="0.28"/>
    <ellipse cx="700" cy="3900" rx="2450" ry="360" transform="rotate(-14 700 3900)" fill="none" stroke="#ff9fc4" stroke-width="4" opacity="0.2"/>
  </g>`;
}

function title() {
  return `
  <g font-family="'Segoe UI', 'Segoe UI Light', Arial, sans-serif" fill="#ffffff">
    <text x="420" y="1020" font-family="'Yu Gothic', 'Meiryo', sans-serif" font-size="96" letter-spacing="40" fill="${HUD}" opacity="0.85" filter="url(#glowSm)">コスモス</text>
    <text x="400" y="1380" font-size="400" font-weight="300" letter-spacing="30" filter="url(#glowTitle)">KOS-MOS</text>
    <rect x="420" y="1450" width="1720" height="6" fill="url(#lineFade)"/>
    <text x="420" y="1540" font-size="54" letter-spacing="22" opacity="0.85">ANTI-GNOSIS HUMANOID INTERFACE</text>
    <text x="420" y="1620" font-family="Consolas, monospace" font-size="38" letter-spacing="10" fill="${HUD}" opacity="0.7">VER.1 · STANDBY → ONLINE · 0x4B4F53</text>
    <g fill="${ACCENT}"><rect x="420" y="1680" width="60" height="10"/><rect x="500" y="1680" width="24" height="10" opacity="0.6"/><rect x="544" y="1680" width="10" height="10" opacity="0.4"/></g>
  </g>`;
}

function eye(cx, cy, mirror) {
  const t = mirror ? `translate(${cx},${cy}) scale(-1,1)` : `translate(${cx},${cy})`;
  return `
  <g transform="${t}">
    <path d="M-20,-6 Q-6,-22 18,-17 Q22,2 16,16 Q0,27 -16,17 Q-22,6 -20,-6 Z" fill="#fff"/>
    <g clip-path="url(#eyeClip)">
      <ellipse cx="1" cy="3" rx="14.5" ry="20" fill="url(#iris)"/>
      <ellipse cx="1" cy="-12" rx="18" ry="10" fill="#3a0010" opacity="0.55"/>
      <ellipse cx="1" cy="4" rx="9.5" ry="13.5" fill="none" stroke="#ffa3b6" stroke-width="1.2" opacity="0.55"/>
      <ellipse cx="1" cy="4" rx="5" ry="8" fill="#2a0008"/>
      <ellipse cx="1" cy="15" rx="9" ry="5" fill="#ffc2cf" opacity="0.55"/>
      <path d="M-20,-8 Q0,-24 20,-16 L20,-8 Q0,-14 -20,-2 Z" fill="${LINE}" opacity="0.25"/>
    </g>
    <path d="M-23,-3 Q-10,-25 21,-19 L23,-14 Q-6,-21 -19,-2 Z" fill="${LINE}"/>
    <path d="M-20,-6 L-29,0 L-21,-1 Z M-22,-9 L-30,-7 L-22,-5 Z" fill="${LINE}"/>
    <path d="M-15,-25 Q2,-32 19,-25" stroke="${LINE}" stroke-width="1.4" fill="none" opacity="0.45" stroke-linecap="round"/>
    <path d="M-13,19 Q0,25 12,19" stroke="${LINE}" stroke-width="1.4" fill="none" opacity="0.55" stroke-linecap="round"/>
  </g>
  <circle cx="${cx + 6}" cy="${cy - 7}" r="5.2" fill="#fff"/>
  <circle cx="${cx - 5}" cy="${cy + 11}" r="2.3" fill="#fff" opacity="0.9"/>
  <circle cx="${cx + 8}" cy="${cy + 6}" r="1.3" fill="#fff" opacity="0.8"/>`;
}

function headFin(right) {
  return `
  <g transform="${right ? "translate(300,0) scale(-1,1)" : ""}">
    <path d="M82,148 L32,132 L22,148 L38,168 L26,198 L80,202 Z" fill="url(#armor)" stroke="${ARMOR_EDGE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M32,132 L22,148 L38,168 L44,160 Z" fill="#c9d3e6" opacity="0.8"/>
    <path d="M76,160 L36,146" stroke="${TRIM}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M76,190 L40,190" stroke="${TRIM}" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="58" cy="175" r="7" fill="url(#softGlow)"/>
    <circle cx="58" cy="175" r="3.4" fill="#bff4ff"/>
  </g>`;
}

// Tapered, wind-blown strand from a root near the head toward a tip.
function strand(x1, y1, cx, cy, x2, y2, w) {
  const dir = Math.sign(x2 - x1);
  return `<path d="M${x1},${y1} C${x1 + dir * 30},${y1 - 6} ${cx},${cy - w} ${x2},${y2} C${cx + dir * 10},${cy + w * 0.6} ${x1 + dir * 24},${y1 + w * 1.2} ${x1},${y1 + w} Z"/>`;
}

function character() {
  const bangs =
    "M62,172 Q52,66 150,52 Q248,66 238,172 L224,126 L216,182 L201,106 L188,154 L171,98 L158,200 L150,104 L142,200 L129,98 L112,154 L99,106 L84,182 L76,126 Z";
  return `
  <g transform="translate(${TX},${TY}) scale(${S})">
    <!-- Back hair and wind strands -->
    <g fill="url(#hair)" stroke="${HAIR_DARK}" stroke-width="1.2" stroke-linejoin="round">
      ${strand(70, 170, -10, 210, -130, 250, 22)}
      ${strand(66, 220, -20, 290, -150, 330, 26)}
      ${strand(64, 270, 0, 340, -90, 400, 22)}
      ${strand(232, 170, 290, 210, 350, 240, 16)}
      ${strand(236, 230, 300, 290, 370, 330, 18)}
      <path d="M62,150 Q48,66 150,48 Q252,66 238,150 Q252,280 296,440 L4,440 Q48,280 62,150 Z"/>
    </g>
    <g fill="none" stroke="${HAIR_LIGHT}" stroke-width="1.4" opacity="0.5" stroke-linecap="round">
      <path d="M80,200 Q66,300 40,420"/><path d="M96,210 Q90,320 76,430"/>
      <path d="M220,200 Q236,300 262,420"/><path d="M206,210 Q214,320 226,430"/>
    </g>
    <path d="M62,150 Q48,66 150,48" fill="none" stroke="#9ff0ff" stroke-width="3" opacity="0.6" filter="url(#glowXs)"/>

    <!-- Neck and body -->
    <path d="M132,226 L132,284 Q150,292 168,284 L168,226 Z" fill="${SKIN}"/>
    <path d="M132,232 Q150,258 168,232 L168,252 Q150,270 132,252 Z" fill="${SKIN_SHADE}"/>
    <path d="M60,440 L74,318 Q88,286 132,276 L168,276 Q212,286 226,318 L240,440 Z" fill="url(#suit)"/>
    <path d="M96,318 Q150,298 204,318 L196,378 Q150,398 104,378 Z" fill="url(#armor)" stroke="${ARMOR_EDGE}" stroke-width="1.6"/>
    <path d="M106,326 Q150,310 194,326" stroke="${TRIM}" stroke-width="2.6" fill="none"/>
    <path d="M110,370 Q150,386 190,370" stroke="${TRIM}" stroke-width="1.8" fill="none" opacity="0.7"/>
    <path d="M72,300 L122,288 L112,334 L62,346 Z" fill="url(#armor)" stroke="${ARMOR_EDGE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M228,300 L178,288 L188,334 L238,346 Z" fill="url(#armor)" stroke="${ARMOR_EDGE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M78,310 L114,302 M222,310 L186,302" stroke="${TRIM}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M118,260 L136,246 L136,290 L114,304 Z" fill="url(#armor)" stroke="${ARMOR_EDGE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M182,260 L164,246 L164,290 L186,304 Z" fill="url(#armor)" stroke="${ARMOR_EDGE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M122,270 L131,263 M178,270 L169,263" stroke="${ACCENT}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="150" cy="346" r="34" fill="url(#coreBloom)"/>
    <circle cx="150" cy="346" r="10" fill="url(#core)" stroke="${ARMOR_EDGE}" stroke-width="1.6"/>

    <!-- Head, tilted slightly -->
    <g transform="rotate(-4 150 240)">
      <path d="M72,150 Q72,226 150,246 Q228,226 228,150 Q228,80 150,80 Q72,80 72,150 Z" fill="${SKIN}"/>
      <g clip-path="url(#faceClip)">
        <path d="${bangs}" transform="translate(0,7)" fill="${SKIN_SHADE}" opacity="0.8"/>
      </g>

      <g stroke="${HAIR_DARK}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.8">
        <path d="M100,140 Q114,134 130,138"/><path d="M170,138 Q186,134 200,140"/>
      </g>
      ${eye(116, 172, false)}
      ${eye(184, 172, true)}

      <ellipse cx="102" cy="202" rx="16" ry="7" fill="url(#blush)"/>
      <ellipse cx="198" cy="202" rx="16" ry="7" fill="url(#blush)"/>
      <g stroke="#f08aa6" stroke-width="1.2" stroke-linecap="round" opacity="0.7">
        <path d="M96,204 l3,-5 M102,204 l3,-5 M108,204 l3,-5"/>
        <path d="M190,204 l3,-5 M196,204 l3,-5 M202,204 l3,-5"/>
      </g>
      <path d="M151,195 l-2,5" stroke="#dca99c" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M142,213 Q150,220 158,212" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M146,217 Q150,219 154,217" stroke="#e7a3a8" stroke-width="1.4" fill="none" stroke-linecap="round"/>

      <path d="${bangs}" fill="url(#hair)" stroke="${HAIR_DARK}" stroke-width="1.3" stroke-linejoin="round"/>
      <g stroke="${HAIR_DARK}" stroke-width="1" fill="none" opacity="0.45" stroke-linecap="round">
        <path d="M150,70 L150,104"/><path d="M128,74 L129,98"/><path d="M172,74 L171,98"/>
        <path d="M104,86 L100,106"/><path d="M196,86 L200,106"/><path d="M84,110 L78,126"/><path d="M216,110 L222,126"/>
      </g>
      <path d="M90,94 Q150,64 210,92" stroke="#fff" stroke-width="5" fill="none" opacity="0.55" stroke-linecap="round" stroke-dasharray="26 7 14 7"/>
      <path d="M66,150 Q60,80 130,58" stroke="#9ff0ff" stroke-width="2" fill="none" opacity="0.7" filter="url(#glowXs)"/>

      ${[false, true]
        .map(
          (right) => `<path d="M68,150 Q58,246 84,344 L98,338 Q86,244 92,160 Z" transform="${right ? "translate(300,0) scale(-1,1)" : ""}"
            fill="url(#hair)" stroke="${HAIR_DARK}" stroke-width="1.3"/>`,
        )
        .join("")}
      ${headFin(false)}
      ${headFin(true)}
    </g>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#03041a"/><stop offset="0.45" stop-color="#0d1240"/><stop offset="0.8" stop-color="#26113f"/><stop offset="1" stop-color="#12061f"/>
  </linearGradient>
  <radialGradient id="softGlow"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.3" stop-color="#9ff0ff" stop-opacity="0.45"/><stop offset="1" stop-color="#9ff0ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="neb1"><stop offset="0" stop-color="#2fb8ff" stop-opacity="0.55"/><stop offset="1" stop-color="#2fb8ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="neb2"><stop offset="0" stop-color="#ff4f9a" stop-opacity="0.4"/><stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></radialGradient>
  <radialGradient id="neb3"><stop offset="0" stop-color="#8a5bff" stop-opacity="0.45"/><stop offset="1" stop-color="#8a5bff" stop-opacity="0"/></radialGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="#bff4ff" stop-opacity="0.55"/><stop offset="0.4" stop-color="#35c7e8" stop-opacity="0.18"/><stop offset="1" stop-color="#35c7e8" stop-opacity="0"/></radialGradient>
  <radialGradient id="planet" cx="0.35" cy="0.2" r="0.9"><stop offset="0" stop-color="#3d6fd6"/><stop offset="0.35" stop-color="#1a2d6e"/><stop offset="1" stop-color="#060a24"/></radialGradient>
  <radialGradient id="atmo"><stop offset="0.86" stop-color="#6fd9ff" stop-opacity="0.45"/><stop offset="1" stop-color="#6fd9ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="vignette" cx="0.55" cy="0.45" r="0.8"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.65"/></radialGradient>
  <linearGradient id="lineFade" x1="0" x2="1"><stop offset="0" stop-color="${HUD}"/><stop offset="1" stop-color="${HUD}" stop-opacity="0"/></linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bff4ff" stop-opacity="0"/><stop offset="0.5" stop-color="#bff4ff" stop-opacity="0.16"/><stop offset="1" stop-color="#bff4ff" stop-opacity="0"/></linearGradient>

  <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${HAIR_LIGHT}"/><stop offset="0.25" stop-color="${HAIR}"/><stop offset="0.75" stop-color="#6fa6e0"/><stop offset="1" stop-color="${HAIR_DARK}"/>
  </linearGradient>
  <linearGradient id="armor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd8ea"/></linearGradient>
  <linearGradient id="suit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3a62"/><stop offset="1" stop-color="#141a33"/></linearGradient>
  <linearGradient id="iris" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5a0014"/><stop offset="0.5" stop-color="#d4163c"/><stop offset="1" stop-color="#ff9aae"/>
  </linearGradient>
  <radialGradient id="core"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="#ff6b82"/><stop offset="1" stop-color="${ACCENT}"/></radialGradient>
  <radialGradient id="coreBloom"><stop offset="0" stop-color="#ff6b82" stop-opacity="0.7"/><stop offset="1" stop-color="#ff6b82" stop-opacity="0"/></radialGradient>
  <radialGradient id="blush"><stop offset="0" stop-color="#ff8fae" stop-opacity="0.65"/><stop offset="1" stop-color="#ff8fae" stop-opacity="0"/></radialGradient>

  <clipPath id="eyeClip" clipPathUnits="userSpaceOnUse"><path d="M-20,-6 Q-6,-22 18,-17 Q22,2 16,16 Q0,27 -16,17 Q-22,6 -20,-6 Z"/></clipPath>
  <clipPath id="faceClip" clipPathUnits="userSpaceOnUse"><path d="M72,150 Q72,226 150,246 Q228,226 228,150 Q228,80 150,80 Q72,80 72,150 Z"/></clipPath>

  <filter id="blurBig" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="120"/></filter>
  <filter id="glowXs" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="glowSm" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="glowTitle" x="-10%" y="-30%" width="120%" height="160%">
    <feGaussianBlur stdDeviation="22" result="b"/><feFlood flood-color="${HUD}" flood-opacity="0.9"/><feComposite in2="b" operator="in" result="g"/>
    <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="charGlow" x="-10%" y="-10%" width="120%" height="120%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="30" result="b"/><feFlood flood-color="#7fe3ff" flood-opacity="0.55"/><feComposite in2="b" operator="in" result="g"/>
    <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>

<rect width="${W}" height="${H}" fill="url(#sky)"/>
<g filter="url(#blurBig)">
  <ellipse cx="3500" cy="900" rx="1600" ry="900" fill="url(#neb1)"/>
  <ellipse cx="4600" cy="2200" rx="1300" ry="800" fill="url(#neb2)"/>
  <ellipse cx="1400" cy="700" rx="1500" ry="700" fill="url(#neb3)"/>
  <ellipse cx="2300" cy="2300" rx="1200" ry="600" fill="url(#neb1)" opacity="0.6"/>
</g>
<path d="M2600,-200 L5400,2400 L5400,2900 L2200,-200 Z" fill="url(#beam)"/>
<path d="M3600,-200 L5400,1500 L5400,1700 L3450,-200 Z" fill="url(#beam)"/>
${stars()}
${bokeh()}
${planet()}
<circle cx="${HEAD.x}" cy="${HEAD.y}" r="1500" fill="url(#halo)"/>
${hudRings()}
${title()}
<g filter="url(#charGlow)">${character()}</g>
${bigSparkles()}
<rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>`;

process.stdout.write(svg);
