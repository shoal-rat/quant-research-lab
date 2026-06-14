import {
  CompiledSignal,
  FactorKind,
  HoldingPeriod,
  ResearchDiscoveryCard,
  SourceCredibilityReport
} from "../types";

// Strategy-family knowledge base distilled from the cross-sectional equity
// literature (Jegadeesh-Titman momentum, De Bondt-Thaler / Lehmann reversal,
// Ball-Brown PEAD, Tetlock news sentiment, Frazzini-Pedersen BAB,
// Novy-Marx quality, Heston-Sadka seasonality, Gatev pairs, Cohen-Frazzini
// lead-lag, Moreira-Muir vol-managed) plus the replication-crisis findings
// (Harvey-Liu-Zhu multiple testing, McLean-Pontiff post-publication decay).
// Net Sharpe ranges are deliberately honest: most published factors net of
// costs land between 0.2 and 0.7.

export interface FamilyParameter {
  name: string;
  min: number;
  max: number;
  default: number;
  step: number;
}

export interface StrategyFamily {
  key: string;
  name: string;
  factorKind: FactorKind;
  rationaleKind: "risk_premium" | "behavioral" | "structural";
  rationale: string;
  construction: string;
  holdingPeriods: HoldingPeriod[];
  grossSharpe: [number, number];
  netSharpe: [number, number];
  costSensitivity: "low" | "medium" | "high";
  crowdingRisk: "low" | "medium" | "high";
  failureModes: string[];
  parameters: FamilyParameter[];
  keyPapers: string[];
  newsDriven: boolean;
  // can the signal be computed from daily prices alone (real-data mode)?
  priceComputable: boolean;
  // deterministic simulator inputs
  baseEdgeDaily: number;
  decayHalfLifeRuns: number;
  // --- fields populated when a family is DISCOVERED by the research agent ---
  origin?: "builtin" | "researched";
  // a kernel-ready signal formula (in the SIGNAL_SPEC style) the agent's
  // backtest kernel implements; researched families have no hand-written
  // in-browser code, so they are computed only by the bridge kernel
  signalSpec?: string;
  // citations / URLs the agent read (papers, news, institution reports)
  references?: string[];
  // structured card and signal compiler output from the discovery agent
  discoveryCard?: ResearchDiscoveryCard;
  compiledSignal?: CompiledSignal;
  sourceCredibility?: SourceCredibilityReport;
  // only the bridge kernel can backtest this (no in-browser implementation)
  bridgeOnly?: boolean;
}

export const STRATEGY_FAMILIES: StrategyFamily[] = [
  {
    key: "xs_momentum",
    name: "Cross-Sectional Momentum",
    factorKind: "momentum",
    rationaleKind: "behavioral",
    rationale: "Investors underreact to firm-specific news, so 3-12 month relative winners keep outperforming losers.",
    construction: "Rank by trailing return skipping the most recent week, long top decile, short bottom decile, rebalance weekly.",
    holdingPeriods: [5, 20],
    grossSharpe: [0.6, 1.0],
    netSharpe: [0.3, 0.6],
    costSensitivity: "medium",
    crowdingRisk: "high",
    failureModes: [
      "Momentum crashes when the market rebounds sharply (2009-style short-leg squeeze)",
      "Crowding compresses the premium and deepens drawdowns",
      "Short lookbacks degenerate into expensive turnover"
    ],
    parameters: [
      { name: "lookbackDays", min: 20, max: 250, default: 120, step: 10 },
      { name: "skipDays", min: 0, max: 10, default: 5, step: 1 },
      { name: "volatilityPenalty", min: 0, max: 0.8, default: 0.35, step: 0.05 }
    ],
    keyPapers: ["Jegadeesh & Titman (1993)", "Daniel & Moskowitz (2016) momentum crashes"],
    newsDriven: false,
    priceComputable: true,
    baseEdgeDaily: 0.00052,
    decayHalfLifeRuns: 9
  },
  {
    key: "short_term_reversal",
    name: "Short-Term Reversal",
    factorKind: "mean_reversion",
    rationaleKind: "structural",
    rationale: "Liquidity provision: one-week losers bounce because their sell-off was price pressure, not information.",
    construction: "Buy the past-week losers and short the past-week winners within industry, holding 1-5 days with a turnover cap.",
    holdingPeriods: [1, 3, 5],
    grossSharpe: [0.8, 1.4],
    netSharpe: [0.0, 0.4],
    costSensitivity: "high",
    crowdingRisk: "medium",
    failureModes: [
      "Costs eat nearly the whole gross edge at realistic bps",
      "Fails on real information events (earnings losers keep falling)",
      "Capacity is tiny relative to momentum"
    ],
    parameters: [
      { name: "reversalWindow", min: 2, max: 10, default: 5, step: 1 },
      { name: "sentimentFloor", min: -1, max: 0, default: -0.55, step: 0.05 },
      { name: "turnoverCap", min: 0.3, max: 1, default: 0.7, step: 0.05 }
    ],
    keyPapers: ["Lehmann (1990)", "Nagel (2012) evaporating liquidity"],
    newsDriven: false,
    priceComputable: true,
    baseEdgeDaily: 0.00038,
    decayHalfLifeRuns: 7
  },
  {
    key: "pead",
    name: "Post-Earnings Announcement Drift",
    factorKind: "event_drift",
    rationaleKind: "behavioral",
    rationale: "Prices underreact to earnings surprises, drifting in the surprise direction for weeks after the report.",
    construction: "Rank earnings-tagged headlines published before the close by surprise sentiment, enter next open, hold 5-20 days.",
    holdingPeriods: [5, 20],
    grossSharpe: [0.6, 1.1],
    netSharpe: [0.3, 0.6],
    costSensitivity: "low",
    crowdingRisk: "medium",
    failureModes: [
      "Timestamp leakage fakes most of the in-sample edge",
      "Drift has weakened post-2000 as anomaly got published",
      "Event clustering concentrates the book in a few names"
    ],
    parameters: [
      { name: "surpriseThreshold", min: 0.1, max: 0.9, default: 0.42, step: 0.04 },
      { name: "timestampLagHours", min: 1, max: 24, default: 2, step: 1 },
      { name: "maxEventAgeDays", min: 1, max: 10, default: 3, step: 1 }
    ],
    keyPapers: ["Ball & Brown (1968)", "Bernard & Thomas (1989)"],
    newsDriven: true,
    priceComputable: false,
    baseEdgeDaily: 0.00058,
    decayHalfLifeRuns: 10
  },
  {
    key: "news_sentiment_momentum",
    name: "News Sentiment Momentum",
    factorKind: "news_sentiment",
    rationaleKind: "behavioral",
    rationale: "Fresh tone in firm news predicts short-horizon returns before the information is fully priced.",
    construction: "Aggregate same-day headline sentiment with strict pre-close timestamps, long top quintile, hold 1-5 days.",
    holdingPeriods: [1, 3, 5],
    grossSharpe: [0.7, 1.2],
    netSharpe: [0.1, 0.5],
    costSensitivity: "high",
    crowdingRisk: "high",
    failureModes: [
      "Edge decays within days, so turnover and costs dominate",
      "Vendor sentiment is widely sold, making the trade crowded",
      "Lookahead bias from re-stamped headlines is endemic"
    ],
    parameters: [
      { name: "sentimentWeight", min: 0.2, max: 1, default: 0.62, step: 0.04 },
      { name: "minNewsCount", min: 1, max: 5, default: 1, step: 1 },
      { name: "freshnessHours", min: 4, max: 48, default: 24, step: 4 }
    ],
    keyPapers: ["Tetlock (2007)", "Tetlock, Saar-Tsechansky & Macskassy (2008)"],
    newsDriven: true,
    priceComputable: false,
    baseEdgeDaily: 0.00046,
    decayHalfLifeRuns: 6
  },
  {
    key: "crowded_news_fade",
    name: "Crowded News Fade",
    factorKind: "news_sentiment",
    rationaleKind: "behavioral",
    rationale: "Stocks with saturation media coverage and stretched short-term returns overshoot and mean revert.",
    construction: "Short names with extreme positive sentiment plus stretched 3-day returns, buy quiet neutral names, hold one week.",
    holdingPeriods: [3, 5],
    grossSharpe: [0.4, 0.9],
    netSharpe: [0.1, 0.4],
    costSensitivity: "high",
    crowdingRisk: "medium",
    failureModes: [
      "Shorting glamour names risks squeeze losses far beyond the edge",
      "Works only when attention proxies are well measured",
      "Regime dependent: fails in strong momentum markets"
    ],
    parameters: [
      { name: "sentimentWeight", min: 0.3, max: 1, default: 0.62, step: 0.04 },
      { name: "returnFadeWindow", min: 2, max: 7, default: 3, step: 1 },
      { name: "attentionCutoff", min: 0.5, max: 0.95, default: 0.8, step: 0.05 }
    ],
    keyPapers: ["Barber & Odean (2008) attention", "Da, Engelberg & Gao (2011)"],
    newsDriven: true,
    priceComputable: false,
    baseEdgeDaily: 0.00040,
    decayHalfLifeRuns: 7
  },
  {
    key: "low_volatility",
    name: "Low Volatility / Betting Against Beta",
    factorKind: "low_volatility",
    rationaleKind: "structural",
    rationale: "Leverage-constrained investors overpay for lottery-like high-beta stocks, leaving low-risk names underpriced.",
    construction: "Rank by inverse 20-60 day realized volatility, hold a long defensive basket rebalanced monthly.",
    holdingPeriods: [20],
    grossSharpe: [0.5, 0.9],
    netSharpe: [0.3, 0.7],
    costSensitivity: "low",
    crowdingRisk: "medium",
    failureModes: [
      "Underperforms badly in sharp risk-on rallies",
      "Sector concentration (utilities, staples) drives tracking error",
      "Rate-sensitivity makes it a bond proxy in hiking cycles"
    ],
    parameters: [
      { name: "volatilityWindow", min: 10, max: 60, default: 20, step: 5 },
      { name: "negativeNewsCutoff", min: -0.8, max: 0, default: -0.35, step: 0.05 },
      { name: "rebalanceBuffer", min: 0, max: 0.3, default: 0.12, step: 0.02 }
    ],
    keyPapers: ["Frazzini & Pedersen (2014) BAB", "Baker, Bradley & Wurgler (2011)"],
    newsDriven: false,
    priceComputable: true,
    baseEdgeDaily: 0.00028,
    decayHalfLifeRuns: 14
  },
  {
    key: "quality",
    name: "Quality / Profitability",
    factorKind: "quality_proxy",
    rationaleKind: "risk_premium",
    rationale: "Profitable, conservatively financed firms earn higher risk-adjusted returns than junk, and the market underprices it.",
    construction: "Composite of gross profitability, margin stability and low issuance, long-only tilt rebalanced monthly.",
    holdingPeriods: [20],
    grossSharpe: [0.4, 0.8],
    netSharpe: [0.3, 0.6],
    costSensitivity: "low",
    crowdingRisk: "low",
    failureModes: [
      "Slow factor: needs quarters, not days, to pay off",
      "Definition shopping across 20+ quality metrics invites overfitting",
      "Expensive quality (high multiple) drags in late cycles"
    ],
    parameters: [
      { name: "profitabilityWeight", min: 0.2, max: 1, default: 0.5, step: 0.05 },
      { name: "stabilityWindow", min: 20, max: 120, default: 60, step: 10 },
      { name: "industryNeutral", min: 0, max: 1, default: 1, step: 1 }
    ],
    keyPapers: ["Novy-Marx (2013)", "Asness, Frazzini & Pedersen (2019) QMJ"],
    newsDriven: false,
    priceComputable: true,
    baseEdgeDaily: 0.00030,
    decayHalfLifeRuns: 16
  },
  {
    key: "seasonality",
    name: "Calendar Seasonality",
    factorKind: "seasonality",
    rationaleKind: "structural",
    rationale: "Institutional flow patterns (turn-of-month rebalancing, payroll inflows) create recurring calendar return patterns.",
    construction: "Overweight equities into the last and first three trading days of the month, neutral otherwise.",
    holdingPeriods: [1, 3],
    grossSharpe: [0.3, 0.7],
    netSharpe: [0.1, 0.4],
    costSensitivity: "medium",
    crowdingRisk: "low",
    failureModes: [
      "Tiny number of independent bets per year inflates t-stats",
      "Patterns shift when flows change (e.g. 401k timing)",
      "Easy to data-mine dozens of calendar rules"
    ],
    parameters: [
      { name: "entryDayOffset", min: -5, max: 0, default: -3, step: 1 },
      { name: "holdDays", min: 2, max: 8, default: 5, step: 1 },
      { name: "signalScale", min: 0.3, max: 1, default: 0.7, step: 0.05 }
    ],
    keyPapers: ["Heston & Sadka (2008)", "Lakonishok & Smidt (1988)"],
    newsDriven: false,
    priceComputable: true,
    baseEdgeDaily: 0.00024,
    decayHalfLifeRuns: 8
  },
  {
    key: "pairs_statarb",
    name: "Pairs / Statistical Arbitrage",
    factorKind: "pairs",
    rationaleKind: "structural",
    rationale: "Close economic substitutes share a common value process; spread divergences revert as arbitrageurs step in.",
    construction: "Match pairs by normalized price distance over a formation year, trade 2-sigma divergences back to the mean.",
    holdingPeriods: [3, 5, 20],
    grossSharpe: [0.5, 1.0],
    netSharpe: [0.1, 0.4],
    costSensitivity: "high",
    crowdingRisk: "medium",
    failureModes: [
      "Pair breaks (one firm changes fundamentally) cause unbounded divergence",
      "Returns have decayed sharply since the 1990s as the trade crowded",
      "Needs shorting and tight execution; cost assumptions decide viability"
    ],
    parameters: [
      { name: "entryZScore", min: 1, max: 3.5, default: 2, step: 0.25 },
      { name: "exitZScore", min: 0, max: 1.5, default: 0.5, step: 0.25 },
      { name: "formationDays", min: 120, max: 500, default: 250, step: 10 }
    ],
    keyPapers: ["Gatev, Goetzmann & Rouwenhorst (2006)", "Do & Faff (2010) decay"],
    newsDriven: false,
    priceComputable: true,
    baseEdgeDaily: 0.00034,
    decayHalfLifeRuns: 8
  },
  {
    key: "lead_lag_spillover",
    name: "Supply-Chain / Peer Lead-Lag",
    factorKind: "lead_lag",
    rationaleKind: "behavioral",
    rationale: "Investors are slow to propagate news across economically linked firms, so peer returns predict laggards.",
    construction: "Aggregate related-ticker sentiment and returns, lag one day, long laggards of strong peers within the sector.",
    holdingPeriods: [3, 5],
    grossSharpe: [0.5, 0.9],
    netSharpe: [0.2, 0.5],
    costSensitivity: "medium",
    crowdingRisk: "medium",
    failureModes: [
      "Link data quality decides everything; stale supplier maps kill the edge",
      "Concentrates in a few hub names like the semiconductor chain",
      "Spillover speed has accelerated, shrinking the window"
    ],
    parameters: [
      { name: "relatedTickerWeight", min: 0.2, max: 1, default: 0.54, step: 0.04 },
      { name: "lagDays", min: 1, max: 5, default: 1, step: 1 },
      { name: "industryNeutral", min: 0, max: 1, default: 1, step: 1 }
    ],
    keyPapers: ["Cohen & Frazzini (2008) economic links", "Menzly & Ozbas (2010)"],
    newsDriven: true,
    priceComputable: true,
    baseEdgeDaily: 0.00044,
    decayHalfLifeRuns: 8
  },
  {
    key: "vol_managed",
    name: "Volatility-Managed Overlay",
    factorKind: "vol_managed",
    rationaleKind: "structural",
    rationale: "Volatility is persistent but returns are not, so scaling exposure inversely to recent variance raises Sharpe.",
    construction: "Scale a base signal by inverse realized variance over the last 20 days, capping leverage at 1.5x.",
    holdingPeriods: [5, 20],
    grossSharpe: [0.5, 0.9],
    netSharpe: [0.3, 0.6],
    costSensitivity: "medium",
    crowdingRisk: "low",
    failureModes: [
      "Whipsaws in fast vol spikes followed by instant recoveries",
      "Adds leverage exactly when funding is cheapest to lose",
      "Benefit shrinks when the base signal already has low vol"
    ],
    parameters: [
      { name: "varianceWindow", min: 10, max: 60, default: 20, step: 5 },
      { name: "leverageCap", min: 1, max: 2.5, default: 1.5, step: 0.1 },
      { name: "targetVol", min: 0.05, max: 0.25, default: 0.12, step: 0.01 }
    ],
    keyPapers: ["Moreira & Muir (2017)", "Barroso & Santa-Clara (2015) momentum risk"],
    newsDriven: false,
    priceComputable: true,
    baseEdgeDaily: 0.00032,
    decayHalfLifeRuns: 14
  },
  {
    key: "earnings_revision",
    name: "Analyst Revision Momentum",
    factorKind: "earnings_revision",
    rationaleKind: "behavioral",
    rationale: "Analyst forecast changes diffuse slowly; stocks with rising estimates keep beating those with cuts.",
    construction: "Rank by net analyst revision sentiment over the last month, long top quintile, hold 20 days.",
    holdingPeriods: [5, 20],
    grossSharpe: [0.5, 0.9],
    netSharpe: [0.2, 0.5],
    costSensitivity: "medium",
    crowdingRisk: "medium",
    failureModes: [
      "Revision data arrives with vendor lag; backtests overstate timeliness",
      "Edge concentrated around earnings season",
      "Correlated with price momentum: adds less than it appears"
    ],
    parameters: [
      { name: "revisionWindow", min: 10, max: 60, default: 21, step: 1 },
      { name: "surpriseThreshold", min: 0.1, max: 0.8, default: 0.35, step: 0.05 },
      { name: "momentumOverlapPenalty", min: 0, max: 0.8, default: 0.4, step: 0.05 }
    ],
    keyPapers: ["Chan, Jegadeesh & Lakonishok (1996)", "Gleason & Lee (2003)"],
    newsDriven: true,
    priceComputable: false,
    baseEdgeDaily: 0.00042,
    decayHalfLifeRuns: 10
  },
  {
    key: "trend_overlay",
    name: "Time-Series Trend Filter",
    factorKind: "trend_overlay",
    rationaleKind: "behavioral",
    rationale: "Slow-moving capital makes index-level trends persist; a trend filter cuts the left tail of long exposure.",
    construction: "Hold the equity basket only when price is above its 100-200 day moving average, otherwise de-risk.",
    holdingPeriods: [20],
    grossSharpe: [0.4, 0.8],
    netSharpe: [0.3, 0.6],
    costSensitivity: "low",
    crowdingRisk: "medium",
    failureModes: [
      "Whipsaw losses in sideways markets",
      "Misses V-shaped recoveries by design",
      "Few independent signals: hard to distinguish luck from skill"
    ],
    parameters: [
      { name: "trendWindow", min: 50, max: 250, default: 150, step: 10 },
      { name: "bufferPct", min: 0, max: 0.05, default: 0.01, step: 0.005 },
      { name: "deriskFraction", min: 0.3, max: 1, default: 0.7, step: 0.05 }
    ],
    keyPapers: ["Moskowitz, Ooi & Pedersen (2012)", "Faber (2007)"],
    newsDriven: false,
    priceComputable: true,
    baseEdgeDaily: 0.00026,
    decayHalfLifeRuns: 16
  },
  {
    key: "fifty_two_week_high",
    name: "52-Week-High Anchoring",
    factorKind: "momentum",
    rationaleKind: "behavioral",
    rationale: "Traders anchor on the 52-week high and underreact to news that should push price through it.",
    construction: "Rank by price proximity to its 52-week high, long the closest decile, hold 20 days.",
    holdingPeriods: [5, 20],
    grossSharpe: [0.4, 0.8],
    netSharpe: [0.2, 0.5],
    costSensitivity: "medium",
    crowdingRisk: "medium",
    failureModes: [
      "Overlaps heavily with plain momentum",
      "Breaks down in January and reversal regimes",
      "High-proximity names cluster in trending sectors"
    ],
    parameters: [
      { name: "proximityCutoff", min: 0.7, max: 1, default: 0.9, step: 0.02 },
      { name: "lookbackDays", min: 120, max: 250, default: 250, step: 10 },
      { name: "volatilityPenalty", min: 0, max: 0.8, default: 0.3, step: 0.05 }
    ],
    keyPapers: ["George & Hwang (2004)"],
    newsDriven: false,
    priceComputable: true,
    baseEdgeDaily: 0.00036,
    decayHalfLifeRuns: 10
  }
];

// Families discovered by the research agent at runtime (persisted by the app
// in localStorage). They live alongside the built-in literature families.
let researchedFamilies: StrategyFamily[] = [];
let familyIndex = new Map<string, StrategyFamily>(STRATEGY_FAMILIES.map((family) => [family.key, family]));

function rebuildIndex(): void {
  familyIndex = new Map([...STRATEGY_FAMILIES, ...researchedFamilies].map((family) => [family.key, family]));
}

export function getFamily(key: string): StrategyFamily {
  return familyIndex.get(key) ?? STRATEGY_FAMILIES[0];
}

// every known family, built-in first then researched
export function getAllFamilies(): StrategyFamily[] {
  return [...STRATEGY_FAMILIES, ...researchedFamilies];
}

export function getResearchedFamilies(): StrategyFamily[] {
  return researchedFamilies;
}

// replace the researched set (called on load from storage and after a research
// run); later built-ins win key collisions so a discovery can't shadow them
export function setResearchedFamilies(list: StrategyFamily[]): void {
  const builtinKeys = new Set(STRATEGY_FAMILIES.map((family) => family.key));
  researchedFamilies = list
    .filter((family) => family && family.key && !builtinKeys.has(family.key))
    .map((family) => ({ ...family, origin: "researched", bridgeOnly: true }));
  rebuildIndex();
}
