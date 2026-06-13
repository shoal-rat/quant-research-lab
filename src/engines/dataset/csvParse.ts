import { DatasetColumns } from "../../types";
import { buildRealMarketData, RealMarketData, RealTicker } from "../realMarket";

// Parse a user CSV (uploaded or fetched from a URL) into the same in-memory
// shape the bundled dataset uses, so every in-browser provider shares one
// honest backtester. Supports the two layouts real price exports come in:
//   long : date,ticker,close[,industry]
//   wide : date,AAPL,MSFT,NVDA,...   (one price column per name)

export interface CsvParseResult {
  data: RealMarketData;
  detected: { layout: "long" | "wide"; columns?: DatasetColumns; frequency?: string };
  dropped: string[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(field);
      field = "";
    } else field += ch;
  }
  out.push(field);
  return out.map((value) => value.trim());
}

// Normalize a date OR datetime cell to a sortable ISO string, PRESERVING the
// time component when present so intraday (hourly/minute) data keeps its
// resolution instead of collapsing many bars onto one day.
function normalizeTimestamp(raw: string): string | null {
  const value = raw.trim();
  // ISO date or datetime
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) return iso[2] ? `${iso[1]}T${iso[2]}:${iso[3]}:${iso[4] ?? "00"}` : iso[1];
  // US m/d/yyyy [h:mm]
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (us) {
    const date = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    return us[4] ? `${date}T${us[4].padStart(2, "0")}:${us[5]}:00` : date;
  }
  // yyyymmdd
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  // epoch seconds / millis
  if (/^\d{10}$/.test(value)) {
    const dt = new Date(Number(value) * 1000);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 19);
  }
  if (/^\d{13}$/.test(value)) {
    const dt = new Date(Number(value));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 19);
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return /[:T]/.test(value) ? parsed.toISOString().slice(0, 19) : parsed.toISOString().slice(0, 10);
  }
  return null;
}

function findColumn(header: string[], candidates: string[]): number {
  const lower = header.map((h) => h.toLowerCase());
  for (const name of candidates) {
    const exact = lower.indexOf(name);
    if (exact >= 0) return exact;
  }
  for (let i = 0; i < lower.length; i += 1) {
    if (candidates.some((name) => lower[i].includes(name))) return i;
  }
  return -1;
}

const MIN_HISTORY_FRACTION = 0.2;

function assemble(
  source: string,
  dateSet: Set<string>,
  perTicker: Map<string, Map<string, number>>,
  industries: Map<string, string>
): CsvParseResult["data"] {
  const dates = [...dateSet].sort();
  const tickers: Record<string, RealTicker> = {};
  const minPoints = Math.max(30, Math.floor(dates.length * MIN_HISTORY_FRACTION));
  for (const [symbol, byDate] of perTicker) {
    if (byDate.size < minPoints) continue;
    const closes: (number | null)[] = [];
    let last: number | null = null;
    for (const date of dates) {
      const value = byDate.get(date);
      if (value !== undefined && Number.isFinite(value)) last = value;
      closes.push(last);
    }
    tickers[symbol] = { name: symbol, industry: industries.get(symbol) ?? "Uncategorized", closes };
  }

  // synthesize an equal-weight benchmark if none was supplied
  const symbols = Object.keys(tickers);
  // precompute each name's first non-null close once (the inner loop must stay
  // O(dates * names), not O(dates^2 * names) — uploads can be large)
  const firstClose = new Map<string, number>();
  for (const symbol of symbols) {
    const first = tickers[symbol].closes.find((c) => c !== null) ?? 1;
    firstClose.set(symbol, first || 1);
  }
  const benchCloses: (number | null)[] = [];
  for (let d = 0; d < dates.length; d += 1) {
    let sum = 0;
    let count = 0;
    for (const symbol of symbols) {
      const value = tickers[symbol].closes[d];
      if (value !== null) {
        sum += value / (firstClose.get(symbol) as number);
        count += 1;
      }
    }
    benchCloses.push(count > 0 ? Number((sum / count).toFixed(6)) : null);
  }
  tickers.__EWBENCH__ = { name: "Equal-weight index", industry: "Benchmark", closes: benchCloses };

  return buildRealMarketData({
    source,
    fetchedAt: new Date().toISOString().slice(0, 10),
    start: dates[0] ?? "",
    end: dates[dates.length - 1] ?? "",
    dates,
    benchmark: "__EWBENCH__",
    tickers
  } as Omit<RealMarketData, "returns">);
}

export function parseMarketCsv(text: string, label: string, columns?: DatasetColumns): CsvParseResult {
  const rawLines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (rawLines.length < 3) throw new Error("CSV has too few rows");
  const header = splitCsvLine(rawLines[0]);

  const dateCol = columns ? header.indexOf(columns.date) : findColumn(header, ["date", "timestamp", "time", "day"]);
  if (dateCol < 0) throw new Error("Could not find a date column");
  const tickerCol = columns ? header.indexOf(columns.ticker) : findColumn(header, ["ticker", "symbol", "permno", "secid", "name"]);
  const closeCol = columns ? header.indexOf(columns.close) : findColumn(header, ["adj_close", "adjclose", "adjusted", "close", "price", "px_last"]);
  const industryCol = columns?.industry ? header.indexOf(columns.industry) : findColumn(header, ["industry", "sector", "gics"]);

  const dateSet = new Set<string>();
  const perTicker = new Map<string, Map<string, number>>();
  const industries = new Map<string, string>();

  const isLong = tickerCol >= 0 && closeCol >= 0;
  if (isLong) {
    for (let i = 1; i < rawLines.length; i += 1) {
      const cells = splitCsvLine(rawLines[i]);
      const date = normalizeTimestamp(cells[dateCol] ?? "");
      const symbol = (cells[tickerCol] ?? "").toUpperCase();
      const close = Number(cells[closeCol]);
      if (!date || !symbol || !Number.isFinite(close) || close <= 0) continue;
      dateSet.add(date);
      let byDate = perTicker.get(symbol);
      if (!byDate) perTicker.set(symbol, (byDate = new Map()));
      byDate.set(date, close);
      if (industryCol >= 0 && !industries.has(symbol)) industries.set(symbol, cells[industryCol] ?? "Uncategorized");
    }
    const data = assemble(label, dateSet, perTicker, industries);
    return {
      data,
      detected: {
        layout: "long",
        frequency: data.frequency,
        columns: { date: header[dateCol], ticker: header[tickerCol], close: header[closeCol], industry: industryCol >= 0 ? header[industryCol] : undefined }
      },
      dropped: []
    };
  }

  // wide: every non-date column is a ticker's price series
  const tickerCols = header.map((name, index) => ({ name: name.toUpperCase(), index })).filter((col) => col.index !== dateCol);
  for (let i = 1; i < rawLines.length; i += 1) {
    const cells = splitCsvLine(rawLines[i]);
    const date = normalizeTimestamp(cells[dateCol] ?? "");
    if (!date) continue;
    dateSet.add(date);
    for (const col of tickerCols) {
      const close = Number(cells[col.index]);
      if (!Number.isFinite(close) || close <= 0) continue;
      let byDate = perTicker.get(col.name);
      if (!byDate) perTicker.set(col.name, (byDate = new Map()));
      byDate.set(date, close);
    }
  }
  const wideData = assemble(label, dateSet, perTicker, industries);
  return { data: wideData, detected: { layout: "wide", frequency: wideData.frequency }, dropped: [] };
}
