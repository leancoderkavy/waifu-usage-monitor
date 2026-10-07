//! Apple Music now-playing and transport controls.
//!
//! Apple has no local API for its Windows app, but it publishes to the system
//! media session (the same one behind the volume flyout), which carries the
//! track, artwork and play state and accepts play/pause/skip. No sign-in or
//! token is needed, and nothing leaves the machine.

use base64::Engine;
use serde::Serialize;

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    /// False when Apple Music has no media session (closed, or never played).
    pub connected: bool,
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Identifies the track; the artwork is only sent when it changes.
    pub key: String,
    /// `data:` URL, present only when `key` differs from the caller's `known`.
    pub artwork: Option<String>,
    pub position_ms: u64,
    pub duration_ms: u64,
    pub can_prev: bool,
    pub can_next: bool,
}

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::{
        Media::Control::{
            GlobalSystemMediaTransportControlsSession as Session,
            GlobalSystemMediaTransportControlsSessionManager as Manager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
        },
        Storage::Streams::DataReader,
        Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
    };

    fn init() {
        // Blocking-pool threads start without COM; already-initialised is fine.
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
    }

    fn is_apple_music(s: &Session) -> bool {
        s.SourceAppUserModelId()
            .map(|id| {
                let id = id.to_string().to_lowercase();
                id.contains("applemusic") || id.contains("apple music") || id.contains("itunes")
            })
            .unwrap_or(false)
    }

    fn find() -> Option<Session> {
        let mgr = Manager::RequestAsync().ok()?.get().ok()?;
        mgr.GetSessions().ok()?.into_iter().find(is_apple_music)
    }

    fn artwork(s: &Session) -> Option<String> {
        let props = s.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
        let stream = props.Thumbnail().ok()?.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().ok()? as u32;
        if size == 0 || size > 8 * 1024 * 1024 {
            return None;
        }
        let mime = stream.ContentType().map(|m| m.to_string()).unwrap_or_default();
        let reader = DataReader::CreateDataReader(&stream).ok()?;
        reader.LoadAsync(size).ok()?.get().ok()?;
        let mut bytes = vec![0u8; size as usize];
        reader.ReadBytes(&mut bytes).ok()?;
        let mime = if mime.is_empty() { "image/jpeg" } else { &mime };
        Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
    }

    pub fn now(known: Option<String>) -> NowPlaying {
        init();
        let Some(s) = find() else { return NowPlaying::default() };
        let Some(props) = s.TryGetMediaPropertiesAsync().ok().and_then(|p| p.get().ok()) else {
            return NowPlaying { connected: true, ..Default::default() };
        };
        let title = props.Title().map(|t| t.to_string()).unwrap_or_default();
        let artist = props.Artist().map(|t| t.to_string()).unwrap_or_default();
        let album = props.AlbumTitle().map(|t| t.to_string()).unwrap_or_default();
        let key = format!("{title}\u{1}{artist}\u{1}{album}");
        let info = s.GetPlaybackInfo().ok();
        let playing = info.as_ref().and_then(|i| i.PlaybackStatus().ok()) == Some(Status::Playing);
        let controls = info.as_ref().and_then(|i| i.Controls().ok());
        let ms = |t: windows::Foundation::TimeSpan| (t.Duration.max(0) / 10_000) as u64;
        let (position_ms, duration_ms) = s
            .GetTimelineProperties()
            .map(|t| {
                let start = t.StartTime().map(ms).unwrap_or(0);
                let end = t.EndTime().map(ms).unwrap_or(0);
                let pos = t.Position().map(ms).unwrap_or(0);
                (pos.saturating_sub(start), end.saturating_sub(start))
            })
            .unwrap_or((0, 0));
        let art = if known.as_deref() == Some(key.as_str()) { None } else { artwork(&s) };
        NowPlaying {
            connected: true,
            playing,
            title,
            artist,
            album,
            key,
            artwork: art,
            position_ms,
            duration_ms,
            can_prev: controls.as_ref().and_then(|c| c.IsPreviousEnabled().ok()).unwrap_or(false),
            can_next: controls.as_ref().and_then(|c| c.IsNextEnabled().ok()).unwrap_or(false),
        }
    }

    pub fn control(action: &str, seek_ms: Option<u64>) -> Result<(), String> {
        init();
        let s = find().ok_or("Apple Music isn't running")?;
        let e = |e: windows::core::Error| e.message();
        match action {
            "toggle" => s.TryTogglePlayPauseAsync().map_err(e)?.get().map_err(e)?,
            "next" => s.TrySkipNextAsync().map_err(e)?.get().map_err(e)?,
            "prev" => s.TrySkipPreviousAsync().map_err(e)?.get().map_err(e)?,
            "seek" => {
                let ms = seek_ms.ok_or("missing position")?;
                s.TryChangePlaybackPositionAsync(ms as i64 * 10_000).map_err(e)?.get().map_err(e)?
            }
            other => return Err(format!("unknown action {other}")),
        };
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn now(_: Option<String>) -> NowPlaying {
        NowPlaying::default()
    }
    pub fn control(_: &str, _: Option<u64>) -> Result<(), String> {
        Err("Apple Music controls are only available on Windows".into())
    }
}

#[tauri::command]
pub async fn media_now(known: Option<String>) -> NowPlaying {
    tokio::task::spawn_blocking(move || imp::now(known)).await.unwrap_or_default()
}

#[tauri::command]
pub async fn media_control(action: String, seek_ms: Option<u64>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || imp::control(&action, seek_ms))
        .await
        .map_err(|e| e.to_string())?
}

/// Starts Apple Music through its `music:` protocol (Store app) when it isn't running.
#[tauri::command]
pub fn open_apple_music(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url("music://", None::<&str>).map_err(|e| e.to_string())
}
