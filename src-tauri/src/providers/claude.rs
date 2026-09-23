//! Claude plan limits (Pro / Max) from the OAuth usage endpoint, using the
//! login Claude Code keeps in `~/.claude/.credentials.json` (Windows, Linux)
//! or in the login Keychain as "Claude Code-credentials" (macOS).

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use serde_json::Value;

use super::{check, clamp_pct, num, timestamp};
use crate::model::{Account, Meter, Report};
use crate::vault::{self, Login, Source};

const API: &str = "https://api.anthropic.com/api/oauth";

pub fn default_home() -> PathBuf {
    if let Ok(h) = std::env::var("CLAUDE_CONFIG_DIR") {
        if !h.is_empty() {
            return PathBuf::from(h);
        }
    }
    dirs::home_dir().unwrap_or_default().join(".claude")
}

/// Claude Code's OAuth client, used to renew saved logins.
const CLIENT_ID: &str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const TOKEN_URLS: [&str; 2] = [
    "https://platform.claude.com/v1/oauth/token",
    "https://console.anthropic.com/v1/oauth/token",
];

/// Raw Claude Code credentials JSON for a folder: `.credentials.json` if it
/// exists, else (macOS, default folder only) the login Keychain item Claude
/// Code writes there instead of the file.
fn read_credentials(home: &std::path::Path) -> Option<String> {
    if let Ok(text) = std::fs::read_to_string(home.join(".credentials.json")) {
        return Some(text);
    }
    #[cfg(target_os = "macos")]
    if home == default_home() {
        return keychain_credentials();
    }
    None
}

/// Reads the "Claude Code-credentials" generic password through `security`,
/// the same tool Claude Code uses to write it, so the item's access list
/// already allows it and macOS does not prompt.
#[cfg(target_os = "macos")]
fn keychain_credentials() -> Option<String> {
    let out = std::process::Command::new("/usr/bin/security")
        .args(["find-generic-password", "-s", "Claude Code-credentials", "-w"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8(out.stdout).ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// True when Claude Code has a login stored for this folder (file or Keychain).
pub fn has_credentials(home: &std::path::Path) -> bool {
    home.join(".credentials.json").exists() || {
        #[cfg(target_os = "macos")]
        {
            home == default_home() && keychain_credentials().is_some()
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }
}

/// The Claude login in a Claude Code folder, keyed by Claude account uuid.
/// The account details live in `.claude.json`: next to the folder for the
/// default `~/.claude`, inside it when CLAUDE_CONFIG_DIR is used.
pub fn live_login(home: &std::path::Path) -> Option<Login> {
    let creds: Value = serde_json::from_str(&read_credentials(home)?).ok()?;
    let oauth = creds["claudeAiOauth"].clone();
    oauth["accessToken"].as_str()?;
    let config = if home == default_home() {
        dirs::home_dir()?.join(".claude.json")
    } else {
        home.join(".claude.json")
    };
    let cfg: Value = serde_json::from_str(&std::fs::read_to_string(config).ok()?).ok()?;
    let account = &cfg["oauthAccount"];
    Some(Login {
        identity: account["accountUuid"].as_str()?.to_string(),
        email: account["emailAddress"].as_str().map(String::from),
        creds: oauth,
    })
}

/// Renews a saved login. Claude access tokens only last about 8 hours.
async fn fresh(http: &reqwest::Client, login: Login) -> Result<Login> {
    let exp_ms = num(&login.creds["expiresAt"]).unwrap_or(0.0) as i64;
    if exp_ms / 1000 > chrono::Utc::now().timestamp() + 300 {
        return Ok(login);
    }
    let refresh = login.creds["refreshToken"]
        .as_str()
        .context("saved login can't be renewed. Sign in to it again in Claude Code")?;
    let mut last_err = None;
    for url in TOKEN_URLS {
        let sent = http
            .post(url)
            .json(&serde_json::json!({
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "client_id": CLIENT_ID,
            }))
            .send()
            .await;
        let body = match sent {
            Ok(resp) => match check(resp).await {
                Ok(b) => b,
                Err(e) => {
                    last_err = Some(e);
                    continue;
                }
            },
            Err(e) => {
                last_err = Some(e.into());
                continue;
            }
        };
        let mut creds = login.creds.clone();
        if let Some(a) = body["access_token"].as_str() {
            creds["accessToken"] = Value::String(a.into());
        }
        if let Some(r) = body["refresh_token"].as_str() {
            creds["refreshToken"] = Value::String(r.into());
        }
        let expires_in = num(&body["expires_in"]).unwrap_or(28_800.0) as i64;
        creds["expiresAt"] = Value::from((chrono::Utc::now().timestamp() + expires_in) * 1000);
        let renewed = Login { creds, ..login };
        vault::put(&vault::key("claude", &renewed.identity), &renewed)?;
        return Ok(renewed);
    }
    Err(last_err
        .unwrap_or_else(|| anyhow::anyhow!("no token endpoint"))
        .context("saved login expired. Sign in to this account in Claude Code once"))
}

fn home(acc: &Account) -> PathBuf {
    // Claude reuses the Codex folder field: any folder that holds `.credentials.json`.
    match acc.codex_home.as_deref().map(str::trim) {
        Some(h) if !h.is_empty() => PathBuf::from(h),
        _ => default_home(),
    }
}

async fn get(http: &reqwest::Client, token: &str, path: &str) -> Result<Value> {
    let resp = http
        .get(format!("{API}/{path}"))
        .bearer_auth(token)
        .header("anthropic-beta", "oauth-2025-04-20")
        .send()
        .await?;
    check(resp).await
}

pub async fn fetch(http: &reqwest::Client, acc: &Account) -> Result<Report> {
    let home = home(acc);
    let live = live_login(&home);
    if live.is_none() && acc.identity.is_none() {
        let path = home.join(".credentials.json");
        if cfg!(target_os = "macos") && home == default_home() {
            bail!("no Claude Code login in the macOS Keychain or at {}. Run `claude` and /login.", path.display());
        }
        bail!("no Claude Code login at {}. Run `claude` and /login.", path.display());
    }
    let (login, source) = vault::pick("claude", acc.identity.as_deref(), live)?;
    let login = if source == Source::Saved { fresh(http, login).await? } else { login };
    let oauth = &login.creds;
    let token = oauth["accessToken"].as_str().context("login has no access token")?;
    if source == Source::Live
        && num(&oauth["expiresAt"]).is_some_and(|e| (e as i64) / 1000 < chrono::Utc::now().timestamp())
    {
        bail!("Claude login expired. Open Claude Code once to refresh it.");
    }

    let mut report = Report::new(acc);
    report.signed_in = Some(source == Source::Live);
    report.identity = login.email.clone();
    report.plan = oauth["subscriptionType"].as_str().map(String::from);

    let usage = get(http, token, "usage").await?;
    if let Ok(profile) = get(http, token, "profile").await {
        report.identity = profile["account"]["email"].as_str().map(String::from);
    }

    if let Some(limits) = usage["limits"].as_array().filter(|l| !l.is_empty()) {
        for l in limits {
            let Some(pct) = num(&l["percent"]) else { continue };
            let kind = l["kind"].as_str().unwrap_or("limit");
            let model = l["scope"]["model"]["display_name"].as_str();
            let label = match (kind, model) {
                ("session", _) => "5-hour session".to_string(),
                ("weekly_all", _) => "Weekly (all models)".to_string(),
                (_, Some(m)) => format!("Weekly · {m}"),
                (k, None) => k.replace('_', " "),
            };
            report.meters.push(Meter {
                key: format!("{kind}:{}", model.unwrap_or("all")),
                label,
                used_percent: clamp_pct(pct),
                unit: "percent".into(),
                resets_at: timestamp(&l["resets_at"]),
                window_secs: Some(if kind == "session" { 18_000 } else { 604_800 }),
                ..Default::default()
            });
        }
    } else {
        for (key, label) in [
            ("five_hour", "5-hour session"),
            ("seven_day", "Weekly (all models)"),
            ("seven_day_opus", "Weekly · Opus"),
            ("seven_day_sonnet", "Weekly · Sonnet"),
        ] {
            let w = &usage[key];
            if let Some(pct) = num(&w["utilization"]) {
                report.meters.push(Meter {
                    key: key.into(),
                    label: label.into(),
                    used_percent: clamp_pct(pct),
                    unit: "percent".into(),
                    resets_at: timestamp(&w["resets_at"]),
                    window_secs: Some(if key == "five_hour" { 18_000 } else { 604_800 }),
                    ..Default::default()
                });
            }
        }
    }

    let extra = &usage["extra_usage"];
    if extra["is_enabled"].as_bool() == Some(true) {
        let scale = 10f64.powi(num(&extra["decimal_places"]).unwrap_or(2.0) as i32);
        let used = num(&extra["used_credits"]).unwrap_or(0.0) / scale;
        if let Some(limit) = num(&extra["monthly_limit"]).map(|l| l / scale).filter(|l| *l > 0.0) {
            report.meters.push(Meter {
                key: "extra".into(),
                label: "Extra usage this month".into(),
                used_percent: clamp_pct(used / limit * 100.0),
                used: Some(used),
                limit: Some(limit),
                unit: "usd".into(),
                resets_at: None,
                window_secs: None,
            });
        }
    }
    Ok(report)
}
