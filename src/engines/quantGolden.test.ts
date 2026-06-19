import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { annualizedReturn, annualizedSharpe, calmarRatio, maxDrawdown, probabilisticSharpe, sortinoRatio } from "./perfMetrics";
import { spearmanIC } from "./factorAnalytics";
import { normCdf } from "./backtestEngine";
import { betaResidualize, demeanByGroup, rankNormalize, winsorize, zscore } from "./signalPreprocess";

// Golden values produced by scripts/quant_reference/reference.py using
// empyrical / scipy / statsmodels / numpy. This test proves the in-browser TS
// math matches the professional Python stack. Regenerate with:
//   python scripts/quant_reference/reference.py
const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, "__fixtures__", "quant_golden.json"), "utf-8")) as {
  annualization: number;
  returns: number[];
  crossSection: number[];
  groups: string[];
  betas: number[];
  signal: number[];
  forward: number[];
  expected: {
    sharpe: number;
    sortino: number;
    calmar: number;
    annualReturn: number;
    maxDrawdown: number;
    spearmanIC: number;
    psr: number;
    normCdf: Record<string, number>;
    winsorize05: number[];
    zscore: number[];
    rankNormalize: number[];
    demeanByGroup: number[];
    betaResidualize: number[];
  };
};

const ppy = golden.annualization;
const e = golden.expected;

function expectClose(actual: number[], want: number[], tol: number) {
  expect(actual.length).toBe(want.length);
  actual.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(tol));
}

describe("quant engines vs Python reference libraries", () => {
  it("annualizedSharpe (production fn) matches empyrical.sharpe_ratio", () => {
    expect(Math.abs(annualizedSharpe(golden.returns, ppy) - e.sharpe)).toBeLessThan(1e-6);
  });

  it("Sortino matches empyrical.sortino_ratio", () => {
    expect(Math.abs(sortinoRatio(golden.returns, ppy) - e.sortino)).toBeLessThan(1e-6);
  });

  it("annualizedReturn (production fn) matches empyrical.annual_return", () => {
    expect(Math.abs(annualizedReturn(golden.returns, ppy) - e.annualReturn)).toBeLessThan(1e-6);
  });

  it("maxDrawdown (production fn) matches empyrical.max_drawdown", () => {
    expect(Math.abs(maxDrawdown(golden.returns) - e.maxDrawdown)).toBeLessThan(1e-9);
  });

  it("Calmar matches empyrical.calmar_ratio — fully through production fns", () => {
    // route Calmar through the production annualizedReturn + maxDrawdown (not the
    // empyrical golden inputs), so the whole chain is exercised end-to-end
    const calmar = calmarRatio(annualizedReturn(golden.returns, ppy), maxDrawdown(golden.returns));
    expect(Math.abs(calmar - e.calmar)).toBeLessThan(1e-6);
  });

  it("Spearman IC matches scipy.stats.spearmanr", () => {
    const ic = spearmanIC(golden.signal, golden.forward);
    expect(ic).not.toBeNull();
    expect(Math.abs((ic as number) - e.spearmanIC)).toBeLessThan(1e-9);
  });

  it("normCdf matches scipy.stats.norm.cdf", () => {
    Object.entries(e.normCdf).forEach(([z, want]) => {
      expect(Math.abs(normCdf(Number(z)) - want)).toBeLessThan(1e-6);
    });
  });

  // NOTE: PSR is validated against an in-house Bailey/López de Prado reference in
  // reference.py (scipy norm.cdf + skew/kurtosis), not an off-the-shelf library
  // function (empyrical/quantstats have no PSR). The other metrics above ARE
  // matched to library functions (empyrical.sharpe/sortino/calmar/annual_return/
  // max_drawdown, scipy.spearmanr/norm.cdf, numpy/statsmodels).
  it("Probabilistic Sharpe matches the in-house Bailey/LdP scipy reference", () => {
    expect(Math.abs(probabilisticSharpe(e.sharpe, golden.returns, ppy, 0) - e.psr)).toBeLessThan(2e-3);
  });

  it("winsorize matches numpy quantile-clip", () => {
    expectClose(winsorize(golden.crossSection, 0.05), e.winsorize05, 1e-9);
  });

  it("zscore matches numpy (ddof=1)", () => {
    expectClose(zscore(golden.crossSection), e.zscore, 1e-9);
  });

  it("rankNormalize matches scipy rankdata CSRankNorm", () => {
    expectClose(rankNormalize(golden.crossSection), e.rankNormalize, 1e-9);
  });

  it("demeanByGroup matches pandas groupby-demean", () => {
    expectClose(demeanByGroup(golden.crossSection, golden.groups), e.demeanByGroup, 1e-9);
  });

  it("betaResidualize matches statsmodels OLS residuals", () => {
    expectClose(betaResidualize(golden.crossSection, golden.betas), e.betaResidualize, 1e-9);
  });
});
