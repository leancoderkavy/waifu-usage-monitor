//! Global reset announcements from public feeds. Providers announce resets on X,
//! which has no free API, so this reads trackers that mirror those posts plus
//! individual X posts the user adds (via X's public tweet lookup).

use anyhow::{bail, Context, Result};
use serde::Serialize;
use serde_json::Value;

use crate::model::Provider;
use crate::providers::{check, timestamp};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Announcement {
    pub id: String,
    pub provider: Provider,
    pub at: i64,
    /// "standard" (limits reset now) or "banked" (a saved reset to use later).
    pub reset_type: String,
    /// "confirmed" or "upcoming".
    pub status: String,
    pub text: String,
    pub url: String,
    pub source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedResult {
    pub announcements: Vec<Announcement>,
    pub errors: Vec<String>,
}

/// Official accounts whose posts count as announcements.
fn provider_for_author(handle: &str) -> Option<Provider> {
    match handle.to_ascii_lowercase().as_str() {
        "thsottiaux" | "openaidevs" | "openai" | "codex" => Some(Provider::Codex),
        "claudeai" | "anthropicai" => Some(Provider::Claude),
        "cursor_ai" => Some(Provider::Cursor),
        "xai" | "grok" => Some(Provider::Xai),
        _ => None,
    }
}

fn provider_for_slug(slug: &str) -> Option<Provider> {
    match slug {
        "codex" | "chatgpt" | "openai" => Some(Provider::Codex),
        "claude" | "anthropic" => Some(Provider::Claude),
        "cursor" => Some(Provider::Cursor),
        "grok" | "xai" => Some(Provider::Xai),
        _ => None,
    }
}

fn is_banked(text: &str) -> bool {
    let t = text.to_lowercase();
    ["banked", "bank ", "save and use", "whenever you choose", "use it any", "use anytime"]
        .iter()
        .any(|k| t.contains(k))
}

/// A post is a global reset announcement when it talks about a reset and about
/// everyone or a whole plan, and isn't a question or complaint.
pub fn looks_like_global_reset(text: &str) -> bool {
    let t = text.to_lowercase();
    let reset = ["reset", "resetting"].iter().any(|k| t.contains(k));
    let audience = [
        "all ", "every", "everyone", "subscri", "plus", "pro", "max", "team", "business", "plans", "propagated",
    ]
    .iter()
    .any(|k| t.contains(k));
    let noise = ["didn't get", "when does", "how to", "bug"].iter().any(|k| t.contains(k))
        || t.trim_end().ends_with('?');
    reset && audience && !noise
}

async fn get_json(http: &reqwest::Client, url: &str) -> Result<Value> {
    check(http.get(url).header("User-Agent", "Mozilla/5.0 KosmosUsageMonitor/0.1").send().await?).await
}

/// codexresets.com mirrors every Codex reset post by the Codex lead.
async fn codex_resets(http: &reqwest::Client) -> Result<Vec<Announcement>> {
    let body = get_json(http, "https://codexresets.com/api/resets").await?;
    let events = body["events"].as_array().context("codexresets: no events")?;
    Ok(events
        .iter()
        .filter_map(|e| {
            let status = e["event_status"].as_str().unwrap_or("");
            let confirmed = status == "confirmed" || status.ends_with("completed");
            Some(Announcement {
                id: format!("codexresets:{}", e["event_id"].as_str()?),
                provider: Provider::Codex,
                at: timestamp(&e["completed_at"]).or_else(|| timestamp(&e["announced_at"]))?,
                reset_type: e["reset_type"].as_str().unwrap_or("standard").into(),
                status: if confirmed { "confirmed" } else { "upcoming" }.into(),
                text: e["text"].as_str().unwrap_or("").into(),
                url: e["tweet_url"].as_str().unwrap_or("").into(),
                source: "codexresets.com".into(),
            })
        })
        .collect())
}

/// GitHub releases of inmve/token-resets, tagged `<provider>-<date>-<status>`.
async fn token_resets(http: &reqwest::Client) -> Result<Vec<Announcement>> {
    let body = get_json(http, "https://api.github.com/repos/inmve/token-resets/releases?per_page=30").await?;
    let releases = body.as_array().context("token-resets: not a list")?;
    Ok(releases
        .iter()
        .filter_map(|r| {
            let tag = r["tag_name"].as_str()?;
            let provider = provider_for_slug(tag.split('-').next()?)?;
            let text = format!("{} {}", r["name"].as_str().unwrap_or(""), r["body"].as_str().unwrap_or(""));
            let confirmed = tag.ends_with("confirmed") || tag.ends_with("completed");
            Some(Announcement {
                id: format!("token-resets:{tag}"),
                provider,
                at: timestamp(&r["published_at"])?,
                reset_type: if is_banked(&text) { "banked" } else { "standard" }.into(),
                status: if confirmed { "confirmed" } else { "upcoming" }.into(),
                text: r["name"].as_str().unwrap_or(tag).into(),
                url: r["html_url"].as_str().unwrap_or("").into(),
                source: "token-resets".into(),
            })
        })
        .collect())
}

pub fn tweet_id(input: &str) -> Option<String> {
    let s = input.trim();
    if !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()) {
        return Some(s.into());
    }
    let after = s.split("/status/").nth(1)?;
    let id: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
    (!id.is_empty()).then_some(id)
}

/// Reads one X post through the public embed endpoint and checks it is an
/// official reset announcement.
pub async fn tweet(http: &reqwest::Client, input: &str) -> Result<Announcement> {
    let id = tweet_id(input).context("not an x.com post link")?;
    let t = get_json(http, &format!("https://cdn.syndication.twimg.com/tweet-result?id={id}&token=a")).await?;
    let handle = t["user"]["screen_name"].as_str().context("X returned no post (deleted or private?)")?;
    let text = t["text"].as_str().unwrap_or("").to_string();
    let Some(provider) = provider_for_author(handle) else {
        bail!("@{handle} is not an official Codex, Claude, Cursor or xAI account");
    };
    if !looks_like_global_reset(&text) {
        bail!("@{handle}'s post doesn't read like a reset announcement");
    }
    Ok(Announcement {
        id: format!("x:{id}"),
        provider,
        at: timestamp(&t["created_at"]).context("post has no date")?,
        reset_type: if is_banked(&text) { "banked" } else { "standard" }.into(),
        status: "confirmed".into(),
        text,
        url: format!("https://x.com/{handle}/status/{id}"),
        source: "x.com".into(),
    })
}

pub async fn fetch_all(tweets: &[String]) -> FeedResult {
    let http = crate::providers::client();
    let mut announcements = vec![];
    let mut errors = vec![];
    let (a, b) = tokio::join!(codex_resets(&http), token_resets(&http));
    for (name, res) in [("codexresets.com", a), ("token-resets", b)] {
        match res {
            Ok(list) => announcements.extend(list),
            Err(e) => errors.push(format!("{name}: {e:#}")),
        }
    }
    for t in tweets {
        match tweet(&http, t).await {
            Ok(a) => announcements.push(a),
            Err(e) => errors.push(format!("x.com {t}: {e:#}")),
        }
    }
    announcements.sort_by_key(|a| std::cmp::Reverse(a.at));
    FeedResult { announcements, errors }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_posts() {
        assert!(looks_like_global_reset(
            "We're also providing subscription users a rate limit reset, which you can save and use whenever you choose."
        ));
        assert!(!looks_like_global_reset("when does the pro reset happen?"));
        assert_eq!(tweet_id("https://x.com/claudeai/status/2102435538120691886?s=20").as_deref(), Some("2102435538120691886"));
    }

    /// Hits the live feeds. Run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn live_feeds_have_todays_resets() {
        let r = fetch_all(&["https://x.com/claudeai/status/2102435538120691886".into()]).await;
        for e in &r.errors {
            eprintln!("feed error: {e}");
        }
        for a in r.announcements.iter().take(4) {
            eprintln!("{} {:?} {} {} {}", a.at, a.provider, a.reset_type, a.status, a.source);
        }
        let claude = r.announcements.iter().find(|a| a.id == "x:2102435538120691886").expect("claude post");
        assert_eq!(claude.provider, Provider::Claude);
        assert_eq!(claude.reset_type, "banked");
        assert!(r.announcements.iter().any(|a| a.provider == Provider::Codex && a.at >= 1_790_100_000 && a.status == "confirmed"));
    }
}
