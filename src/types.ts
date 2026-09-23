export type Provider = "codex" | "claude" | "cursor" | "grokbot" | "openai" | "xai";

export interface Account {
  id: string;
  provider: Provider;
  label: string;
  codexHome?: string | null;
  cursorAuto: boolean;
  teamId?: string | null;
  monthlyBudget?: number | null;
  hasSecret: boolean;
  identity?: string | null;
  hiddenMeters: string[];
}

export interface Meter {
  key: string;
  label: string;
  usedPercent: number;
  used?: number | null;
  limit?: number | null;
  unit: "percent" | "usd" | "requests";
  resetsAt?: number | null;
  windowSecs?: number | null;
}

export interface Bank {
  available: number;
  earned?: number | null;
  credits: { grantedAt?: number | null; expiresAt?: number | null }[];
}

export interface Sample {
  key: string;
  t: number;
  used: number;
  resetsAt?: number | null;
  windowSecs?: number | null;
  plan?: string | null;
}

export interface Report {
  accountId: string;
  provider: Provider;
  label: string;
  ok: boolean;
  error?: string | null;
  identity?: string | null;
  plan?: string | null;
  meters: Meter[];
  note?: string | null;
  bank?: Bank | null;
  signedIn?: boolean | null;
  fetchedAt: number;
}

export interface Announcement {
  id: string;
  provider: Provider;
  at: number;
  resetType: "standard" | "banked" | string;
  status: "confirmed" | "upcoming" | string;
  text: string;
  url: string;
  source: string;
}

export interface FeedResult {
  announcements: Announcement[];
  errors: string[];
}

export interface Session {
  id: string;
  tool: "codex" | "claude" | "ollama" | string;
  model?: string | null;
  effort?: string | null;
  project?: string | null;
  cwd?: string | null;
  branch?: string | null;
  client?: string | null;
  subagent: boolean;
  lastActive: number;
  started?: number | null;
  totalTokens?: number | null;
  contextTokens?: number | null;
  sizeBytes?: number | null;
}

export interface SystemStats {
  cpuName: string;
  cpu: number;
  cores: number[];
  memUsedGb: number;
  memTotalGb: number;
  swapUsedGb: number;
  swapTotalGb: number;
  gpus: {
    name: string;
    load: number;
    memUsedMb: number;
    memTotalMb: number;
    tempC?: number | null;
    powerW?: number | null;
    powerLimitW?: number | null;
  }[];
  gpuNote?: string | null;
  top: { name: string; pid: number; cpu: number; memMb: number; gpuMemMb?: number | null }[];
}

export type Mood = "happy" | "calm" | "worried" | "panic" | "pouty" | "sleepy" | "love";

export interface Settings {
  waifuName: string;
  /** Built-in companion id from src/waifus.ts. */
  waifu: string;
  /** Show the 3D model (falls back to the 2D art if it can't load). */
  character3d: boolean;
  userTitle: string;
  /** "waifu": playful anime lines. "android": calm, formal KOS-MOS lines. */
  personality: "waifu" | "android";
  /** Upload time of each custom file in app data; absent means use the built-in art. */
  customAssets: { avatar?: number; portrait?: number; model?: number };
  llm: boolean;
  llmUrl: string;
  llmModel: string;
  refreshMinutes: number;
  voice: boolean;
  /** "system" = browser speechSynthesis, "elevenlabs" = ElevenLabs TTS. */
  voiceEngine: "system" | "elevenlabs";
  elevenVoiceId: string;
  elevenModel: string;
  notify: boolean;
  warnAt: number;
  criticalAt: number;
}

export const PROVIDERS: Record<
  Provider,
  { name: string; short: string; color: string; glow: string; icon: string }
> = {
  codex: { name: "ChatGPT / Codex", short: "ChatGPT", color: "#10a37f", glow: "#6fffd2", icon: "✦" },
  claude: { name: "Claude", short: "Claude", color: "#d97757", glow: "#ffc2a8", icon: "✺" },
  cursor: { name: "Cursor", short: "Cursor", color: "#7c6cff", glow: "#c3b9ff", icon: "➤" },
  grokbot: { name: "Grok Bot", short: "Grok Bot", color: "#16161f", glow: "#9aa0ff", icon: "Ⓖ" },
  openai: { name: "OpenAI API", short: "OpenAI API", color: "#ff9f43", glow: "#ffd29c", icon: "◈" },
  xai: { name: "Grok / xAI", short: "Grok", color: "#3a3a52", glow: "#b7b7ff", icon: "𝕏" },
};
