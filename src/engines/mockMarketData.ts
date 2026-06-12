import { MarketRow } from "../types";
import { normalLike, seededRandom } from "./random";

const STOCKS = [
  ["AAPL", "Apple", "Technology"],
  ["MSFT", "Microsoft", "Technology"],
  ["NVDA", "NVIDIA", "Semiconductors"],
  ["AMD", "Advanced Micro Devices", "Semiconductors"],
  ["AVGO", "Broadcom", "Semiconductors"],
  ["JPM", "JPMorgan Chase", "Financials"],
  ["XOM", "Exxon Mobil", "Energy"],
  ["UNH", "UnitedHealth", "Healthcare"],
  ["COST", "Costco", "Consumer Staples"],
  ["META", "Meta Platforms", "Communication Services"],
  ["GOOGL", "Alphabet", "Communication Services"],
  ["TSLA", "Tesla", "Consumer Discretionary"]
] as const;

const EVENT_TYPES = ["earnings", "guidance", "analyst_revision", "macro", "product", "regulatory"];

const NEWS_PHRASES = [
  "management tone improves after guidance call",
  "analysts debate margin durability",
  "sector flow rotates into quality balance sheets",
  "supply chain update changes near-term sentiment",
  "volume spike follows product-cycle discussion",
  "macro sensitivity rises before policy data"
];

function addBusinessDays(start: Date, days: number): Date {
  const next = new Date(start);
  let added = 0;
  while (added < days) {
    next.setDate(next.getDate() + 1);
    const day = next.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }
  return next;
}

export function makeMockMarketData(start = "2021-01-04", businessDays = 520): MarketRow[] {
  const rows: MarketRow[] = [];
  const baseDate = new Date(`${start}T00:00:00Z`);

  STOCKS.forEach(([ticker, stockName, industry], stockIndex) => {
    const rng = seededRandom(`market-${ticker}`);
    let close = 60 + stockIndex * 24 + rng() * 35;
    for (let dayIndex = 0; dayIndex < businessDays; dayIndex += 1) {
      const date = addBusinessDays(baseDate, dayIndex);
      const yyyyMmDd = date.toISOString().slice(0, 10);
      const regime = Math.sin(dayIndex / 37 + stockIndex * 0.7) * 0.0025;
      const industryCycle = industry === "Semiconductors" ? Math.sin(dayIndex / 24) * 0.004 : 0;
      const shock = normalLike(rng) * (0.011 + stockIndex * 0.0004);
      const drift = 0.00018 + (stockIndex % 3) * 0.00005;
      const dailyReturn = drift + regime + industryCycle + shock;
      close = Math.max(8, close * (1 + dailyReturn));
      const newsSentiment = Math.max(-1, Math.min(1, regime * 90 + normalLike(rng) * 0.35));
      const eventType = EVENT_TYPES[(dayIndex + stockIndex) % EVENT_TYPES.length];
      const related = STOCKS[(stockIndex + dayIndex + 3) % STOCKS.length][0];
      rows.push({
        ticker,
        stockName,
        industry,
        date: yyyyMmDd,
        close: Number(close.toFixed(2)),
        dailyReturn: Number(dailyReturn.toFixed(5)),
        newsHeadline: `${stockName}: ${NEWS_PHRASES[(dayIndex + stockIndex) % NEWS_PHRASES.length]}`,
        newsTimestamp: `${yyyyMmDd}T${String(9 + (dayIndex % 7)).padStart(2, "0")}:30:00Z`,
        relatedTicker: related,
        newsSentiment: Number(newsSentiment.toFixed(3)),
        eventType
      });
    }
  });

  return rows;
}

export function parseUniverse(universe: string): string[] {
  return universe
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
}
