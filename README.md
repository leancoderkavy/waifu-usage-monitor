# KOS-MOS Usage Monitor

A Windows tray app that watches how much AI usage you have left across all your accounts. A KOS-MOS-style android companion (fan art inspired by *Xenosaga: The Animation*) reads it out, reacts to low limits, and sends Windows notifications.

Built with Tauri 2 (Rust + WebView2), React 19, Vite 8 and Motion.

## What it tracks

| Provider | What you see | How it signs in |
| --- | --- | --- |
| ChatGPT / Codex | 5-hour and weekly plan windows, per-model limits, banked reset credits | The Codex CLI login in `%USERPROFILE%\.codex\auth.json` (auto-detected) |
| Claude | 5-hour session, weekly, per-model weekly (Pro / Max), extra usage | The Claude Code login in `%USERPROFILE%\.claude\.credentials.json` (auto-detected) |
| Cursor | Included, Auto-mode, named-model and on-demand usage for this billing cycle | The Cursor app on this PC (auto-detected), or a pasted `WorkosCursorSessionToken` cookie |
| OpenAI API | This month's usage as a share of a budget you set | Admin key (`sk-admin-…`) |
| Grok / xAI API | Share of prepaid credits used |
| Grok Bot | Weekly included usage (billed through Cursor, same login) | Management key + team id |

Every meter shows usage as a percentage, with no dollar amounts. Pasted keys go to Windows Credential Manager, not to disk. The app reads the tools' login files but never writes to them.

### Several accounts on different emails

No setup needed. Sign in to each email once in Codex, Claude Code or Cursor, the way you normally switch accounts. Every time the app refreshes it:

1. Checks who is signed in to each tool.
2. Saves that login to an encrypted vault (`%APPDATA%\com.waifu.usagemonitor\vault.bin`, encrypted with Windows DPAPI so only your Windows user can read it).
3. Adds a card for any email it hasn't seen before.

After you switch to another email, it keeps checking the earlier ones with their saved logins. Those cards show a **SAVED** badge. When a saved login expires, the app renews it. It never renews the login the tool is using right now, so Codex and Claude Code stay signed in.

Claude logins expire after about 8 hours and Codex after about 10 days, so the app renews them in the background. Cursor logins last about 60 days. When one runs out, sign in to that account in Cursor once more.

### Editing cards

- Hover a meter and click **–** to hide it. Hidden meters stop counting toward her mood and alerts. Click the **+ name** chip at the bottom of the card to bring one back.
- Removing a card keeps its saved login. **Add account → Removed accounts** has **Restore**, and **Forget** to delete it for good.

## Sessions and System tabs

- **Sessions:** Codex and Claude Code sessions from the last 24 hours, read from their local logs, plus the models Ollama has loaded. Each row shows the model, effort, project, branch, context size and how long ago it was active.
- **System:** CPU, RAM, GPU and VRAM gauges with 2-minute graphs, per-thread load and the heaviest processes. GPU stats need an NVIDIA GPU (`nvidia-smi`).

Not covered: grok.com / SuperGrok chat limits and ChatGPT web message caps. Neither has an API.

## Reset calendar

The **Reset calendar** tab shows:

- **Global resets (announced)**: a provider reset limits for everyone, or gave everyone a banked reset. These come from public feeds (see below). You get a Windows notification and she announces it.
- **Early resets (this login)**: one of your windows reset before its scheduled time. If it lines up with an announced global reset, it's marked **✓ Matches an announced global reset**.
- **Bank resets**: free reset credits granted, used, or expiring (ChatGPT / Codex).
- **Scheduled and upcoming resets** for daily or longer windows. 5-hour windows are left off to keep the calendar readable.

### Where global resets come from

Resets are announced on X, which has no free API. The app polls these sources every 15 minutes, with no login:

| Source | Covers |
| --- | --- |
| [codexresets.com/api/resets](https://codexresets.com/api/resets) | Every confirmed Codex reset posted by the Codex lead (@thsottiaux) |
| [inmve/token-resets](https://github.com/inmve/token-resets/releases) releases | Upcoming-reset teasers |
| X posts you add | Any provider. Paste an x.com link in the calendar. The app reads it through X's public embed endpoint and keeps it only if it's from an official account (@claudeai, @AnthropicAI, @thsottiaux, @OpenAIDevs, @OpenAI, @cursor_ai, @xai, @grok) and reads like a reset. |

There is no automatic feed for Claude, Cursor or xAI yet. For those, paste the announcement post. Claude's 2026-09-22 reset post is preloaded.

Past resets for ChatGPT / Codex are rebuilt from Codex session logs on first run. Those logs mix every account used on the machine, and they record the plan but not the account. So each plan gets its own track, and an early reset from the logs that matches no announcement may just be a switch between two accounts on the same plan. Live detection skips account switches.

## Local LLM voice (optional)

Her lines are built from templates by default. To have a local model write them:

1. Install [Ollama](https://ollama.com), then run `ollama pull qwen3.5:4b`. This is [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B): Apache-2.0, about 5 GB RAM.
2. Open Settings, turn on **Use a local LLM**, then press **Test model**.

On low-RAM PCs, use `qwen3.5:2b` instead. Any OpenAI-compatible server also works, such as `llama-server` on `http://localhost:8080`. Replies that contain a number not in the usage data are thrown out, and a template line is used instead.

## 3D character

`public/models/kosmos.glb` was generated on this PC with open Hugging Face models. The scripts live in `D:\AI\kosmos-3d` and run in the `D:\AI\envs\hunyuan3d2mv` Python environment:

1. `gen_ref.py front 303` and `gen_ref.py back 303` make full-body front and back views with [Animagine XL 4.0](https://huggingface.co/cagliostrolab/animagine-xl-4.0).
2. `make_mesh.py 303` removes the backgrounds and builds the shape with [Hunyuan3D-2mv](https://huggingface.co/tencent/Hunyuan3D-2mv). This takes about 90 s on an RTX 3090. The mesh is then reduced to 60k faces.
3. `texture.py` paints the mesh by projecting the front art onto forward-facing faces and the back art onto the rest, then writes `kosmos.glb`.

In the app she breathes, floats, turns toward your mouse, nods while talking, spins when clicked and changes rim-light color with her mood. Settings has a switch back to the 2D art. Hunyuan3D's license doesn't cover use in the EU, the UK or South Korea.

## Develop

```sh
npm install
npm run tauri dev     # run with hot reload
npm run tauri build   # installers in src-tauri/target/release/bundle
```

Needs Node 20+, Rust stable, and the WebView2 runtime (built into Windows 11).
