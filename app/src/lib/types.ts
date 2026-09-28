export type CharId = "akari" | "shiori" | "ren" | "saki" | "iori" | "mio";
export type Lang = "zh" | "en";
export type Face = "base" | "joy" | "angry" | "shock" | "sad" | "special";
export type Act =
  | "idle" | "think" | "write" | "present" | "drink" | "read" | "type" | "sig"
  | "joy" | "angry" | "cry" | "shock" | "blush" | "dizzy" | "victory";
export type Emote = "!" | "?" | "anger" | "sweat" | "sparkle" | "heart" | "zzz" | "note" | "idea" | "gloom";
export type Shot = "wide" | "vn" | "reveal" | "cutin";
export type Tier = "N" | "R" | "SR" | "SSR";

export interface Beat {
  who: CharId;
  zh: string;
  en: string;
  face: Face;
  act: Act;
  emote?: Emote | null;
  shot: Shot;
  card?: string;
  stamp?: "adopt" | "reserve" | "reject";
  tier?: Tier;
}

export interface Stage {
  key: "parse" | "integrity" | "signal" | "backtest" | "risk" | "skeptic" | "verdict";
  agent: CharId;
  status: string;
  [k: string]: any;
}

export interface CandidateData {
  expr: string;
  universe: string;
  mode: string | null;
  family: string | null;
  mechanism: string;
  title_zh: string;
  title_en: string;
  thesis_zh: string;
  thesis_en: string;
  source: string;
}

export interface LabEvent {
  type: string;
  episode?: number;
  beats?: Beat[];
  t?: number;
  [k: string]: any;
}

export interface Status {
  running: boolean;
  busy: boolean;
  episode: number;
  pulls: number;
  promoted: number;
  brain: { backends: string[]; benched: Record<string, number>; last_backend: string | null; last_error: string | null; calls: number };
  settings: Record<string, any>;
  club: Record<CharId, { affection: number; pats: number; bonks: number }>;
  strictness: number;
  directives: string[];
  data: Record<string, boolean>;
  data_status: Record<string, any>;
}

export interface TrialSlim {
  id: string;
  created: number;
  episode: number | null;
  expr: string;
  canonical: string;
  universe: string;
  mode: string;
  family: string | null;
  mechanism: string;
  source: string;
  title_zh: string;
  title_en: string;
  thesis_zh: string;
  thesis_en: string;
  sr: number | null;
  sr_train: number | null;
  sr_valid: number | null;
  post_mean: number | null;
  post_sd: number | null;
  dsr: number | null;
  verdict: string;
  tier: Tier;
  status: string;
  equity?: [string, number][];
  max_dd?: number;
  cagr?: number;
  promoted_at?: number | null;
}
