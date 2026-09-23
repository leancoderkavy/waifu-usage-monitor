import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import Modal from "./Modal";
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
  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => {});
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
        <input value={settings.userTitle} onChange={(e) => set("userTitle", e.target.value || "Operator")} />
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
        3D character (generated with Animagine XL + Hunyuan3D-2mv)
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.voice} onChange={(e) => set("voice", e.target.checked)} />
        She speaks out loud
        <button className="btn ghost small" onClick={onTestVoice}>
          Test
        </button>
      </label>
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
