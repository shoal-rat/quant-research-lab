import { Settings } from "../types";

export const defaultSettings: Settings = {
  researchTaskName: "Find robust US equity signals that survive transaction costs",
  stockUniverse: "AAPL, MSFT, NVDA, AMD, AVGO, JPM, XOM, UNH, COST, META, GOOGL, TSLA",
  startDate: "2021-01-04",
  endDate: "2025-12-31",
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
  openaiApiKey: ""
};
