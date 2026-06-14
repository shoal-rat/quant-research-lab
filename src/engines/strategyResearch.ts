import { CompiledSignal, FactorKind, HoldingPeriod, PortfolioType, ResearchBrain, ResearchDiscoveryCard } from "../types";
import { normalizeSourceCitation, sourceCredibility } from "./researchWorkflow";
import { FamilyParameter, getAllFamilies, StrategyFamily } from "./strategyKnowledge";

// Asks the connected agent (via the bridge) to read the web — papers, news,
// institution reports — for new price-based strategy families, then normalizes
// whatever it returns into full StrategyFamily records the desk can use.

const FACTOR_KINDS: FactorKind[] = [
  "news_sentiment",
  "momentum",
  "mean_reversion",
  "low_volatility",
  "event_drift",
  "quality_proxy",
  "seasonality",
  "lead_lag",
  "pairs",
  "vol_managed",
  "earnings_revision",
  "trend_overlay"
];

const HOLDINGS: HoldingPeriod[] = [1, 3, 5, 20];

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugKey(raw: unknown, name: string): string {
  const base = (typeof raw === "string" && raw ? raw : name) || "discovered";
  return base
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "discovered";
}

function normalizeParameters(raw: unknown): FamilyParameter[] {
  const list = Array.isArray(raw) ? raw : [];
  const params: FamilyParameter[] = [];
  for (const item of list.slice(0, 6)) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    if (typeof p.name !== "string" || !p.name) continue;
    const min = num(p.min, 0);
    const max = num(p.max, Math.max(min + 1, 1));
    const def = Math.min(Math.max(num(p.default, (min + max) / 2), min), max);
    const step = Math.max(num(p.step, (max - min) / 10 || 1), 1e-6);
    params.push({ name: p.name.slice(0, 32), min, max: Math.max(max, min), default: def, step });
  }
  if (params.length === 0) {
    params.push({ name: "lookbackDays", min: 20, max: 250, default: 120, step: 10 });
  }
  return params;
}

function asStringArray(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string" && value.length > 0).map((value) => value.slice(0, 200)).slice(0, limit);
}

function readField(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function textField(record: Record<string, unknown>, fallback: string, ...keys: string[]): string {
  const value = readField(record, ...keys);
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 500) : fallback;
}

function normalizeDiscoveryCard(
  raw: Record<string, unknown>,
  fallback: {
    name: string;
    rationale: string;
    construction: string;
    signalSpec: string;
    holdingPeriods: HoldingPeriod[];
    failureModes: string[];
    references: string[];
  }
): ResearchDiscoveryCard {
  const cardRaw = readField(raw, "discoveryCard", "discovery_card", "hypothesisCard", "hypothesis_card");
  const card = cardRaw && typeof cardRaw === "object" ? (cardRaw as Record<string, unknown>) : raw;
  const sourcesRaw = readField(card, "sourceCitations", "source_citations", "sources", "citations", "references");
  const references = Array.isArray(sourcesRaw) && sourcesRaw.length > 0 ? sourcesRaw : fallback.references;
  const requiredData = asStringArray(readField(card, "requiredData", "required_data", "data"), 8);
  const failureRisks = asStringArray(readField(card, "failureRisks", "failure_risks", "risks", "failureModes"), 6);
  return {
    phenomenon: textField(card, fallback.name, "phenomenon", "theme", "observation"),
    whyAlphaMayExist: textField(card, fallback.rationale, "whyAlphaMayExist", "why_alpha_may_exist", "why", "rationale"),
    tradableUniverse: textField(card, "Cross-sectional equities", "tradableUniverse", "tradable_universe", "universe"),
    requiredData: requiredData.length > 0 ? requiredData : ["point-in-time prices", "tradable universe membership", "sector classification"],
    signalConstruction: textField(card, fallback.signalSpec || fallback.construction, "signalConstruction", "signal_construction", "construction"),
    timestampLag: textField(card, "1 trading bar", "timestampLag", "timestamp_lag", "lag"),
    holdingPeriod: textField(card, `${fallback.holdingPeriods[0] ?? 5} trading bars`, "holdingPeriod", "holding_period", "hold"),
    failureRisks: failureRisks.length > 0 ? failureRisks : fallback.failureModes,
    sourceCitations: references.slice(0, 8).map((source, index) => normalizeSourceCitation(source, `Research source ${index + 1}`))
  };
}

function normalizeCompiledSignal(
  raw: Record<string, unknown>,
  fallback: { signalSpec: string; construction: string; holdingPeriods: HoldingPeriod[]; portfolioType: PortfolioType }
): CompiledSignal {
  const compiledRaw = readField(raw, "compiledSignal", "compiled_signal", "signalCompiler", "signal_compiler");
  const compiled = compiledRaw && typeof compiledRaw === "object" ? (compiledRaw as Record<string, unknown>) : {};
  const portfolio = readField(compiled, "portfolio");
  return {
    universe: textField(compiled, "Cross-sectional equities", "universe"),
    feature: textField(compiled, fallback.signalSpec || fallback.construction, "feature"),
    rank: textField(compiled, "Rank feature cross-sectionally and trade the tails.", "rank"),
    lag: textField(compiled, "1 trading bar", "lag", "timestampLag"),
    hold: textField(compiled, `${fallback.holdingPeriods[0] ?? 5} trading bars`, "hold", "holdingPeriod"),
    portfolio: portfolio === "long_only" || portfolio === "long_short" ? portfolio : fallback.portfolioType,
    formula: textField(compiled, fallback.signalSpec || fallback.construction, "formula", "signal", "signalSpec"),
    rebalance: textField(compiled, `Every ${fallback.holdingPeriods[0] ?? 5} trading bars`, "rebalance")
  };
}

// Turn one agent-proposed family into a full, sane StrategyFamily, or null if it
// is unusable (no signal formula the kernel could implement).
export function normalizeResearchedFamily(raw: unknown, existingKeys: Set<string>): StrategyFamily | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" && r.name ? r.name.slice(0, 60) : null;
  const signalSpec = typeof r.signalSpec === "string" && r.signalSpec.trim().length >= 4 ? r.signalSpec.slice(0, 400) : null;
  if (!name || !signalSpec) return null;

  // resolve key collisions deterministically (suffix _2, _3, …) instead of a
  // single hashed attempt that could itself collide and silently drop the family
  let key = slugKey(r.key, name);
  if (existingKeys.has(key)) {
    let resolved = "";
    for (let suffix = 2; suffix <= 50; suffix += 1) {
      const candidate = `${key}_${suffix}`;
      if (!existingKeys.has(candidate)) {
        resolved = candidate;
        break;
      }
    }
    if (!resolved) return null;
    key = resolved;
  }

  const factorKind = FACTOR_KINDS.includes(r.factorKind as FactorKind) ? (r.factorKind as FactorKind) : "momentum";
  const rationaleKind = (["risk_premium", "behavioral", "structural"] as const).includes(r.rationaleKind as "risk_premium")
    ? (r.rationaleKind as "risk_premium" | "behavioral" | "structural")
    : "behavioral";
  const holdingPeriods = (Array.isArray(r.holdingPeriods) ? r.holdingPeriods : [])
    .map((value) => Number(value))
    .filter((value): value is HoldingPeriod => HOLDINGS.includes(value as HoldingPeriod));
  const netSharpeRaw = Array.isArray(r.netSharpe) ? (r.netSharpe as unknown[]) : [];
  const netLo = num(netSharpeRaw[0], 0.2);
  const netHi = Math.max(netLo, num(netSharpeRaw[1], 0.5));
  const references = asStringArray(r.references, 5);
  const fallbackFailureModes =
    asStringArray(r.failureModes, 4).length > 0
      ? asStringArray(r.failureModes, 4)
      : ["Newly discovered - out-of-sample behavior is unproven."];
  const normalizedHoldingPeriods: HoldingPeriod[] = holdingPeriods.length > 0 ? holdingPeriods : [5];
  const rationale = typeof r.rationale === "string" ? r.rationale.slice(0, 240) : "Discovered from the literature by the research agent.";
  const construction = typeof r.construction === "string" ? r.construction.slice(0, 240) : signalSpec;
  const discoveryCard = normalizeDiscoveryCard(r, {
    name,
    rationale,
    construction,
    signalSpec,
    holdingPeriods: normalizedHoldingPeriods,
    failureModes: fallbackFailureModes,
    references
  });
  const compiledSignal = normalizeCompiledSignal(r, {
    signalSpec,
    construction,
    holdingPeriods: normalizedHoldingPeriods,
    portfolioType: "long_short"
  });
  const credibility = sourceCredibility(discoveryCard.sourceCitations);

  return {
    key,
    name,
    factorKind,
    rationaleKind,
    rationale,
    construction,
    holdingPeriods: normalizedHoldingPeriods,
    grossSharpe: [Math.max(0.3, netLo + 0.2), netHi + 0.4],
    netSharpe: [Math.max(-0.2, netLo), Math.min(1.2, netHi)],
    costSensitivity: (["low", "medium", "high"] as const).includes(r.costSensitivity as "low") ? (r.costSensitivity as "low" | "medium" | "high") : "medium",
    crowdingRisk: (["low", "medium", "high"] as const).includes(r.crowdingRisk as "low") ? (r.crowdingRisk as "low" | "medium" | "high") : "medium",
    failureModes: asStringArray(r.failureModes, 4).length > 0 ? asStringArray(r.failureModes, 4) : ["Newly discovered — out-of-sample behavior is unproven."],
    parameters: normalizeParameters(r.parameters),
    keyPapers: asStringArray(r.keyPapers, 4),
    newsDriven: false,
    priceComputable: true,
    baseEdgeDaily: Math.max(0.0001, (netHi / 16) / 252),
    decayHalfLifeRuns: 8,
    origin: "researched",
    signalSpec,
    references,
    discoveryCard,
    compiledSignal,
    sourceCredibility: credibility,
    bridgeOnly: true
  };
}

export async function researchStrategiesViaBridge(
  bridgeUrl: string,
  brain: ResearchBrain,
  topic: string,
  timeoutMs = 720000 // web search + multiple fetches + reasoning is slow; give it 12 min
): Promise<StrategyFamily[]> {
  const backend = brain === "codex" ? "codex" : "claude-code";
  const existingKeys = new Set(getAllFamilies().map((family) => family.key));
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/research/strategies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ backend, topic, existingKeys: [...existingKeys] })
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { result?: { families?: unknown[] }; error?: string };
    const families = payload.result?.families;
    if (!Array.isArray(families)) return [];
    const seen = new Set(existingKeys);
    const out: StrategyFamily[] = [];
    for (const raw of families.slice(0, 4)) {
      const family = normalizeResearchedFamily(raw, seen);
      if (family) {
        seen.add(family.key);
        out.push(family);
      }
    }
    return out;
  } catch (error) {
    // a network failure, an abort/timeout, or a malformed JSON body all land
    // here — log the cause so a misconfigured bridge is diagnosable
    if (error instanceof SyntaxError) console.warn("[research] bridge returned invalid JSON");
    else if ((error as Error)?.name === "AbortError") console.warn("[research] timed out");
    else console.warn("[research] bridge call failed:", error);
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}
