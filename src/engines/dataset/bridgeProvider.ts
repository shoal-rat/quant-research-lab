import { BacktestParameters, DatasetConfig, ResearchBrain, StrategySpec } from "../../types";
import { metricsFromReturnSeries } from "../realBacktestEngine";
import { STRATEGY_FAMILIES } from "../strategyKnowledge";
import { DatasetBacktestContext, DatasetMeta, DatasetProvider } from "./types";

const PRICE_FAMILIES = STRATEGY_FAMILIES.filter((family) => family.priceComputable).map((family) => family.key);

interface InspectReply {
  label?: string;
  tickers?: number;
  start?: string;
  end?: string;
  rows?: number;
  frequency?: string;
  periodsPerYear?: number;
  note?: string;
  columns?: { date?: string; ticker?: string; close?: string; industry?: string };
}

interface ReturnsReply {
  dates?: string[];
  returns?: number[];
  benchmarkReturns?: number[];
  universe?: number;
  turnover?: number;
  concentration?: number;
  frequency?: string;
  periodsPerYear?: number;
  note?: string;
  error?: string;
}

function backendFor(brain: ResearchBrain): "claude-code" | "codex" {
  return brain === "codex" ? "codex" : "claude-code";
}

function sourcePayload(config: DatasetConfig) {
  return {
    kind: config.bridgeSourceKind ?? "file",
    ref: config.bridgeRef ?? "",
    query: config.bridgeQuery,
    columns: config.columns
  };
}

// A dataset that stays where it lives (a large local file, Parquet, DuckDB /
// SQLite / Postgres, or a remote URL). The connected CLI reads it and streams
// back only the strategy's daily returns; the browser never downloads it.
export class BridgeDatasetProvider implements DatasetProvider {
  private constructor(
    private readonly config: DatasetConfig,
    private readonly bridgeUrl: string,
    private readonly backend: "claude-code" | "codex",
    private readonly inspectResult: InspectReply
  ) {}

  static async create(config: DatasetConfig, bridgeUrl: string, brain: ResearchBrain): Promise<BridgeDatasetProvider | null> {
    const backend = backendFor(brain);
    try {
      const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/dataset/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backend, source: sourcePayload(config) })
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { result?: InspectReply; error?: string };
      if (!payload.result) return null;
      return new BridgeDatasetProvider(config, bridgeUrl, backend, payload.result);
    } catch {
      return null;
    }
  }

  meta(): DatasetMeta {
    return {
      kind: "bridge",
      label: this.config.label,
      tickers: this.inspectResult.tickers ?? 0,
      start: this.inspectResult.start ?? "",
      end: this.inspectResult.end ?? "",
      rows: this.inspectResult.rows ?? 0,
      inMemory: false,
      frequency: this.inspectResult.frequency,
      periodsPerYear: this.inspectResult.periodsPerYear,
      note: this.inspectResult.note
    };
  }

  profileText(): string {
    const r = this.inspectResult;
    const cols = r.columns
      ? `date=${r.columns.date ?? "?"}, ticker=${r.columns.ticker ?? "?"}, close=${r.columns.close ?? "?"}${r.columns.industry ? `, industry=${r.columns.industry}` : ""}`
      : "auto-detected";
    return [
      `Dataset (read by the ${this.backend} CLI where it lives, not downloaded): ${this.config.label}`,
      `Source: ${this.config.bridgeSourceKind ?? "file"} @ ${this.config.bridgeRef ?? "?"}.`,
      `Profiled: ${r.tickers ?? "?"} names, ${r.rows ?? "?"} rows, ${r.start ?? "?"} to ${r.end ?? "?"}, ${r.frequency ?? "?"} frequency. Columns: ${cols}.`,
      r.note ? `CLI note: ${r.note}` : "",
      `The CLI computes the strategy's cross-sectional per-period returns over the full (possibly very large) source with no lookahead, at the data's native frequency.`
    ]
      .filter(Boolean)
      .join("\n");
  }

  computableFamilies(): string[] | null {
    // the CLI computes signals itself; price families are the safe set
    return PRICE_FAMILIES;
  }

  canBacktest(familyKey: string): boolean {
    return PRICE_FAMILIES.includes(familyKey);
  }

  async runBacktest(strategy: StrategySpec, params: BacktestParameters, context: DatasetBacktestContext) {
    try {
      const response = await fetch(`${this.bridgeUrl.replace(/\/$/, "")}/dataset/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backend: this.backend,
          source: sourcePayload(this.config),
          strategy: {
            familyKey: strategy.familyKey,
            parameters: strategy.parameters,
            holdingPeriod: strategy.holdingPeriod,
            portfolioType: strategy.portfolioType
          },
          params: {
            start: params.dateRange.start,
            end: params.dateRange.end,
            transactionCostBps: params.transactionCostBps
          }
        })
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { result?: ReturnsReply; error?: string };
      const result = payload.result;
      if (!result || !Array.isArray(result.returns) || result.returns.length < 60) return null;
      // coerce a stray non-finite value to a flat day rather than dropping it —
      // dropping would desync the returns array from the parallel dates array
      const returns = result.returns.map((value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
      });
      const dates =
        Array.isArray(result.dates) && result.dates.length === returns.length
          ? result.dates.map(String)
          : returns.map((_, index) => `t${index}`);
      const periodsPerYear = result.periodsPerYear ?? this.inspectResult.periodsPerYear;
      const frequency = result.frequency ?? this.inspectResult.frequency ?? "?";
      return metricsFromReturnSeries({
        returns,
        dates,
        benchmarkReturns: Array.isArray(result.benchmarkReturns) ? result.benchmarkReturns.map(Number) : undefined,
        trials: context.totalTrials,
        priorCandidates: context.priorCandidates,
        avgTurnover: result.turnover,
        concentration: result.concentration,
        periodsPerYear,
        universeSize: result.universe ?? this.inspectResult.tickers ?? 20,
        dataUsed: `${this.config.label} via ${this.backend} CLI (${result.universe ?? "?"} names, ${frequency}${result.note ? `, ${result.note}` : ""})`
      });
    } catch {
      return null;
    }
  }
}
