//! Saved logins for accounts that aren't signed in right now.
//!
//! Codex, Claude Code and Cursor each remember one account at a time. Every time
//! the app sees a login it keeps a copy here, so after you switch to another
//! email it can keep checking the previous one. On Windows the file is
//! encrypted with DPAPI, so only your Windows user can read it. On macOS the
//! whole vault lives in the login Keychain instead of a file.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One saved login. `creds` is whatever the provider needs to call its API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Login {
    pub identity: String,
    pub email: Option<String>,
    pub creds: Value,
}

/// Where the credentials used for a check came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// The account the tool is signed in to right now.
    Live,
    /// A saved copy from an earlier sign-in.
    Saved,
}

static LOCK: Mutex<()> = Mutex::new(());

#[cfg_attr(target_os = "macos", allow(dead_code))]
fn path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_default()
        .join("com.waifu.usagemonitor")
        .join("vault.bin")
}

pub fn key(provider: &str, identity: &str) -> String {
    format!("{provider}:{identity}")
}

fn read_all() -> HashMap<String, Login> {
    backend::load()
        .and_then(|plain| serde_json::from_slice(&plain).ok())
        .unwrap_or_default()
}

fn write_all(map: &HashMap<String, Login>) -> Result<()> {
    backend::save(&serde_json::to_vec(map)?)
}

pub fn get(key: &str) -> Option<Login> {
    let _g = LOCK.lock().ok()?;
    read_all().remove(key)
}

pub fn put(key: &str, login: &Login) -> Result<()> {
    let _g = LOCK.lock().map_err(|_| anyhow::anyhow!("vault lock poisoned"))?;
    let mut map = read_all();
    map.insert(key.to_string(), login.clone());
    write_all(&map)
}

pub fn remove(key: &str) {
    if let Ok(_g) = LOCK.lock() {
        let mut map = read_all();
        if map.remove(key).is_some() {
            let _ = write_all(&map);
        }
    }
}

/// Picks the credentials for an account bound to `identity`: the live login if
/// that account is the one signed in now (and refreshes the saved copy), else
/// the saved copy. Unbound accounts just use whatever is signed in.
pub fn pick(provider: &str, identity: Option<&str>, live: Option<Login>) -> Result<(Login, Source)> {
    match (identity, live) {
        (Some(id), Some(l)) if l.identity == id => {
            put(&key(provider, id), &l)?;
            Ok((l, Source::Live))
        }
        (None, Some(l)) => Ok((l, Source::Live)),
        (Some(id), _) => get(&key(provider, id))
            .map(|l| (l, Source::Saved))
            .context("no saved login for this account. Sign in to it once in its app, then refresh"),
        (None, None) => anyhow::bail!("not signed in"),
    }
}

/// Windows: `vault.bin` in the config folder, sealed with DPAPI.
#[cfg(windows)]
mod backend {
    use anyhow::{Context, Result};

    pub fn load() -> Option<Vec<u8>> {
        let bytes = std::fs::read(super::path()).ok()?;
        super::dpapi::unprotect(&bytes).ok()
    }

    pub fn save(plain: &[u8]) -> Result<()> {
        let p = super::path();
        std::fs::create_dir_all(p.parent().context("vault path")?)?;
        std::fs::write(p, super::dpapi::protect(plain)?)?;
        Ok(())
    }
}

/// macOS: one generic-password item in the login Keychain. Only this app (and
/// the user, through Keychain Access) can read it.
#[cfg(target_os = "macos")]
mod backend {
    use anyhow::{Context, Result};

    const SERVICE: &str = "waifu-usage-monitor";
    // Tests use their own item so they never touch a real vault.
    const ACCOUNT: &str = if cfg!(test) { "saved-logins-vault-test" } else { "saved-logins-vault" };

    fn entry() -> Option<keyring::Entry> {
        keyring::Entry::new(SERVICE, ACCOUNT).ok()
    }

    pub fn load() -> Option<Vec<u8>> {
        entry()?.get_secret().ok()
    }

    pub fn save(plain: &[u8]) -> Result<()> {
        entry().context("macOS Keychain is unavailable")?.set_secret(plain)?;
        Ok(())
    }

    #[cfg(test)]
    pub fn clear() {
        if let Some(e) = entry() {
            let _ = e.delete_credential();
        }
    }
}

/// Other platforms (not shipped): plain file, no OS encryption available here.
#[cfg(not(any(windows, target_os = "macos")))]
mod backend {
    use anyhow::{Context, Result};

    pub fn load() -> Option<Vec<u8>> {
        std::fs::read(super::path()).ok()
    }

    pub fn save(plain: &[u8]) -> Result<()> {
        let p = super::path();
        std::fs::create_dir_all(p.parent().context("vault path")?)?;
        std::fs::write(p, plain)?;
        Ok(())
    }
}

#[cfg(windows)]
mod dpapi {
    use anyhow::{bail, Result};
    use windows_sys::Win32::Foundation::{LocalFree, HLOCAL};
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    fn run(data: &[u8], encrypt: bool) -> Result<Vec<u8>> {
        let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        // SAFETY: plain Win32 calls with valid in/out blobs; the output buffer is
        // copied and then released with LocalFree as the API requires.
        unsafe {
            let ok = if encrypt {
                CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            } else {
                CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            };
            if ok == 0 {
                bail!("DPAPI failed");
            }
            let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
            LocalFree(out.pbData as HLOCAL);
            Ok(bytes)
        }
    }

    pub fn protect(data: &[u8]) -> Result<Vec<u8>> {
        run(data, true)
    }

    pub fn unprotect(data: &[u8]) -> Result<Vec<u8>> {
        run(data, false)
    }
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn dpapi_round_trip() {
        let secret = b"hello vault";
        let sealed = super::dpapi::protect(secret).unwrap();
        assert_ne!(&sealed[..], secret);
        assert_eq!(super::dpapi::unprotect(&sealed).unwrap(), secret);
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn keychain_round_trip() {
        backend::clear();
        let login = Login { identity: "abc".into(), email: Some("a@b.c".into()), creds: serde_json::json!({ "token": "t" }) };
        put(&key("claude", "abc"), &login).unwrap();
        let back = get(&key("claude", "abc")).expect("saved login");
        assert_eq!(back.email.as_deref(), Some("a@b.c"));
        assert_eq!(back.creds["token"], "t");
        remove(&key("claude", "abc"));
        assert!(get(&key("claude", "abc")).is_none());
        backend::clear();
    }
}
