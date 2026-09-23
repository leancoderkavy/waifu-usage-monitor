//! Recent and running AI coding sessions on this PC, read from the logs Codex
//! and Claude Code write, plus the models Ollama has loaded.

use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::Serialize;
use serde_json::Value;

use crate::providers::{num, timestamp};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    /// "codex", "claude" or "ollama".
    pub tool: String,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub project: Option<String>,
    pub cwd: Option<String>,
    pub branch: Option<String>,
    /// Where it runs: "Codex Desktop", "cli", "vscode", …
    pub client: Option<String>,
    pub subagent: bool,
    /// Unix seconds of the last logged activity.
    pub last_active: i64,
    pub started: Option<i64>,
    pub total_tokens: Option<f64>,
    /// Context tokens used by the last turn (Codex) or last message (Claude).
    pub context_tokens: Option<f64>,
    pub size_bytes: Option<f64>,
}

const LOOKBACK: Duration = Duration::from_secs(24 * 3600);
/// Enough of the file end to hold the last few turns.
const TAIL: u64 = 512 * 1024;

fn recent_files(dir: &Path, depth: u8, out: &mut Vec<(SystemTime, PathBuf)>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let cutoff = SystemTime::now() - LOOKBACK;
    for e in entries.flatten() {
        let p = e.path();
        let Ok(meta) = e.metadata() else { continue };
        // Folder times don't reliably move when files inside change, so always descend.
        if meta.is_dir() {
            if depth > 0 {
                recent_files(&p, depth - 1, out);
            }
        } else if p.extension().is_some_and(|x| x == "jsonl") {
            if let Ok(m) = meta.modified() {
                if m >= cutoff {
                    out.push((m, p));
                }
            }
        }
    }
}

fn first_line(path: &Path) -> Option<Value> {
    let mut line = String::new();
    BufReader::new(std::fs::File::open(path).ok()?).read_line(&mut line).ok()?;
    serde_json::from_str(&line).ok()
}

/// Parsed JSON lines from the end of a file, oldest first.
fn tail_lines(path: &Path) -> Vec<Value> {
    let Ok(mut f) = std::fs::File::open(path) else { return vec![] };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(TAIL);
    if f.seek(SeekFrom::Start(start)).is_err() {
        return vec![];
    }
    let mut buf = String::new();
    if f.read_to_string(&mut buf).is_err() {
        // Cut mid UTF-8 character; fall back to lossy.
        let mut bytes = vec![];
        let _ = f.seek(SeekFrom::Start(start));
        let _ = f.read_to_end(&mut bytes);
        buf = String::from_utf8_lossy(&bytes).into_owned();
    }
    let body = if start > 0 { buf.split_once('\n').map(|(_, rest)| rest).unwrap_or("") } else { &buf };
    body.lines().filter_map(|l| serde_json::from_str(l).ok()).collect()
}

type Cache = std::collections::HashMap<PathBuf, (SystemTime, u64, Option<Session>)>;
static CACHE: std::sync::Mutex<Option<Cache>> = std::sync::Mutex::new(None);

/// Parses a log only when it changed since the last scan. Most of the 24 h of
/// logs are idle, so repeat scans touch just the few files still being written.
fn cached(path: &Path, mtime: SystemTime, parse: impl FnOnce() -> Option<Session>) -> Option<Session> {
    let len = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if let Some(hit) = CACHE
        .lock()
        .ok()
        .and_then(|c| c.as_ref().and_then(|m| m.get(path).cloned()))
        .filter(|(t, l, _)| *t == mtime && *l == len)
    {
        return hit.2;
    }
    let parsed = parse();
    if let Ok(mut c) = CACHE.lock() {
        c.get_or_insert_with(Default::default).insert(path.to_path_buf(), (mtime, len, parsed.clone()));
    }
    parsed
}

fn project_name(cwd: Option<&str>) -> Option<String> {
    let cwd = cwd?;
    Path::new(cwd).file_name().map(|n| n.to_string_lossy().into_owned())
}

fn codex(home: &Path, out: &mut Vec<Session>) {
    let mut files = vec![];
    recent_files(&home.join("sessions"), 4, &mut files);
    for (mtime, path) in files {
        out.extend(cached(&path, mtime, || codex_file(&path, mtime)));
    }
}

fn codex_file(path: &Path, mtime: SystemTime) -> Option<Session> {
    let meta = first_line(path).unwrap_or_default();
    let m = &meta["payload"];
    let tail = tail_lines(path);
    let ctx = tail.iter().rev().find(|j| j["type"] == "turn_context").map(|j| &j["payload"]);
    let tokens = tail
        .iter()
        .rev()
        .find(|j| j["payload"]["type"] == "token_count" && j["payload"]["info"].is_object())
        .map(|j| &j["payload"]["info"]);
    let last = tail.iter().rev().find_map(|j| timestamp(&j["timestamp"]));
    let cwd = ctx.and_then(|c| c["cwd"].as_str()).or_else(|| m["cwd"].as_str());
    Some(Session {
        id: m["id"].as_str().or(m["session_id"].as_str()).unwrap_or_default().to_string(),
        tool: "codex".into(),
        model: ctx.and_then(|c| c["model"].as_str()).map(String::from),
        effort: ctx.and_then(|c| c["effort"].as_str()).map(String::from),
        project: project_name(cwd),
        cwd: cwd.map(String::from),
        branch: m["git"]["branch"].as_str().map(String::from),
        client: m["originator"].as_str().or(m["source"].as_str()).map(String::from),
        subagent: m["thread_source"].as_str().is_some_and(|s| s != "user"),
        last_active: last.unwrap_or_else(|| to_unix(mtime)),
        started: timestamp(&m["timestamp"]),
        total_tokens: tokens.and_then(|t| num(&t["total_token_usage"]["total_tokens"])),
        context_tokens: tokens.and_then(|t| num(&t["last_token_usage"]["input_tokens"])),
        size_bytes: None,
    })
}

fn claude(home: &Path, out: &mut Vec<Session>) {
    let mut files = vec![];
    recent_files(&home.join("projects"), 3, &mut files);
    for (mtime, path) in files {
        out.extend(cached(&path, mtime, || claude_file(&path, mtime)));
    }
}

fn claude_file(path: &Path, mtime: SystemTime) -> Option<Session> {
    let tail = tail_lines(path);
    let msg = tail.iter().rev().find(|j| j["type"] == "assistant" && j["message"]["model"].is_string())?;
    let model = msg["message"]["model"].as_str().unwrap_or_default();
    if model.starts_with('<') {
        return None; // "<synthetic>" placeholder messages
    }
    let u = &msg["message"]["usage"];
    let context = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
        .iter()
        .filter_map(|k| num(&u[*k]))
        .sum::<f64>();
    let last = tail.iter().rev().find_map(|j| timestamp(&j["timestamp"]));
    let cwd = msg["cwd"].as_str();
    let subagent = msg["isSidechain"].as_bool() == Some(true) || msg["agentId"].is_string();
    Some(Session {
        id: msg["agentId"]
            .as_str()
            .map(|a| format!("{}:{a}", msg["sessionId"].as_str().unwrap_or_default()))
            .or_else(|| msg["sessionId"].as_str().map(String::from))
            .unwrap_or_else(|| path.to_string_lossy().into_owned()),
        tool: "claude".into(),
        model: Some(model.to_string()),
        effort: msg["effort"].as_str().map(String::from),
        project: project_name(cwd),
        cwd: cwd.map(String::from),
        branch: msg["gitBranch"].as_str().filter(|b| !b.is_empty()).map(String::from),
        client: msg["entrypoint"].as_str().map(String::from),
        subagent,
        last_active: last.unwrap_or_else(|| to_unix(mtime)),
        started: None,
        total_tokens: None,
        context_tokens: (context > 0.0).then_some(context),
        size_bytes: None,
    })
}

async fn ollama(out: &mut Vec<Session>) {
    let Ok(resp) = reqwest::Client::new()
        .get("http://localhost:11434/api/ps")
        .timeout(Duration::from_secs(2))
        .send()
        .await
    else {
        return;
    };
    let Ok(body) = resp.json::<Value>().await else { return };
    let now = chrono::Utc::now().timestamp();
    for m in body["models"].as_array().into_iter().flatten() {
        let name = m["name"].as_str().unwrap_or_default().to_string();
        out.push(Session {
            id: format!("ollama:{name}"),
            tool: "ollama".into(),
            model: Some(name),
            effort: m["details"]["quantization_level"].as_str().map(String::from),
            project: None,
            cwd: None,
            branch: None,
            client: Some("Ollama".into()),
            subagent: false,
            // Loaded models are live by definition.
            last_active: now,
            started: None,
            total_tokens: None,
            context_tokens: num(&m["context_length"]),
            size_bytes: num(&m["size_vram"]).filter(|v| *v > 0.0).or_else(|| num(&m["size"])),
        });
    }
}

fn to_unix(t: SystemTime) -> i64 {
    t.duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Sessions active in the last 24 hours, most recent first.
pub async fn list(codex_home: PathBuf, claude_home: PathBuf) -> Vec<Session> {
    let mut out = tokio::task::spawn_blocking(move || {
        let mut v = vec![];
        codex(&codex_home, &mut v);
        claude(&claude_home, &mut v);
        v
    })
    .await
    .unwrap_or_default();
    ollama(&mut out).await;
    out.sort_by_key(|s| std::cmp::Reverse(s.last_active));
    out
}

#[cfg(test)]
mod tests {
    /// Reads this PC's real logs. Run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn lists_local_sessions() {
        let list = super::list(crate::providers::codex::default_home(), crate::providers::claude::default_home()).await;
        let now = chrono::Utc::now().timestamp();
        for s in list.iter().take(12) {
            eprintln!(
                "{:>6}s ago {:6} {:22} {:8} {:24} sub={} ctx={:?}",
                now - s.last_active,
                s.tool,
                s.model.as_deref().unwrap_or("?"),
                s.effort.as_deref().unwrap_or(""),
                s.project.as_deref().unwrap_or(""),
                s.subagent,
                s.context_tokens
            );
        }
        eprintln!("total {}", list.len());
        assert!(!list.is_empty());
    }
}
