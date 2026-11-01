"""Apply KOS-MOS icons to Windows known folders, preserving desktop.ini metadata."""
from __future__ import annotations

import argparse
import ctypes
import json
import os
import re
import shutil
import winreg
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKUP = Path((ROOT / "last-apply-backup.txt").read_text(encoding="utf-8").strip())
DEST = Path(os.environ["LOCALAPPDATA"]) / "KOS-MOS" / "Icons" / "R-CORE"
KEYS = {
    "Documents": "Personal",
    "Downloads": "{374DE290-123F-4565-9164-39C4925E467B}",
    "Pictures": "My Pictures",
    "Music": "My Music",
    "Videos": "My Video",
}


def known_folder(name: str) -> Path:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as key:
        raw, _ = winreg.QueryValueEx(key, KEYS[name])
    return Path(os.path.expandvars(raw))


def apply(names: list[str]) -> None:
    if not BACKUP.is_dir():
        raise RuntimeError(f"Missing settings backup: {BACKUP}")
    DEST.mkdir(parents=True, exist_ok=True)
    for icon in (ROOT / "icons").glob("*.ico"):
        shutil.copy2(icon, DEST / icon.name)
    backup_dir = BACKUP / "folder-icons"
    backup_dir.mkdir(exist_ok=True)
    changed = []
    for name in names:
        folder = known_folder(name)
        ini = folder / "desktop.ini"
        if not ini.is_file():
            raise RuntimeError(f"No existing desktop.ini to preserve: {ini}")
        existing = ini.read_bytes()
        backup_path = backup_dir / f"{name}.desktop.ini"
        if not backup_path.exists():
            shutil.copy2(ini, backup_path)
        text = existing.decode("utf-16")
        line = f"IconResource={DEST / (name.lower() + '.ico')},0"
        if not re.search(r"(?mi)^IconResource=.*$", text):
            raise RuntimeError(f"Missing IconResource in {ini}")
        updated = re.sub(r"(?mi)^IconResource=[^\r\n]*", lambda _: line, text, count=1)
        if updated != text:
            # "wb" uses CREATE_ALWAYS, which Windows rejects for an existing
            # Hidden/System desktop.ini. Update the existing file in place.
            with ini.open("r+b") as stream:
                stream.write(updated.encode("utf-16"))
                stream.truncate()
            changed.append(str(folder))
    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
    (BACKUP / "folder-icons-applied.json").write_text(json.dumps({"folders": changed, "icons": str(DEST)}, indent=2), encoding="utf-8")
    print(f"Applied icons to {len(names)} folders; refreshed Explorer: {', '.join(names)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="+", choices=list(KEYS))
    apply(parser.parse_args().names)
