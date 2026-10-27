//! A transparent native overlay; all input goes to the desktop underneath.
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub fn enabled(app: &AppHandle) -> bool {
    app.path().app_config_dir().ok()
        .and_then(|p| std::fs::read_to_string(p.join("desktop-agents.json")).ok())
        .and_then(|s| serde_json::from_str::<bool>(&s).ok()).unwrap_or(true)
}

pub fn apply(app: &AppHandle, enabled: bool) -> Result<(), String> {
    if !enabled {
        if let Some(w) = app.get_webview_window("desktop-agents") {
            w.destroy().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    if app.get_webview_window("desktop-agents").is_some() { return Ok(()); }
    let monitor = app.get_webview_window("island")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten()).ok_or("No desktop monitor available")?;
    let area = monitor.work_area();
    let window = WebviewWindowBuilder::new(app, "desktop-agents", WebviewUrl::App("index.html".into()))
        .title("Agent companions").transparent(true).decorations(false).shadow(false)
        .always_on_top(true).skip_taskbar(true).focused(false).focusable(false)
        .resizable(false).visible(false).build().map_err(|e| e.to_string())?;
    // Configure input passthrough BEFORE showing; never leave an input-blocking overlay.
    let configure = || -> tauri::Result<()> {
        window.set_ignore_cursor_events(true)?;
        window.set_position(PhysicalPosition::new(area.position.x, area.position.y))?;
        window.set_size(PhysicalSize::new(area.size.width, area.size.height))?;
        window.show()?;
        Ok(())
    };
    if let Err(e) = configure() { let _ = window.destroy(); return Err(e.to_string()); }
    Ok(())
}

#[tauri::command]
pub fn desktop_agents_enabled(app: AppHandle) -> bool {
    app.get_webview_window("desktop-agents").is_some()
}

#[tauri::command]
pub async fn set_desktop_agents(app: AppHandle, enabled: bool) -> Result<(), String> {
    apply(&app, enabled)?;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("desktop-agents.json"), enabled.to_string()).map_err(|e| e.to_string())
}
