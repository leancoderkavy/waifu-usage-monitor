"""Merge the KOS-MOS scheme/theme into this user's Windows Terminal settings."""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEMPLATE = json.loads((ROOT / "terminal" / "kosmos-terminal.json").read_text(encoding="utf-8"))
SETTINGS = Path(os.environ["LOCALAPPDATA"]) / "Packages" / "Microsoft.WindowsTerminal_8wekyb3d8bbwe" / "LocalState" / "settings.json"


def upsert(items: list[dict], item: dict) -> None:
    for index, current in enumerate(items):
        if current.get("name") == item["name"]:
            items[index] = item
            return
    items.append(item)


def main() -> None:
    current = json.loads(SETTINGS.read_text(encoding="utf-8-sig"))
    for item in TEMPLATE["schemes"]:
        upsert(current.setdefault("schemes", []), item)
    for item in TEMPLATE["themes"]:
        upsert(current.setdefault("themes", []), item)
    current.setdefault("profiles", {}).setdefault("defaults", {}).update(TEMPLATE["profiles"]["defaults"])
    current["theme"] = TEMPLATE["theme"]
    terminal_icon = Path(os.environ["LOCALAPPDATA"]) / "KOS-MOS" / "Icons" / "R-CORE" / "terminal.ico"
    if not terminal_icon.is_file():
        raise RuntimeError(f"Missing installed Terminal icon: {terminal_icon}")
    for profile in current["profiles"].get("list", []):
        if profile.get("guid") == current.get("defaultProfile"):
            profile["icon"] = str(terminal_icon)
            break
    target = SETTINGS.with_suffix(".json.kosmos-tmp")
    target.write_text(json.dumps(current, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
    os.replace(target, SETTINGS)
    print(f"Applied {TEMPLATE['theme']} to {SETTINGS}; {len(current['profiles'].get('list', []))} profiles retained")


if __name__ == "__main__":
    main()
