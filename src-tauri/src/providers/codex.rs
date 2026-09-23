//! ChatGPT plan limits. Codex and ChatGPT share the same plan, so one signed-in
//! Codex `auth.json` gives the 5-hour and weekly windows for both.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use serde_json::Value;

use super::{check, clamp_pct, jwt_claims, num, timestamp};
use crate::model::{Account, Bank, BankCredit, Meter, Report, Sample};
use crate::vault::{self, Login, Source};

const USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
const RESET_CREDITS_URL: &str = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

pub fn default_home() -> PathBuf {
    if let Ok(h) = std::env::var("CODEX_HOME") {
        if !h.is_empty() {
            return PathBuf::from(h);
        }
    }
    dirs::home_dir().unwrap_or_default().join(".codex")
}

/// Codex's OAuth client, used to renew saved logins.
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";

/// The ChatGPT login in a Codex folder, keyed by ChatGPT account id.
pub fn live_login(home: &Path) -> Option<Login> {
    let auth: Value = serde_json::from_str(&std::fs::read_to_string(home.join("auth.json")).ok()?).ok()?;
    login_from_tokens(&auth["tokens"])
}

fn login_from_tokens(tokens: &Value) -> Option<Login> {
    tokens["access_token"].as_str()?;
    let claims = tokens["id_token"].as_str().and_then(jwt_claims).unwrap_or_default();
    let identity = tokens["account_id"]
        .as_str()
        .or_else(|| claims["https://api.openai.com/auth"]["chatgpt_account_id"].as_str())?
        .to_string();
    Some(Login { identity, email: claims["email"].as_str().map(String::from), creds: tokens.clone() })
}

/// Renews a saved login whose access token is about to expire.
async fn fresh(http: &reqwest::Client, login: Login) -> Result<Login> {
    let exp = login.creds["access_token"].as_str().and_then(jwt_claims).and_then(|c| c["exp"].as_i64());
    if exp.is_some_and(|e| e > chrono::Utc::now().timestamp() + 300) {
        return Ok(login);
    }
    let refresh = login.creds["refresh_token"].as_str().context("saved login can't be renewed. Sign in to it again in Codex")?;
    let body = check(
        http.post(TOKEN_URL)
            .json(&serde_json::json!({
                "client_id": CLIENT_ID,
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "scope": "openid profile email",
            }))
            .send()
            .await?,
    )
    .await
    .context("saved login expired. Sign in to this account in Codex once")?;
    let mut creds = login.creds.clone();
    for k in ["access_token", "refresh_token", "id_token"] {
        if let Some(v) = body[k].as_str() {
            creds[k] = Value::String(v.into());
        }
    }
    let renewed = Login { creds, ..login };
    vault::put(&vault::key("codex", &renewed.identity), &renewed)?;
    Ok(renewed)
}

pub fn home(acc: &Account) -> PathBuf {
    match acc.codex_home.as_deref().map(str::trim) {
        Some(h) if !h.is_empty() => PathBuf::from(h),
        _ => default_home(),
    }
}

pub async fn fetch(http: &reqwest::Client, acc: &Account) -> Result<Report> {
    let home = home(acc);
    let live = live_login(&home);
    if live.is_none() && acc.identity.is_none() {
        bail!("no ChatGPT login in {}. Run `codex login`.", home.display());
    }
    let (login, source) = vault::pick("codex", acc.identity.as_deref(), live)?;
    let login = if source == Source::Saved { fresh(http, login).await? } else { login };
    let tokens = &login.creds;
    let access = tokens["access_token"].as_str().context("login has no access token")?;

    let mut report = Report::new(acc);
    report.signed_in = Some(source == Source::Live);
    if let Some(claims) = tokens["id_token"].as_str().and_then(jwt_claims) {
        report.identity = claims["email"].as_str().map(String::from);
        report.plan = claims["https://api.openai.com/auth"]["chatgpt_plan_type"]
            .as_str()
            .map(String::from);
    }

    let mut req = http
        .get(USAGE_URL)
        .bearer_auth(access)
        .header("User-Agent", "codex_cli_rs");
    if let Some(id) = tokens["account_id"].as_str() {
        req = req.header("ChatGPT-Account-Id", id);
    }

    let live = match req.send().await {
        Ok(resp) => check(resp).await,
        Err(e) => Err(e.into()),
    };

    match live {
        Ok(body) => {
            parse_live(&body, &mut report);
            let mut bank_req = http
                .get(RESET_CREDITS_URL)
                .bearer_auth(access)
                .header("User-Agent", "codex_cli_rs");
            if let Some(id) = tokens["account_id"].as_str() {
                bank_req = bank_req.header("ChatGPT-Account-Id", id);
            }
            // Best effort: the bank is a bonus, not a reason to fail the card.
            if let Ok(resp) = bank_req.send().await {
                if let Ok(bank) = check(resp).await {
                    parse_bank(&bank, &mut report);
                }
            }
        }
        Err(err) => {
            // Token expired or offline: fall back to the last snapshot Codex wrote.
            // Those logs belong to whoever is signed in, so only for that account.
            if source == Source::Live && parse_sessions(&home, &mut report) {
                report.note = Some(format!(
                    "Live check failed ({}). Showing the last Codex session.",
                    short(&err)
                ));
            } else {
                return Err(err.context("open Codex once to refresh the login"));
            }
        }
    }
    Ok(report)
}

fn short(err: &anyhow::Error) -> String {
    err.to_string().chars().take(60).collect()
}

fn window_label(seconds: Option<f64>, fallback: &str) -> String {
    match seconds.map(|s| s as i64) {
        Some(18_000) => "5-hour window".into(),
        Some(604_800) => "Weekly window".into(),
        Some(s) if s >= 86_400 => format!("{}-day window", s / 86_400),
        Some(s) if s > 0 => format!("{}-hour window", (s + 1_799) / 3_600),
        _ => fallback.into(),
    }
}

fn window_meter(key: &str, fallback: &str, w: &Value, now: i64) -> Option<Meter> {
    let used = num(&w["used_percent"])?;
    let resets_at = timestamp(&w["reset_at"])
        .or_else(|| num(&w["reset_after_seconds"]).map(|s| now + s as i64));
    Some(Meter {
        key: key.into(),
        label: window_label(num(&w["limit_window_seconds"]), fallback),
        used_percent: clamp_pct(used),
        unit: "percent".into(),
        resets_at,
        window_secs: num(&w["limit_window_seconds"]).map(|s| s as i64),
        ..Default::default()
    })
}

fn parse_live(body: &Value, report: &mut Report) {
    let now = chrono::Utc::now().timestamp();
    if let Some(plan) = body["plan_type"].as_str() {
        report.plan = Some(plan.into());
    }
    let rl = &body["rate_limit"];
    report
        .meters
        .extend(window_meter("primary", "Session", &rl["primary_window"], now));
    report
        .meters
        .extend(window_meter("secondary", "Weekly", &rl["secondary_window"], now));

    if let Some(extra) = body["additional_rate_limits"].as_array() {
        for (i, item) in extra.iter().enumerate() {
            let name = ["limit_name", "metered_feature", "name"]
                .iter()
                .find_map(|k| item[*k].as_str())
                .unwrap_or("Model limit")
                .to_string();
            let inner = if item["rate_limit"].is_object() { &item["rate_limit"] } else { item };
            for (slot, w) in [("p", &inner["primary_window"]), ("s", &inner["secondary_window"])] {
                if let Some(mut m) = window_meter(&format!("extra{i}{slot}"), &name, w, now) {
                    m.label = format!("{name} · {}", m.label);
                    report.meters.push(m);
                }
            }
        }
    }

    if let Some(n) = num(&body["rate_limit_reset_credits"]["available_count"]) {
        report.bank = Some(Bank {
            available: n as u32,
            ..Default::default()
        });
    }

    let credits = &body["credits"];
    if credits["unlimited"].as_bool() == Some(true) {
        report.note = Some("Unlimited credits".into());
    } else if credits["has_credits"].as_bool() == Some(true) {
        if let Some(b) = num(&credits["balance"]) {
            report.note = Some(format!("{b:.0} credits left"));
        }
    }
    if report.meters.is_empty() {
        report.note = Some("ChatGPT returned no rate-limit windows for this plan.".into());
    }
}

/// Free rate-limit resets granted to this account ("reset credits").
fn parse_bank(v: &Value, report: &mut Report) {
    let first_ts = |c: &Value, keys: &[&str]| keys.iter().find_map(|k| timestamp(&c[*k]));
    let credits = v["credits"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|c| BankCredit {
            granted_at: first_ts(c, &["granted_at", "created_at", "earned_at", "issued_at"]),
            expires_at: first_ts(c, &["expires_at", "expiration", "expires", "expiry"]),
        })
        .collect::<Vec<_>>();
    let available = num(&v["available_count"])
        .map(|n| n as u32)
        .unwrap_or(credits.len() as u32);
    report.bank = Some(Bank {
        available,
        earned: num(&v["total_earned_count"]).map(|n| n as u32),
        credits,
    });
}

/// Reads the newest `rate_limits` snapshot from `sessions/**/rollout-*.jsonl`.
fn parse_sessions(home: &Path, report: &mut Report) -> bool {
    let mut files = vec![];
    collect_rollouts(&home.join("sessions"), &mut files, 0);
    files.sort_by_key(|(t, _)| std::cmp::Reverse(*t));

    let now = chrono::Utc::now().timestamp();
    for (_, path) in files.into_iter().take(8) {
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        for line in text.lines().rev() {
            if !line.contains("rate_limits") {
                continue;
            }
            let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
            let limits = if v["payload"]["rate_limits"].is_object() {
                &v["payload"]["rate_limits"]
            } else if v["rate_limits"].is_object() {
                &v["rate_limits"]
            } else {
                continue;
            };
            let line_ts = timestamp(&v["timestamp"]).unwrap_or(now);
            for (key, fallback) in [("primary", "Session"), ("secondary", "Weekly")] {
                let w = &limits[key];
                let Some(used) = num(&w["used_percent"]) else { continue };
                let resets_at = timestamp(&w["resets_at"])
                    .or_else(|| num(&w["resets_in_seconds"]).map(|s| line_ts + s as i64));
                // The window already rolled over since this snapshot.
                let used = if resets_at.is_some_and(|r| r < now) { 0.0 } else { used };
                let secs = num(&w["window_minutes"]).map(|m| m * 60.0);
                report.meters.push(Meter {
                    key: key.into(),
                    label: window_label(secs, fallback),
                    used_percent: clamp_pct(used),
                    unit: "percent".into(),
                    resets_at: resets_at.filter(|r| *r >= now),
                    window_secs: secs.map(|s| s as i64),
                    ..Default::default()
                });
            }
            if !report.meters.is_empty() {
                return true;
            }
        }
    }
    false
}

/// Every rate-limit reading Codex has logged for this account, oldest first,
/// with repeated readings dropped. The calendar uses it to find past resets.
pub fn history(acc: &Account) -> Vec<Sample> {
    let mut files = vec![];
    collect_rollouts(&home(acc).join("sessions"), &mut files, 0);
    files.sort_by(|a, b| a.1.cmp(&b.1));

    let mut out: Vec<Sample> = vec![];
    for (_, path) in files {
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        for line in text.lines().filter(|l| l.contains("\"rate_limits\"")) {
            let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
            let limits = &v["payload"]["rate_limits"];
            // Model-specific limits (other `limit_id`s) interleave with the main one.
            if limits["limit_id"].as_str().is_some_and(|id| id != "codex") {
                continue;
            }
            let plan = limits["plan_type"].as_str().map(String::from);
            let Some(t) = timestamp(&v["timestamp"]) else { continue };
            for key in ["primary", "secondary"] {
                let w = &limits[key];
                let Some(used) = num(&w["used_percent"]) else { continue };
                let resets_at = timestamp(&w["resets_at"])
                    .or_else(|| num(&w["resets_in_seconds"]).map(|s| t + s as i64));
                let window_secs = num(&w["window_minutes"]).map(|m| (m * 60.0) as i64);
                let same = out.iter().rev().find(|s| s.key == key).is_some_and(|s| {
                    s.used == used && s.resets_at.zip(resets_at).is_none_or(|(a, b)| (a - b).abs() < 120)
                });
                if !same {
                    out.push(Sample { key: key.into(), t, used, resets_at, window_secs, plan: plan.clone() });
                }
            }
        }
    }
    out.sort_by_key(|s| s.t);
    out
}

fn collect_rollouts(dir: &Path, out: &mut Vec<(std::time::SystemTime, PathBuf)>, depth: u8) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            collect_rollouts(&p, out, depth + 1);
        } else if p.extension().is_some_and(|x| x == "jsonl") {
            if let Ok(t) = e.metadata().and_then(|m| m.modified()) {
                out.push((t, p));
            }
        }
    }
}
