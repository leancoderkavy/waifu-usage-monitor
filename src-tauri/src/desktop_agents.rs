//! Transparent native overlays along the screen edges; all input goes to the desktop underneath.
//!
//! The companions only walk the border, so instead of one full-screen window (which a
//! transparent WebView repaints in full every frame) there is one thin strip per edge.
//! A strip with nobody on its edge has nothing to repaint.
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

/// Strip thickness in logical pixels; must match `STRIP` in src/desktop-agents.ts.
const STRIP: f64 = 200.0;
const EDGES: [&str; 4] = ["bottom", "right", "top", "left"];

fn label(edge: &str) -> String {
    format!("desktop-agents-{edge}")
}

pub fn enabled(app: &AppHandle) -> bool {
    app.path().app_config_dir().ok()
        .and_then(|p| std::fs::read_to_string(p.join("desktop-agents.json")).ok())
        .and_then(|s| serde_json::from_str::<bool>(&s).ok()).unwrap_or(true)
}

pub fn is_open(app: &AppHandle) -> bool {
    EDGES.iter().any(|edge| app.get_webview_window(&label(edge)).is_some())
}

fn close_all(app: &AppHandle) -> Result<(), String> {
    for edge in EDGES {
        if let Some(w) = app.get_webview_window(&label(edge)) {
            w.destroy().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn apply(app: &AppHandle, enabled: bool) -> Result<(), String> {
    if !enabled {
        return close_all(app);
    }
    if is_open(app) { return Ok(()); }
    let monitor = app.get_webview_window("island")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten()).ok_or("No desktop monitor available")?;
    let area = monitor.work_area();
    let (x, y) = (area.position.x, area.position.y);
    let (w, h) = (area.size.width, area.size.height);
    let t = ((STRIP * monitor.scale_factor()).round() as u32).min(w / 2).min(h / 2);
    for edge in EDGES {
        let (px, py, sw, sh) = match edge {
            "bottom" => (x, y + (h - t) as i32, w, t),
            "right" => (x + (w - t) as i32, y, t, h),
            "top" => (x, y, w, t),
            _ => (x, y, t, h),
        };
        let window = WebviewWindowBuilder::new(app, label(edge), WebviewUrl::App("index.html".into()))
            .title("Agent companions").transparent(true).decorations(false).shadow(false)
            .always_on_top(true).skip_taskbar(true).focused(false).focusable(false)
            .resizable(false).visible(false).build().map_err(|e| e.to_string())?;
        // Configure input passthrough BEFORE showing; never leave an input-blocking overlay.
        let configure = || -> tauri::Result<()> {
            window.set_ignore_cursor_events(true)?;
            window.set_position(PhysicalPosition::new(px, py))?;
            window.set_size(PhysicalSize::new(sw, sh))?;
            window.show()?;
            Ok(())
        };
        if let Err(e) = configure() {
            let _ = close_all(app);
            return Err(e.to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_agents_enabled(app: AppHandle) -> bool {
    is_open(&app)
}

#[tauri::command]
pub async fn set_desktop_agents(app: AppHandle, enabled: bool) -> Result<(), String> {
    apply(&app, enabled)?;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("desktop-agents.json"), enabled.to_string()).map_err(|e| e.to_string())
}
