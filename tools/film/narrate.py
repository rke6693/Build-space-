"""Render the narration track for public/film ("After Eden") and sync its captions.

The film's captions and its voice come from the LINES table below. Each voiced line
is rendered with the Kokoro TTS model, trimmed, treated and placed on a single
330-second stem that lines up with the film's timeline. The stem is mastered with
ffmpeg and written to public/film/narration.mp3, and the CUES block in
public/film/index.html is rewritten with the real start and end of every line so
captions and ducking follow the voice.

Setup (once):
    python3 -m venv .venv && . .venv/bin/activate
    pip install kokoro-onnx soundfile numpy scipy imageio-ffmpeg pyloudnorm
    mkdir -p tools/film/models && cd tools/film/models
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

Run from the repo root:
    python tools/film/narrate.py
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import pyloudnorm
import soundfile as sf
from kokoro_onnx import Kokoro
from scipy import signal

ROOT = Path(__file__).resolve().parents[2]
FILM_LEN = 330.0
SR = 48000

NARRATOR = {"voice": "af_heart", "speed": 0.92, "lufs": -20.0}
# Quotations are performed by other synthetic voices and treated to sound remembered.
# They are not recordings of, or imitations of, the people quoted.
QUOTE_VOICES = {"jobs": "am_michael", "amelio": "am_fenrir", "dell": "am_puck"}
QUOTE_LUFS = -22.0

# Scene cuts in the film, used as soft deadlines so a line does not run far into the next scene.
CUTS = [0, 15, 29, 38, 41.5, 60, 63.5, 77, 90, 100, 103.5, 114, 126, 142, 145.5, 166, 178,
        192, 204, 207.5, 225, 228.5, 238, 249, 267, 275, 292, 299, 318, 330]
BLEED = 0.6

# at: desired start (s). lock: start exactly there (it is cut to picture or sound).
# say: what the voice speaks, as text fragments and pauses in seconds; defaults to text.
# who: attribution for a quotation, shown under the caption.
LINES = [
    {"slug": "January 24, 1984", "a": 2.5, "b": 10.6},
    {"at": 6.2, "text": "In the beginning, I said hello.", "say": ["In the beginning,", 0.25, "I said hello."]},
    {"at": 15.6, "text": "They named me after an apple, the McIntosh.", "say": ["They named me after an apple.", 0.3, "The Mackintosh."]},
    {"at": 20.0, "text": "The people who made me flew a pirate flag over their building."},
    {"at": 24.4, "text": "Their captain was twenty-eight years old."},
    {"slug": "New York, 1983", "a": 42, "b": 47.9},
    {"at": 42.0, "text": "A year before I was born, the captain went to New York to recruit a man who sold soda."},
    {"at": 48.2, "text": "“Do you want to spend the rest of your life selling sugared water, or do you want a chance to change the world?”",
     "say": ["Do you want to spend the rest of your life selling sugared water,", 0.2, "or do you want a chance to change the world?"],
     "voice": "jobs", "who": "Steve Jobs to John Sculley of Pepsi, 1983"},
    {"at": 55.6, "text": "He said yes."},
    {"slug": "Cupertino, spring 1985", "a": 64, "b": 69.3},
    {"at": 64.2, "text": "Then I stopped selling. The two men went to war over me.", "say": ["Then I stopped selling.", 0.4, "The two men went to war over me."]},
    {"at": 69.8, "text": "The board chose the soda man."},
    {"at": 77.6, "text": "They took away the captain’s division and moved him to an empty building."},
    {"at": 82.8, "text": "He called it Siberia."},
    {"at": 86.2, "text": "Nobody called."},
    {"slug": "September 17, 1985", "a": 91, "b": 99.5},
    {"at": 92.6, "text": "He resigned. He was thirty years old.", "say": ["He resigned.", 0.7, "He was thirty years old."]},
    {"at": 104.2, "text": "After he left, they made me expensive."},
    {"at": 108.6, "text": "Margins got fat. Market share got thin.", "say": ["Margins got fat.", 0.35, "Market share got thin."]},
    {"slug": "November 1985", "a": 114.5, "b": 119.9},
    {"at": 114.6, "text": "Two months after he left, Apple signed a paper letting a rival borrow my look."},
    {"at": 120.3, "text": "Years later, it sued to take my look back."},
    {"at": 123.8, "lock": True, "text": "It lost."},
    {"slug": "1993", "a": 126.5, "b": 133.8},
    {"at": 126.8, "text": "They gave me a little brother who could read your handwriting."},
    {"at": 136.0, "lock": True, "text": "Mostly."},
    {"at": 138.2, "text": "That summer, the board let the soda man go."},
    {"at": 146.2, "text": "The next captain was an engineer they called the Diesel."},
    {"at": 151.0, "text": "He gave me dozens of brothers, with numbers for names."},
    {"at": 156.0, "text": "Even the stores couldn’t tell us apart."},
    {"at": 160.0, "text": "Then Apple let other companies sell cheaper copies of me."},
    {"slug": "August 24, 1995", "a": 166.5, "b": 173.9},
    {"at": 166.6, "text": "A rival’s new system went on sale at midnight."},
    {"at": 171.0, "text": "People lined up around the block."},
    {"at": 174.2, "text": "Nobody lined up for me."},
    {"slug": "February 1996", "a": 178.5, "b": 181.6},
    {"at": 178.5, "text": "A third captain took the helm."},
    {"at": 181.8, "text": "“Apple is like a ship with a hole in the bottom, leaking water, and my job is to get the ship pointed in the right direction.”",
     "say": ["Apple is like a ship with a hole in the bottom, leaking water,", 0.15, "and my job is to get the ship pointed in the right direction."],
     "voice": "amelio", "who": "Gil Amelio, Apple CEO, 1996 to 1997"},
    {"at": 189.6, "text": "The water kept coming."},
    {"slug": "August 1996", "a": 192.5, "b": 197.9},
    {"at": 192.4, "text": "They promised me a new mind, code-named Copland.", "say": ["They promised me a new mind,", 0.2, "code-named Copeland."]},
    {"at": 197.2, "lock": True, "text": "It never shipped."},
    {"at": 198.6, "text": "That year, Apple lost $816 million.", "say": ["That year, Apple lost eight hundred and sixteen million dollars."]},
    {"at": 208.0, "text": "Far away, the captain was failing too."},
    {"at": 211.5, "text": "He built a perfect black cube. Almost nobody bought it.", "say": ["He built a perfect black cube.", 0.4, "Almost nobody bought it."]},
    {"at": 216.4, "text": "He bought a small studio that made pictures with computers. In 1995, it released Toy Story.",
     "say": ["He bought a small studio that made pictures with computers.", 0.3, "In nineteen ninety-five, it released Toy Story."]},
    {"at": 222.8, "text": "Out there, he learned to finish things."},
    {"slug": "December 20, 1996", "a": 229, "b": 232.9},
    {"at": 229.2, "text": "Apple bought his company for $429 million.", "say": ["Apple bought his company, for four hundred and twenty-nine million dollars."]},
    {"at": 233.4, "text": "It bought him back with it."},
    {"slug": "June 1997", "a": 238.5, "b": 243.4},
    {"at": 238.6, "text": "A magazine crowned our logo with thorns and printed one word."},
    {"at": 243.6, "text": "By his own later account, Apple was about ninety days from going broke."},
    {"slug": "Boston, August 6, 1997", "a": 249.5, "b": 259.3},
    {"at": 249.6, "text": "The third captain was gone. The first one was back on stage.", "say": ["The third captain was gone.", 0.4, "The first one was back on stage."]},
    {"at": 253.7, "text": "A rival invested $150 million. When its chief appeared on the big screen, the crowd booed.",
     "say": ["A rival invested a hundred and fifty million dollars.", 0.2, "When its chief appeared on the big screen, the crowd booed."]},
    {"at": 260.0, "text": "“We have to let go of this notion that for Apple to win, Microsoft has to lose.”",
     "voice": "jobs", "who": "Steve Jobs, Macworld Boston"},
    {"at": 267.5, "text": "A competitor was asked what he would do with Apple."},
    {"at": 270.6, "text": "“I’d shut it down and give the money back to the shareholders.”", "voice": "dell", "who": "Michael Dell, October 1997"},
    {"at": 275.5, "text": "He did the opposite. He started saying no.", "say": ["He did the opposite.", 0.45, "He started saying no."]},
    {"at": 279.95, "lock": True, "text": "No to the clones."},
    {"at": 281.95, "lock": True, "text": "No to the Newton."},
    {"at": 283.95, "lock": True, "text": "No to the numbered brothers."},
    {"at": 286.1, "text": "Four products. That was the whole plan.", "say": ["Four products.", 0.55, "That was the whole plan."]},
    {"slug": "September 1997", "a": 292.5, "b": 298.5},
    {"slug": "May 6, 1998", "a": 300, "b": 305.4},
    {"at": 300.2, "text": "Fourteen years after my first word, my heir said it again."},
    {"at": 308.7, "lock": True, "text": "Hello again.", "say": ["Hello, again."], "speed": 0.84},
    {"at": 311.4, "text": "Apple turned a profit in fiscal 1998.", "say": ["Apple turned a profit,", 0.15, "in fiscal nineteen ninety-eight."]},
]


def deadline(t: float) -> float:
    return next(c for c in CUTS if c > t + 0.01) + BLEED


def trim(x: np.ndarray, sr: int) -> np.ndarray:
    env = np.convolve(np.abs(x), np.ones(int(sr * 0.01)) / (sr * 0.01), mode="same")
    idx = np.flatnonzero(env > 10 ** (-46 / 20))
    if idx.size == 0:
        return x
    a = max(0, idx[0] - int(sr * 0.02))
    b = min(len(x), idx[-1] + int(sr * 0.09))
    out = x[a:b].copy()
    fade = int(sr * 0.006)
    out[:fade] *= np.linspace(0, 1, fade)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out


def remembered(x: np.ndarray) -> np.ndarray:
    """Band-limit, warm and place a quotation in a small room so it reads as memory."""
    sos = signal.butter(4, [210, 4300], btype="bandpass", fs=SR, output="sos")
    y = signal.sosfilt(sos, x)
    y = np.tanh(y * 1.8) / np.tanh(1.8)
    rng = np.random.default_rng(7)
    n = int(SR * 0.5)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (SR * 0.09))
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = signal.fftconvolve(y, ir)
    out = np.zeros(len(wet))
    out[: len(y)] += y
    out += 0.22 * wet
    return out


def loudness_match(x: np.ndarray, target: float, meter: pyloudnorm.Meter) -> np.ndarray:
    padded = np.concatenate([x, np.zeros(int(SR * 0.5))]) if len(x) < SR * 0.5 else x
    lufs = meter.integrated_loudness(padded)
    if not np.isfinite(lufs):
        rms = np.sqrt(np.mean(x ** 2)) + 1e-9
        return x * (10 ** (target / 20) / rms)
    return x * 10 ** ((target - lufs) / 20)


class Renderer:
    def __init__(self, models: Path):
        self.k = Kokoro(str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin"))
        self.cache: dict[tuple, np.ndarray] = {}
        self.meter = pyloudnorm.Meter(SR)

    def fragment(self, text: str, voice: str, speed: float) -> np.ndarray:
        key = (text, voice, round(speed, 3))
        if key not in self.cache:
            samples, sr = self.k.create(text, voice=voice, speed=speed, lang="en-us")
            x = trim(np.asarray(samples, dtype=np.float64), sr)
            self.cache[key] = signal.resample_poly(x, SR // 8000, sr // 8000)
        return self.cache[key]

    def line(self, line: dict, speed: float) -> np.ndarray:
        quote = "voice" in line
        voice = QUOTE_VOICES[line["voice"]] if quote else NARRATOR["voice"]
        parts = []
        for piece in line.get("say", [line["text"]]):
            if isinstance(piece, (int, float)):
                parts.append(np.zeros(int(SR * piece / speed)))
            else:
                parts.append(self.fragment(piece, voice, speed))
        x = np.concatenate(parts)
        if quote:
            x = remembered(x)
        return loudness_match(x, QUOTE_LUFS if quote else NARRATOR["lufs"], self.meter)


def layout(r: Renderer) -> list[dict]:
    voiced = [l for l in LINES if "text" in l]
    placed, prev_end = [], 0.0
    for i, line in enumerate(voiced):
        nxt = voiced[i + 1] if i + 1 < len(voiced) else None
        start = line["at"] if line.get("lock") else max(line["at"], prev_end + 0.3)
        limit = deadline(line["at"])
        if nxt:
            limit = min(limit, nxt["at"] - (0.15 if nxt.get("lock") else 0.25))
        base = line.get("speed", 1.0 if "voice" in line else NARRATOR["speed"])
        for mult in (1.0, 1.04, 1.08, 1.12, 1.17):
            audio = r.line(line, base * mult)
            if start + len(audio) / SR <= limit:
                break
        end = start + len(audio) / SR
        if start < prev_end:
            print(f"  ! overlaps previous line: {line['text'][:40]}", file=sys.stderr)
        if end > limit:
            print(f"  ! runs {end - limit:.2f}s past its slot: {line['text'][:40]}", file=sys.stderr)
        placed.append({**line, "start": start, "end": end, "speed": base * mult, "audio": audio})
        prev_end = end
    return placed


def captions(placed: list[dict]) -> list[dict]:
    cues = [{"a": l["a"], "b": l["b"], "slug": l["slug"]} for l in LINES if "slug" in l]
    for i, p in enumerate(placed):
        a = max(0.0, p["start"] - 0.12)
        b = p["end"] + 0.8
        if i + 1 < len(placed):
            b = min(b, placed[i + 1]["start"] - 0.14)
        b = max(b, min(a + 1.4, placed[i + 1]["start"] - 0.14 if i + 1 < len(placed) else a + 1.4))
        cue = {"a": round(a, 2), "b": round(b, 2), "text": p["text"]}
        if "who" in p:
            cue["who"] = p["who"]
        cues.append(cue)
    return sorted(cues, key=lambda q: (q["a"], "slug" not in q))


def master(stem: np.ndarray, out: Path) -> None:
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    chain = ",".join([
        "highpass=f=70",
        "equalizer=f=180:t=q:w=0.9:g=1.2",
        "equalizer=f=3800:t=q:w=1.1:g=2.2",
        "treble=g=1.5:f=9500",
        "acompressor=threshold=0.089:ratio=2.5:attack=6:release=110:makeup=1.4",
        "deesser=i=0.35:m=0.5:f=0.5",
        "alimiter=limit=0.891:level=false",
    ])
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "stem.wav"
        sf.write(raw, stem.astype(np.float32), SR, subtype="FLOAT")
        subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(raw), "-af", chain,
                        "-ar", str(SR), "-ac", "1", "-c:a", "libmp3lame", "-q:a", "5", str(out)], check=True)


def write_block(html: Path, cues: list[dict], spans: list[list[float]]) -> None:
    text = html.read_text(encoding="utf-8")
    lines = ",\n".join("    " + json.dumps(q, ensure_ascii=False) for q in cues)
    block = (
        "/* narration:start (generated by tools/film/narrate.py; edit the script there) */\n"
        f"  const CUES = [\n{lines},\n  ];\n"
        f"  const VOICE_SPANS = {json.dumps(spans)};\n"
        "  /* narration:end */"
    )
    new, n = re.subn(r"/\* narration:start.*?/\* narration:end \*/", lambda _: block, text, flags=re.S)
    if n != 1:
        sys.exit("narration markers not found in " + str(html))
    html.write_text(new, encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--models", type=Path, default=ROOT / "tools/film/models")
    ap.add_argument("--html", type=Path, default=ROOT / "public/film/index.html")
    ap.add_argument("--out", type=Path, default=ROOT / "public/film/narration.mp3")
    args = ap.parse_args()

    r = Renderer(args.models)
    placed = layout(r)
    stem = np.zeros(int(FILM_LEN * SR) + SR)
    for p in placed:
        s = int(p["start"] * SR)
        stem[s: s + len(p["audio"])] += p["audio"]
    master(stem, args.out)

    spans = [[round(p["start"], 2), round(p["end"], 2)] for p in placed]
    write_block(args.html, captions(placed), spans)
    for p in placed:
        print(f"{p['start']:7.2f} {p['end']:7.2f}  x{p['speed']:.2f}  {p['text'][:64]}")
    speech = sum(p["end"] - p["start"] for p in placed)
    print(f"{len(placed)} lines, {speech:.0f}s of speech, {args.out.stat().st_size / 1e6:.2f} MB -> {args.out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
