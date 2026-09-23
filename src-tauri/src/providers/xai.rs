//! xAI / Grok API prepaid credits via the management API.
//! The balance is a ledger in USD cents where top-ups are negative, so the
//! remaining credit is the negated total.

use anyhow::{Context, Result};

use super::{check, clamp_pct, num};
use crate::model::{Account, Meter, Report};
use crate::store;

pub async fn fetch(http: &reqwest::Client, acc: &Account) -> Result<Report> {
    let key = store::get_secret(&acc.id).context("add an xAI management key")?;
    let team = acc
        .team_id
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .context("add your xAI team id")?;

    let body = check(
        http.get(format!(
            "https://management-api.x.ai/v1/billing/teams/{team}/prepaid/balance"
        ))
        .bearer_auth(&key)
        .send()
        .await?,
    )
    .await?;

    let remaining = -num(&body["total"]["val"]).context("xAI returned no balance total")? / 100.0;
    let added: f64 = body["changes"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|c| num(&c["amount"]["val"]))
        .filter(|v| *v < 0.0)
        .map(|v| -v / 100.0)
        .sum();

    let mut report = Report::new(acc);
    report.plan = Some("Prepaid".into());
    let used = (added - remaining).max(0.0);
    report.meters.push(Meter {
        key: "prepaid".into(),
        label: "Prepaid credits".into(),
        used_percent: if added > 0.0 { clamp_pct(used / added * 100.0) } else { 100.0 },
        used: Some(used),
        limit: Some(added),
        unit: "usd".into(),
        resets_at: None,
        window_secs: None,
    });
    report.note = Some("xAI posts spend at cycle close, so this can lag.".into());
    Ok(report)
}
