// Alpha expression DSL (redesign v3, pillar A1): a tiny, safe, serializable
// expression language evaluated per (symbol, bar) with TRAILING windows only —
// no lookahead by construction. Every window/offset op ends at the evaluation
// index; evaluateAlpha never reads data past ctx.at.
//
// Factor primitives reimplement the same math as realBacktestEngine's families
// locally (no import) so composed formulas mean the same thing as the classic
// menu without creating a module cycle.

import { RealMarketData } from "./realMarket";

export type AlphaExpr = object;

export interface AlphaContext {
  data: RealMarketData;
  symbol: string;
  at: number; // bar index; evaluation NEVER reads past it
  industryPeers: Record<string, string[]>;
  periodsPerYear: number;
}

const MAX_DEPTH = 8;
const MAX_NODES = 64;
const WINDOW_MIN = 2;
const WINDOW_MAX = 500;
const SKIP_MAX = 250;

type BinaryOp = "+" | "-" | "*" | "/";

interface NumNode {
  kind: "num";
  value: number;
}

interface TerminalNode {
  kind: "terminal";
  name: string;
}

interface BinaryNode {
  kind: "binary";
  op: BinaryOp;
  left: AlphaNode;
  right: AlphaNode;
}

interface CallNode {
  kind: "call";
  name: string;
  args: AlphaNode[];
}

type AlphaNode = NumNode | TerminalNode | BinaryNode | CallNode;

const TERMINALS = ["close", "high", "low", "volume", "returns", "vwapproxy", "dollarvol"] as const;

// arg kinds: "expr" is any sub-expression; "window" / "skip" must be integer
// literals (clamped at parse time so the canonical form is stable).
type ArgKind = "expr" | "window" | "lag" | "skip";

interface FunctionSpec {
  args: ArgKind[];
  group: "ts" | "scalar" | "factor";
}

const FUNCTIONS: Record<string, FunctionSpec> = {
  ts_mean: { args: ["expr", "window"], group: "ts" },
  ts_std: { args: ["expr", "window"], group: "ts" },
  ts_rank: { args: ["expr", "window"], group: "ts" },
  ts_min: { args: ["expr", "window"], group: "ts" },
  ts_max: { args: ["expr", "window"], group: "ts" },
  ts_sum: { args: ["expr", "window"], group: "ts" },
  ts_zscore: { args: ["expr", "window"], group: "ts" },
  // A one-bar delta/delay is both valid and important for short-horizon
  // formulas. Windows retain their two-bar minimum; lags do not.
  delta: { args: ["expr", "lag"], group: "ts" },
  delay: { args: ["expr", "lag"], group: "ts" },
  ts_corr: { args: ["expr", "expr", "window"], group: "ts" },
  abs: { args: ["expr"], group: "scalar" },
  log: { args: ["expr"], group: "scalar" },
  sign: { args: ["expr"], group: "scalar" },
  sqrt: { args: ["expr"], group: "scalar" },
  pow2: { args: ["expr"], group: "scalar" },
  neg: { args: ["expr"], group: "scalar" },
  zn: { args: ["expr"], group: "scalar" }, // per-date cross-sectional z-score
  min: { args: ["expr", "expr"], group: "scalar" },
  max: { args: ["expr", "expr"], group: "scalar" },
  clamp: { args: ["expr", "expr", "expr"], group: "scalar" },
  mom: { args: ["window", "skip"], group: "factor" },
  rev: { args: ["window"], group: "factor" },
  vol: { args: ["window"], group: "factor" },
  amihud: { args: ["window"], group: "factor" },
  r52wk: { args: ["window"], group: "factor" },
  range_vol: { args: ["window"], group: "factor" },
  adv_log: { args: ["window"], group: "factor" },
  peer_gap: { args: ["window"], group: "factor" },
  quality_drift: { args: ["window"], group: "factor" }
};

// ---------------------------------------------------------------------------
// tokenizer + parser
// ---------------------------------------------------------------------------

interface Token {
  type: "num" | "ident" | "sym";
  text: string;
  pos: number;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < src.length) {
    const ch = src[pos];
    if (/\s/.test(ch)) {
      pos += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const match = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(pos));
      if (!match) throw new Error(`invalid number at position ${pos} in "${src}"`);
      tokens.push({ type: "num", text: match[0], pos });
      pos += match[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(src.slice(pos));
      tokens.push({ type: "ident", text: (match as RegExpExecArray)[0].toLowerCase(), pos });
      pos += (match as RegExpExecArray)[0].length;
      continue;
    }
    if ("+-*/(),".includes(ch)) {
      tokens.push({ type: "sym", text: ch, pos });
      pos += 1;
      continue;
    }
    throw new Error(`unexpected character "${ch}" at position ${pos} in "${src}"`);
  }
  return tokens;
}

function windowLiteral(node: AlphaNode, kind: ArgKind, fn: string): NumNode {
  if (node.kind !== "num" || !Number.isFinite(node.value)) {
    throw new Error(`${fn}: window arguments must be integer literals`);
  }
  const rounded = Math.round(node.value);
  const clamped =
    kind === "skip"
      ? Math.min(SKIP_MAX, Math.max(0, rounded))
      : kind === "lag"
        ? Math.min(WINDOW_MAX, Math.max(1, rounded))
        : Math.min(WINDOW_MAX, Math.max(WINDOW_MIN, rounded));
  return { kind: "num", value: clamped };
}

class Parser {
  private index = 0;

  constructor(private tokens: Token[], private src: string) {}

  private peek(): Token | null {
    return this.tokens[this.index] ?? null;
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (!token) throw new Error(`unexpected end of formula "${this.src}"`);
    this.index += 1;
    return token;
  }

  private expectSym(text: string): void {
    const token = this.next();
    if (token.type !== "sym" || token.text !== text) {
      throw new Error(`expected "${text}" at position ${token.pos} in "${this.src}", got "${token.text}"`);
    }
  }

  parse(): AlphaNode {
    const node = this.parseExpr();
    const rest = this.peek();
    if (rest) throw new Error(`unexpected "${rest.text}" at position ${rest.pos} in "${this.src}"`);
    return node;
  }

  private parseExpr(): AlphaNode {
    let left = this.parseTerm();
    let token = this.peek();
    while (token && token.type === "sym" && (token.text === "+" || token.text === "-")) {
      this.next();
      const right = this.parseTerm();
      left = { kind: "binary", op: token.text as BinaryOp, left, right };
      token = this.peek();
    }
    return left;
  }

  private parseTerm(): AlphaNode {
    let left = this.parseUnary();
    let token = this.peek();
    while (token && token.type === "sym" && (token.text === "*" || token.text === "/")) {
      this.next();
      const right = this.parseUnary();
      left = { kind: "binary", op: token.text as BinaryOp, left, right };
      token = this.peek();
    }
    return left;
  }

  private parseUnary(): AlphaNode {
    const token = this.peek();
    if (token && token.type === "sym" && token.text === "-") {
      this.next();
      const arg = this.parseUnary();
      // fold "-3" into a negative literal so the canonical form is stable
      if (arg.kind === "num") return { kind: "num", value: -arg.value };
      return { kind: "call", name: "neg", args: [arg] };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AlphaNode {
    const token = this.next();
    if (token.type === "num") return { kind: "num", value: Number(token.text) };
    if (token.type === "sym" && token.text === "(") {
      const inner = this.parseExpr();
      this.expectSym(")");
      return inner;
    }
    if (token.type === "ident") {
      const following = this.peek();
      if (following && following.type === "sym" && following.text === "(") {
        return this.parseCall(token.text, token.pos);
      }
      if ((TERMINALS as readonly string[]).includes(token.text)) {
        return { kind: "terminal", name: token.text };
      }
      throw new Error(`unknown terminal "${token.text}" at position ${token.pos} in "${this.src}"`);
    }
    throw new Error(`unexpected "${token.text}" at position ${token.pos} in "${this.src}"`);
  }

  private parseCall(name: string, pos: number): AlphaNode {
    const spec = FUNCTIONS[name];
    if (!spec) throw new Error(`unknown function "${name}" at position ${pos} in "${this.src}"`);
    this.expectSym("(");
    const args: AlphaNode[] = [];
    if (!(this.peek()?.type === "sym" && this.peek()?.text === ")")) {
      args.push(this.parseExpr());
      while (this.peek()?.type === "sym" && this.peek()?.text === ",") {
        this.next();
        args.push(this.parseExpr());
      }
    }
    this.expectSym(")");
    if (args.length !== spec.args.length) {
      throw new Error(`${name} expects ${spec.args.length} argument(s), got ${args.length}`);
    }
    const shaped = args.map((arg, index) =>
      spec.args[index] === "expr" ? arg : windowLiteral(arg, spec.args[index], name)
    );
    return { kind: "call", name, args: shaped };
  }
}

function walk(node: AlphaNode, visit: (node: AlphaNode, depth: number) => void, depth = 1): void {
  visit(node, depth);
  if (node.kind === "binary") {
    walk(node.left, visit, depth + 1);
    walk(node.right, visit, depth + 1);
  } else if (node.kind === "call") {
    for (const arg of node.args) walk(arg, visit, depth + 1);
  }
}

function treeStats(node: AlphaNode): { nodes: number; depth: number } {
  let nodes = 0;
  let depth = 0;
  walk(node, (_, d) => {
    nodes += 1;
    if (d > depth) depth = d;
  });
  return { nodes, depth };
}

function assertCaps(node: AlphaNode): void {
  const { nodes, depth } = treeStats(node);
  if (depth > MAX_DEPTH) throw new Error(`formula too deep: depth ${depth} exceeds max ${MAX_DEPTH}`);
  if (nodes > MAX_NODES) throw new Error(`formula too large: ${nodes} nodes exceeds max ${MAX_NODES}`);
}

export function parseAlpha(src: string): AlphaExpr {
  if (typeof src !== "string" || src.trim().length === 0) throw new Error("empty formula");
  const node = new Parser(tokenize(src), src).parse();
  assertCaps(node);
  return node;
}

export function validateAlpha(src: string): { ok: boolean; error?: string } {
  try {
    parseAlpha(src);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ---------------------------------------------------------------------------
// canonical formatting (parse -> format -> parse reproduces the same tree)
// ---------------------------------------------------------------------------

function precedence(node: AlphaNode): number {
  if (node.kind !== "binary") return 3;
  return node.op === "+" || node.op === "-" ? 1 : 2;
}

function formatNode(node: AlphaNode): string {
  switch (node.kind) {
    case "num":
      return String(node.value);
    case "terminal":
      return node.name;
    case "call":
      return `${node.name}(${node.args.map(formatNode).join(", ")})`;
    case "binary": {
      const own = precedence(node);
      // left child keeps parens only when strictly weaker; right child also when
      // equal, so the left-associative parse rebuilds this exact tree
      const left = precedence(node.left) < own ? `(${formatNode(node.left)})` : formatNode(node.left);
      const right = precedence(node.right) <= own ? `(${formatNode(node.right)})` : formatNode(node.right);
      return `${left} ${node.op} ${right}`;
    }
  }
}

export function formatAlpha(expr: AlphaExpr): string {
  return formatNode(expr as AlphaNode);
}

export function alphaComplexity(expr: AlphaExpr): number {
  const root = expr as AlphaNode;
  let complexity = 0;
  walk(root, (node) => {
    complexity += 1;
    if (node.kind === "call") {
      const spec = FUNCTIONS[node.name];
      if (!spec) return;
      spec.args.forEach((kind, index) => {
        const arg = node.args[index];
        if (kind !== "expr" && arg.kind === "num") complexity += arg.value / 64;
      });
    }
  });
  return complexity;
}

// ---------------------------------------------------------------------------
// evaluation (strictly trailing; index i never exceeds ctx.at)
// ---------------------------------------------------------------------------

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function seriesValue(ctx: AlphaContext, name: string, index: number): number | null {
  const ticker = ctx.data.tickers[ctx.symbol];
  if (!ticker || index < 0) return null;
  const close = ticker.closes[index];
  switch (name) {
    case "close":
      return close ?? null;
    case "high":
      return ticker.highs?.[index] ?? null;
    case "low":
      return ticker.lows?.[index] ?? null;
    case "volume":
      return ticker.volumes?.[index] ?? null;
    case "returns":
      return ctx.data.returns[ctx.symbol]?.[index] ?? null;
    case "vwapproxy": {
      const high = ticker.highs?.[index];
      const low = ticker.lows?.[index];
      if (high === null || high === undefined || low === null || low === undefined || close === null || close === undefined) {
        return null;
      }
      return (high + low + close) / 3;
    }
    case "dollarvol": {
      const volume = ticker.volumes?.[index];
      if (volume === null || volume === undefined || close === null || close === undefined) return null;
      return close * volume;
    }
    default:
      return null;
  }
}

// --- factor primitives: same math as realBacktestEngine's families ---------

function trailingReturn(closes: (number | null)[], at: number, lookback: number, skip = 0): number | null {
  const endIdx = at - skip;
  const startIdx = endIdx - lookback;
  if (startIdx < 0) return null;
  const start = closes[startIdx];
  const end = closes[endIdx];
  if (!start || !end) return null;
  return end / start - 1;
}

function trailingVol(returns: (number | null)[], at: number, window: number): number | null {
  if (at - window < 1) return null;
  let sum = 0;
  let count = 0;
  for (let index = at - window + 1; index <= at; index += 1) {
    const value = returns[index];
    if (value === null || value === undefined) return null;
    sum += value;
    count += 1;
  }
  const mean = sum / count;
  let variance = 0;
  for (let index = at - window + 1; index <= at; index += 1) {
    variance += ((returns[index] as number) - mean) ** 2;
  }
  return Math.sqrt(variance / Math.max(1, count - 1));
}

function trailingMax(closes: (number | null)[], at: number, window: number): number | null {
  let max = -Infinity;
  for (let index = Math.max(0, at - window); index <= at; index += 1) {
    const value = closes[index];
    if (value !== null && value !== undefined && value > max) max = value;
  }
  return Number.isFinite(max) ? max : null;
}

function avgDollarVolume(ctx: AlphaContext, at: number, window: number): number | null {
  const ticker = ctx.data.tickers[ctx.symbol];
  const volumes = ticker.volumes;
  if (!volumes) return null;
  let sum = 0;
  let count = 0;
  for (let index = Math.max(0, at - window + 1); index <= at; index += 1) {
    const volume = volumes[index];
    const close = ticker.closes[index];
    if (volume !== null && volume !== undefined && close) {
      sum += volume * close;
      count += 1;
    }
  }
  return count >= Math.max(5, window * 0.5) ? sum / count : null;
}

function amihudIlliquidity(ctx: AlphaContext, at: number, window: number): number | null {
  const ticker = ctx.data.tickers[ctx.symbol];
  const volumes = ticker.volumes;
  const returns = ctx.data.returns[ctx.symbol];
  if (!volumes || !returns) return null;
  let sum = 0;
  let count = 0;
  for (let index = Math.max(1, at - window + 1); index <= at; index += 1) {
    const ret = returns[index];
    const volume = volumes[index];
    const close = ticker.closes[index];
    if (ret !== null && ret !== undefined && volume !== null && volume !== undefined && volume > 0 && close) {
      sum += Math.abs(ret) / (volume * close);
      count += 1;
    }
  }
  return count >= Math.max(5, window * 0.5) ? (sum / count) * 1e9 : null;
}

function avgHighLowRange(ctx: AlphaContext, at: number, window: number): number | null {
  const ticker = ctx.data.tickers[ctx.symbol];
  const highs = ticker.highs;
  const lows = ticker.lows;
  if (!highs || !lows) return null;
  let sum = 0;
  let count = 0;
  for (let index = Math.max(0, at - window + 1); index <= at; index += 1) {
    const high = highs[index];
    const low = lows[index];
    const close = ticker.closes[index];
    if (high !== null && high !== undefined && low !== null && low !== undefined && close) {
      sum += (high - low) / close;
      count += 1;
    }
  }
  return count >= Math.max(5, window * 0.5) ? sum / count : null;
}

function peerGap(ctx: AlphaContext, at: number, window: number): number | null {
  const ticker = ctx.data.tickers[ctx.symbol];
  const peers = ctx.industryPeers[ticker.industry] ?? [];
  const own = trailingReturn(ticker.closes, at, window);
  if (own === null) return null;
  let sum = 0;
  let count = 0;
  for (const peer of peers) {
    if (peer === ctx.symbol) continue;
    const peerCloses = ctx.data.tickers[peer]?.closes;
    if (!peerCloses) continue;
    const peerReturn = trailingReturn(peerCloses, at, window);
    if (peerReturn !== null) {
      sum += peerReturn;
      count += 1;
    }
  }
  if (count < 2) return null;
  return -(own - sum / count);
}

function factorValue(ctx: AlphaContext, name: string, windows: number[], at: number): number | null {
  const ticker = ctx.data.tickers[ctx.symbol];
  const returns = ctx.data.returns[ctx.symbol];
  switch (name) {
    case "mom":
      return trailingReturn(ticker.closes, at, windows[0], windows[1]);
    case "rev": {
      const recent = trailingReturn(ticker.closes, at, windows[0]);
      return recent === null ? null : -recent;
    }
    case "vol":
      return trailingVol(returns, at, windows[0]);
    case "amihud":
      return amihudIlliquidity(ctx, at, windows[0]);
    case "r52wk": {
      const high = trailingMax(ticker.closes, at, windows[0]);
      const close = ticker.closes[at];
      if (!high || !close) return null;
      return close / high;
    }
    case "range_vol": {
      const range = avgHighLowRange(ctx, at, windows[0]);
      return range === null ? null : -range;
    }
    case "adv_log": {
      const adv = avgDollarVolume(ctx, at, windows[0]);
      return adv === null ? null : -Math.log(Math.max(1, adv));
    }
    case "peer_gap":
      return peerGap(ctx, at, windows[0]);
    case "quality_drift": {
      const drift = trailingReturn(ticker.closes, at, 120);
      const vol = trailingVol(returns, at, windows[0]);
      if (drift === null || vol === null) return null;
      return drift * 0.5 - vol * 0.5 * 12;
    }
    default:
      return null;
  }
}

// pearson correlation over paired arrays (no nulls)
function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  const denom = Math.sqrt(vx * vy);
  if (denom < 1e-12) return null;
  return cov / denom;
}

type Memo = Map<AlphaNode, Map<number, number | null>>;

// A formula is parsed once per backtest, then evaluated for every symbol. Cache
// each zn() node's per-date cross-section so component-level normalization is
// mathematically real without repeating the same N-symbol calculation N times.
const crossSectionCache = new WeakMap<AlphaNode, WeakMap<RealMarketData, Map<number, Map<string, number | null>>>>();

function crossSectionalZScore(node: AlphaNode, ctx: AlphaContext, index: number): number | null {
  let byData = crossSectionCache.get(node);
  if (!byData) {
    byData = new WeakMap();
    crossSectionCache.set(node, byData);
  }
  let byIndex = byData.get(ctx.data);
  if (!byIndex) {
    byIndex = new Map();
    byData.set(ctx.data, byIndex);
  }
  const cached = byIndex.get(index);
  if (cached) return cached.get(ctx.symbol) ?? null;

  const raw = new Map<string, number | null>();
  const finiteValues: number[] = [];
  for (const symbol of Object.keys(ctx.data.tickers)) {
    if (symbol === ctx.data.benchmark) continue;
    const value = evalNode(node, { ...ctx, symbol }, index, new Map());
    raw.set(symbol, value);
    if (value !== null && Number.isFinite(value)) finiteValues.push(value);
  }

  const normalized = new Map<string, number | null>();
  if (finiteValues.length < 2) {
    for (const symbol of raw.keys()) normalized.set(symbol, null);
  } else {
    const mean = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
    const variance = finiteValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (finiteValues.length - 1);
    const std = Math.sqrt(Math.max(0, variance));
    for (const [symbol, value] of raw) {
      normalized.set(symbol, value === null ? null : std < 1e-12 ? 0 : (value - mean) / std);
    }
  }
  byIndex.set(index, normalized);
  return normalized.get(ctx.symbol) ?? null;
}

function evalNode(node: AlphaNode, ctx: AlphaContext, index: number, memo: Memo): number | null {
  if (index < 0 || index > ctx.at) return null; // hard no-lookahead guard
  let byIndex = memo.get(node);
  if (byIndex) {
    const cached = byIndex.get(index);
    if (cached !== undefined) return cached;
  } else {
    byIndex = new Map();
    memo.set(node, byIndex);
  }
  const value = evalNodeUncached(node, ctx, index, memo);
  const result = value === null ? null : finite(value);
  byIndex.set(index, result);
  return result;
}

function evalWindowValues(node: AlphaNode, ctx: AlphaContext, index: number, window: number, memo: Memo): number[] | null {
  if (index - window + 1 < 0) return null;
  const values: number[] = [];
  for (let i = index - window + 1; i <= index; i += 1) {
    const value = evalNode(node, ctx, i, memo);
    if (value === null) return null; // any null propagates
    values.push(value);
  }
  return values;
}

function evalNodeUncached(node: AlphaNode, ctx: AlphaContext, index: number, memo: Memo): number | null {
  switch (node.kind) {
    case "num":
      return node.value;
    case "terminal":
      return seriesValue(ctx, node.name, index);
    case "binary": {
      const left = evalNode(node.left, ctx, index, memo);
      const right = evalNode(node.right, ctx, index, memo);
      if (left === null || right === null) return null;
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return right === 0 ? null : left / right;
      }
      return null;
    }
    case "call":
      return evalCall(node, ctx, index, memo);
  }
}

function evalCall(node: CallNode, ctx: AlphaContext, index: number, memo: Memo): number | null {
  const spec = FUNCTIONS[node.name];
  if (!spec) return null;
  if (spec.group === "factor") {
    const windows = node.args.map((arg) => (arg.kind === "num" ? arg.value : 0));
    return factorValue(ctx, node.name, windows, index);
  }
  if (spec.group === "scalar") {
    if (node.name === "zn") return crossSectionalZScore(node.args[0], ctx, index);
    const values: number[] = [];
    for (const arg of node.args) {
      const value = evalNode(arg, ctx, index, memo);
      if (value === null) return null;
      values.push(value);
    }
    switch (node.name) {
      case "abs":
        return Math.abs(values[0]);
      case "log":
        return values[0] <= 0 ? null : Math.log(values[0]);
      case "sign":
        return Math.sign(values[0]);
      case "sqrt":
        return values[0] < 0 ? null : Math.sqrt(values[0]);
      case "pow2":
        return values[0] * values[0];
      case "neg":
        return -values[0];
      case "min":
        return Math.min(values[0], values[1]);
      case "max":
        return Math.max(values[0], values[1]);
      case "clamp":
        return Math.min(Math.max(values[1], values[2]), Math.max(Math.min(values[1], values[2]), values[0]));
      default:
        return null;
    }
  }
  // time-series ops: trailing window ending at `index`
  const windowArg = node.args[node.args.length - 1];
  const window = windowArg.kind === "num" ? windowArg.value : 0;
  const child = node.args[0];
  switch (node.name) {
    case "delay":
      return evalNode(child, ctx, index - window, memo);
    case "delta": {
      const now = evalNode(child, ctx, index, memo);
      const past = evalNode(child, ctx, index - window, memo);
      if (now === null || past === null) return null;
      return now - past;
    }
    case "ts_corr": {
      const xs = evalWindowValues(node.args[0], ctx, index, window, memo);
      const ys = evalWindowValues(node.args[1], ctx, index, window, memo);
      if (!xs || !ys) return null;
      return pearson(xs, ys);
    }
    default: {
      const values = evalWindowValues(child, ctx, index, window, memo);
      if (!values) return null;
      switch (node.name) {
        case "ts_mean":
          return values.reduce((sum, value) => sum + value, 0) / values.length;
        case "ts_sum":
          return values.reduce((sum, value) => sum + value, 0);
        case "ts_min":
          return Math.min(...values);
        case "ts_max":
          return Math.max(...values);
        case "ts_std": {
          const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
          const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
          return Math.sqrt(variance);
        }
        case "ts_rank": {
          const current = values[values.length - 1];
          // Fractional rank: ties receive their average rank rather than the
          // arbitrary rank of the last equal observation.
          let below = 0;
          let equal = 0;
          for (const value of values) {
            if (value < current) below += 1;
            else if (value === current) equal += 1;
          }
          return (below + Math.max(0, equal - 1) / 2) / (values.length - 1);
        }
        case "ts_zscore": {
          const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
          const std = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
          if (std < 1e-12) return null;
          return (values[values.length - 1] - mean) / std;
        }
        default:
          return null;
      }
    }
  }
}

export function evaluateAlpha(expr: AlphaExpr, ctx: AlphaContext): number | null {
  const root = expr as AlphaNode;
  if (!Number.isInteger(ctx.at) || ctx.at < 0) return null;
  const memo: Memo = new Map();
  const value = evalNode(root, ctx, ctx.at, memo);
  return value === null ? null : finite(value);
}

// ---------------------------------------------------------------------------
// random growth, mutation, crossover (for the genetic miner)
// ---------------------------------------------------------------------------

const WINDOW_CHOICES = [5, 10, 20, 40, 60, 120, 250];
const SKIP_CHOICES = [0, 1, 2, 5, 10];
const TS_TWO_ARG = ["ts_mean", "ts_std", "ts_rank", "ts_min", "ts_max", "ts_sum", "ts_zscore", "delta", "delay"];
const SCALAR_ONE_ARG = ["abs", "log", "sign", "sqrt", "pow2", "neg", "zn"];
const FACTOR_ONE_WINDOW = ["rev", "vol", "amihud", "r52wk", "range_vol", "adv_log", "peer_gap", "quality_drift"];
const BINARY_OPS: BinaryOp[] = ["+", "-", "*", "/"];

function choose<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function randomWindow(rng: () => number): NumNode {
  return { kind: "num", value: choose(WINDOW_CHOICES, rng) };
}

function randomLeaf(rng: () => number): AlphaNode {
  const roll = rng();
  if (roll < 0.45) return { kind: "terminal", name: choose(TERMINALS, rng) };
  if (roll < 0.55) return { kind: "call", name: "mom", args: [randomWindow(rng), { kind: "num", value: choose(SKIP_CHOICES, rng) }] };
  return { kind: "call", name: choose(FACTOR_ONE_WINDOW, rng), args: [randomWindow(rng)] };
}

function growNode(rng: () => number, depth: number, maxDepth: number): AlphaNode {
  if (depth >= maxDepth || rng() < 0.25) return randomLeaf(rng);
  const roll = rng();
  if (roll < 0.35) {
    return {
      kind: "binary",
      op: choose(BINARY_OPS, rng),
      left: growNode(rng, depth + 1, maxDepth),
      right: rng() < 0.2 ? { kind: "num", value: Math.round(rng() * 40 - 20) / 10 || 1 } : growNode(rng, depth + 1, maxDepth)
    };
  }
  if (roll < 0.75) {
    const name = choose(TS_TWO_ARG, rng);
    return { kind: "call", name, args: [growNode(rng, depth + 1, maxDepth), randomWindow(rng)] };
  }
  if (roll < 0.85) {
    return {
      kind: "call",
      name: "ts_corr",
      args: [growNode(rng, depth + 1, maxDepth), growNode(rng, depth + 1, maxDepth), randomWindow(rng)]
    };
  }
  return { kind: "call", name: choose(SCALAR_ONE_ARG, rng), args: [growNode(rng, depth + 1, maxDepth)] };
}

export function randomAlpha(seedRng: () => number, maxDepth = 4): string {
  const boundedDepth = Math.min(Math.max(2, Math.round(maxDepth)), MAX_DEPTH - 2);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const node = growNode(seedRng, 1, boundedDepth);
    if (node.kind === "num") continue; // a bare constant is a degenerate signal
    const { nodes, depth } = treeStats(node);
    if (nodes <= MAX_NODES && depth <= MAX_DEPTH) return formatNode(node);
  }
  return formatNode(randomLeaf(seedRng));
}

interface NodeSite {
  node: AlphaNode;
  parent: BinaryNode | CallNode | null;
  slot: number; // 0=left/arg0, 1=right/arg1, ...
  windowKind: ArgKind; // "expr" unless the node sits in a window/skip slot
}

function collectSites(root: AlphaNode): NodeSite[] {
  const sites: NodeSite[] = [];
  const visit = (node: AlphaNode, parent: NodeSite["parent"], slot: number, windowKind: ArgKind): void => {
    sites.push({ node, parent, slot, windowKind });
    if (node.kind === "binary") {
      visit(node.left, node, 0, "expr");
      visit(node.right, node, 1, "expr");
    } else if (node.kind === "call") {
      const spec = FUNCTIONS[node.name];
      node.args.forEach((arg, index) => visit(arg, node, index, spec ? spec.args[index] : "expr"));
    }
  };
  visit(root, null, 0, "expr");
  return sites;
}

function cloneNode(node: AlphaNode): AlphaNode {
  return JSON.parse(JSON.stringify(node)) as AlphaNode;
}

function replaceChild(site: NodeSite, replacement: AlphaNode): void {
  const parent = site.parent;
  if (!parent) return;
  if (parent.kind === "binary") {
    if (site.slot === 0) parent.left = replacement;
    else parent.right = replacement;
  } else {
    parent.args[site.slot] = replacement;
  }
}

function pointMutate(site: NodeSite, rng: () => number): void {
  const node = site.node;
  if (node.kind === "num") {
    if (site.windowKind === "window") node.value = choose(WINDOW_CHOICES, rng);
    else if (site.windowKind === "skip") node.value = choose(SKIP_CHOICES, rng);
    else node.value = Math.round(node.value * (0.5 + rng()) * 1000) / 1000 || 1;
    return;
  }
  if (node.kind === "terminal") {
    node.name = choose(TERMINALS, rng);
    return;
  }
  if (node.kind === "binary") {
    node.op = choose(BINARY_OPS, rng);
    return;
  }
  // call: swap to another function with the same argument shape
  const spec = FUNCTIONS[node.name];
  if (!spec) return;
  if (spec.group === "ts" && node.name !== "ts_corr") node.name = choose(TS_TWO_ARG, rng);
  else if (spec.group === "scalar" && spec.args.length === 1) node.name = choose(SCALAR_ONE_ARG, rng);
  else if (spec.group === "factor" && spec.args.length === 1) node.name = choose(FACTOR_ONE_WINDOW, rng);
}

export function mutateAlpha(src: string, seedRng: () => number): string {
  const canonical = formatNode(parseAlpha(src) as AlphaNode);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const root = cloneNode(parseAlpha(canonical) as AlphaNode);
    const sites = collectSites(root);
    const site = choose(sites, seedRng);
    if (seedRng() < 0.6 || !site.parent) {
      pointMutate(site, seedRng);
    } else if (site.windowKind === "window" || site.windowKind === "skip") {
      pointMutate(site, seedRng);
    } else {
      replaceChild(site, growNode(seedRng, 1, 3));
    }
    const { nodes, depth } = treeStats(root);
    if (nodes > MAX_NODES || depth > MAX_DEPTH) continue;
    const out = formatNode(root);
    if (validateAlpha(out).ok && out !== canonical) return out;
  }
  return canonical;
}

export function crossoverAlpha(a: string, b: string, seedRng: () => number): string {
  const canonicalA = formatNode(parseAlpha(a) as AlphaNode);
  const rootB = parseAlpha(b) as AlphaNode;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const rootA = cloneNode(parseAlpha(canonicalA) as AlphaNode);
    // only splice into expression slots — window/skip slots must stay literals
    const sitesA = collectSites(rootA).filter((site) => site.parent && site.windowKind === "expr");
    const donorSites = collectSites(rootB).filter((site) => site.windowKind === "expr");
    if (sitesA.length === 0 || donorSites.length === 0) return canonicalA;
    const target = choose(sitesA, seedRng);
    const donor = cloneNode(choose(donorSites, seedRng).node);
    replaceChild(target, donor);
    const { nodes, depth } = treeStats(rootA);
    if (nodes > MAX_NODES || depth > MAX_DEPTH) continue;
    const out = formatNode(rootA);
    if (validateAlpha(out).ok) return out;
  }
  return canonicalA;
}
