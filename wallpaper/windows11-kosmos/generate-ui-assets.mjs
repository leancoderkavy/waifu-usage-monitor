// KOS-MOS Windows UI vector masters. Run: node wallpaper/windows11-kosmos/generate-ui-assets.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const cursorDir = join(root, "cursors");
const statusDir = join(root, "status");
const liveDir = join(root, "live-states");
mkdirSync(cursorDir, { recursive: true });
mkdirSync(statusDir, { recursive: true });
mkdirSync(liveDir, { recursive: true });

const C = { ink: "#091127", navy: "#0d1240", cyan: "#35c7e8", ice: "#e8fcff", red: "#e8304f", muted: "#91abc8" };
const wrap = (body, size = 64) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${body}</svg>`;
const edge = `stroke="${C.ink}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
const cursors = {
  arrow: { hotspot: [4, 3], svg: wrap(`<path d="M5 3v46l12-11 8 18 8-4-8-18h16z" fill="${C.ice}" ${edge}/><path d="M5 3v46l12-11 8 18 8-4-8-18h16z" fill="none" stroke="${C.cyan}" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 13v22" stroke="${C.cyan}" stroke-width="2.5" stroke-linecap="round"/><circle cx="39" cy="17" r="3" fill="${C.red}"/>`) },
  text: { hotspot: [32, 32], svg: wrap(`<path d="M17 8h30M32 9v46M17 55h30" fill="none" stroke="${C.ink}" stroke-width="8" stroke-linecap="round"/><path d="M17 8h30M32 9v46M17 55h30" fill="none" stroke="${C.ice}" stroke-width="4" stroke-linecap="round"/><path d="M32 16v32" stroke="${C.cyan}" stroke-width="1.5"/>`) },
  busy: { hotspot: [32, 32], svg: wrap(`<circle cx="32" cy="32" r="23" fill="${C.ink}" stroke="${C.ice}" stroke-width="3"/><circle cx="32" cy="32" r="15" fill="${C.navy}" stroke="${C.cyan}" stroke-width="5" stroke-dasharray="46 48" transform="rotate(-90 32 32)"/><circle cx="32" cy="32" r="5" fill="${C.red}"/><path d="M32 3v6m0 46v6M3 32h6m46 0h6" stroke="${C.ice}" stroke-width="2"/>`) },
  working: { hotspot: [4, 3], svg: wrap(`<path d="M4 3v38l10-9 7 15 7-3-7-15h13z" fill="${C.ice}" ${edge}/><path d="M4 3v38l10-9 7 15 7-3-7-15h13z" fill="none" stroke="${C.cyan}" stroke-width="1.5"/><circle cx="47" cy="43" r="12" fill="${C.ink}" stroke="${C.ice}" stroke-width="2"/><path d="M47 32a11 11 0 0 1 11 11" fill="none" stroke="${C.cyan}" stroke-width="4" stroke-linecap="round"/><circle cx="47" cy="43" r="3" fill="${C.red}"/>`) },
  crosshair: { hotspot: [32, 32], svg: wrap(`<circle cx="32" cy="32" r="19" fill="none" stroke="${C.ink}" stroke-width="8"/><circle cx="32" cy="32" r="19" fill="none" stroke="${C.ice}" stroke-width="3"/><path d="M32 2v18m0 24v18M2 32h18m24 0h18" stroke="${C.ink}" stroke-width="7"/><path d="M32 2v18m0 24v18M2 32h18m24 0h18" stroke="${C.cyan}" stroke-width="3"/><circle cx="32" cy="32" r="3.5" fill="${C.red}"/>`) },
  hand: { hotspot: [22, 8], svg: wrap(`<path d="M22 10c0-5 8-5 8 0v18c0-6 8-6 8 0v2c0-5 8-5 8 1v2c2-4 9-2 9 4v9c0 10-8 15-18 15H26c-7 0-12-5-17-13l-6-10c-2-6 4-10 8-6l11 10z" fill="${C.ice}" ${edge}/><path d="M22 10v31m8-12v8m8-6v7m8-5v7" fill="none" stroke="${C.cyan}" stroke-width="2.5" stroke-linecap="round"/><path d="M25 54h21" stroke="${C.red}" stroke-width="3" stroke-linecap="round"/>`) },
  unavailable: { hotspot: [32, 32], svg: wrap(`<circle cx="32" cy="32" r="23" fill="${C.ink}" stroke="${C.ice}" stroke-width="3"/><circle cx="32" cy="32" r="18" fill="none" stroke="${C.red}" stroke-width="6"/><path d="m19 45 26-26" stroke="${C.red}" stroke-width="6" stroke-linecap="round"/>`) },
  move: { hotspot: [32, 32], svg: wrap(`<path d="M32 4v56M4 32h56" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/><path d="M32 4v56M4 32h56" stroke="${C.ice}" stroke-width="4" stroke-linecap="round"/><path d="m24 12 8-8 8 8M24 52l8 8 8-8M12 24l-8 8 8 8m40-16 8 8-8 8" fill="none" stroke="${C.cyan}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="32" r="4" fill="${C.red}"/>`) },
};
for (const [name, { hotspot, svg }] of Object.entries(cursors)) {
  writeFileSync(join(cursorDir, `${name}.svg`), svg);
  writeFileSync(join(cursorDir, `${name}.json`), JSON.stringify({ hotspot, intendedSize: 64 }) + "\n");
}

const ring = (fill, core, mark = "") => wrap(`<circle cx="32" cy="32" r="29" fill="${C.ink}"/><circle cx="32" cy="32" r="24" fill="${C.navy}" stroke="${fill}" stroke-width="3"/><path d="M10 32h10m24 0h10M32 10v10m0 24v10" stroke="${C.ice}" stroke-width="2" stroke-linecap="round"/><circle cx="32" cy="32" r="12" fill="${core}" stroke="${C.ice}" stroke-width="2"/>${mark || `<circle cx="28" cy="28" r="3" fill="${C.ice}" opacity=".8"/>`}`);
for (const [name, fill, core, mark] of [
  ["standby", C.cyan, "#24527c", ""],
  ["working", C.cyan, "#35c7e8", ""],
  ["warning", C.red, C.red, ""],
  ["sign-in", "#f8d186", "#6e4b31", `<path d="M32 25v9m0 5v1" stroke="${C.ice}" stroke-width="3" stroke-linecap="round"/>`],
  ["rate-limited", "#a4b9d8", "#314265", `<path d="M32 25v8l5 3" stroke="${C.ice}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`],
]) writeFileSync(join(statusDir, `${name}.svg`), ring(fill, core, mark));

const notification = `<svg xmlns="http://www.w3.org/2000/svg" width="364" height="180" viewBox="0 0 364 180"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#142958"/><stop offset=".65" stop-color="#0d1240"/><stop offset="1" stop-color="#26113f"/></linearGradient><linearGradient id="line"><stop stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.red}"/></linearGradient></defs><rect width="364" height="180" rx="20" fill="url(#bg)"/><rect x="2" y="2" width="360" height="176" rx="18" fill="none" stroke="url(#line)" stroke-width="2"/><circle cx="284" cy="92" r="62" fill="none" stroke="${C.cyan}" opacity=".3"/><circle cx="284" cy="92" r="40" fill="none" stroke="${C.cyan}" opacity=".5" stroke-dasharray="4 7"/><circle cx="284" cy="92" r="18" fill="${C.red}" opacity=".9"/><path d="M32 31h170" stroke="${C.cyan}" stroke-width="2"/><text x="32" y="59" fill="${C.ice}" font-size="24" font-family="Segoe UI, sans-serif" letter-spacing="5">KOS-MOS</text><text x="32" y="98" fill="${C.ice}" font-size="17" font-family="Segoe UI, sans-serif">Usage alert</text><text x="32" y="125" fill="${C.muted}" font-size="12" font-family="Consolas, monospace">VIEW LIMIT DETAILS IN APP</text><path d="M32 146h100" stroke="${C.red}" stroke-width="3"/><text x="32" y="166" fill="${C.cyan}" font-size="10" font-family="Consolas, monospace" letter-spacing="2">LLM LINK // STATUS CHANNEL</text></svg>`;
writeFileSync(join(statusDir, "notification-hero.svg"), notification);

for (const [name, label, color, detail] of [
  ["standby", "STANDBY", C.cyan, "LINK READY"],
  ["working", "MONITORING", C.cyan, "SYNC IN PROGRESS"],
  ["warning", "LIMIT WARNING", C.red, "OPEN USAGE MONITOR"],
]) {
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="5120" height="2880" viewBox="0 0 5120 2880"><defs><linearGradient id="panel"><stop stop-color="#081129" stop-opacity=".88"/><stop offset="1" stop-color="#0d1240" stop-opacity=".68"/></linearGradient></defs><rect x="315" y="2180" width="1800" height="290" rx="40" fill="url(#panel)" stroke="${color}" stroke-width="5"/><path d="M365 2240h440" stroke="${color}" stroke-width="8"/><circle cx="1940" cy="2325" r="72" fill="none" stroke="${color}" stroke-width="10"/><circle cx="1940" cy="2325" r="28" fill="${color}"/><text x="370" y="2322" fill="${C.ice}" font-family="Segoe UI, sans-serif" font-size="94" letter-spacing="16">${label}</text><text x="373" y="2414" fill="${color}" font-family="Consolas, monospace" font-size="46" letter-spacing="12">${detail}</text><path d="M315 2550h1800" stroke="${color}" stroke-width="3" opacity=".4"/></svg>`;
  writeFileSync(join(liveDir, `${name}.svg`), overlay);
}
