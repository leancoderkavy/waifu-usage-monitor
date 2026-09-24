"""Local text-to-speech for the waifus, with Kokoro-82M (Apache-2.0).

    pip install "kokoro>=0.9.4" soundfile
    python scripts/voice_server.py                 serve on http://127.0.0.1:8880
    python scripts/voice_server.py --samples       write docs/voices/<waifu>.wav and exit

Each waifu has her own voice, blended from Kokoro's stock voices (a weighted
average of their style vectors), plus a speaking speed. A touch of a Japanese
voice in the English mix gives the light anime accent.

API (OpenAI-compatible, so any client for /v1/audio/speech works):
    POST /v1/audio/speech   {"input": "...", "voice": "sakura", "speed": 1.0}  -> audio/wav
    GET  /v1/audio/voices   -> {"voices": [...]}
    GET  /health
`voice` is a waifu name, any Kokoro voice id (af_heart), or a blend like
"af_bella*0.6+jf_alpha*0.4".
"""

import argparse
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

REPO = "hexgrad/Kokoro-82M"
RATE = 24000
ROOT = Path(__file__).resolve().parent.parent

# name -> (blend, speed). Weights are normalised, so they only need to be relative.
WAIFUS = {
    "kosmos": ("af_nicole*0.5+af_sky*0.3+bf_emma*0.2", 0.92),  # calm, soft, precise
    "sakura": ("af_bella*0.5+af_nova*0.3+jf_alpha*0.2", 1.12),  # bright and quick
    "yuki": ("af_sky*0.6+bf_isabella*0.2+jf_gongitsune*0.2", 0.95),  # quiet, gentle
    "akane": ("af_kore*0.5+af_bella*0.3+jf_nezumi*0.2", 1.08),  # sharp, pouty
    "luna": ("af_river*0.5+af_heart*0.3+jf_tebukuro*0.2", 0.88),  # sleepy drawl
}
SAMPLES = {
    "kosmos": "Status report, Senpai. Claude weekly usage is at eighty seven percent remaining. I will keep watching.",
    "sakura": "Yatta! Plenty of tokens left, Senpai! Ganbatte, go build something amazing!",
    "yuki": "Your Codex window is at forty percent. A shorter prompt with better context usually wins.",
    "akane": "Hmph! It's not like I'm tracking your tokens because I like you, baka!",
    "luna": "Mm... still coding at this hour, Senpai? The weekly reset won't come any faster.",
}

pipe = KPipeline(lang_code="a", repo_id=REPO)
lock = threading.Lock()  # the pipeline is not thread-safe
packs: dict[str, torch.Tensor] = {}


def pack(voice_id: str) -> torch.Tensor:
    if voice_id not in packs:
        packs[voice_id] = pipe.load_single_voice(voice_id)
    return packs[voice_id]


def resolve(voice: str) -> tuple[torch.Tensor, float]:
    """Voice name or blend -> (style tensor, default speed)."""
    blend, speed = WAIFUS.get(voice, (voice, 1.0))
    parts = []
    for term in blend.split("+"):
        vid, _, w = term.strip().partition("*")
        if not vid.replace("_", "").isalnum():
            raise ValueError(f"bad voice {vid!r}")
        parts.append((vid, float(w or 1)))
    total = sum(w for _, w in parts)
    return sum(pack(v) * (w / total) for v, w in parts), speed


def synth(text: str, voice: str, speed: float | None = None) -> np.ndarray:
    style, default_speed = resolve(voice)
    with lock:
        chunks = [r.audio.numpy() for r in pipe(text, voice=style, speed=speed or default_speed) if r.audio is not None]
    return np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)


def wav(audio: np.ndarray) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, audio, RATE, format="WAV", subtype="PCM_16")
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, kind: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: object) -> None:
        self._send(code, json.dumps(obj).encode(), "application/json")

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"ok": True})
        elif self.path == "/v1/audio/voices":
            self._json(200, {"voices": list(WAIFUS)})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/v1/audio/speech":
            return self._json(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            text = str(req["input"]).strip()[:1000]
            audio = synth(text, str(req.get("voice", "kosmos")), req.get("speed"))
        except Exception as e:  # bad JSON, unknown voice, empty text
            return self._json(400, {"error": str(e)})
        self._send(200, wav(audio), "audio/wav")

    def log_message(self, *_):  # quiet
        pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8880)
    ap.add_argument("--samples", action="store_true", help="write docs/voices/<waifu>.wav and exit")
    args = ap.parse_args()
    if args.samples:
        out = ROOT / "docs" / "voices"
        out.mkdir(parents=True, exist_ok=True)
        for name, line in SAMPLES.items():
            sf.write(out / f"{name}.wav", synth(line, name), RATE, subtype="PCM_16")
            print("wrote", out / f"{name}.wav", flush=True)
        return
    synth("Ready.", "kosmos")  # warm up so the first real line is fast
    print(f"Waifu voices on http://{args.host}:{args.port}  ({', '.join(WAIFUS)})", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
