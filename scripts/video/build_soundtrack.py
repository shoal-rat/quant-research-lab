"""Mix narration (placed on the timeline) over ducked chiptune music.
Reads work/timeline.json, work/audio/music.wav, work/audio/vo/<id>.wav.
Writes work/audio/soundtrack.wav (stereo 44.1k 16-bit)."""
import json
import os
import wave

import numpy as np

def _find_root(p):
    p = os.path.dirname(os.path.abspath(p))
    while p != os.path.dirname(p):
        if os.path.exists(os.path.join(p, "package.json")):
            return p
        p = os.path.dirname(p)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


ROOT = _find_root(__file__)
SR = 44100
AUD = os.path.join(ROOT, "work", "audio")
tl = json.load(open(os.environ.get("QRL_TIMELINE", os.path.join(ROOT, "work", "timeline.json")), encoding="utf-8"))
N = int(tl["total"] * SR)
MUSIC = os.environ.get("QRL_MUSIC", os.path.join(AUD, "music.wav"))
VODIR = os.environ.get("QRL_VODIR", os.path.join(AUD, "vo"))
OUT_ST = os.environ.get("QRL_SOUNDTRACK", os.path.join(AUD, "soundtrack.wav"))

BASE = 0.82          # music level when no narration
DUCK = 0.34          # music multiplier under narration
VO_GAIN = 0.96


def read_wav(p):
    w = wave.open(p, "rb")
    n = w.getnframes(); ch = w.getnchannels()
    d = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32767.0
    w.close()
    if ch == 2:
        d = d.reshape(-1, 2)
    return d


music = read_wav(MUSIC)
if music.ndim == 1:
    music = np.stack([music, music], axis=1)
if len(music) < N:
    music = np.pad(music, ((0, N - len(music)), (0, 0)))
music = music[:N]

vo = np.zeros((N, 2), np.float32)
gain = np.full(N, BASE, np.float32)

for seg in tl["segments"]:
    if not seg["vo"].strip():
        continue
    w = read_wav(os.path.join(VODIR, seg["id"] + ".wav"))
    if w.ndim == 2:
        w = w.mean(axis=1)
    at = int(seg["voAt"] * SR)
    end = min(N, at + len(w))
    seg_w = w[: end - at]
    vo[at:end, 0] += seg_w
    vo[at:end, 1] += seg_w
    d0 = max(0, int((seg["voAt"] - 0.18) * SR))
    d1 = min(N, end + int(0.30 * SR))
    gain[d0:d1] = BASE * DUCK

# smooth the duck envelope (120ms box) to avoid clicks
k = np.ones(int(0.12 * SR), np.float32)
k /= k.sum()
gain = np.convolve(gain, k, mode="same")

# normalize narration to a consistent peak, then mix
vpeak = float(np.abs(vo).max()) or 1.0
vo *= (0.92 / vpeak)
mix = music * gain[:, None] + vo * VO_GAIN
mix = np.tanh(mix * 1.05)
mix /= (float(np.abs(mix).max()) or 1.0)
mix *= 0.97

pcm = (mix * 32767).astype(np.int16)
out = OUT_ST
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"soundtrack.wav: {N/SR:.2f}s, {os.path.getsize(out)/1e6:.1f} MB")
