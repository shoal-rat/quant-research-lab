import type { Act, CharId, Face } from "./types";

export const ORDER: CharId[] = ["akari", "shiori", "ren", "saki", "iori", "mio"];

export const CAST: Record<CharId, {
  zh: string; en: string; shortZh: string; shortEn: string; roleZh: string; roleEn: string;
  color: string; pitch: number; mottoZh: string; mottoEn: string;
}> = {
  akari: { zh: "星野灯", en: "Hoshino Akari", shortZh: "灯", shortEn: "Akari", roleZh: "假说研究员", roleEn: "Hypothesis", color: "#ff8a3d", pitch: 1.25, mottoZh: "我有个假说！", mottoEn: "I've got a hypothesis!" },
  shiori: { zh: "白石栞", en: "Shiraishi Shiori", shortZh: "栞", shortEn: "Shiori", roleZh: "数据管理员", roleEn: "Data Keeper", color: "#a78bfa", pitch: 1.1, mottoZh: "……这条数据，来自未来。", mottoEn: "...This data is from the future." },
  ren: { zh: "九条莲", en: "Kujo Ren", shortZh: "莲", shortEn: "Ren", roleZh: "回测工程师", roleEn: "Backtest Engineer", color: "#3b82f6", pitch: 0.8, mottoZh: "跑完了。……我去睡了。", mottoEn: "It ran. ...I'm going to sleep." },
  saki: { zh: "绯村纱季", en: "Himura Saki", shortZh: "纱季", shortEn: "Saki", roleZh: "风控官", roleEn: "Risk Officer", color: "#ef4444", pitch: 1.05, mottoZh: "成本！你算成本了吗！", mottoEn: "Costs! Did you count the costs?!" },
  iori: { zh: "黑羽伊织", en: "Kurobane Iori", shortZh: "伊织", shortEn: "Iori", roleZh: "统计审查官", roleEn: "Statistics Skeptic", color: "#d4a017", pitch: 0.7, mottoZh: "多重检验的诅咒……", mottoEn: "The curse of multiple testing..." },
  mio: { zh: "水无月澪", en: "Minazuki Mio", shortZh: "澪", shortEn: "Mio", roleZh: "部长 · 组合经理", roleEn: "President · PM", color: "#14b8a6", pitch: 0.95, mottoZh: "数字不会说谎——但会撒娇。", mottoEn: "Numbers don't lie — but they flirt." },
};

export const art = {
  chibi: (c: CharId, pose: string) => `/art/chibi/${c}/${pose}.webp`,
  portrait: (c: CharId, face: Face) => `/art/portrait/${c}/${face}.webp`,
  avatar: (c: CharId) => `/art/avatar/${c}.webp`,
  bg: (name: string) => `/art/bg/${name}.webp`,
};

/** chibi action -> sprite name */
export const ACT_POSE: Record<Act, string> = {
  idle: "idle", think: "think", write: "write", present: "present", drink: "drink", read: "read",
  type: "type", sig: "sig", joy: "joy", angry: "angry", cry: "cry", shock: "shock", blush: "blush",
  dizzy: "dizzy", victory: "victory",
};

// ------------------------------------------------------------ the club room
// Coordinates are in the background image's pixel space (1536 x 1024).
export const WORLD = { w: 1536, h: 1024, backY: 400, frontY: 960 };

export type Pt = [number, number];

export const HOME: Record<CharId, Pt> = {
  saki: [455, 452],
  ren: [772, 452],
  mio: [1085, 440],
  shiori: [270, 470],
  akari: [610, 560],
  iori: [1352, 462],
};

export const SPOTS = {
  coffee: [235, 548] as Pt,
  whiteboard: [640, 470] as Pt,
  rack: [262, 455] as Pt,
  shelf: [1352, 462] as Pt,
  window: [1250, 420] as Pt,
  rug: [560, 790] as Pt,
  sofa: [300, 640] as Pt,
};

/** Around the round table (front and sides only — the table would hide anyone behind it). */
export const MEETING: Record<CharId, Pt> = {
  mio: [872, 640],
  akari: [965, 772],
  shiori: [1095, 805],
  ren: [1225, 798],
  saki: [1345, 745],
  iori: [800, 752],
};

/** Walk-around targets for idle wandering. */
export const WANDER: Pt[] = [
  [430, 520], [560, 500], [700, 520], [840, 470], [480, 640], [640, 660], [780, 620],
  [420, 780], [700, 800], [860, 880], [1000, 900], [1180, 900], [1330, 860], [560, 900],
];

/** Obstacles as ellipses [cx, cy, rx, ry] or rects [x0, y0, x1, y1] tagged by kind. */
export const OBSTACLES: ({ kind: "ellipse"; c: [number, number, number, number] } | { kind: "rect"; c: [number, number, number, number] })[] = [
  { kind: "ellipse", c: [1150, 560, 250, 140] }, // round table + chairs
  { kind: "rect", c: [0, 585, 345, 1024] }, // sofa
  { kind: "rect", c: [205, 715, 520, 880] }, // coffee table
  { kind: "rect", c: [1415, 510, 1536, 1024] }, // right cabinet
  { kind: "rect", c: [0, 0, 1536, 395] }, // back wall + desks
  { kind: "rect", c: [0, 0, 185, 600] }, // coffee counter / rack
];

/** Corridor nodes for path-finding around obstacles. */
export const NODES: Pt[] = [
  [600, 470], [880, 450], [860, 560], [820, 700], [900, 860], [1150, 880], [1390, 860],
  [1395, 700], [1400, 450], [540, 640], [400, 560], [260, 560], [620, 900], [380, 950],
];

export const faceOf = (f: string | undefined): Face =>
  (["base", "joy", "angry", "shock", "sad", "special"].includes(f ?? "") ? f : "base") as Face;
