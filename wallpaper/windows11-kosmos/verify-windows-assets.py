"""Structural and native Windows load checks for the KOS-MOS design pack."""
from __future__ import annotations

import ctypes
import json
import re
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import unquote

from PIL import Image

ROOT = Path(__file__).resolve().parent


def check() -> None:
    icons = sorted((ROOT / "icons").glob("*.ico"))
    cursors = sorted((ROOT / "cursors").glob("*.cur"))
    assert len(icons) == 12, f"expected 12 icons, found {len(icons)}"
    assert len(cursors) == 8, f"expected 8 cursors, found {len(cursors)}"
    sizes = {(n, n) for n in (16, 24, 32, 48, 64, 128, 256)}
    for path in icons:
        with Image.open(path) as icon:
            assert icon.format == "ICO"
            assert sizes <= icon.ico.sizes(), f"missing icon sizes: {path}"
    for path in cursors:
        data = path.read_bytes()
        assert struct.unpack_from("<HHH", data) == (0, 2, 2), f"invalid cursor header: {path}"
        hotspot = json.loads(path.with_suffix(".json").read_text())["hotspot"]
        for i, size in enumerate((32, 64)):
            width, height, _, _, x, y, length, offset = struct.unpack_from("<BBBBHHII", data, 6 + 16 * i)
            assert (width, height) == (size, size)
            assert (x, y) == tuple(round(v * size / 64) for v in hotspot)
            assert data[offset:offset + 4] == struct.pack("<I", 40) and offset + length <= len(data)
        if sys.platform == "win32":
            user32 = ctypes.WinDLL("user32", use_last_error=True)
            load = user32.LoadImageW
            load.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_uint, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
            load.restype = ctypes.c_void_p
            handle = load(None, str(path), 2, 0, 0, 0x10 | 0x40)
            assert handle, f"Windows rejected {path}: {ctypes.get_last_error()}"
            user32.DestroyCursor(ctypes.c_void_p(handle))
    for path in ROOT.rglob("*.svg"):
        ET.parse(path)
    for path in ROOT.rglob("*.json"):
        json.loads(path.read_text(encoding="utf-8"))
    with Image.open(ROOT / "kosmos-account-portrait.png") as portrait:
        assert portrait.size == (512, 512)
    with Image.open(ROOT / "kosmos-lock-5k.png") as lock:
        assert lock.size == (5120, 2880)
    html = (ROOT / "preview.html").read_text(encoding="utf-8")
    refs = re.findall(r'(?:src="|url\([\'\"]?)([^\'\"\)]+)', html)
    for ref in refs:
        if ref.startswith(("http:", "https:")):
            continue
        assert (ROOT / unquote(ref)).resolve().exists(), f"broken preview reference: {ref}"
    theme = (ROOT / "KOS-MOS.theme").read_text(encoding="utf-8")
    for path in re.findall(r"^[A-Za-z]+=(D:\\[^\r\n]+)$", theme, re.MULTILINE):
        assert Path(path).exists(), f"broken theme path: {path}"
    print(f"OK: {len(icons)} multi-size ICOs, {len(cursors)} native Windows CURs, SVG/JSON, images, preview, and theme paths")


if __name__ == "__main__":
    check()
