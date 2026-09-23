mod custom;
mod feeds;
mod llm;
mod model;
mod providers;
mod sessions;
mod store;
mod system;
mod tts;
mod vault;

use std::{sync::OnceLock, time::{Duration, Instant}};

use model::{Account, Provider, Report, Sample};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WindowEvent,
};

type CmdResult<T> = Result<T, String>;

struct RecentReports {
    accounts_key: String,
    checked_at: Instant,
    reports: Vec<Report>,
}

static REPORTS: OnceLock<tokio::sync::Mutex<Option<RecentReports>>> = OnceLock::new();

fn err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

#[tauri::command]
async fn list_accounts(app: AppHandle) -> CmdResult<Vec<Account>> {
    tokio::task::spawn_blocking(move || store::load(&app))
        .await
        .map_err(|e| e.to_string())?
        .map_err(err)
}

#[tauri::command]
fn save_account(app: AppHandle, mut account: Account, secret: Option<String>) -> CmdResult<Vec<Account>> {
    let mut all = store::load(&app).map_err(err)?;
    if account.id.is_empty() {
        account.id = uuid::Uuid::new_v4().to_string();
    }
    if let Some(s) = secret.filter(|s| !s.trim().is_empty()) {
        store::set_secret(&account.id, &s).map_err(err)?;
    }
    account.has_secret = store::get_secret(&account.id).is_some();
    match all.iter_mut().find(|a| a.id == account.id) {
        Some(existing) => *existing = account,
        None => all.push(account),
    }
    store::save(&app, &all).map_err(err)?;
    Ok(all)
}

#[tauri::command]
fn delete_account(app: AppHandle, id: String) -> CmdResult<Vec<Account>> {
    let mut all = store::load(&app).map_err(err)?;
    let removed = all.iter().find(|a| a.id == id).cloned();
    all.retain(|a| a.id != id);
    // Keep its key and saved login so the card can be restored.
    if let Some(r) = removed {
        store::park(&app, &r).map_err(err)?;
    }
    store::save(&app, &all).map_err(err)?;
    Ok(all)
}

#[tauri::command]
fn list_removed(app: AppHandle) -> Vec<Account> {
    store::removed(&app)
}

#[tauri::command]
fn restore_account(app: AppHandle, id: String) -> CmdResult<Vec<Account>> {
    store::restore(&app, &id).map_err(err)
}

#[tauri::command]
fn forget_account(app: AppHandle, id: String) -> CmdResult<Vec<Account>> {
    store::purge(&app, &id).map_err(err)?;
    Ok(store::removed(&app))
}

#[derive(serde::Serialize)]
struct SyncResult {
    accounts: Vec<Account>,
    added: Vec<Account>,
}

/// Picks up whoever is signed in to Codex, Claude Code and Cursor right now.
#[tauri::command]
async fn sync_logins(app: AppHandle) -> CmdResult<SyncResult> {
    let (accounts, added) = tokio::task::spawn_blocking(move || store::sync_logins(&app))
        .await
        .map_err(|e| e.to_string())?
        .map_err(err)?;
    Ok(SyncResult { accounts, added })
}

#[tauri::command]
async fn detect_accounts() -> Vec<Account> {
    tokio::task::spawn_blocking(store::detect).await.unwrap_or_default()
}

#[tauri::command]
async fn refresh_all(app: AppHandle) -> CmdResult<Vec<Report>> {
    let accounts = store::load(&app).map_err(err)?;
    let accounts_key = serde_json::to_string(&accounts).map_err(|e| e.to_string())?;
    // Main dashboard and always-on-top island refresh together. Share one
    // provider request across those windows instead of hitting rate limits.
    let mut recent = REPORTS.get_or_init(|| tokio::sync::Mutex::new(None)).lock().await;
    if let Some(cached) = recent.as_ref() {
        if cached.accounts_key == accounts_key && cached.checked_at.elapsed() < Duration::from_secs(10) {
            return Ok(cached.reports.clone());
        }
    }
    let http = providers::client();
    let jobs = accounts.iter().map(|a| providers::fetch(&http, a));
    let reports = futures::future::join_all(jobs).await;
    *recent = Some(RecentReports { accounts_key, checked_at: Instant::now(), reports: reports.clone() });
    Ok(reports)
}

/// Past rate-limit readings for an account, for the reset calendar.
/// Only Codex keeps a local log to rebuild from.
#[tauri::command]
async fn account_history(app: AppHandle, id: String) -> CmdResult<Vec<Sample>> {
    let acc = store::load(&app)
        .map_err(err)?
        .into_iter()
        .find(|a| a.id == id)
        .ok_or("unknown account")?;
    if acc.provider != Provider::Codex {
        return Ok(vec![]);
    }
    tokio::task::spawn_blocking(move || providers::codex::history(&acc))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn llm_line(url: String, model: String, system: String, facts: String) -> CmdResult<String> {
    llm::line(&url, &model, &system, &facts).await.map_err(err)
}

/// Global reset announcements from public trackers plus any X posts the user added.
#[tauri::command]
async fn global_resets(tweets: Vec<String>) -> feeds::FeedResult {
    feeds::fetch_all(&tweets).await
}

/// Checks one X post before it is saved to the watch list.
#[tauri::command]
async fn inspect_post(url: String) -> CmdResult<feeds::Announcement> {
    feeds::tweet(&providers::client(), &url).await.map_err(err)
}

#[tauri::command]
async fn llm_available(url: String, model: String) -> bool {
    llm::available(&url, &model).await
}

/// Codex and Claude Code sessions from the last 24 hours, plus loaded Ollama models.
#[tauri::command]
async fn list_sessions() -> Vec<sessions::Session> {
    sessions::list(providers::codex::default_home(), providers::claude::default_home()).await
}

/// CPU, RAM and GPU load plus the heaviest processes.
#[tauri::command]
async fn system_stats(with_procs: bool) -> Result<system::Stats, String> {
    tokio::task::spawn_blocking(move || system::stats(with_procs)).await.map_err(|e| e.to_string())
}

/// Saves an uploaded avatar, portrait or model. The file arrives as the raw
/// request body; `kind` and `ext` come as headers so large models skip JSON.
#[tauri::command]
fn save_custom_asset(app: AppHandle, request: tauri::ipc::Request) -> Result<(), String> {
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).unwrap_or_default().to_string();
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file as raw bytes".into());
    };
    custom::save(&app, &header("kind"), &header("ext"), bytes).map_err(err)
}

/// The saved file for `kind`, or an empty body when there is none.
#[tauri::command]
fn read_custom_asset(app: AppHandle, kind: String) -> Result<tauri::ipc::Response, String> {
    let bytes = custom::read(&app, &kind).map_err(err)?.unwrap_or_default();
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn clear_custom_asset(app: AppHandle, kind: String) -> Result<(), String> {
    custom::clear(&app, &kind).map_err(err)
}

#[tauri::command]
fn set_tray_tooltip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(text));
    }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("island") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn show_dashboard(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn set_island_expanded(app: AppHandle, expanded: bool) -> Result<(), String> {
    let window = app.get_webview_window("island").ok_or("Island window missing")?;
    let width = 680.0;
    let height = if expanded { 520.0 } else { 54.0 };
    window.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
        let scale = monitor.scale_factor();
        let x = monitor.position().x as f64 / scale + (monitor.size().width as f64 / scale - width) / 2.0;
        let y = monitor.position().y as f64 / scale;
        // macOS: the menu bar covers the top of the screen, so start below it.
        // The work area excludes the menu bar; fall back to a typical height.
        #[cfg(target_os = "macos")]
        let y = {
            let top = monitor.work_area().position.y as f64 / scale;
            if top > y { top } else { y + 38.0 }
        };
        window.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // macOS: live in the menu bar only, no Dock icon, like the Windows tray app.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            set_island_expanded(app.handle().clone(), false).map_err(std::io::Error::other)?;
            let show = MenuItem::with_id(app, "show", "Open", true, None::<&str>)?;
            let refresh = MenuItem::with_id(app, "refresh", "Refresh now", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &refresh, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Waifu Usage Monitor")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => show_main(app),
                    "refresh" => {
                        let _ = app.emit("tray-refresh", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = e
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing hides to the tray so she keeps watching.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_accounts,
            save_account,
            delete_account,
            detect_accounts,
            sync_logins,
            list_removed,
            restore_account,
            forget_account,
            refresh_all,
            account_history,
            llm_line,
            llm_available,
            list_sessions,
            system_stats,
            global_resets,
            inspect_post,
            set_tray_tooltip,
            show_dashboard,
            save_custom_asset,
            read_custom_asset,
            clear_custom_asset,
            set_island_expanded,
            tts::set_elevenlabs_key,
            tts::has_elevenlabs_key,
            tts::elevenlabs_voices,
            tts::elevenlabs_speak
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
