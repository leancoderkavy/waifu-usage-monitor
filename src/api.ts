import { invoke } from "@tauri-apps/api/core";
import type { Account, Announcement, FeedResult, Report, Sample, Session, Settings, SystemStats } from "./types";

export type CustomKind = "avatar" | "portrait" | "model";

export const api = {
  listAccounts: () => invoke<Account[]>("list_accounts"),
  saveAccount: (account: Account, secret?: string) =>
    invoke<Account[]>("save_account", { account, secret: secret || null }),
  deleteAccount: (id: string) => invoke<Account[]>("delete_account", { id }),
  detectAccounts: () => invoke<Account[]>("detect_accounts"),
  refreshAll: () => invoke<Report[]>("refresh_all"),
  listRemoved: () => invoke<Account[]>("list_removed"),
  restoreAccount: (id: string) => invoke<Account[]>("restore_account", { id }),
  forgetAccount: (id: string) => invoke<Account[]>("forget_account", { id }),
  syncLogins: () => invoke<{ accounts: Account[]; added: Account[] }>("sync_logins"),
  accountHistory: (id: string) => invoke<Sample[]>("account_history", { id }),
  llmLine: (url: string, model: string, system: string, facts: string) =>
    invoke<string>("llm_line", { url, model, system, facts }),
  llmAvailable: (url: string, model: string) => invoke<boolean>("llm_available", { url, model }),
  systemStats: (withProcs = false) => invoke<SystemStats>("system_stats", { withProcs }),
  listSessions: () => invoke<Session[]>("list_sessions"),
  globalResets: (tweets: string[]) => invoke<FeedResult>("global_resets", { tweets }),
  inspectPost: (url: string) => invoke<Announcement>("inspect_post", { url }),
  setTrayTooltip: (text: string) => invoke("set_tray_tooltip", { text }),
  showDashboard: () => invoke("show_dashboard"),
  setIslandExpanded: (expanded: boolean) => invoke("set_island_expanded", { expanded }),
  /** Copies an uploaded file into app data. Sent raw so big models skip JSON. */
  saveCustomAsset: async (kind: CustomKind, file: File) => {
    const ext = file.name.split(".").pop() ?? "";
    await invoke("save_custom_asset", new Uint8Array(await file.arrayBuffer()), { headers: { kind, ext } });
  },
  readCustomAsset: (kind: CustomKind) => invoke<ArrayBuffer>("read_custom_asset", { kind }),
  clearCustomAsset: (kind: CustomKind) => invoke("clear_custom_asset", { kind }),
  setElevenLabsKey: (key: string | null) => invoke("set_elevenlabs_key", { key }),
  hasElevenLabsKey: () => invoke<boolean>("has_elevenlabs_key"),
  elevenLabsVoices: () =>
    invoke<{ voice_id: string; name: string }[]>("elevenlabs_voices"),
  elevenLabsSpeak: (text: string, voiceId: string, modelId?: string) =>
    invoke<ArrayBuffer>("elevenlabs_speak", { text, voiceId, modelId: modelId || null }),
};

const POSTS_KEY = "kosmos.watchedPosts";
// Claude's 2026-09-22 saved-reset post. Trackers only cover Codex, so Claude
// announcements come from X posts added here or in the calendar.
const DEFAULT_POSTS = ["https://x.com/claudeai/status/2102435538120691886"];

export function loadWatchedPosts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(POSTS_KEY) ?? "null") ?? DEFAULT_POSTS;
  } catch {
    return DEFAULT_POSTS;
  }
}

export function saveWatchedPosts(posts: string[]) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

const SETTINGS_KEY = "kosmos.settings";

export const DEFAULT_SETTINGS: Settings = {
  waifuName: "KOS-MOS",
  waifu: "kosmos",
  character3d: true,
  userTitle: "Senpai",
  personality: "waifu",
  customAssets: {},
  llm: false,
  llmUrl: "http://localhost:11434",
  llmModel: "qwen3.5:4b",
  refreshMinutes: 5,
  voice: false,
  voiceEngine: "system",
  elevenVoiceId: "",
  elevenModel: "eleven_flash_v2_5",
  notify: true,
  warnAt: 25,
  criticalAt: 10,
};

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
