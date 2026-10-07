"""Pack the SVG-rendered PNGs as Windows ICO/CUR and crop the existing wallpaper portrait."""
from __future__ import annotations

import json
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent
WALLPAPER = ROOT.parent / "kosmos-5k.png"


def make_ico() -> None:
    for png in (ROOT / "icons").glob("*.png"):
        with Image.open(png) as source:
            image = source.convert("RGBA")
            image.save(png.with_suffix(".ico"), format="ICO", sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)])


def dib(image: Image.Image) -> bytes:
    width, height = image.size
    rows = [image.crop((0, y, width, y + 1)).tobytes("raw", "BGRA") for y in range(height - 1, -1, -1)]
    xor = b"".join(rows)
    stride = ((width + 31) // 32) * 4
    mask_rows = []
    alpha = image.getchannel("A")
    for y in range(height - 1, -1, -1):
        mask = bytearray(stride)
        for x in range(width):
            if alpha.getpixel((x, y)) < 128:
                mask[x // 8] |= 0x80 >> (x % 8)
        mask_rows.append(bytes(mask))
    and_mask = b"".join(mask_rows)
    header = struct.pack("<IiiHHIIiiII", 40, width, height * 2, 1, 32, 0, len(xor) + len(and_mask), 0, 0, 0, 0)
    return header + xor + and_mask


def make_cursor() -> None:
    for png in (ROOT / "cursors").glob("*.png"):
        with Image.open(png) as source:
            base = source.convert("RGBA")
        hotspot = json.loads(png.with_suffix(".json").read_text())["hotspot"]
        images = [(size, dib(base.resize((size, size), Image.Resampling.LANCZOS))) for size in (32, 64)]
        directory = struct.pack("<HHH", 0, 2, len(images))
        offset = 6 + 16 * len(images)
        entries = []
        payload = []
        for size, data in images:
            x, y = (round(v * size / 64) for v in hotspot)
            entries.append(struct.pack("<BBBBHHII", size, size, 0, 0, x, y, len(data), offset))
            payload.append(data)
            offset += len(data)
        png.with_suffix(".cur").write_bytes(directory + b"".join(entries) + b"".join(payload))


def make_portrait() -> None:
    with Image.open(WALLPAPER) as source:
        # Face, headdress, shoulders, and some of the wallpaper's cyan HUD.
        crop = source.convert("RGB").crop((2420, 200, 4220, 2000)).resize((512, 512), Image.Resampling.LANCZOS)
    out = Image.new("RGB", (512, 512), "#0d1240")
    mask = Image.new("L", (512, 512))
    draw = ImageDraw.Draw(mask)
    draw.ellipse((13, 13, 499, 499), fill=255)
    out.paste(crop, (0, 0), mask)
    draw = ImageDraw.Draw(out)
    draw.ellipse((9, 9, 503, 503), outline="#35c7e8", width=7)
    draw.ellipse((20, 20, 492, 492), outline="#bff4ff", width=2)
    out.save(ROOT / "kosmos-account-portrait.png", optimize=True)


if __name__ == "__main__":
    make_ico()
    make_cursor()
    make_portrait()
