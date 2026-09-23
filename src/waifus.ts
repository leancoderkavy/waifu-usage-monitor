/**
 * Built-in companions. KOS-MOS has the 3D model; the others are original 2D
 * characters drawn with Animagine XL 4.0 (see scripts/gen_waifus.py).
 * `lines` join her idle chatter when the waifu personality is on.
 */
export interface WaifuPreset {
  id: string;
  name: string;
  blurb: string;
  avatar: string;
  portrait: string;
  has3d: boolean;
  lines: (title: string) => string[];
}

export const WAIFUS: WaifuPreset[] = [
  {
    id: "kosmos",
    name: "KOS-MOS",
    blurb: "Android guardian. 3D model.",
    avatar: "/models/kosmos_avatar.png",
    portrait: "/models/kosmos_bust.png",
    has3d: true,
    lines: (t) => [`Guard mode active. No rate limit will touch you on my watch, ${t}.`],
  },
  {
    id: "sakura",
    name: "Sakura",
    blurb: "Cheerful genki girl.",
    avatar: "/waifus/sakura/avatar.png",
    portrait: "/waifus/sakura/portrait.png",
    has3d: false,
    lines: (t) => [
      `Ganbare, ${t}! Every token you spend brings the feature closer~`,
      "Headphones on, tokens counted, vibes immaculate!",
    ],
  },
  {
    id: "yuki",
    name: "Yuki",
    blurb: "Quiet, clever kuudere.",
    avatar: "/waifus/yuki/avatar.png",
    portrait: "/waifus/yuki/portrait.png",
    has3d: false,
    lines: (t) => [
      `A shorter prompt with better context usually wins, ${t}. ...Just an observation.`,
      "I read your rate limits the way I read books. Carefully.",
    ],
  },
  {
    id: "akane",
    name: "Akane",
    blurb: "Tsundere. Cares a lot, admits nothing.",
    avatar: "/waifus/akane/avatar.png",
    portrait: "/waifus/akane/portrait.png",
    has3d: false,
    lines: (t) => [
      `I-it's not like I'm tracking your tokens because I like you, ${t}! Baka!`,
      "Hmph. If you hit the limit again, I'm not helping. ...Fine, I'll help.",
    ],
  },
  {
    id: "luna",
    name: "Luna",
    blurb: "Sleepy night-owl gamer.",
    avatar: "/waifus/luna/avatar.png",
    portrait: "/waifus/luna/portrait.png",
    has3d: false,
    lines: (t) => [
      `*yawn*... still coding at this hour, ${t}? The weekly reset won't come any faster~`,
      "GG. Your quota survived another raid.",
    ],
  },
];

export const waifuById = (id: string | undefined): WaifuPreset => WAIFUS.find((w) => w.id === id) ?? WAIFUS[0];
