import { useEffect, useState } from "react";
import { api } from "../api";
import Modal from "./Modal";
import { PROVIDERS, type Account, type Provider } from "../types";

interface Props {
  initial?: Account;
  onSave: (a: Account, secret?: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  onRestored?: (accounts: Account[]) => void;
}

const HELP: Record<Provider, string> = {
  codex:
    "Reads the login from a Codex CLI folder (auth.json). One folder = one ChatGPT account. Shows the 5-hour and weekly limits that ChatGPT and Codex share. For a second account, sign in with CODEX_HOME set to another folder and put that folder here.",
  claude:
    "Reads the login Claude Code keeps in .credentials.json. Shows the 5-hour session, weekly, and per-model weekly limits for Pro and Max plans. For a second account, sign in with CLAUDE_CONFIG_DIR set to another folder and put that folder here.",
  cursor:
    "Auto mode reads the session from the Cursor app on this computer. For other accounts, paste the WorkosCursorSessionToken cookie from cursor.com (DevTools → Application → Cookies).",
  grokbot:
    "Grok Bot's weekly included usage, billed through Cursor. Uses the same login as Cursor: the Cursor app on this computer, or a pasted WorkosCursorSessionToken cookie.",
  openai:
    "Needs an OpenAI admin key (sk-admin-…) from platform.openai.com → Organization → Admin keys. Shows this month's API spend against your budget.",
  xai:
    "Needs an xAI management key and team id from console.x.ai → Settings. Shows prepaid Grok API credits left.",
};

export default function AccountEditor({ initial, onSave, onDelete, onClose, onRestored }: Props) {
  const [removedList, setRemovedList] = useState<Account[]>([]);
  useEffect(() => {
    if (!initial) api.listRemoved().then(setRemovedList).catch(() => {});
  }, [initial]);
  const [acc, setAcc] = useState<Account>(
    initial ?? {
      id: "",
      provider: "codex",
      label: "",
      codexHome: "",
      cursorAuto: true,
      teamId: "",
      monthlyBudget: null,
      hasSecret: false,
      hiddenMeters: [],
    },
  );
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Account>(k: K, v: Account[K]) => setAcc((a) => ({ ...a, [k]: v }));
  const needsSecret =
    acc.provider === "openai" || acc.provider === "xai" || ((acc.provider === "cursor" || acc.provider === "grokbot") && !acc.cursorAuto);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...acc, label: acc.label.trim() || PROVIDERS[acc.provider].name }, secret);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Edit account" : "Add account"} onClose={onClose}>
      {!initial && (
        <div className="provider-pick">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <button
              key={p}
              className={acc.provider === p ? "active" : ""}
              style={{ "--brand": PROVIDERS[p].color } as React.CSSProperties}
              onClick={() => set("provider", p)}
            >
              <span>{PROVIDERS[p].icon}</span>
              {PROVIDERS[p].name}
            </button>
          ))}
        </div>
      )}
      <p className="help">{HELP[acc.provider]}</p>
      {!initial && ["codex", "claude", "cursor", "grokbot"].includes(acc.provider) && (
        <p className="help">
          Have several emails? No setup needed: sign in to each one once in {acc.provider === "codex" ? "Codex" : acc.provider === "claude" ? "Claude Code" : "Cursor"}.
          The app saves every login it sees and keeps tracking it after you switch.
        </p>
      )}

      <label>
        Nickname
        <input value={acc.label} placeholder={PROVIDERS[acc.provider].name} onChange={(e) => set("label", e.target.value)} />
      </label>

      {(acc.provider === "codex" || acc.provider === "claude") && (
        <label>
          {acc.provider === "codex" ? "Codex folder" : "Claude Code folder"}
          <input
            value={acc.codexHome ?? ""}
            placeholder={acc.provider === "codex" ? "Blank = ~/.codex" : "Blank = ~/.claude"}
            onChange={(e) => set("codexHome", e.target.value)}
          />
        </label>
      )}

      {(acc.provider === "cursor" || acc.provider === "grokbot") && (
        <label className="check">
          <input type="checkbox" checked={acc.cursorAuto} onChange={(e) => set("cursorAuto", e.target.checked)} />
          Use the account signed in to Cursor on this computer
        </label>
      )}

      {acc.provider === "xai" && (
        <label>
          Team id
          <input value={acc.teamId ?? ""} onChange={(e) => set("teamId", e.target.value)} />
        </label>
      )}

      {acc.provider === "openai" && (
        <label>
          Monthly budget (USD)
          <input
            type="number"
            min={0}
            value={acc.monthlyBudget ?? ""}
            onChange={(e) => set("monthlyBudget", e.target.value ? Number(e.target.value) : null)}
          />
        </label>
      )}

      {needsSecret && (
        <label>
          {acc.provider === "cursor" || acc.provider === "grokbot" ? "Session cookie" : acc.provider === "openai" ? "Admin key" : "Management key"}
          <input
            type="password"
            value={secret}
            placeholder={acc.hasSecret ? "Saved in your system keychain. Type to replace." : ""}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
      )}

      {!initial && removedList.length > 0 && (
        <div className="removed">
          <h3 className="section">Removed accounts</h3>
          {removedList.map((r) => (
            <div key={r.id} className="removed-row">
              <span className="removed-icon" style={{ "--brand": PROVIDERS[r.provider].color } as React.CSSProperties}>
                {PROVIDERS[r.provider].icon}
              </span>
              <span className="removed-name">{r.label}</span>
              <button
                className="btn small"
                onClick={async () => {
                  const accs = await api.restoreAccount(r.id);
                  setRemovedList((l) => l.filter((x) => x.id !== r.id));
                  onRestored?.(accs);
                }}
              >
                Restore
              </button>
              <button
                className="btn ghost small"
                title="Delete it and its saved login for good"
                onClick={async () => {
                  if (confirm(`Forget "${r.label}" for good? Its saved login and key are deleted.`)) {
                    setRemovedList(await api.forgetAccount(r.id));
                  }
                }}
              >
                Forget
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="card-err">{error}</div>}

      <div className="modal-actions">
        {onDelete && (
          <button
            className="btn danger"
            onClick={async () => {
              if (confirm(`Remove "${acc.label}"? You can restore it later from Add account.`)) {
                await onDelete();
                onClose();
              }
            }}
          >
            Remove
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
