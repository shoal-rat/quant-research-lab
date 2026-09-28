/** Tiny synthesized sound kit (WebAudio) — no audio files to ship. */
import { useStore } from "./store";

let ctx: AudioContext | null = null;
const ac = () => {
  if (!ctx) {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
};

function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.08, when = 0, slide = 0) {
  if (useStore.getState().muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.2, lp = 800, when = 0) {
  if (useStore.getState().muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + when;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const s = a.createBufferSource();
  s.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lp;
  const g = a.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start(t0);
}

export const sfx = {
  unlock: () => ac(),
  blip: (pitch = 1) => tone(520 * pitch + Math.random() * 40, 0.045, "square", 0.018),
  pop: () => tone(880, 0.09, "sine", 0.06, 0, 1.6),
  click: () => tone(1200, 0.04, "triangle", 0.04),
  whoosh: () => noise(0.35, 0.18, 2400),
  stamp: () => {
    noise(0.25, 0.5, 300);
    tone(90, 0.25, "sine", 0.25, 0, 0.5);
  },
  sparkle: () => [1320, 1760, 2349, 2637].forEach((f, i) => tone(f, 0.25, "sine", 0.05, i * 0.07)),
  fanfare: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, "triangle", 0.07, i * 0.1)),
  sad: () => [392, 349, 311].forEach((f, i) => tone(f, 0.3, "triangle", 0.05, i * 0.16)),
  pat: () => [988, 1318].forEach((f, i) => tone(f, 0.12, "sine", 0.06, i * 0.08)),
  bonk: () => {
    tone(300, 0.08, "square", 0.08, 0, 2.2);
    tone(1500, 0.12, "square", 0.04, 0.05, 0.6);
  },
};
