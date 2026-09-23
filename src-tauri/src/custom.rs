//! User-supplied character art: a strip avatar, a 2D portrait and a 3D model.
//! Files are copied into `<app data>/custom/` so the originals can move or be
//! deleted. Each kind keeps one file, named after the kind.

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use tauri::{AppHandle, Manager};

/// Largest file accepted. A detailed GLB is a few tens of MB at most.
const MAX_BYTES: usize = 64 * 1024 * 1024;

fn allowed(kind: &str) -> Result<&'static [&'static str]> {
    Ok(match kind {
        "avatar" | "portrait" => &["png", "jpg", "jpeg", "webp", "gif"],
        // VRM is a GLB with extra metadata, so three.js loads it as one.
        "model" => &["glb", "vrm"],
        _ => bail!("unknown asset kind {kind:?}"),
    })
}

fn dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_data_dir()?.join("custom");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn find(app: &AppHandle, kind: &str) -> Result<Option<PathBuf>> {
    let exts = allowed(kind)?;
    let dir = dir(app)?;
    Ok(exts.iter().map(|e| dir.join(format!("{kind}.{e}"))).find(|p| p.exists()))
}

pub fn save(app: &AppHandle, kind: &str, ext: &str, bytes: &[u8]) -> Result<()> {
    let ext = ext.trim_start_matches('.').to_ascii_lowercase();
    if !allowed(kind)?.contains(&ext.as_str()) {
        bail!("{kind} must be one of: {}", allowed(kind)?.join(", "));
    }
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        bail!("file must be between 1 byte and {} MB", MAX_BYTES / 1024 / 1024);
    }
    clear(app, kind)?;
    std::fs::write(dir(app)?.join(format!("{kind}.{ext}")), bytes).context("could not save the file")?;
    Ok(())
}

pub fn read(app: &AppHandle, kind: &str) -> Result<Option<Vec<u8>>> {
    match find(app, kind)? {
        Some(p) => Ok(Some(std::fs::read(p)?)),
        None => Ok(None),
    }
}

pub fn clear(app: &AppHandle, kind: &str) -> Result<()> {
    while let Some(p) = find(app, kind)? {
        std::fs::remove_file(p)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::allowed;

    #[test]
    fn only_known_kinds_and_formats() {
        assert!(allowed("model").unwrap().contains(&"glb"));
        assert!(allowed("avatar").unwrap().contains(&"png"));
        assert!(!allowed("avatar").unwrap().contains(&"glb"));
        assert!(allowed("../etc").is_err());
    }
}
