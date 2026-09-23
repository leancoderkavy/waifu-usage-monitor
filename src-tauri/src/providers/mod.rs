pub mod claude;
pub mod codex;
pub mod cursor;
pub mod openai;
pub mod xai;

use std::time::Duration;

use base64::Engine;
use serde_json::Value;

use crate::model::{Account, Provider, Report};

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("WaifuUsageMonitor/0.1")
        .build()
        .expect("http client")
}

pub async fn fetch(http: &reqwest::Client, acc: &Account) -> Report {
    let res = match acc.provider {
        Provider::Codex => codex::fetch(http, acc).await,
        Provider::Cursor => cursor::fetch(http, acc).await,
        Provider::Grokbot => cursor::fetch_grokbot(http, acc).await,
        Provider::Claude => claude::fetch(http, acc).await,
        Provider::Openai => openai::fetch(http, acc).await,
        Provider::Xai => xai::fetch(http, acc).await,
    };
    res.unwrap_or_else(|e| Report::failed(acc, e))
}

/// Decodes the payload of a JWT without verifying it. Used only to read the
/// email, plan and user id that the provider already put in the token.
pub fn jwt_claims(token: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload.trim_end_matches('='))
        .ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn num(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

/// Accepts unix seconds, unix milliseconds or an RFC 3339 string.
pub fn timestamp(v: &Value) -> Option<i64> {
    if let Some(n) = num(v) {
        let n = n as i64;
        return Some(if n > 10_000_000_000 { n / 1000 } else { n });
    }
    let s = v.as_str()?;
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|d| d.timestamp())
}

pub fn clamp_pct(p: f64) -> f64 {
    if p.is_finite() {
        p.clamp(0.0, 100.0)
    } else {
        0.0
    }
}

pub async fn check(resp: reqwest::Response) -> anyhow::Result<Value> {
    let status = resp.status();
    let body = resp.text().await?;
    if !status.is_success() {
        let snippet: String = body.chars().take(200).collect();
        anyhow::bail!("HTTP {status}: {snippet}");
    }
    Ok(serde_json::from_str(&body)?)
}
