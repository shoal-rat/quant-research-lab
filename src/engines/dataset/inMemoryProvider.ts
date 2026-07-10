import { BacktestParameters, StrategySpec } from "../../types";
import { dateIndex, RealMarketData, realUniverse } from "../realMarket";
import { runRealBacktest } from "../realBacktestEngine";
import { STRATEGY_FAMILIES } from "../strategyKnowledge";
import { evolveFormula, MinerState } from "../alphaMiner";
import { DatasetBacktestContext, DatasetMeta, DatasetMineRequest, DatasetMineResult, DatasetProvider } from "./types";

const PRICE_FAMILIES = STRATEGY_FAMILIES.filter((family) => family.priceComputable).map((family) => family.key);

// Wraps a fully-resident RealMarketData (bundled JSON, uploaded or remote CSV)
// and runs the in-browser cross-sectional backtester over it.
export class InMemoryDatasetProvider implements DatasetProvider {
  private minerState: MinerState | null = null;

  constructor(private readonly data: RealMarketData, private readonly kind: string, private readonly label: string) {}

  meta(): DatasetMeta {
    const universe = realUniverse(this.data);
    return {
      kind: this.kind,
      label: this.label,
      tickers: universe.length,
      start: this.data.start,
      end: this.data.end,
      rows: universe.length * this.data.dates.length,
      inMemory: true,
      frequency: this.data.frequency,
      periodsPerYear: this.data.periodsPerYear
    };
  }

  profileText(): string {
    const universe = realUniverse(this.data);
    const industries = new Map<string, number>();
    for (const symbol of universe) {
      const industry = this.data.tickers[symbol]?.industry ?? "Uncategorized";
      industries.set(industry, (industries.get(industry) ?? 0) + 1);
    }
    const byIndustry = [...industries.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} (${count})`)
      .join(", ");
    const sample = universe.slice(0, 10).join(", ");
    return [
      `Dataset: ${this.label}`,
      `In-memory price panel: ${universe.length} names x ${this.data.dates.length} ${this.data.frequency ?? "daily"} closes, ${this.data.start} to ${this.data.end} (annualization ${this.data.periodsPerYear ?? 252}/yr).`,
      `Benchmark: ${this.data.benchmark}. Industries: ${byIndustry || "n/a"}.`,
      `Names include: ${sample}${universe.length > 10 ? ", …" : ""}.`,
      `Only price-derived families are backtestable here (no fundamentals or news columns).`
    ].join("\n");
  }

  computableFamilies(): string[] {
    return PRICE_FAMILIES;
  }

  canBacktest(familyKey: string): boolean {
    return PRICE_FAMILIES.includes(familyKey);
  }

  async runBacktest(strategy: StrategySpec, params: BacktestParameters, context: DatasetBacktestContext) {
    try {
      return runRealBacktest(strategy, params, this.data, context);
    } catch {
      return null;
    }
  }

  async mineFormula(request: DatasetMineRequest): Promise<DatasetMineResult | null> {
    try {
      const universe = realUniverse(this.data);
      if (universe.length < 6) return null;
      const industryPeers: Record<string, string[]> = {};
      for (const symbol of universe) {
        const industry = this.data.tickers[symbol].industry;
        (industryPeers[industry] = industryPeers[industry] ?? []).push(symbol);
      }
      const start = Math.max(260, dateIndex(this.data, request.startDate));
      const end = Math.min(this.data.dates.length - 1, dateIndex(this.data, request.endDate) + 1);
      // Search only the training portion of the pre-lockbox development set.
      // The standard engine uses 58% IS and reserves the last 12% lockbox.
      const searchEndIndex = start + Math.floor(Math.max(0, end - start) * 0.58 * 0.88);
      const avoidSignals = request.experiments
        .map((experiment) => experiment.strategyParameters?.formula)
        .filter((formula): formula is string => typeof formula === "string" && formula.length > 0)
        .map((formula) => ({ formula }));
      const outcome = evolveFormula({
        state: this.minerState,
        data: this.data,
        universe,
        industryPeers,
        periodsPerYear: this.data.periodsPerYear ?? 252,
        searchEndIndex,
        avoidSignals,
        seed: request.seed
      });
      this.minerState = outcome.state;
      return { formula: outcome.formula, fitness: outcome.fitness, evaluations: outcome.evaluations };
    } catch {
      return null;
    }
  }
}
