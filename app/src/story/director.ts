/**
 * The Director turns the engine's event stream into a storyboard.
 *
 * Shot grammar per research meeting:
 *   title card  ->  WIDE: everyone walks to the round table
 *   WIDE: the proposer thinks (whiteboard / archive / miner)
 *   VN:   the hypothesis, two portraits facing each other
 *   WIDE: each reviewer walks to their station and acts it out
 *   REVEAL: the backtest card draws its equity curve
 *   VN:   risk and skeptic arguments
 *   CUT-IN: the verdict stamp (+ gacha reveal on adoption)
 *   WIDE: reactions, then everyone goes back to their desks
 *
 * Events are queued and played in order; when the queue backs up, beats
 * shorten so the story never falls far behind the lab.
 */
import { HOME, MEETING, ORDER, SPOTS, faceOf } from "../lib/cast";
import { sfx } from "../lib/sfx";
import { useStore, type EpisodeView } from "../lib/store";
import type { Beat, CharId, LabEvent, Stage } from "../lib/types";
import { world } from "../stage/world";

const VN_BG: Record<string, string> = {
  proposal: "vn-room", thinking: "vn-room", signal: "vn-room", integrity: "vn-room", parse: "vn-room",
  backtest: "vn-screens", risk: "vn-council", skeptic: "vn-council", verdict: "vn-council", end: "vn-rooftop",
  directive: "vn-room", chatter: "vn-room",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Director {
  queue: LabEvent[] = [];
  playing = false;
  skip: (() => void) | null = null;
  ctx = "room";
  cutKey = 0;

  push(ev: LabEvent) {
    // state-only events apply immediately
    if (ev.type === "status" || ev.type === "hello") {
      const st = ev.type === "hello" ? ev.status : { ...ev };
      delete (st as any).type;
      useStore.getState().set({ status: st as any });
      return;
    }
    if (ev.type === "fund" || ev.type === "paper") {
      useStore.getState().set({ dataVersion: useStore.getState().dataVersion + 1 });
      return;
    }
    if (ev.type === "chatter" && this.queue.length > 2) return; // chatter is filler; drop when busy
    this.queue.push(ev);
    if (this.queue.length > 60) this.trim();
    useStore.getState().set({ backlog: this.queue.length });
    if (!this.playing) void this.run();
  }

  /** Replay a stored meeting (events as recorded by the engine). */
  replay(events: LabEvent[]) {
    this.queue = [];
    for (const ev of events) this.push({ ...ev, replay: true });
  }

  /** Way behind (e.g. the tab sat in the background): jump to the newest meeting. */
  private trim() {
    let start = -1;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].type === "episode_start") {
        start = i;
        break;
      }
    }
    this.queue = start > 0 ? this.queue.slice(start) : this.queue.slice(-30);
    useStore.getState().set({ dataVersion: useStore.getState().dataVersion + 1 });
  }

  advance() {
    this.skip?.();
  }

  get speed() {
    const n = this.queue.length;
    return n > 30 ? 0.3 : n > 14 ? 0.55 : 1;
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        this.skip = null;
        resolve();
      }, ms * this.speed);
      this.skip = () => {
        window.clearTimeout(id);
        this.skip = null;
        resolve();
      };
    });
  }

  private async run() {
    this.playing = true;
    while (this.queue.length) {
      const ev = this.queue.shift()!;
      useStore.getState().set({ backlog: this.queue.length });
      try {
        await this.play(ev);
      } catch (e) {
        console.error("director", e);
      }
    }
    this.playing = false;
  }

  private ep(patch: Partial<EpisodeView>) {
    const cur = useStore.getState().episode;
    useStore.getState().set({ episode: { ...(cur ?? { n: 0, source: "", stages: {} }), ...patch } });
  }

  private async gather(timeout = 3600) {
    world.lock("all", true);
    await Promise.race([
      Promise.all(ORDER.map((id) => new Promise<void>((res) => world.goto(id, MEETING[id], { onArrive: res, run: this.speed < 1 })))),
      sleep(timeout * this.speed),
    ]);
  }

  private async play(ev: LabEvent) {
    const S = useStore.getState();
    switch (ev.type) {
      case "episode_start": {
        this.ep({ n: ev.episode ?? 0, source: ev.source, stages: {}, candidate: undefined, verdict: undefined, tier: undefined, trial: undefined, mining: undefined });
        S.set({ titleCard: { n: ev.episode ?? 0, source: ev.source, key: Date.now() } });
        sfx.whoosh();
        await this.wait(2300);
        S.set({ titleCard: null });
        this.ctx = "proposal";
        await this.gather();
        await this.beats(ev.beats);
        return;
      }
      case "thinking": {
        const who: CharId = ev.source === "miner" ? "ren" : "akari";
        const spot = ev.source === "miner" ? HOME.ren : ev.source === "library" ? SPOTS.shelf : SPOTS.whiteboard;
        world.goto(who, spot, { then: ev.source === "miner" ? "type" : ev.source === "library" ? "read" : "think" });
        world.lock(ORDER.filter((c) => c !== who), false);
        this.ctx = "thinking";
        await this.beats(ev.beats);
        return;
      }
      case "mining": {
        this.ep({ mining: { generation: ev.generation, fitness: ev.fitness, expr: ev.expr } });
        await this.beats(ev.beats, 1400);
        return;
      }
      case "proposal": {
        this.ep({ candidate: ev.candidate });
        this.ctx = "proposal";
        world.lock("all", true);
        world.goto("akari", SPOTS.whiteboard, { then: "present" });
        await this.beats(ev.beats);
        return;
      }
      case "stage": {
        const st: Stage = ev.stage;
        const cur = useStore.getState().episode;
        this.ep({ stages: { ...(cur?.stages ?? {}), [st.key]: st } });
        this.ctx = st.key;
        await this.choreograph(st);
        await this.beats(ev.beats, undefined, st);
        return;
      }
      case "episode_end": {
        this.ep({ verdict: ev.verdict, tier: ev.tier, trial: ev.trial });
        this.ctx = "end";
        if (ev.verdict === "promote") {
          S.set({ gacha: { tier: ev.tier, title: S.lang === "zh" ? ev.title_zh || ev.expr : ev.title_en || ev.expr, expr: ev.expr, post: ev.posterior?.mean, sharpe: ev.sharpe, trial: ev.trial, key: Date.now() } });
          await this.wait(4200);
          S.set({ gacha: null });
        }
        S.set({ vn: null });
        await this.beats(ev.beats);
        S.set({ dataVersion: S.dataVersion + 1 });
        await this.wait(1200);
        world.lock("all", false);
        ORDER.forEach((id, i) => window.setTimeout(() => world.home(id, id === "ren" ? "type" : id === "iori" ? "read" : "idle"), i * 250));
        return;
      }
      case "chatter": {
        if (useStore.getState().vn) return;
        this.ctx = "chatter";
        await this.beats(ev.beats);
        return;
      }
      case "directive":
      case "interaction": {
        this.ctx = "directive";
        const beats = (ev.beats ?? []).map((b) => ({ ...b, shot: "wide" as const }));
        await this.beats(beats, 2200);
        return;
      }
      case "error": {
        console.warn("lab error", ev.message);
        return;
      }
    }
  }

  private async choreograph(st: Stage) {
    const fail = st.status === "fail";
    switch (st.key) {
      case "parse":
        world.goto("ren", HOME.ren, { then: fail ? "angry" : "type" });
        break;
      case "integrity":
        world.goto("shiori", SPOTS.rack, { then: fail ? "shock" : "sig" });
        await this.wait(900);
        break;
      case "signal":
        world.goto("akari", SPOTS.whiteboard, { then: "present" });
        break;
      case "backtest":
        world.goto("ren", HOME.ren, { then: "type" });
        await this.wait(700);
        break;
      case "risk":
        world.goto("saki", HOME.saki, { then: fail ? "sig" : "write" });
        await this.wait(700);
        if (fail) {
          sfx.stamp();
          useStore.getState().set({ shake: useStore.getState().shake + 1 });
        }
        break;
      case "skeptic":
        world.goto("iori", SPOTS.shelf, { then: "sig" });
        await this.wait(700);
        break;
      case "verdict":
        useStore.getState().set({ vn: null });
        await this.gather(2600);
        break;
    }
  }

  private async beats(beats: Beat[] | undefined, minMs?: number, st?: Stage) {
    for (const b of beats ?? []) await this.beat(b, minMs, st);
  }

  private async beat(b: Beat, minMs?: number, st?: Stage) {
    const S = useStore.getState();
    const text = b[S.lang] || b.zh;
    const readMs = Math.min(7000, Math.max(minMs ?? 1900, 900 + text.length * (S.lang === "zh" ? 95 : 42)));
    S.set({ beat: b, beatKey: S.beatKey + 1 });

    if (b.shot === "wide") {
      if (S.vn) S.set({ vn: null });
      world.setAct(b.who, b.act, readMs + 600);
      world.emote(b.who, b.emote, Math.min(readMs, 3000));
      world.say(b.who, text, readMs + 300);
      if (b.emote) sfx.pop();
      await this.wait(readMs);
      return;
    }

    if (b.shot === "vn") {
      this.enterVN(b);
      world.setAct(b.who, b.act, readMs);
      await this.wait(readMs + 300);
      return;
    }

    if (b.shot === "reveal") {
      const stage = st ?? useStore.getState().episode?.stages.backtest;
      S.set({ vn: null, reveal: stage ?? null });
      sfx.sparkle();
      world.setAct(b.who, b.act, readMs);
      await this.wait(Math.max(readMs, 4600));
      S.set({ reveal: null });
      return;
    }

    if (b.shot === "cutin") {
      S.set({ vn: null });
      const cand = useStore.getState().episode?.candidate;
      sfx.whoosh();
      S.set({ cutin: { who: b.who, stamp: b.stamp ?? "reject", tier: b.tier, title: cand ? (S.lang === "zh" ? cand.title_zh : cand.title_en) || cand.expr : "", key: ++this.cutKey } });
      window.setTimeout(() => {
        sfx.stamp();
        useStore.getState().set({ shake: useStore.getState().shake + 1 });
        if (b.stamp === "adopt") sfx.fanfare();
        if (b.stamp === "reject") window.setTimeout(sfx.sad, 400);
      }, 1050 * this.speed);
      world.setAct(b.who, b.act, readMs + 2000);
      await this.wait(Math.max(readMs, 3200) + 600);
      S.set({ cutin: null });
    }
  }

  private enterVN(b: Beat) {
    const S = useStore.getState();
    const cur = S.vn;
    const bg = VN_BG[this.ctx] ?? "vn-room";
    const slot = { who: b.who, face: faceOf(b.face) };
    let left = cur?.left;
    let right = cur?.right;
    if (left?.who === b.who) left = slot;
    else if (right?.who === b.who) right = slot;
    else if (!left) left = slot;
    else right = slot;
    S.set({ vn: { left, right, speaker: b.who, bg } });
  }
}

export const director = new Director();

if (import.meta.env.DEV) (window as any).__director = director;
