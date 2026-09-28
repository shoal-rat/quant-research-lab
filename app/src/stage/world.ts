/**
 * The chibi world: an imperative 60 fps engine for the six SD characters.
 *
 * React renders one container per character once; this engine moves those
 * containers every animation frame (no React re-render per frame). Movement
 * is a hop-walk along a path found on a small visibility graph that routes
 * around furniture; sprites swap between two walk frames per direction.
 */
import { create } from "zustand";
import { ACT_POSE, HOME, NODES, OBSTACLES, ORDER, WANDER, WORLD, type Pt } from "../lib/cast";
import type { Act, CharId, Emote } from "../lib/types";

type Facing = "front" | "back" | "left" | "right";

interface Entity {
  id: CharId;
  x: number;
  y: number;
  path: Pt[];
  speed: number;
  facing: Facing;
  act: Act;
  actUntil: number;
  phase: number;
  locked: boolean;
  wanderAt: number;
  onArrive?: () => void;
  afterAct?: Act;
  el?: HTMLDivElement | null;
  img?: HTMLImageElement | null;
  pose?: string;
  flip?: boolean;
}

// ---------------------------------------------------------------- UI overlay state
interface WorldUI {
  bubbles: Partial<Record<CharId, { text: string; key: number }>>;
  emotes: Partial<Record<CharId, { emote: Emote; key: number }>>;
  menu: CharId | null;
  fx: { id: number; who: CharId; kind: "pat" | "bonk" }[];
  set: (p: Partial<WorldUI>) => void;
}
export const useWorldUI = create<WorldUI>((set) => ({ bubbles: {}, emotes: {}, menu: null, fx: [], set: (p) => set(p) }));

let sizes: Record<string, Record<string, [number, number]>> = {};
export const setSpriteSizes = (s: typeof sizes) => (sizes = s);

const BASE_H = 196; // on-floor chibi height (world px) at depth scale 1

export function depthScale(y: number) {
  const t = Math.min(1, Math.max(0, (y - WORLD.backY) / (WORLD.frontY - WORLD.backY)));
  return 0.78 + 0.34 * t;
}

// ---------------------------------------------------------------- geometry
function segHitsObstacle(a: Pt, b: Pt): boolean {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12);
  for (let i = 1; i < steps; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / steps;
    const y = a[1] + ((b[1] - a[1]) * i) / steps;
    if (inObstacle(x, y)) return true;
  }
  return false;
}

function inObstacle(x: number, y: number): boolean {
  for (const o of OBSTACLES) {
    const c = o.c;
    if (o.kind === "ellipse") {
      if (((x - c[0]) / c[2]) ** 2 + ((y - c[1]) / c[3]) ** 2 < 1) return true;
    } else if (x > c[0] && x < c[2] && y > c[1] && y < c[3]) return true;
  }
  return false;
}

export function findPath(from: Pt, to: Pt): Pt[] {
  if (!segHitsObstacle(from, to)) return [to];
  const pts: Pt[] = [from, to, ...NODES];
  const n = pts.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    if (u === 1) break;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      if (segHitsObstacle(pts[u], pts[v])) continue;
      const d = dist[u] + Math.hypot(pts[u][0] - pts[v][0], pts[u][1] - pts[v][1]);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  if (prev[1] < 0) return [to];
  const path: Pt[] = [];
  for (let v = 1; v > 0; v = prev[v]) path.unshift(pts[v]);
  return path;
}

// ---------------------------------------------------------------- engine
class World {
  e: Record<CharId, Entity>;
  raf = 0;
  last = 0;
  bubbleSeq = 0;

  constructor() {
    this.e = {} as Record<CharId, Entity>;
    ORDER.forEach((id, i) => {
      const [x, y] = HOME[id];
      this.e[id] = {
        id, x, y, path: [], speed: 150, facing: "front", act: "idle", actUntil: 0, phase: i,
        locked: false, wanderAt: performance.now() + 4000 + i * 1500,
      };
    });
  }

  attach(id: CharId, el: HTMLDivElement | null, img: HTMLImageElement | null) {
    this.e[id].el = el;
    this.e[id].img = img;
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.tick(dt, t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // ------------------------------------------------------------ commands
  goto(id: CharId, to: Pt, opts: { then?: Act; onArrive?: () => void; run?: boolean } = {}) {
    const en = this.e[id];
    en.path = findPath([en.x, en.y], to);
    en.speed = opts.run ? 260 : 150;
    en.act = "idle";
    en.actUntil = 0;
    en.afterAct = opts.then;
    en.onArrive = opts.onArrive;
  }

  setAct(id: CharId, act: Act, ms = 0) {
    const en = this.e[id];
    en.act = act;
    en.actUntil = ms ? performance.now() + ms : 0;
    if (act !== "idle") en.facing = "front";
  }

  lock(ids: CharId[] | "all", on: boolean) {
    (ids === "all" ? ORDER : ids).forEach((id) => {
      this.e[id].locked = on;
      if (!on) this.e[id].wanderAt = performance.now() + 3000 + Math.random() * 5000;
    });
  }

  home(id: CharId, then: Act = "idle") {
    this.goto(id, HOME[id], { then });
  }

  isMoving(id: CharId) {
    return this.e[id].path.length > 0;
  }

  pos(id: CharId): Pt {
    return [this.e[id].x, this.e[id].y];
  }

  say(id: CharId, text: string, ms = 3500) {
    const key = ++this.bubbleSeq;
    const ui = useWorldUI.getState();
    ui.set({ bubbles: { ...ui.bubbles, [id]: { text, key } } });
    window.setTimeout(() => {
      const cur = useWorldUI.getState().bubbles[id];
      if (cur?.key === key) {
        const b = { ...useWorldUI.getState().bubbles };
        delete b[id];
        useWorldUI.getState().set({ bubbles: b });
      }
    }, ms);
  }

  emote(id: CharId, emote: Emote | null | undefined, ms = 2600) {
    if (!emote) return;
    const key = ++this.bubbleSeq;
    const ui = useWorldUI.getState();
    ui.set({ emotes: { ...ui.emotes, [id]: { emote, key } } });
    window.setTimeout(() => {
      const cur = useWorldUI.getState().emotes[id];
      if (cur?.key === key) {
        const e = { ...useWorldUI.getState().emotes };
        delete e[id];
        useWorldUI.getState().set({ emotes: e });
      }
    }, ms);
  }

  // ------------------------------------------------------------ simulation
  tick(dt: number, now: number) {
    for (const id of ORDER) {
      const en = this.e[id];
      if (en.path.length) {
        const [tx, ty] = en.path[0];
        const dx = tx - en.x;
        const dy = ty - en.y;
        const d = Math.hypot(dx, dy);
        const step = en.speed * dt * (0.75 + 0.5 * depthScale(en.y));
        if (d <= step) {
          en.x = tx;
          en.y = ty;
          en.path.shift();
          if (!en.path.length) {
            en.facing = "front";
            if (en.afterAct) {
              en.act = en.afterAct;
              en.afterAct = undefined;
            }
            const cb = en.onArrive;
            en.onArrive = undefined;
            cb?.();
          }
        } else {
          en.x += (dx / d) * step;
          en.y += (dy / d) * step;
          en.facing = Math.abs(dx) > Math.abs(dy) * 0.9 ? (dx < 0 ? "left" : "right") : dy > 0 ? "front" : "back";
        }
        en.phase += dt * 9;
      } else {
        if (en.actUntil && now > en.actUntil) {
          en.act = "idle";
          en.actUntil = 0;
        }
        if (!en.locked && en.act === "idle" && now > en.wanderAt) this.idleBehavior(en, now);
      }
      this.render(en, now);
    }
  }

  idleBehavior(en: Entity, now: number) {
    en.wanderAt = now + 6000 + Math.random() * 9000;
    const r = Math.random();
    if (r < 0.45) {
      const t = WANDER[Math.floor(Math.random() * WANDER.length)];
      this.goto(en.id, t, { then: Math.random() < 0.3 ? "think" : undefined });
    } else if (r < 0.62) {
      this.goto(en.id, HOME[en.id], { then: en.id === "ren" ? "type" : en.id === "iori" ? "read" : "write" });
    } else if (r < 0.75) {
      this.goto(en.id, [235 + Math.random() * 40, 548 + Math.random() * 30], { then: "drink" });
    } else {
      const acts: Act[] = en.id === "ren" ? ["sig", "type", "drink"] : ["think", "read", "write", "drink"];
      this.setAct(en.id, acts[Math.floor(Math.random() * acts.length)], 5000 + Math.random() * 4000);
      if (en.id === "ren" && en.act === "sig") this.emote(en.id, "zzz", 5000);
    }
  }

  render(en: Entity, now: number) {
    if (!en.el || !en.img) return;
    const moving = en.path.length > 0;
    let pose: string;
    let flip = false;
    if (moving) {
      const f = Math.floor(en.phase / Math.PI) % 2 === 0 ? 1 : 2;
      if (en.facing === "back") pose = `back_walk${f}`;
      else if (en.facing === "left" || en.facing === "right") {
        pose = `side_walk${f}`;
        flip = en.facing === "right";
      } else pose = `walk${f}`;
    } else {
      pose = en.act === "idle" && en.facing === "back" ? "back" : ACT_POSE[en.act] ?? "idle";
    }
    const s = depthScale(en.y);
    const k = (BASE_H * s) / 360;
    if (pose !== en.pose) {
      en.pose = pose;
      en.img.src = `/art/chibi/${en.id}/${pose}.webp`;
      const sz = sizes[en.id]?.[pose];
      if (sz) {
        en.img.style.width = `${sz[0]}px`;
        en.img.style.height = `${sz[1]}px`;
        en.img.style.marginLeft = `${-sz[0] / 2}px`;
        en.img.style.marginTop = `${-sz[1]}px`;
      }
    }
    const hop = moving ? Math.abs(Math.sin(en.phase)) * 11 * s : 0;
    const breathe = moving ? 1 : 1 + 0.014 * Math.sin(now / 420 + en.phase);
    const squash = moving ? 1 - 0.05 * Math.cos(en.phase * 2) : breathe;
    en.el.style.transform = `translate3d(${en.x}px, ${en.y}px, 0)`;
    en.el.style.zIndex = String(Math.round(en.y));
    en.el.style.setProperty("--h", `${BASE_H * s}px`);
    en.el.style.setProperty("--s", String(s));
    en.el.style.setProperty("--hop", `${hop}px`);
    en.img.style.transform = `translateY(${-hop}px) scale(${(flip ? -1 : 1) * k}, ${k * squash})`;
  }
}

export const world = new World();
