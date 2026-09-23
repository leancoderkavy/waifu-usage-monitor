//! Optional ElevenLabs text-to-speech. The API key lives in Windows
//! Credential Manager (same keyring service as account secrets) and is never
//! logged or returned to the frontend.

use std::{sync::OnceLock, time::Duration};

use serde::Serialize;
use serde_json::{json, Value};

use crate::store;

const KEY_ID: &str = "elevenlabs";
const API: &str = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL: &str = "eleven_flash_v2_5";

#[derive(Serialize)]
pub struct Voice {
    voice_id: String,
    name: String,
}

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("WaifuUsageMonitor/0.1")
            .build()
            .expect("http client")
    })
}

fn key() -> Result<String, String> {
    store::get_secret(KEY_ID).ok_or_else(|| "No ElevenLabs API key saved".to_string())
}

/// Turns a failed ElevenLabs response into "ElevenLabs 401: short message".
async fn fail(resp: reqwest::Response) -> String {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    let msg = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| {
            let d = v.get("detail")?;
            d.get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| d.as_str().map(str::to_string))
        })
        .unwrap_or(body);
    let short: String = msg.chars().take(160).collect();
    format!("ElevenLabs {}: {}", status.as_u16(), short.trim())
}

#[tauri::command]
pub fn set_elevenlabs_key(key: Option<String>) -> Result<(), String> {
    match key.map(|k| k.trim().to_string()).filter(|k| !k.is_empty()) {
        Some(k) => store::set_secret(KEY_ID, &k).map_err(|e| format!("{e:#}")),
        None => {
            store::delete_secret(KEY_ID);
            Ok(())
        }
    }
}

#[tauri::command]
pub fn has_elevenlabs_key() -> bool {
    store::get_secret(KEY_ID).is_some()
}

#[tauri::command]
pub async fn elevenlabs_voices() -> Result<Vec<Voice>, String> {
    let resp = http()
        .get(format!("{API}/voices"))
        .header("xi-api-key", key()?)
        .send()
        .await
        .map_err(|e| format!("ElevenLabs request failed: {}", e.without_url()))?;
    if !resp.status().is_success() {
        return Err(fail(resp).await);
    }
    let v: Value = resp
        .json()
        .await
        .map_err(|e| format!("ElevenLabs bad response: {e}"))?;
    let voices = v
        .get("voices")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|x| {
                    Some(Voice {
                        voice_id: x.get("voice_id")?.as_str()?.to_string(),
                        name: x.get("name")?.as_str()?.to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(voices)
}

#[tauri::command]
pub async fn elevenlabs_speak(
    text: String,
    voice_id: String,
    model_id: Option<String>,
) -> Result<tauri::ipc::Response, String> {
    let voice_id = voice_id.trim();
    if voice_id.is_empty() || !voice_id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Invalid ElevenLabs voice id".into());
    }
    let model = model_id
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let resp = http()
        .post(format!(
            "{API}/text-to-speech/{voice_id}?output_format=mp3_44100_128"
        ))
        .header("xi-api-key", key()?)
        .header("accept", "audio/mpeg")
        .json(&json!({ "text": text, "model_id": model }))
        .send()
        .await
        .map_err(|e| format!("ElevenLabs request failed: {}", e.without_url()))?;
    if !resp.status().is_success() {
        return Err(fail(resp).await);
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("ElevenLabs audio download failed: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes.to_vec()))
}
