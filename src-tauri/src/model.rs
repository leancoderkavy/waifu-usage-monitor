use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    /// ChatGPT plan limits shared by ChatGPT and Codex (read from a Codex `auth.json`).
    Codex,
    Cursor,
    /// Grok Bot weekly usage, billed through Cursor.
    Grokbot,
    /// Claude Pro / Max plan limits (read from a Claude Code login).
    Claude,
    /// OpenAI API platform spend (admin key).
    Openai,
    /// xAI / Grok API prepaid credits (management key + team id).
    Xai,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub provider: Provider,
    pub label: String,
    /// Codex: folder that holds `auth.json`. Empty means `$CODEX_HOME` or `~/.codex`.
    #[serde(default)]
    pub codex_home: Option<String>,
    /// Cursor: read the session from the local Cursor install instead of a pasted cookie.
    #[serde(default)]
    pub cursor_auto: bool,
    /// xAI: team id for the management API.
    #[serde(default)]
    pub team_id: Option<String>,
    /// OpenAI API: monthly budget in USD used to compute the percentage.
    #[serde(default)]
    pub monthly_budget: Option<f64>,
    #[serde(default)]
    pub has_secret: bool,
    /// The login this card belongs to (ChatGPT account id, Claude account uuid
    /// or Cursor user id). Empty until the app first sees the login.
    #[serde(default)]
    pub identity: Option<String>,
    /// Meter keys the user hid on this card.
    #[serde(default)]
    pub hidden_meters: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Meter {
    pub key: String,
    pub label: String,
    pub used_percent: f64,
    pub used: Option<f64>,
    pub limit: Option<f64>,
    /// "percent", "usd" or "requests".
    pub unit: String,
    /// Unix seconds.
    pub resets_at: Option<i64>,
    /// Length of the limit window, when known. Lets the calendar skip 5-hour resets.
    pub window_secs: Option<i64>,
}

/// One point-in-time reading of a meter, used to rebuild reset history.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub key: String,
    pub t: i64,
    pub used: f64,
    pub resets_at: Option<i64>,
    pub window_secs: Option<i64>,
    /// A plan change moves reset dates without being a reset.
    pub plan: Option<String>,
}

/// Free rate-limit resets the provider has granted and not yet used.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Bank {
    pub available: u32,
    pub earned: Option<u32>,
    pub credits: Vec<BankCredit>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BankCredit {
    pub granted_at: Option<i64>,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub account_id: String,
    pub provider: Provider,
    pub label: String,
    pub ok: bool,
    pub error: Option<String>,
    pub identity: Option<String>,
    pub plan: Option<String>,
    pub meters: Vec<Meter>,
    pub note: Option<String>,
    pub bank: Option<Bank>,
    /// True when checked with the login the app is signed in to right now,
    /// false when checked with a saved login.
    pub signed_in: Option<bool>,
    pub fetched_at: i64,
}

impl Report {
    pub fn new(acc: &Account) -> Self {
        Report {
            account_id: acc.id.clone(),
            provider: acc.provider,
            label: acc.label.clone(),
            ok: true,
            error: None,
            identity: None,
            plan: None,
            meters: vec![],
            note: None,
            bank: None,
            signed_in: None,
            fetched_at: chrono::Utc::now().timestamp(),
        }
    }

    pub fn failed(acc: &Account, err: anyhow::Error) -> Self {
        let mut r = Report::new(acc);
        r.ok = false;
        r.error = Some(format!("{err:#}"));
        r
    }
}
