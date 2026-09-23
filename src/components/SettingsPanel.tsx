import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import Modal from "./Modal";
import { api, type CustomKind } from "../api";
import type { Settings } from "../types";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onTestVoice: () => void;
  onTestLlm: () => Promise<string>;
}

export default function SettingsPanel({ settings, onChange, onClose, onTestVoice, onTestLlm }: Props) {
  const [autostart, setAutostart] = useState(false);
  const [llmStatus, setLlmStatus] = useState<string | null>(null);
  const [elevenKey, setElevenKey] = useState("");
  const [hasElevenKey, setHasElevenKey] = useState(false);
  const [elevenVoices, setElevenVoices] = useState<{ voice_id: string; name: string }[]>([]);
  const [elevenStatus, setElevenStatus] = useState<string | null>(null);
  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => {});
    api.hasElevenLabsKey().then(setHasElevenKey).catch(() => {});
  }, []);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });

  return (
    <Modal title="Settings" onClose={onClose}>
      <label>
        Her name
        <input value={settings.waifuName} onChange={(e) => set("waifuName", e.target.value || "KOS-MOS")} />
      </label>
      <label>
        She calls you
        <input value={settings.userTitle} onChange={(e) => set("userTitle", e.target.value || "Senpai")} />
      </label>
      <label>
        Personality
        <select value={settings.personality} onChange={(e) => set("personality", e.target.value as Settings["personality"])}>
          <option value="waifu">Waifu: playful anime lines (ne, mou, yatta~)</option>
          <option value="android">Android: calm, formal status reports</option>
        </select>
      </label>
      <label>
        Check every {settings.refreshMinutes} min
        <input
          type="range"
          min={1}
          max={60}
          value={settings.refreshMinutes}
          onChange={(e) => set("refreshMinutes", Number(e.target.value))}
        />
      </label>
      <label>
        Warn when below {settings.warnAt}% left
        <input type="range" min={5} max={60} value={settings.warnAt} onChange={(e) => set("warnAt", Number(e.target.value))} />
      </label>
      <label>
        Panic when below {settings.criticalAt}% left
        <input
          type="range"
          min={1}
          max={Math.max(2, settings.warnAt - 1)}
          value={settings.criticalAt}
          onChange={(e) => set("criticalAt", Number(e.target.value))}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.character3d} onChange={(e) => set("character3d", e.target.checked)} />
        3D character (uses your model if uploaded, else the built-in one)
      </label>
      <h3 className="section">Your own character</h3>
      <p className="help">
        Swap in your own art. Files are copied into the app's data folder and never leave this PC. Remove one to go back
        to the built-in art.
      </p>
      <CustomUpload kind="avatar" label="Island icon" accept=".png,.jpg,.jpeg,.webp,.gif" hint="Square image, shown round at the top of the island" settings={settings} onChange={onChange} />
      <CustomUpload kind="portrait" label="2D character" accept=".png,.jpg,.jpeg,.webp,.gif" hint="Transparent PNG works best. Used when 3D is off" settings={settings} onChange={onChange} />
      <CustomUpload kind="model" label="3D model" accept=".glb,.vrm" hint="GLB or VRM, up to 64 MB. Used when 3D is on" settings={settings} onChange={onChange} />
      <label className="check">
        <input type="checkbox" checked={settings.voice} onChange={(e) => set("voice", e.target.checked)} />
        She speaks out loud
        <button className="btn ghost small" onClick={onTestVoice}>
          Test
        </button>
      </label>
      <h3 className="section">Voice</h3>
      <label>
        Engine
        <select
          value={settings.voiceEngine}
          onChange={(e) => set("voiceEngine", e.target.value as Settings["voiceEngine"])}
        >
          <option value="system">System (Windows voices)</option>
          <option value="elevenlabs">ElevenLabs</option>
        </select>
      </label>
      {settings.voiceEngine === "elevenlabs" && (
        <>
          <p className="help">
            Natural anime-style voices. Needs an API key from{" "}
            <a
              href="https://elevenlabs.io/app/settings/api-keys"
              onClick={(e) => {
                e.preventDefault();
                openUrl("https://elevenlabs.io/app/settings/api-keys").catch(() => {});
              }}
            >
              elevenlabs.io/app/settings/api-keys
            </a>
            . Recent lines are cached to save credits; on any error she falls back to the system voice.
          </p>
          <label>
            API key
            <input
              type="password"
              value={elevenKey}
              placeholder={hasElevenKey ? "Key saved in Windows Credential Manager" : "xi-api-key"}
              onChange={(e) => setElevenKey(e.target.value)}
            />
          </label>
          <div className="row">
            <button
              className="btn ghost small"
              disabled={!elevenKey.trim()}
              onClick={async () => {
                try {
                  await api.setElevenLabsKey(elevenKey.trim());
                  setElevenKey("");
                  setHasElevenKey(true);
                  setElevenStatus("Key saved.");
                } catch (e) {
                  setElevenStatus(String(e));
                }
              }}
            >
              Save
            </button>
            <button
              className="btn ghost small"
              disabled={!hasElevenKey}
              onClick={async () => {
                await api.setElevenLabsKey(null).catch(() => {});
                setHasElevenKey(await api.hasElevenLabsKey().catch(() => false));
                setElevenVoices([]);
                setElevenStatus("Key removed.");
              }}
            >
              Remove
            </button>
            {hasElevenKey && <span className="status">Key saved in Windows Credential Manager</span>}
          </div>
          <label>
            Voice
            <select value={settings.elevenVoiceId} onChange={(e) => set("elevenVoiceId", e.target.value)}>
              <option value="">(choose a voice)</option>
              {settings.elevenVoiceId && !elevenVoices.some((v) => v.voice_id === settings.elevenVoiceId) && (
                <option value={settings.elevenVoiceId}>{settings.elevenVoiceId}</option>
              )}
              {elevenVoices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button
              className="btn ghost small"
              disabled={!hasElevenKey}
              onClick={async () => {
                setElevenStatus("Loading voices…");
                try {
                  const voices = await api.elevenLabsVoices();
                  setElevenVoices(voices);
                  setElevenStatus(`${voices.length} voices loaded.`);
                } catch (e) {
                  setElevenStatus(String(e));
                }
              }}
            >
              Load voices
            </button>
            <button className="btn ghost small" onClick={onTestVoice}>
              Test
            </button>
            {elevenStatus && <span className="status">{elevenStatus}</span>}
          </div>
          <label>
            Model
            <input
              value={settings.elevenModel}
              placeholder="eleven_flash_v2_5"
              onChange={(e) => set("elevenModel", e.target.value)}
            />
          </label>
        </>
      )}
      <label className="check">
        <input type="checkbox" checked={settings.notify} onChange={(e) => set("notify", e.target.checked)} />
        Windows notifications when a limit runs low
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={autostart}
          onChange={async (e) => {
            const on = e.target.checked;
            await (on ? enable() : disable());
            setAutostart(await isEnabled());
          }}
        />
        Start with Windows
      </label>
      <h3 className="section">Local LLM voice</h3>
      <p className="help">
        Lets a local model write her lines. Recommended: Qwen3.5-4B (Apache-2.0, about 5 GB RAM). Install Ollama, then run{" "}
        <code>ollama pull qwen3.5:4b</code>. Lines with numbers not in the data are thrown out and a built-in line is used instead.
      </p>
      <label className="check">
        <input type="checkbox" checked={settings.llm} onChange={(e) => set("llm", e.target.checked)} />
        Use a local LLM for her lines
      </label>
      <label>
        Server URL (Ollama or OpenAI-compatible, e.g. llama-server on :8080)
        <input value={settings.llmUrl} onChange={(e) => set("llmUrl", e.target.value)} />
      </label>
      <label>
        Model
        <input value={settings.llmModel} onChange={(e) => set("llmModel", e.target.value)} />
      </label>
      <div className="row">
        <button
          className="btn ghost small"
          onClick={async () => {
            setLlmStatus("Testing…");
            setLlmStatus(await onTestLlm());
          }}
        >
          Test model
        </button>
        {llmStatus && <span className="status">{llmStatus}</span>}
      </div>
      <div className="modal-actions">
        <span style={{ flex: 1 }} />
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

/** One row for uploading or removing a custom avatar, portrait or model. */
function CustomUpload({ kind, label, accept, hint, settings, onChange }: {
  kind: CustomKind;
  label: string;
  accept: string;
  hint: string;
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const assets = settings.customAssets ?? {};
  const setVersion = (v: number | undefined) => onChange({ ...settings, customAssets: { ...assets, [kind]: v } });
  return (
    <div className="row custom-upload">
      <span className="custom-upload-label">
        {label}
        <small>{hint}</small>
      </span>
      <label className="btn ghost small">
        {assets[kind] ? "Replace" : "Upload"}
        <input
          type="file"
          accept={accept}
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setStatus("Saving…");
            try {
              await api.saveCustomAsset(kind, file);
              setVersion(Date.now());
              setStatus(null);
            } catch (err) {
              setStatus(String(err));
            }
          }}
        />
      </label>
      {assets[kind] && (
        <button
          className="btn ghost small"
          onClick={async () => {
            await api.clearCustomAsset(kind);
            setVersion(undefined);
          }}
        >
          Remove
        </button>
      )}
      {status && <span className="status">{status}</span>}
    </div>
  );
}
