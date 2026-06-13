import { Settings } from "../types";

export const defaultSettings: Settings = {
  researchTaskName: "Find robust US equity signals that survive transaction costs",
  stockUniverse: "AAPL, MSFT, NVDA, AMD, INTC, JPM, GS, XOM, UNH, COST, KO, CAT, AMZN, NFLX, HD, BA",
  startDate: "2015-01-02",
  endDate: "2026-06-12",
  holdingPeriod: 5,
  transactionCostBps: 12,
  maximumLoopCount: 12,
  experimentsPerLoop: 1,
  newsEnabled: true,
  technicalIndicatorsEnabled: true,
  mockLLMEnabled: true,
  catchphrasesShown: true,
  casualOfficeChatter: true,
  reducedAnimation: false,
  themeMode: "warm",
  officeViewMode: "2d",
  dialogueBackend: "local",
  anthropicApiKey: "",
  openaiApiKey: "",
  bridgeUrl: "http://127.0.0.1:8787",
  language: "en",
  dataset: { kind: "bundled", label: "Bundled US equities · 20y dailies" },
  researchBrain: "claude-code"
};
