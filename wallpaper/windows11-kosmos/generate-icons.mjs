// Generate resolution-independent Windows icons that use the wallpaper palette.
// Run from any directory: node wallpaper/windows11-kosmos/generate-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const iconDir = join(root, "icons");
mkdirSync(iconDir, { recursive: true });

const line = 'fill="none" stroke="#bff4ff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"';
const accents = {
  Documents: `<path d="M82 55h68l27 27v109H82z" ${line}/><path d="M150 55v29h27M101 112h57M101 132h57M101 152h37" ${line}/><path d="M97 190h64" stroke="#ff668a" stroke-width="7" stroke-linecap="round"/>`,
  Downloads: `<path d="M128 56v92m-29-29 29 29 29-29" ${line}/><path d="M79 164v25h98v-25" ${line}/><path d="M92 189h72" stroke="#ff668a" stroke-width="7" stroke-linecap="round"/>`,
  Pictures: `<rect x="67" y="67" width="122" height="122" rx="14" ${line}/><circle cx="103" cy="103" r="13" fill="#ff668a"/><path d="m74 169 41-45 24 23 22-21 26 31" ${line}/>`,
  Music: `<path d="M113 162V83l70-15v78M113 91l70-15" ${line}/><ellipse cx="95" cy="165" rx="19" ry="13" transform="rotate(-19 95 165)" ${line}/><ellipse cx="165" cy="149" rx="19" ry="13" transform="rotate(-19 165 149)" ${line}/><circle cx="183" cy="68" r="5" fill="#ff668a"/>`,
  System: `<rect x="66" y="75" width="124" height="84" rx="11" ${line}/><path d="M100 183h56m-28-24v24M84 141h88" ${line}/><path d="M82 91h26" stroke="#ff668a" stroke-width="6" stroke-linecap="round"/>`,
  Recycle: `<path d="M91 87h74l-8 94H99zM83 85h90M106 77h44" ${line}/><path d="M114 108v50m29-50v50" stroke="#35c7e8" stroke-width="7" stroke-linecap="round"/><path d="M112 73h32" stroke="#ff668a" stroke-width="6" stroke-linecap="round"/>`,
  Videos: `<rect x="67" y="73" width="122" height="110" rx="13" ${line}/><path d="m113 101 48 27-48 27z" fill="#35c7e8" stroke="#bff4ff" stroke-width="4" stroke-linejoin="round"/><path d="M81 91h13m-13 75h13m68-75h13m-13 75h13" stroke="#ff668a" stroke-width="5" stroke-linecap="round"/>`,
  Drive: `<rect x="69" y="104" width="118" height="66" rx="12" ${line}/><path d="M80 104 94 80h68l14 24M90 146h65" ${line}/><circle cx="166" cy="146" r="5" fill="#ff668a"/>`,
  Archive: `<path d="M77 73h102v116H77zM77 104h102M110 74v71m35-71v71" ${line}/><rect x="111" y="143" width="34" height="29" rx="5" fill="#35c7e8" stroke="#bff4ff" stroke-width="5"/><path d="M118 157h20" stroke="#0d1240" stroke-width="4"/>`,
  Code: `<rect x="67" y="72" width="122" height="112" rx="12" ${line}/><path d="m107 105-22 23 22 23m42-46 22 23-22 23m-9-57-24 68" ${line}/><circle cx="83" cy="87" r="4" fill="#ff668a"/>`,
  Shortcut: `<path d="M83 170v-61c0-18 14-32 32-32h55M144 56l27 21-27 21" ${line}/><path d="M88 170h83v-41" ${line}/><path d="M96 189h77" stroke="#ff668a" stroke-width="7" stroke-linecap="round"/>`,
  Terminal: `<rect x="68" y="75" width="120" height="105" rx="11" ${line}/><path d="m87 105 22 18-22 18m35 0h42" ${line}/><path d="M69 94h118" stroke="#35c7e8" stroke-width="5"/><circle cx="85" cy="84" r="3" fill="#ff668a"/>`,
};

function icon(name, symbol) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<defs>
  <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#192859"/><stop offset=".55" stop-color="#0d1240"/><stop offset="1" stop-color="#26113f"/></linearGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8de8ff"/><stop offset=".55" stop-color="#35c7e8"/><stop offset="1" stop-color="#ff6b9c"/></linearGradient>
  <radialGradient id="glow"><stop stop-color="#35c7e8" stop-opacity=".24"/><stop offset="1" stop-color="#35c7e8" stop-opacity="0"/></radialGradient>
</defs>
<circle cx="128" cy="128" r="119" fill="url(#glow)"/>
<rect x="24" y="24" width="208" height="208" rx="51" fill="url(#panel)" stroke="url(#edge)" stroke-width="3"/>
<path d="M62 44h132" stroke="#bff4ff" opacity=".3" stroke-width="2"/>
<circle cx="128" cy="128" r="84" fill="none" stroke="#35c7e8" stroke-opacity=".25" stroke-width="2" stroke-dasharray="9 10"/>
${symbol}
<path d="M42 202h29m114 0h29" stroke="#35c7e8" stroke-width="3" stroke-linecap="round" opacity=".7"/>
</svg>`;
}

for (const [name, symbol] of Object.entries(accents)) {
  writeFileSync(join(iconDir, `${name.toLowerCase()}.svg`), icon(name, symbol));
}
