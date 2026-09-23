use std::path::PathBuf;

use anyhow::{Context, Result};
use tauri::{AppHandle, Manager};

use crate::model::{Account, Provider};
use crate::providers::{claude, codex, cursor};
use crate::vault::{self, Login};

const KEYRING_SERVICE: &str = "waifu-usage-monitor";

fn accounts_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_config_dir()?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("accounts.json"))
}

pub fn load(app: &AppHandle) -> Result<Vec<Account>> {
    let path = accounts_path(app)?;
    if !path.exists() {
        // First launch: add whatever can be found on this machine.
        let found = detect();
        save(app, &found)?;
        let kinds: Vec<Provider> = found.iter().map(|a| a.provider).collect();
        std::fs::write(
            app.path().app_config_dir()?.join("offered.json"),
            serde_json::to_string(&kinds)?,
        )?;
        return Ok(found);
    }
    let text = std::fs::read_to_string(&path)?;
    let mut accounts: Vec<Account> =
        serde_json::from_str(&text).context("accounts.json is not valid")?;
    if offer_new_providers(app, &mut accounts)? {
        save(app, &accounts)?;
    }
    for acc in &mut accounts {
        acc.has_secret = get_secret(&acc.id).is_some();
    }
    Ok(accounts)
}

pub fn save(app: &AppHandle, accounts: &[Account]) -> Result<()> {
    let path = accounts_path(app)?;
    std::fs::write(path, serde_json::to_string_pretty(accounts)?)?;
    Ok(())
}

/// Adds a detected account once for each provider kind this machine has never
/// been offered, so providers added in later versions show up on their own,
/// while accounts the user removed stay removed.
fn offer_new_providers(app: &AppHandle, accounts: &mut Vec<Account>) -> Result<bool> {
    let path = app.path().app_config_dir()?.join("offered.json");
    let mut offered: Vec<Provider> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| accounts.iter().map(|a| a.provider).collect());
    let mut changed = false;
    for acc in detect() {
        if offered.contains(&acc.provider) {
            continue;
        }
        offered.push(acc.provider);
        if !accounts.iter().any(|a| a.provider == acc.provider) {
            accounts.push(acc);
            changed = true;
        }
    }
    std::fs::write(&path, serde_json::to_string(&offered)?)?;
    Ok(changed)
}

/// Accounts that exist on this machine without any setup.
pub fn detect() -> Vec<Account> {
    let mut out = vec![];
    if codex::default_home().join("auth.json").exists() {
        out.push(Account {
            id: uuid::Uuid::new_v4().to_string(),
            provider: Provider::Codex,
            label: "ChatGPT / Codex".into(),
            codex_home: None,
            cursor_auto: false,
            team_id: None,
            monthly_budget: None,
            has_secret: false,
            identity: None,
            hidden_meters: vec![],
        });
    }
    if claude::has_credentials(&claude::default_home()) {
        out.push(Account {
            id: uuid::Uuid::new_v4().to_string(),
            provider: Provider::Claude,
            label: "Claude".into(),
            codex_home: None,
            cursor_auto: false,
            team_id: None,
            monthly_budget: None,
            has_secret: false,
            identity: None,
            hidden_meters: vec![],
        });
    }
    if cursor::local_db_path().is_some_and(|p| p.exists()) {
        out.push(Account {
            id: uuid::Uuid::new_v4().to_string(),
            provider: Provider::Cursor,
            label: "Cursor".into(),
            codex_home: None,
            cursor_auto: true,
            team_id: None,
            monthly_budget: None,
            has_secret: false,
            identity: None,
            hidden_meters: vec![],
        });
        out.push(Account {
            id: uuid::Uuid::new_v4().to_string(),
            provider: Provider::Grokbot,
            label: "Grok Bot".into(),
            codex_home: None,
            cursor_auto: true,
            team_id: None,
            monthly_budget: None,
            has_secret: false,
            identity: None,
            hidden_meters: vec![],
        });
    }
    out
}

fn provider_name(p: Provider) -> &'static str {
    match p {
        Provider::Codex => "ChatGPT / Codex",
        Provider::Claude => "Claude",
        Provider::Cursor => "Cursor",
        Provider::Grokbot => "Grok Bot",
        Provider::Openai => "OpenAI API",
        Provider::Xai => "Grok / xAI",
    }
}

/// Vault namespace. Grok Bot rides on the Cursor login.
fn vault_slug(p: Provider) -> &'static str {
    match p {
        Provider::Codex => "codex",
        Provider::Claude => "claude",
        _ => "cursor",
    }
}

fn norm_home(h: &Option<String>) -> Option<String> {
    h.as_deref().map(str::trim).filter(|h| !h.is_empty()).map(String::from)
}

fn ignored_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("ignored.json"))
}

fn ignored(app: &AppHandle) -> Vec<String> {
    ignored_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn removed_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("removed.json"))
}

pub fn removed(app: &AppHandle) -> Vec<Account> {
    removed_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_removed(app: &AppHandle, list: &[Account]) -> Result<()> {
    std::fs::write(removed_path(app)?, serde_json::to_string_pretty(list)?)?;
    Ok(())
}

fn tag(a: &Account) -> Option<String> {
    a.identity.as_ref().map(|id| format!("{:?}:{id}", a.provider))
}

fn set_ignored(app: &AppHandle, tag: &str, on: bool) -> Result<()> {
    let mut list = ignored(app);
    list.retain(|t| t != tag);
    if on {
        list.push(tag.to_string());
    }
    std::fs::write(ignored_path(app)?, serde_json::to_string(&list)?)?;
    Ok(())
}

/// Parks a removed card so it can be restored, and stops the login from being
/// added back on the next sign-in. Its saved login stays in the vault until
/// the user forgets it for good.
pub fn park(app: &AppHandle, removed_acc: &Account) -> Result<()> {
    if let Some(t) = tag(removed_acc) {
        set_ignored(app, &t, true)?;
    }
    let mut list = removed(app);
    list.retain(|a| a.id != removed_acc.id && (tag(a).is_none() || tag(a) != tag(removed_acc)));
    list.push(removed_acc.clone());
    save_removed(app, &list)
}

/// Puts a removed card back.
pub fn restore(app: &AppHandle, id: &str) -> Result<Vec<Account>> {
    let mut list = removed(app);
    let pos = list.iter().position(|a| a.id == id).context("not in the removed list")?;
    let mut acc = list.remove(pos);
    save_removed(app, &list)?;
    if let Some(t) = tag(&acc) {
        set_ignored(app, &t, false)?;
    }
    let mut accounts = load(app)?;
    acc.has_secret = get_secret(&acc.id).is_some();
    accounts.push(acc);
    save(app, &accounts)?;
    Ok(accounts)
}

/// Drops a removed card for good, including its saved login. It still won't
/// be auto-added again; signing in with it and adding it by hand works.
pub fn purge(app: &AppHandle, id: &str) -> Result<()> {
    let mut list = removed(app);
    let Some(pos) = list.iter().position(|a| a.id == id) else { return Ok(()) };
    let acc = list.remove(pos);
    save_removed(app, &list)?;
    delete_secret(&acc.id);
    if let Some(identity) = &acc.identity {
        let still_used = load(app)?
            .iter()
            .any(|a| a.identity.as_deref() == Some(identity) && vault_slug(a.provider) == vault_slug(acc.provider));
        if !still_used {
            vault::remove(&vault::key(vault_slug(acc.provider), identity));
        }
    }
    Ok(())
}

/// Looks at who is signed in to Codex, Claude Code and Cursor right now. Saves
/// each login to the vault, ties cards to logins, and adds a card for any email
/// the app hasn't seen. Returns every account plus the ones just added.
pub fn sync_logins(app: &AppHandle) -> Result<(Vec<Account>, Vec<Account>)> {
    let mut accounts = load(app)?;
    let skip = ignored(app);

    let mut logins: Vec<(Provider, Option<String>, Login)> = vec![];
    let mut codex_homes: Vec<Option<String>> = vec![None];
    let mut claude_homes: Vec<Option<String>> = vec![None];
    for a in &accounts {
        let h = norm_home(&a.codex_home);
        let list = match a.provider {
            Provider::Codex => &mut codex_homes,
            Provider::Claude => &mut claude_homes,
            _ => continue,
        };
        if !list.contains(&h) {
            list.push(h);
        }
    }
    for h in codex_homes {
        let path = h.as_ref().map(PathBuf::from).unwrap_or_else(codex::default_home);
        if let Some(l) = codex::live_login(&path) {
            logins.push((Provider::Codex, h, l));
        }
    }
    for h in claude_homes {
        let path = h.as_ref().map(PathBuf::from).unwrap_or_else(claude::default_home);
        if let Some(l) = claude::live_login(&path) {
            logins.push((Provider::Claude, h, l));
        }
    }
    if let Some(l) = cursor::live_login() {
        logins.push((Provider::Cursor, None, l.clone()));
        logins.push((Provider::Grokbot, None, l));
    }

    let mut added = vec![];
    let mut changed = false;
    for (p, home, login) in logins {
        vault::put(&vault::key(vault_slug(p), &login.identity), &login)?;
        let same_source = |a: &Account| {
            a.provider == p
                && norm_home(&a.codex_home) == home
                && (!matches!(p, Provider::Cursor | Provider::Grokbot) || a.cursor_auto)
        };
        if accounts.iter().any(|a| same_source(a) && a.identity.as_deref() == Some(login.identity.as_str())) {
            continue;
        }
        // The card shows the email under the name, so the name stays short.
        let label = provider_name(p).to_string();
        if let Some(a) = accounts.iter_mut().find(|a| same_source(a) && a.identity.is_none()) {
            // First sight of the login behind an existing card.
            a.identity = Some(login.identity.clone());
            changed = true;
            continue;
        }
        // Only grow providers the user still has cards for, and never re-add a removed one.
        let tag = format!("{p:?}:{}", login.identity);
        if !accounts.iter().any(|a| a.provider == p) || skip.contains(&tag) {
            continue;
        }
        let acc = Account {
            id: uuid::Uuid::new_v4().to_string(),
            provider: p,
            label,
            codex_home: home,
            cursor_auto: true,
            team_id: None,
            monthly_budget: None,
            has_secret: false,
            identity: Some(login.identity.clone()),
            hidden_meters: vec![],
        };
        added.push(acc.clone());
        accounts.push(acc);
        changed = true;
    }
    if changed {
        save(app, &accounts)?;
    }
    Ok((accounts, added))
}

fn entry(id: &str) -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, id).ok()
}

pub fn get_secret(id: &str) -> Option<String> {
    entry(id)?.get_password().ok().filter(|s| !s.is_empty())
}

pub fn set_secret(id: &str, secret: &str) -> Result<()> {
    let e = entry(id).context("the system credential store (Windows Credential Manager / macOS Keychain) is unavailable")?;
    e.set_password(secret.trim())?;
    Ok(())
}

pub fn delete_secret(id: &str) {
    if let Some(e) = entry(id) {
        let _ = e.delete_credential();
    }
}
