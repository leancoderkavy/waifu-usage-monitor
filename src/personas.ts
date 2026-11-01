import type { ChibiId } from "./components/Chibi";

export type Waiting = "question" | "approval" | "done" | "stopped";
export type Mode = "walk" | "dash" | "idle" | "still" | "asleep" | "call";

/** How each companion carries herself: gait, walking pace, and what she says when she needs you. */
export interface Persona {
  name: string;
  /** Archetype shown in the settings guide. */
  trait: string;
  /** Multiplies walking speed along the border. */
  pace: number;
  voice: Record<Waiting, string[]>;
}

export const PERSONAS: Record<ChibiId, Persona> = {
  sakura: {
    name: "Sakura", trait: "genki: bouncy, cheerful, waves with both arms", pace: 1.15,
    voice: {
      question: ["Senpai~! Quick question!", "Ne, ne! I need your answer!"],
      approval: ["Can I? Can I? Please say yes~", "Waiting for your OK, senpai!"],
      done: ["All done! Look, look! ✿", "Finished~! Praise me?"],
      stopped: ["Uwah… I got stuck!", "Eep! Something stopped me!"],
    },
  },
  yuki: {
    name: "Yuki", trait: "kuudere: calm, precise, pushes up her glasses", pace: 0.9,
    voice: {
      question: ["…A question for you.", "Your decision is required."],
      approval: ["Awaiting your approval.", "Permission requested."],
      done: ["Task complete. As expected.", "Finished. Review when ready."],
      stopped: ["Halted. Instructions?", "Interrupted. Standing by."],
    },
  },
  akane: {
    name: "Akane", trait: "tsundere: brisk, stompy, hands on hips", pace: 1.25,
    voice: {
      question: ["H-hey! Answer me already!", "Don't ignore me! I asked you something!"],
      approval: ["It's not like I need permission… just approve it!", "Hurry up and say yes, baka!"],
      done: ["Hmph. Done. You're welcome.", "I-it's finished! Not for you or anything!"],
      stopped: ["Tch… something broke.", "Ugh! Who stopped me?!"],
    },
  },
  luna: {
    name: "Luna", trait: "dreamy: floaty, sleepy, a little mystical", pace: 0.75,
    voice: {
      question: ["Mm… the stars ask you something…", "Hey… are you there? A question…"],
      approval: ["A seal awaits your mark…", "Mm… may I proceed?"],
      done: ["Finished… can I nap now?", "The spell is complete… ☾"],
      stopped: ["The spell fizzled… zzz", "Mm… it stopped…"],
    },
  },
};

function seed(text: string) {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) % 9973;
  return value;
}

/** The same line for the whole wait, a different one next time. */
export function voiceLine(who: ChibiId, kind: string, key: string): string {
  const lines = PERSONAS[who].voice[(kind in PERSONAS[who].voice ? kind : "done") as Waiting];
  return lines[seed(key) % lines.length];
}

type Props = { swing?: number; bob?: number; nod?: number; wave?: number; arm2?: number; tap?: number; hop?: number;
  talk?: number; joy?: number; eye?: number; doze?: number; emote?: number; fluster?: number };

const NAMES = ["swing", "bob", "nod", "wave", "arm2", "tap", "hop", "talk", "joy", "eye", "doze", "emote", "fluster"] as const;

/**
 * Limb and face custom properties for one tick (consumed by DesktopAgents.css). Each persona
 * walks, idles and calls for you in her own way; everything is a function of the clock.
 */
export function pose(who: ChibiId, id: string, clock: number, mode: Mode): [string, string][] {
  const t = clock + seed(id) / 97, turn = Math.PI * 2;
  const blink = (t % 4.2) < 0.15 ? 0.1 : 1;
  const sin = (period: number) => Math.sin(t * turn / period);
  const pulse = (period: number) => Math.abs(sin(period));
  let p: Props;
  if (mode === "asleep") p = { nod: -10, eye: 0.12, doze: (t / 2.4) % 1 };
  else if (mode === "still") p = { eye: blink };
  else if (mode === "walk" || mode === "dash") {
    // [step period, leg swing, bob]: Sakura skips, Yuki glides, Akane marches, Luna drifts.
    const [step, swing, bob] = { sakura: [0.5, 24, 3], yuki: [0.72, 15, 0.8], akane: [0.52, 28, 1.8], luna: [0.9, 12, 1] }[who];
    const period = mode === "dash" ? step * 0.55 : step, phase = t * turn / period;
    p = { swing: (mode === "dash" ? 1.4 : 1) * swing * Math.sin(phase), bob: -bob * Math.abs(Math.sin(phase)),
      nod: mode === "dash" ? 6 : 2.5 * Math.sin(phase), eye: blink,
      hop: who === "luna" ? 2 + 1.5 * sin(1.8) : who === "sakura" && mode === "walk" ? 1.5 * pulse(1) : 0 };
  } else if (mode === "idle") {
    if (who === "sakura") p = { hop: 5 * Math.max(0, sin(0.7)), wave: 165 + 18 * sin(0.5), joy: sin(0.7) > 0.3 ? 1 : 0, emote: pulse(1.6), eye: blink };
    else if (who === "yuki") p = { wave: 148 + 4 * sin(3), nod: 4 + 2 * sin(3), eye: blink, emote: (t % 6) < 3 ? 1 : 0 };
    else if (who === "akane") p = { wave: 32, arm2: -32, tap: 8 * Math.max(0, sin(0.4)), nod: -3, eye: blink };
    else p = { nod: 10 * sin(3.2), hop: 2 + 2 * sin(2.4), eye: 0.55, talk: (t % 7) < 1.4 ? 1 : 0, emote: pulse(4) };
  } else if ((t % 8) >= 2.5) {
    // Between calls she waits holding still, so the strip has nothing to repaint.
    p = { wave: who === "akane" ? 32 : who === "yuki" ? 160 : 0, arm2: who === "akane" ? -32 : 0, joy: who === "sakura" ? 1 : 0,
      eye: who === "luna" ? 0.6 : 1, emote: 1, fluster: who === "akane" ? 1 : 0 };
  } else {
    // Calling for you in bursts: each says it differently, mouth moving as if talking.
    const talk = (t % 0.36) < 0.18 ? 1 : 0;
    if (who === "sakura") p = { hop: 7 * pulse(0.9), wave: 165 + 20 * sin(0.45), arm2: -165 - 20 * sin(0.45), joy: 1, talk, emote: 1 };
    else if (who === "yuki") p = { wave: 160, nod: 5 * sin(2.5), talk, eye: blink, emote: 1 };
    else if (who === "akane") p = { wave: 32, arm2: -32, tap: 14 * Math.max(0, sin(0.35)), nod: -4, talk, eye: blink, emote: 1, fluster: 1 };
    else p = { hop: 3 + 3 * sin(2), wave: 150 + 15 * sin(1.6), nod: 6 * sin(3), eye: 0.6, talk: (t % 0.6) < 0.3 ? 1 : 0, emote: 1 };
  }
  return NAMES.map(name => {
    const value = p[name] ?? (name === "eye" ? 1 : 0);
    return [`--${name}`, Number.isInteger(value) ? String(value) : value.toFixed(name === "doze" ? 2 : 1)];
  });
}
