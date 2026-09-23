"""Generates the built-in waifu presets with Animagine XL 4.0 and cuts them out.

    python scripts/gen_waifus.py draft <id> [<id> ...]     4 seeds each -> scripts/out/<id>_<seed>.png
    python scripts/gen_waifus.py pick <id> <seed>          cut out one draft -> public/waifus/<id>/

Needs diffusers, torch with CUDA, rembg and Pillow, plus the Animagine XL 4.0
weights (https://huggingface.co/cagliostrolab/animagine-xl-4.0). Set
ANIMAGINE to a local copy to skip the download. All characters are original.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DRAFTS = ROOT / "scripts" / "out"
PUBLIC = ROOT / "public" / "waifus"
MODEL = os.environ.get("ANIMAGINE", "cagliostrolab/animagine-xl-4.0")

# SDXL reads only the first 77 tokens: framing and background first, outfit short.
FRAME = "1girl, solo, upper body, front view, looking at viewer, white background, simple background, safe"
STYLE = "masterpiece, best quality, very aesthetic, anime coloring"
WAIFUS = {
    "sakura": "pink hair, long twintails, green eyes, happy, smile, pastel hoodie, white headphones around neck, hair ribbon",
    "yuki": "silver hair, long straight hair, light blue eyes, calm, slight smile, round glasses, white turtleneck sweater, snowflake hair clip",
    "akane": "red hair, short ponytail, amber eyes, pout, blush, crossed arms, black blazer, red necktie, hair bow",
    "luna": "dark purple hair, messy bob cut, violet eyes, sleepy, cat ear headphones, oversized black hoodie, star hair pin",
}
NEGATIVE = (
    "lowres, bad anatomy, bad hands, extra digits, fewer digits, cropped head, out of frame, multiple views, "
    "weapon, scenery, detailed background, text, watermark, signature, blurry, jpeg artifacts, "
    "worst quality, low quality, displeasing, very displeasing, nsfw, cleavage"
)
SEEDS = [11, 22, 33, 44]


def draft(ids: list[str]) -> None:
    import torch
    from diffusers import StableDiffusionXLPipeline

    DRAFTS.mkdir(parents=True, exist_ok=True)
    pipe = StableDiffusionXLPipeline.from_pretrained(MODEL, torch_dtype=torch.float16, use_safetensors=True).to("cuda")
    for wid in ids:
        prompt = f"{FRAME}, {WAIFUS[wid]}, {STYLE}"
        for seed in SEEDS:
            g = torch.Generator("cuda").manual_seed(seed)
            img = pipe(prompt, negative_prompt=NEGATIVE, width=896, height=1152,
                       num_inference_steps=28, guidance_scale=6.0, generator=g).images[0]
            path = DRAFTS / f"{wid}_{seed}.png"
            img.save(path)
            print("saved", path, flush=True)


def pick(wid: str, seed: int) -> None:
    from PIL import Image
    from rembg import new_session, remove

    src = Image.open(DRAFTS / f"{wid}_{seed}.png").convert("RGB")
    cut = remove(src, session=new_session("isnet-anime"))
    cut = cut.crop(cut.getbbox())
    out = PUBLIC / wid
    out.mkdir(parents=True, exist_ok=True)

    # Portrait: trimmed cut-out, 640 px tall is plenty for the character column.
    portrait = cut.resize((round(cut.width * 640 / cut.height), 640), Image.LANCZOS)
    portrait.save(out / "portrait.png", optimize=True)

    # Avatar: a square around the head. The face sits in the top part of an
    # upper-body shot, centred on the widest run of hair and skin there.
    alpha = cut.getchannel("A")
    band = alpha.crop((0, 0, cut.width, round(cut.height * 0.35))).getbbox() or (0, 0, cut.width, cut.height)
    cx = (band[0] + band[2]) / 2
    side = round(min(cut.width, (band[2] - band[0])) * 0.8)
    top = round(cut.height * 0.04)
    box = (round(cx - side / 2), top, round(cx + side / 2), top + side)
    head = Image.new("RGBA", (side, side), (228, 238, 255, 255))
    head.alpha_composite(cut.crop(box))
    head.convert("RGB").resize((128, 128), Image.LANCZOS).save(out / "avatar.png", optimize=True)
    print("wrote", out, flush=True)


if __name__ == "__main__":
    cmd, *rest = sys.argv[1:]
    if cmd == "draft":
        draft(rest or list(WAIFUS))
    elif cmd == "pick":
        pick(rest[0], int(rest[1]))
    else:
        sys.exit(__doc__)
