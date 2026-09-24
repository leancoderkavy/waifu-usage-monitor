import { api } from "./api";
import type { Settings } from "./types";
import { waifuById } from "./waifus";

// Voice playback (ElevenLabs or the local Kokoro server): one reused <audio>, plus a
// small cache of recent lines so repeated chatter does not spend credits or CPU.
const TTS_CACHE_MAX = 20;
const ttsCache = new Map<string, ArrayBuffer>();
let ttsAudio: HTMLAudioElement | null = null;
let ttsUrl: string | null = null;
let ttsSeq = 0;

function stopAudio() {
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.removeAttribute("src");
  }
  if (ttsUrl) {
    URL.revokeObjectURL(ttsUrl);
    ttsUrl = null;
  }
}

/** Plays one line from a TTS engine, through the cache. `key` names engine + voice + text. */
async function speakClip(key: string, mime: string, fetch: () => Promise<ArrayBuffer>, seq: number) {
  let buf = ttsCache.get(key);
  if (buf) {
    ttsCache.delete(key); // refresh LRU position
  } else {
    buf = await fetch();
  }
  ttsCache.set(key, buf);
  while (ttsCache.size > TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value!);
  if (seq !== ttsSeq) return; // a newer line started meanwhile
  stopAudio();
  ttsAudio ??= new Audio();
  ttsUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
  ttsAudio.src = ttsUrl;
  await ttsAudio.play();
}

export function speak(text: string, s?: Settings) {
  const seq = ++ttsSeq;
  stopAudio();
  window.speechSynthesis?.cancel();
  const clean = text.replace(/[♡♥✧…]/g, " ").trim();
  const fallback = (e: unknown) => {
    console.warn(`${s?.voiceEngine} TTS failed, using system voice:`, e);
    if (seq === ttsSeq) speakSystem(clean);
  };
  if (s?.voiceEngine === "elevenlabs" && s.elevenVoiceId && clean) {
    const key = `eleven|${s.elevenVoiceId}|${s.elevenModel}|${clean}`;
    speakClip(key, "audio/mpeg", () => api.elevenLabsSpeak(clean, s.elevenVoiceId, s.elevenModel), seq).catch(fallback);
    return;
  }
  if (s?.voiceEngine === "local" && clean) {
    const voice = s.localVoice || waifuById(s.waifu).voice;
    const key = `local|${voice}|${clean}`;
    speakClip(key, "audio/wav", () => api.localTtsSpeak(s.localTtsUrl, voice, clean), seq).catch(fallback);
    return;
  }
  speakSystem(clean);
}

function speakSystem(text: string) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  u.voice =
    voices.find((v) => /aria|jenny|zira|female/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
  // Level, slightly synthetic delivery.
  u.pitch = 1.15;
  u.rate = 0.95;
  synth.speak(u);
}
