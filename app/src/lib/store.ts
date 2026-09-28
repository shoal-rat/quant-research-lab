import { create } from "zustand";
import type { Beat, CandidateData, CharId, Face, Lang, Stage, Status, Tier } from "./types";

export type Tab = "room" | "dex" | "fund" | "log" | "theory" | "settings";

export interface EpisodeView {
  n: number;
  source: string;
  candidate?: CandidateData;
  stages: Partial<Record<Stage["key"], Stage>>;
  verdict?: string;
  tier?: Tier;
  trial?: string;
  mining?: { generation: number; fitness: number; expr: string };
}

export interface VNState {
  left?: { who: CharId; face: Face };
  right?: { who: CharId; face: Face };
  speaker?: CharId;
  bg: string;
}

export interface CutIn {
  who: CharId;
  stamp: "adopt" | "reserve" | "reject";
  tier?: Tier;
  title?: string;
  key: number;
}

export interface Gacha {
  tier: Tier;
  title: string;
  expr: string;
  post?: number;
  sharpe?: number;
  trial?: string;
  key: number;
}

interface S {
  conn: boolean;
  status: Status | null;
  lang: Lang;
  tab: Tab;
  entered: boolean;
  muted: boolean;
  tearsheet: string | null;
  profile: CharId | null;
  episode: EpisodeView | null;
  beat: Beat | null;
  beatKey: number;
  vn: VNState | null;
  reveal: Stage | null;
  cutin: CutIn | null;
  gacha: Gacha | null;
  titleCard: { n: number; source: string; key: number } | null;
  shake: number;
  dataVersion: number;
  backlog: number;
  set: (p: Partial<S>) => void;
}

const savedLang = (() => {
  try {
    return (localStorage.getItem("qrl.lang") as Lang) || "zh";
  } catch {
    return "zh" as Lang;
  }
})();

export const useStore = create<S>((set) => ({
  conn: false,
  status: null,
  lang: savedLang,
  tab: "room",
  entered: false,
  muted: false,
  tearsheet: null,
  profile: null,
  episode: null,
  beat: null,
  beatKey: 0,
  vn: null,
  reveal: null,
  cutin: null,
  gacha: null,
  titleCard: null,
  shake: 0,
  dataVersion: 0,
  backlog: 0,
  set: (p) => set(p),
}));

export const setLang = (lang: Lang) => {
  try {
    localStorage.setItem("qrl.lang", lang);
  } catch {
    /* storage may be blocked */
  }
  useStore.getState().set({ lang });
};

export const line = (b: { zh: string; en: string } | null | undefined, lang: Lang) => (b ? b[lang] || b.zh : "");

if (import.meta.env.DEV) (window as any).__qrl = useStore;
