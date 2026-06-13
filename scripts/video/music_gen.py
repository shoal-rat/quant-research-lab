"""Generate a lively, cute chiptune background loop for the trailer.
Pure numpy + stdlib wave. Output: work/audio/music.wav (44.1k, 16-bit stereo)."""
import os
import sys
import wave

import numpy as np

def _find_root(p):
    p = os.path.dirname(os.path.abspath(p))
    while p != os.path.dirname(p):
        if os.path.exists(os.path.join(p, "package.json")):
            return p
        p = os.path.dirname(p)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


SR = 44100
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 121.0
ROOT = _find_root(__file__)
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "work", "audio", "music.wav")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

BPM = 128.0
BEAT = 60.0 / BPM
rng = np.random.default_rng(7)


def midi(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


NOTE = {"A": 9, "A#": 10, "B": 11, "C": 0, "C#": 1, "D": 2, "D#": 3,
        "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8}


def m(name, octv):
    return 12 * (octv + 1) + NOTE[name]


def env(n, attack, decay, sustain=0.0, release=None):
    e = np.ones(n)
    a = int(attack * SR)
    d = int(decay * SR)
    if a > 0:
        e[:a] = np.linspace(0, 1, a)
    if d > 0:
        end = min(n, a + d)
        e[a:end] = np.linspace(1, sustain if sustain > 0 else 0.25, end - a)
        if sustain > 0:
            e[end:] = sustain
        else:
            # pluck: continue decaying to zero
            tail = n - a
            e[a:] = np.exp(-np.linspace(0, 5, tail)) if tail > 0 else e[a:]
    return e


def tone(freq, dur, kind="square", vol=0.2, atk=0.005, dec=0.12, sustain=0.0, detune=0.0, vib=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1 + vib * np.sin(2 * np.pi * 5.5 * t)) if vib else freq
    ph = 2 * np.pi * f * t
    if kind == "square":
        w = np.sign(np.sin(ph))
    elif kind == "tri":
        w = 2 / np.pi * np.arcsin(np.sin(ph))
    elif kind == "saw":
        w = 2 * (t * f - np.floor(0.5 + t * f))
    elif kind == "pulse":
        w = np.where((ph % (2 * np.pi)) < (2 * np.pi * 0.25), 1.0, -1.0)
    else:
        w = np.sin(ph)
    if detune:
        w = 0.5 * w + 0.5 * np.sign(np.sin(2 * np.pi * f * (1 + detune) * t))
    e = env(n, atk, dec, sustain)
    return (w * e * vol).astype(np.float32)


def kick(dur=0.18, vol=0.55):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = np.linspace(150, 45, n)
    w = np.sin(2 * np.pi * np.cumsum(f) / SR)
    e = np.exp(-np.linspace(0, 9, n))
    return (w * e * vol).astype(np.float32)


def hat(dur=0.05, vol=0.16):
    n = int(dur * SR)
    w = rng.standard_normal(n)
    e = np.exp(-np.linspace(0, 22, n))
    return (w * e * vol).astype(np.float32)


def snare(dur=0.14, vol=0.3):
    n = int(dur * SR)
    w = rng.standard_normal(n)
    tone_part = np.sin(2 * np.pi * 190 * np.arange(n) / SR)
    e = np.exp(-np.linspace(0, 14, n))
    return ((0.7 * w + 0.3 * tone_part) * e * vol).astype(np.float32)


total_n = int(DUR * SR)
left = np.zeros(total_n + SR, dtype=np.float32)
right = np.zeros(total_n + SR, dtype=np.float32)


def add(buf, sig, at_s, pan=0.0):
    i = int(at_s * SR)
    j = min(len(buf), i + len(sig))
    if i >= len(buf):
        return
    buf[i:j] += sig[: j - i] * (1.0 - max(0.0, pan)) if pan >= 0 else sig[: j - i]


def add_st(sig, at_s, pan=0.0):
    # pan -1..1
    lg = np.clip(1 - max(0, pan), 0, 1)
    rg = np.clip(1 + min(0, pan), 0, 1)
    i = int(at_s * SR)
    j = min(total_n + SR, i + len(sig))
    if i >= total_n + SR:
        return
    seg = sig[: j - i]
    left[i:j] += seg * lg
    right[i:j] += seg * rg


# I - V - vi - IV in A major, 4 beats each => 16-beat cycle
chords = [
    ("A", ["A", "C#", "E"]),
    ("E", ["E", "G#", "B"]),
    ("F#", ["F#", "A", "C#"]),
    ("D", ["D", "F#", "A"]),
]
arp_patterns = [
    [0, 1, 2, 1, 0, 1, 2, 1],
    [0, 1, 2, 3, 2, 1, 0, 1],
    [0, 2, 1, 2, 0, 2, 1, 2],
    [0, 1, 0, 2, 1, 2, 1, 0],
]

cycle_beats = 16
cycle_dur = cycle_beats * BEAT
t = 0.0
cyc = 0
while t < DUR:
    for ci, (root, tones) in enumerate(chords):
        base = t + ci * 4 * BEAT
        # bass: root on each beat (octave 2/3), bouncing
        for b in range(4):
            bt = base + b * BEAT
            bass_oct = 2 if b % 2 == 0 else 3
            add_st(tone(midi(m(root, bass_oct)), BEAT * 0.9, kind="tri",
                        vol=0.22, atk=0.005, dec=BEAT * 0.5, sustain=0.18), bt, pan=0.0)
        # pad: soft sine chord, low volume, whole 4 beats
        for nt in tones:
            add_st(tone(midi(m(nt, 4)), 4 * BEAT * 0.98, kind="sine", vol=0.05,
                        atk=0.04, dec=0.2, sustain=0.5), base, pan=0.0)
        # lead arpeggio: 8th notes, plucky square
        pat = arp_patterns[(cyc + ci) % len(arp_patterns)]
        sparkle = (cyc % 4 == 3)
        for k, deg in enumerate(pat):
            nt = tones[deg % 3]
            octv = 5 + (1 if deg >= 3 else 0) + (1 if sparkle else 0)
            at = base + k * (BEAT / 2)
            lead = tone(midi(m(nt, octv)), BEAT / 2 * 0.95, kind="square", vol=0.16,
                        atk=0.004, dec=BEAT / 2 * 0.8, vib=0.004)
            add_st(lead, at, pan=(-0.25 if k % 2 == 0 else 0.25))
        # a chime accent on the downbeat of each chord
        add_st(tone(midi(m(tones[0], 6)), BEAT * 0.6, kind="sine", vol=0.07, atk=0.002,
                    dec=BEAT * 0.5), base, pan=0.15)
        # drums
        for b in range(4):
            bt = base + b * BEAT
            if b in (0, 2):
                add_st(kick(), bt, pan=0)
            if b in (1, 3):
                add_st(snare(), bt, pan=0)
            add_st(hat(), bt, pan=-0.3)
            add_st(hat(vol=0.10), bt + BEAT / 2, pan=0.3)
    t += cycle_dur
    cyc += 1

left = left[:total_n]
right = right[:total_n]

# master: gentle soft clip + normalize + fades
def master(x):
    x = np.tanh(x * 1.1)
    peak = np.max(np.abs(x)) or 1.0
    x = x / peak * 0.82
    fi = int(0.8 * SR)
    fo = int(2.2 * SR)
    x[:fi] *= np.linspace(0, 1, fi)
    x[-fo:] *= np.linspace(1, 0, fo)
    return x

left = master(left)
right = master(right)
stereo = np.empty((total_n, 2), dtype=np.float32)
stereo[:, 0] = left
stereo[:, 1] = right
pcm = (stereo * 32767).astype(np.int16)

with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

print(f"music.wav: {DUR:.1f}s, {os.path.getsize(OUT)/1e6:.2f} MB")
