//! OpenAI API platform spend for the current month, via an admin key.

use anyhow::{Context, Result};
use chrono::{Datelike, TimeZone, Utc};

use super::{check, clamp_pct, num};
use crate::model::{Account, Meter, Report};
use crate::store;

pub async fn fetch(http: &reqwest::Client, acc: &Account) -> Result<Report> {
    let key = store::get_secret(&acc.id).context("add an OpenAI admin key (sk-admin-…)")?;
    let now = Utc::now();
    let start = Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .unwrap();
    let next = if now.month() == 12 {
        Utc.with_ymd_and_hms(now.year() + 1, 1, 1, 0, 0, 0)
    } else {
        Utc.with_ymd_and_hms(now.year(), now.month() + 1, 1, 0, 0, 0)
    }
    .unwrap();

    let mut spent = 0.0;
    let mut page: Option<String> = None;
    for _ in 0..10 {
        let mut req = http
            .get("https://api.openai.com/v1/organization/costs")
            .bearer_auth(&key)
            .query(&[
                ("start_time", start.timestamp().to_string()),
                ("bucket_width", "1d".into()),
                ("limit", "31".into()),
            ]);
        if let Some(p) = &page {
            req = req.query(&[("page", p)]);
        }
        let body = check(req.send().await?).await?;
        for bucket in body["data"].as_array().into_iter().flatten() {
            for r in bucket["results"].as_array().into_iter().flatten() {
                spent += num(&r["amount"]["value"]).unwrap_or(0.0);
            }
        }
        page = body["next_page"].as_str().map(String::from);
        if body["has_more"].as_bool() != Some(true) || page.is_none() {
            break;
        }
    }

    let mut report = Report::new(acc);
    report.plan = Some("API".into());
    let budget = acc.monthly_budget.filter(|b| *b > 0.0);
    report.meters.push(Meter {
        key: "month".into(),
        label: "Spend this month".into(),
        used_percent: budget.map(|b| clamp_pct(spent / b * 100.0)).unwrap_or(0.0),
        used: Some(spent),
        limit: budget,
        unit: "usd".into(),
        resets_at: Some(next.timestamp()),
        window_secs: None,
    });
    if budget.is_none() {
        report.note = Some("Set a monthly budget to see a percentage.".into());
    }
    Ok(report)
}
