//! Cursor plan usage from the cursor.com dashboard API, authenticated with the
//! `WorkosCursorSessionToken` cookie. The cookie is built from the token the
//! local Cursor app stores, or from a value pasted by the user.

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use serde_json::Value;

use super::{check, clamp_pct, jwt_claims, num, timestamp};
use crate::model::{Account, Meter, Report};
use crate::store;
use crate::vault::{self, Login, Source};

const BASE: &str = "https://cursor.com";

/// `%APPDATA%\Cursor\...` on Windows, `~/Library/Application Support/Cursor/...` on macOS.
pub fn local_db_path() -> Option<PathBuf> {
    Some(dirs::config_dir()?.join("Cursor/User/globalStorage/state.vscdb"))
}

/// Cursor's login keys. Read together so one refresh opens the DB once.
const AUTH_KEYS: [&str; 2] = ["cursorAuth/accessToken", "cursorAuth/cachedEmail"];

static AUTH_CACHE: std::sync::Mutex<Option<(std::time::Instant, Vec<Option<String>>)>> =
    std::sync::Mutex::new(None);

/// Reads Cursor's login from its `ItemTable`, in place and read-only. The DB
/// can be many GB, so it is never copied; SQLite lets readers in while Cursor
/// has it open. Cached for a few seconds because the Cursor card, the Grok Bot
/// card and the login check all ask during the same refresh.
fn read_local() -> Result<Vec<Option<String>>> {
    if let Ok(cache) = AUTH_CACHE.lock() {
        if let Some((at, vals)) = cache.as_ref() {
            if at.elapsed() < std::time::Duration::from_secs(20) {
                return Ok(vals.clone());
            }
        }
    }
    let src = local_db_path().context("no config dir")?;
    if !src.exists() {
        bail!("Cursor is not installed for this user");
    }
    let conn = rusqlite::Connection::open_with_flags(
        &src,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    conn.busy_timeout(std::time::Duration::from_secs(3))?;
    let mut stmt = conn.prepare("SELECT value FROM ItemTable WHERE key = ?1")?;
    let mut out = vec![];
    for k in AUTH_KEYS {
        let v: Option<rusqlite::types::Value> = stmt.query_row([k], |r| r.get(0)).ok();
        out.push(match v {
            Some(rusqlite::types::Value::Text(s)) => Some(s),
            Some(rusqlite::types::Value::Blob(b)) => String::from_utf8(b).ok(),
            _ => None,
        });
    }
    if let Ok(mut cache) = AUTH_CACHE.lock() {
        *cache = Some((std::time::Instant::now(), out.clone()));
    }
    Ok(out)
}

/// The account signed in to the Cursor app on this PC, keyed by Cursor user id.
pub fn live_login() -> Option<Login> {
    let vals = read_local().ok()?;
    let token = vals[0].clone()?;
    let claims = jwt_claims(&token)?;
    let sub = claims["sub"].as_str()?;
    Some(Login {
        identity: sub.rsplit('|').next().unwrap_or(sub).to_string(),
        email: vals[1].clone(),
        creds: serde_json::json!({ "token": token, "exp": claims["exp"] }),
    })
}

/// Returns (cookie value, user id, email hint, whether it's the live login).
fn session(acc: &Account) -> Result<(String, String, Option<String>, bool)> {
    let (raw, email, live) = if acc.cursor_auto {
        let current = live_login();
        if current.is_none() && acc.identity.is_none() {
            bail!("Cursor is signed out. Sign in to Cursor, then refresh.");
        }
        let (login, source) = vault::pick("cursor", acc.identity.as_deref(), current)?;
        if source == Source::Saved
            && num(&login.creds["exp"]).is_some_and(|e| (e as i64) < chrono::Utc::now().timestamp())
        {
            bail!("saved Cursor login expired. Sign in to this account in Cursor once");
        }
        let token = login.creds["token"].as_str().context("saved login has no token")?.to_string();
        (token, login.email, source == Source::Live)
    } else {
        let s = store::get_secret(&acc.id)
            .context("paste your WorkosCursorSessionToken cookie in account settings")?;
        (s, None, true)
    };
    let raw = raw.trim().trim_matches('"').to_string();
    let raw = raw
        .strip_prefix("WorkosCursorSessionToken=")
        .unwrap_or(&raw)
        .to_string();

    // Already a full cookie value: "<userId>%3A%3A<jwt>".
    for sep in ["%3A%3A", "::"] {
        if let Some((uid, jwt)) = raw.split_once(sep) {
            return Ok((format!("{uid}%3A%3A{jwt}"), uid.to_string(), email, live));
        }
    }
    // Bare JWT: the user id is the part of `sub` after the "|".
    let claims = jwt_claims(&raw).context("Cursor token is not a valid session token")?;
    let sub = claims["sub"].as_str().context("Cursor token has no user id")?;
    let uid = sub.rsplit('|').next().unwrap_or(sub).to_string();
    Ok((format!("{uid}%3A%3A{raw}"), uid, email, live))
}

async fn get(http: &reqwest::Client, cookie: &str, path: &str) -> Result<Value> {
    let resp = http
        .get(format!("{BASE}{path}"))
        .header("Cookie", format!("WorkosCursorSessionToken={cookie}"))
        .header("Origin", BASE)
        .header("Referer", format!("{BASE}/dashboard"))
        .send()
        .await?;
    check(resp).await
}

async fn post(http: &reqwest::Client, cookie: &str, path: &str) -> Result<Value> {
    let resp = http
        .post(format!("{BASE}{path}"))
        .header("Cookie", format!("WorkosCursorSessionToken={cookie}"))
        .header("Origin", BASE)
        .header("Referer", format!("{BASE}/dashboard"))
        .json(&serde_json::json!({}))
        .send()
        .await?;
    check(resp).await
}

/// Grok Bot's weekly included usage. Billed through Cursor, same login.
pub async fn fetch_grokbot(http: &reqwest::Client, acc: &Account) -> Result<Report> {
    let (cookie, _uid, email, live) = session(acc)?;
    let v = post(http, &cookie, "/api/dashboard/get-sand-usage-status")
        .await
        .map_err(|e| e.context("Grok Bot usage unavailable. Is Grok Bot on this Cursor account?"))?;
    let mut report = Report::new(acc);
    report.identity = email;
    report.signed_in = Some(live);
    report.plan = v["grokPlanLabel"].as_str().or(v["cursorPlanName"].as_str()).map(String::from);
    if v["hasNonZeroIncludedLimit"].as_bool() == Some(false) {
        report.note = Some("This plan has no included Grok Bot usage.".into());
        return Ok(report);
    }
    let pct = num(&v["usagePercent"]).context("Grok Bot returned no usage percent")?;
    report.meters.push(Meter {
        key: "weekly".into(),
        label: "Weekly included".into(),
        used_percent: clamp_pct(pct),
        unit: "percent".into(),
        resets_at: timestamp(&v["nextResetTimestampUtc"]),
        window_secs: Some(604_800),
        ..Default::default()
    });
    if v["hasAvailableUsage"].as_bool() == Some(false) {
        report.note = Some("No Grok Bot usage available right now.".into());
    } else if v["onDemandSettings"]["enabled"].as_bool() == Some(true) {
        report.note = Some("On-demand is on: usage past the weekly limit is billed.".into());
    }
    Ok(report)
}

pub async fn fetch(http: &reqwest::Client, acc: &Account) -> Result<Report> {
    let (cookie, uid, email, live) = session(acc)?;
    let mut report = Report::new(acc);
    report.identity = email;
    report.signed_in = Some(live);

    if let Ok(me) = get(http, &cookie, "/api/auth/me").await {
        if let Some(e) = me["email"].as_str() {
            report.identity = Some(e.into());
        }
    }

    match get(http, &cookie, "/api/usage-summary").await {
        Ok(summary) => parse_summary(&summary, &mut report),
        Err(e) => {
            if e.to_string().contains("401") || e.to_string().contains("403") {
                return Err(e.context("Cursor session expired. Sign in again."));
            }
        }
    }

    if report.meters.is_empty() {
        let legacy = get(http, &cookie, &format!("/api/usage?user={uid}")).await?;
        parse_legacy(&legacy, &mut report);
    }
    if report.meters.is_empty() {
        report.note = Some("Cursor returned no usage limits for this plan.".into());
    }
    Ok(report)
}

fn parse_summary(v: &Value, report: &mut Report) {
    report.plan = v["membershipType"].as_str().map(String::from);
    let resets_at = timestamp(&v["billingCycleEnd"]);
    let usage = &v["individualUsage"];

    // Cursor splits the plan three ways. "Total" is what the dashboard headlines:
    // included dollars plus any bonus. "API" is named-model usage, which only
    // draws on the included dollars. "Auto" is Auto-mode usage.
    let plan = &usage["plan"];
    if plan.is_object() && plan["enabled"].as_bool() != Some(false) {
        let cents = |k: &str| num(&plan["breakdown"][k]).or_else(|| num(&plan[k])).map(|c| c / 100.0);
        let total = cents("total");
        let included = num(&plan["limit"]).map(|c| c / 100.0);
        let meter = |key: &str, label: &str, pct: f64, limit: Option<f64>| Meter {
            key: key.into(),
            label: label.into(),
            used_percent: clamp_pct(pct),
            used: limit.map(|l| l * clamp_pct(pct) / 100.0),
            limit,
            unit: "usd".into(),
            resets_at,
            window_secs: None,
        };
        let total_pct = num(&plan["totalPercentUsed"]).or(match (num(&plan["used"]), num(&plan["limit"])) {
            (Some(u), Some(l)) if l > 0.0 => Some(u / l * 100.0),
            _ => None,
        });
        if let Some(p) = total_pct {
            report.meters.push(meter("plan", "Included total", p, total.or(included)));
        }
        if let Some(p) = num(&plan["autoPercentUsed"]) {
            report.meters.push(Meter { unit: "percent".into(), used: None, limit: None, ..meter("auto", "Auto mode", p, None) });
        }
        if let Some(p) = num(&plan["apiPercentUsed"]) {
            report.meters.push(meter("api", "Named models (API)", p, included));
        }
    }

    let od = &usage["onDemand"];
    if od["enabled"].as_bool() == Some(true) {
        let used = num(&od["used"]).map(|c| c / 100.0).unwrap_or(0.0);
        if let Some(limit) = num(&od["limit"]).map(|c| c / 100.0).filter(|l| *l > 0.0) {
            report.meters.push(Meter {
                key: "ondemand".into(),
                label: "On-demand budget".into(),
                used_percent: clamp_pct(used / limit * 100.0),
                used: Some(used),
                limit: Some(limit),
                unit: "usd".into(),
                resets_at,
                window_secs: None,
            });
        } else if used > 0.0 {
            report.note = Some("On-demand is on with no spending cap.".into());
        }
    }
}

fn parse_legacy(v: &Value, report: &mut Report) {
    let resets_at = timestamp(&v["startOfMonth"]).map(|s| s + 30 * 86_400);
    let Some(obj) = v.as_object() else { return };
    for (model, data) in obj {
        let (Some(used), Some(limit)) = (num(&data["numRequests"]), num(&data["maxRequestUsage"]))
        else {
            continue;
        };
        if limit <= 0.0 {
            continue;
        }
        report.meters.push(Meter {
            key: model.clone(),
            label: format!("{model} requests"),
            used_percent: clamp_pct(used / limit * 100.0),
            used: Some(used),
            limit: Some(limit),
            unit: "requests".into(),
            resets_at,
            window_secs: None,
        });
    }
}
