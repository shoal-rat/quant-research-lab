// Local dialogue bridge: lets the browser app generate character dialogue
// through your already-authenticated Claude Code / Codex CLIs (cheapest
// models) instead of raw API keys.
//
//   npm run dialogue-bridge          # starts http://127.0.0.1:8787
//
// Endpoints:
//   GET  /health            -> { ok, claude, codex, dataTools }
//   POST /condense          -> { text } | { error }
//        body: { backend: "claude-code" | "codex", prompt: string, model?: string }
//   POST /dataset/inspect   -> { result: {label,tickers,rows,start,end,columns,note} } | { error }
//        body: { backend, source: { kind, ref, query?, columns? } }
//   POST /dataset/returns   -> { result: {dates,returns,benchmarkReturns,universe,turnover,...} } | { error }
//        body: { backend, source, strategy, params }
//
// The two /dataset/* routes are how a very large dataset is handled: the agent
// reads it where it lives (a big local file, Parquet, DuckDB/SQLite/Postgres,
// or a URL) and writes a reusable backtest KERNEL once; thereafter every
// backtest just runs that cached kernel (plain python, no LLM) and streams back
// the strategy's per-period returns — nothing is downloaded into the browser.
// They run the CLI with code/file access, so they are OFF unless you start the
// bridge with QRL_ALLOW_DATA_TOOLS=1.
//
// The app builds the prompt and validates the JSON reply; this server only
// shells out to the CLI. It binds to 127.0.0.1 only.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.QRL_BRIDGE_PORT ?? 8787);
const CLAUDE_MODEL = process.env.QRL_CLAUDE_MODEL ?? "claude-haiku-4-5";
// ChatGPT-account Codex only serves its own model lineup, so default to the
// account's model at low reasoning effort (the cheap path). API-key users can
// set QRL_CODEX_MODEL=gpt-5.4-nano or similar.
const CODEX_MODEL = process.env.QRL_CODEX_MODEL ?? "default";
const TIMEOUT_MS = 45000;
// Dataset endpoints let the CLI run real analysis code over a (possibly very
// large) local file or database, so they get a stronger model, more reasoning,
// and a longer timeout than the cheap dialogue path. The agent owns the data:
// it detects the format AND the frequency (hourly/daily/weekly/monthly/...) and
// computes whatever we ask for, so the browser never assumes a shape.
const DATA_TIMEOUT_MS = Number(process.env.QRL_DATA_TIMEOUT_MS ?? 480000);
// web research (search + multiple fetches + reasoning) is the slowest path
const RESEARCH_TIMEOUT_MS = Number(process.env.QRL_RESEARCH_TIMEOUT_MS ?? 720000);
const DATA_REASONING = process.env.QRL_DATA_REASONING ?? "high"; // codex effort: low|medium|high|xhigh
const DATA_CLAUDE_MODEL = process.env.QRL_DATA_CLAUDE_MODEL ?? "claude-opus-4-8"; // strongest for hard data work
// Off by default: these endpoints run the CLI with file/DB/code access on your
// machine. Opt in with QRL_ALLOW_DATA_TOOLS=1 when you want big-data mode.
const ALLOW_DATA_TOOLS = process.env.QRL_ALLOW_DATA_TOOLS === "1";
// The agent writes a reusable backtest KERNEL (kernel.py) ONCE per data source;
// it is cached here and then executed for every strategy/params with NO further
// LLM call. This is how "the agent owns all the calculation" stays cheap: one
// agent run per source, then free forever.
const KERNEL_DIR = path.join(os.tmpdir(), "qrl-kernels");
// dialogue replies are deterministic enough to reuse for an identical prompt
const condenseCache = new Map();
const isWindows = process.platform === "win32";

// CLIs run from a neutral temp directory so they never pick up a project's
// CLAUDE.md/AGENTS.md context and start "helping" instead of writing dialogue.
const NEUTRAL_CWD = fs.mkdtempSync(path.join(os.tmpdir(), "qrl-bridge-"));

function run(command, args, { stdin, timeoutMs = TIMEOUT_MS, cwd = NEUTRAL_CWD } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: isWindows, windowsHide: true, cwd });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: -1, stdout, stderr: `${stderr}\n[bridge] timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(error) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

const availability = { claude: null, codex: null };

async function checkCli(name) {
  if (availability[name] !== null) return availability[name];
  const result = await run(name, ["--version"], { timeoutMs: 15000 });
  availability[name] = result.code === 0;
  return availability[name];
}

async function condenseWithClaude(prompt, model) {
  // headless print mode; prompt over stdin avoids shell-quoting issues
  const result = await run(
    "claude",
    [
      "-p",
      "--model",
      model ?? CLAUDE_MODEL,
      "--output-format",
      "text",
      "--max-turns",
      "1",
      "--append-system-prompt",
      "You are a dialogue-generation API. Reply with ONLY the requested JSON object. No prose, no markdown, no questions."
    ],
    { stdin: prompt }
  );
  if (result.code !== 0) throw new Error(`claude CLI exit ${result.code}: ${result.stderr.slice(-400)}`);
  return result.stdout.trim();
}

async function condenseWithCodex(prompt, model) {
  // codex exec reads the prompt from stdin with "-"; the last agent message
  // is written to a temp file so we do not have to parse the transcript
  const outFile = path.join(os.tmpdir(), `qrl-codex-${randomUUID()}.txt`);
  try {
    const chosenModel = model ?? CODEX_MODEL;
    const args = ["exec", "--skip-git-repo-check", "-c", "model_reasoning_effort=low", "--output-last-message", outFile];
    if (chosenModel && chosenModel !== "default") {
      args.push("--model", chosenModel);
    }
    args.push("-");
    const result = await run("codex", args, { stdin: prompt });
    if (result.code !== 0) throw new Error(`codex CLI exit ${result.code}: ${result.stderr.slice(-400)}`);
    if (fs.existsSync(outFile)) {
      return fs.readFileSync(outFile, "utf8").trim();
    }
    return result.stdout.trim();
  } finally {
    fs.rmSync(outFile, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Dataset endpoints: the agent reads a large dataset where it lives, detects its
// format AND frequency, and returns a compact JSON profile (/dataset/inspect) or
// the strategy's per-period returns + periodsPerYear (/dataset/returns). The
// browser turns returns into honest metrics + gates, annualized correctly for
// hourly / daily / weekly / monthly data alike.
// ---------------------------------------------------------------------------

// Compact, deterministic spec so both CLIs compute the same cross-section the
// in-browser engine does — keeping bridge results comparable to bundled ones.
// Frequency-agnostic: a "bar" is one row of the data's native frequency (a tick,
// a minute, an hour, a day, a week, a month — you detect it). Window parameters
// named "...Days" are counts of BARS, not calendar days.
const SIGNAL_SPEC = `Cross-sectional procedure (identical to the in-app engine), at the data's NATIVE frequency:
- Universe = all tickers in the source except any benchmark column.
- A "bar" = one timestamp of the native frequency. Detect the frequency (tick/minute/hourly/daily/weekly/monthly) from the timestamp spacing and report periodsPerYear (e.g. daily≈252, hourly≈252*7, weekly≈52, monthly≈12, minute≈252*390).
- For each rebalance bar t (every <holding> bars), score every name with the family signal using ONLY data up to and including bar t (no lookahead). Window params named "...Days" are counts of BARS.
- Rank names by signal; long the top 30% (equal weight 1/k), and if portfolio=long_short also short the bottom 30% (equal weight -1/k).
- Hold those weights; each subsequent bar earn sum(weight_i * simple_return_{i, next bar}).
- On each rebalance subtract cost = 0.5*sum|w_new - w_old| * 2 * (bps/10000) from that bar's return.
Family signals (params in the strategy JSON, sensible defaults if absent):
- xs_momentum: trailing return over lookbackDays bars skipping the last skipDays bars, minus 10*volatilityPenalty*stdev(per-bar ret,20).
- short_term_reversal: negative of the trailing return over reversalWindow bars.
- low_volatility: negative trailing stdev of per-bar returns over volatilityWindow bars.
- quality: profitabilityWeight*trailingReturn(120 bars) - (1-profitabilityWeight)*12*stdev(stabilityWindow bars).
- seasonality: 1 if the calendar day-of-month is in the turn-of-month window (>=28+entryDayOffset or <=max(1,holdDays-3)), else 0 (time-series, equal-weight the 1s).
- pairs_statarb: negative of (own 60-bar return minus the mean 60-bar return of same-industry peers).
- lead_lag: mean of industry peers' trailing 10-bar return as of bar t-lagDays.
- vol_managed: trailingReturn(120 bars skip 5) * clamp(targetVol/sqrt(periodsPerYear)/stdev(varianceWindow bars), 0.2, leverageCap).
- trend_overlay: 1 if close > (1+bufferPct)*MA(trendWindow bars), else 0 (time-series).
- fifty_two_week_high: close / trailing max close over lookbackDays bars.`;


async function runClaudeAgentic(prompt, workspace) {
  // --output-format json wraps the run in a JSON envelope whose `result` field
  // is the model's final message (separated from tool logs) — far more reliable
  // to parse than scraping mixed stdout. We keep OAuth (NOT --bare, which would
  // force an API key) so it runs on the player's subscription.
  const args = [
    "-p",
    "--model",
    DATA_CLAUDE_MODEL,
    "--output-format",
    "json",
    "--max-turns",
    "20",
    "--permission-mode",
    "bypassPermissions",
    "--allowedTools",
    "Bash,Read,Write,Glob",
    "--add-dir",
    workspace.addDir,
    "--append-system-prompt",
    "You are a data-analysis API. First detect the data's format AND sampling frequency, then use your tools to run code (python/pandas/duckdb/sqlite3) that streams only as much as needed; never load a huge file fully into memory. Reply with ONLY the requested JSON object as your final message."
  ];
  const result = await run("claude", [...args], { stdin: prompt, timeoutMs: DATA_TIMEOUT_MS, cwd: workspace.cwd });
  // unwrap the envelope to the final assistant text
  try {
    const envelope = JSON.parse(result.stdout);
    if (envelope && typeof envelope.result === "string") {
      return { ...result, stdout: envelope.result };
    }
  } catch {
    /* fall through: use raw stdout */
  }
  return result;
}

async function runCodexAgentic(prompt, workspace) {
  const outFile = path.join(os.tmpdir(), `qrl-codex-${randomUUID()}.txt`);
  try {
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--sandbox",
      "danger-full-access",
      "-c",
      `model_reasoning_effort=${DATA_REASONING}`,
      "--output-last-message",
      outFile
    ];
    if (CODEX_MODEL && CODEX_MODEL !== "default") args.push("--model", CODEX_MODEL);
    args.push("-");
    const result = await run("codex", args, { stdin: prompt, timeoutMs: DATA_TIMEOUT_MS, cwd: workspace.cwd });
    const text = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : result.stdout;
    return { ...result, stdout: text };
  } finally {
    fs.rmSync(outFile, { force: true });
  }
}

function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// --- agent-generated reusable kernel cache -------------------------------
// The agent writes kernel.py + meta.json for a source ONCE; both are cached
// under a signature of the source. Inspect reads meta.json; returns runs
// kernel.py (plain python, no LLM) for any strategy/params. One agent call per
// source, then every backtest is free.

let pythonCmdCache = null;
async function pythonCmd() {
  if (pythonCmdCache) return pythonCmdCache;
  for (const cmd of ["python", "python3"]) {
    const probe = await run(cmd, ["--version"], { timeoutMs: 8000 });
    if (probe.code === 0) return (pythonCmdCache = cmd);
  }
  return (pythonCmdCache = "python");
}

function sourceSignature(source, extraFamilies = []) {
  let stamp = "";
  try {
    if (source.ref && fs.existsSync(source.ref) && fs.statSync(source.ref).isFile()) {
      const st = fs.statSync(source.ref);
      stamp = `${st.size}:${Math.round(st.mtimeMs)}`; // file edits bust the cache automatically
    }
  } catch {
    /* ignore */
  }
  // discovered families are part of the kernel, so a new discovery busts it
  const fam = extraFamilies
    .map((f) => `${f.key}=${f.signalSpec}`)
    .sort()
    .join("|");
  const raw = JSON.stringify({ kind: source.kind, ref: source.ref ?? "", query: source.query ?? "", columns: source.columns ?? null, stamp, fam });
  return createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

function kernelPaths(sig) {
  const dir = path.join(KERNEL_DIR, sig);
  return { dir, kernel: path.join(dir, "kernel.py"), meta: path.join(dir, "meta.json") };
}

function readCachedKernel(sig) {
  const { kernel, meta } = kernelPaths(sig);
  if (fs.existsSync(kernel) && fs.existsSync(meta)) {
    try {
      return { kernel, meta: JSON.parse(fs.readFileSync(meta, "utf8")) };
    } catch {
      /* corrupt meta -> regenerate */
    }
  }
  return null;
}

// self-test the kernel on several DIFFERENT families during generation so bugs
// in any one branch (a length mismatch, an empty bucket) surface before the
// kernel is cached, not on a later backtest
const SAMPLE_JOBS = (source) => {
  const wide = { start: "1900-01-01", end: "2100-01-01", transactionCostBps: 10 };
  const mk = (familyKey, parameters, portfolioType = "long_short") => ({
    source,
    strategy: { familyKey, parameters, holdingPeriod: 5, portfolioType },
    params: wide
  });
  return [
    mk("xs_momentum", { lookbackDays: 60, skipDays: 2, volatilityPenalty: 0.3 }),
    mk("low_volatility", { volatilityWindow: 20 }),
    mk("short_term_reversal", { reversalWindow: 5 }),
    mk("trend_overlay", { trendWindow: 100, bufferPct: 0.01 }, "long_only")
  ];
};

async function generateKernel(backend, source, sig, failureHint = "", extraFamilies = []) {
  const { dir, kernel, meta } = kernelPaths(sig);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // the agent works in the kernel dir (writes kernel.py + meta.json there) and
  // can read the source dir for local files
  let sourceDir = dir;
  try {
    if (source.ref && fs.existsSync(source.ref)) {
      sourceDir = fs.statSync(source.ref).isDirectory() ? source.ref : path.dirname(source.ref);
    }
  } catch {
    /* url/db: no local dir */
  }
  const workspace = { cwd: dir, addDir: sourceDir, cleanup: false };

  const prompt = `Set up a REUSABLE backtest kernel for a market dataset, ONCE. Write two files into the CURRENT directory.

SOURCE: ${JSON.stringify(source)}

(1) meta.json — a compact profile, detecting the layout (long: date,ticker,close[,industry]  OR  wide: date + one price column per ticker) and the sampling FREQUENCY from timestamp spacing. Do NOT load the whole file — use duckdb / chunked reads / COUNT/MIN/MAX/DISTINCT.
{"label":"<short>","tickers":<distinct count>,"rows":<row count>,"start":"<min ts>","end":"<max ts>","frequency":"<tick|minute|hourly|daily|weekly|monthly>","periodsPerYear":<minute≈98280|hourly≈1764|daily≈252|weekly≈52|monthly≈12>,"columns":{"date":"<col>","ticker":"<col or '' if wide>","close":"<col>","industry":"<col or ''>"},"note":"<short>"}

(2) kernel.py — a self-contained, REUSABLE Python 3 program. It reads ONE JSON "job" from stdin:
{"source":{<same shape as SOURCE>},"strategy":{"familyKey","parameters","holdingPeriod","portfolioType"},"params":{"start","end","transactionCostBps"}}
It must work for ANY strategy/params with NO edits. It reads the source path from job["source"]["ref"] (stream it; never load a huge file fully), applies the format you detected, computes the cross-section below, and prints ONLY the result JSON:
{"dates":[...],"returns":[...],"benchmarkReturns":[...],"frequency":"...","periodsPerYear":N,"universe":N,"turnover":f,"concentration":f,"note":"..."}
dates and returns MUST be equal length. params.start/end may be wide-open (1900..2100) meaning "all data".

${SIGNAL_SPEC}
${extraFamilies.length ? `\nADDITIONAL families discovered from the literature — implement these too, same cross-sectional procedure, signal computed from price/return windows:\n${extraFamilies.map((f) => `- ${f.key}: ${f.signalSpec}`).join("\n")}\n` : ""}
After writing both files, SELF-TEST kernel.py on EACH of these sample jobs (pipe each via stdin) and FIX the kernel until ALL of them print valid result JSON with len(dates)==len(returns)>0 and only finite numbers. They cover different families on purpose — a kernel that only works for momentum is a bug:
${JSON.stringify(SAMPLE_JOBS(source))}
ALSO self-test once more with params.start/end set to a SUBSET inside the data's actual date range (pick a start/end strictly inside the min/max you found) — the kernel must still return the bars in that window, not crash or return empty. The wide-open 1900..2100 range means "all data".
Watch for: off-by-one length mismatches between price and return arrays, empty long/short buckets on thin days, NaN/inf, and date filtering that wrongly empties the result. The kernel must be GENERAL (handle every family in the spec and any date sub-range), not specialized to one job.
${failureHint ? `\nIMPORTANT — your previous kernel FAILED at runtime with this error; fix exactly this:\n${failureHint}\n` : ""}
When BOTH files exist and ALL self-tests pass, reply with ONLY {"kernelReady":true}.`;

  const result = backend === "codex" ? await runCodexAgentic(prompt, workspace) : await runClaudeAgentic(prompt, workspace);
  if (!fs.existsSync(kernel) || !fs.existsSync(meta)) {
    throw new Error(`agent did not produce kernel.py + meta.json: ${(result.stderr || result.stdout || "").slice(-300)}`);
  }
  return { kernel, meta: JSON.parse(fs.readFileSync(meta, "utf8")) };
}

async function ensureKernel(backend, source, extraFamilies = []) {
  const sig = sourceSignature(source, extraFamilies);
  const cached = readCachedKernel(sig);
  if (cached) return { ...cached, sig, cached: true };
  const fresh = await generateKernel(backend, source, sig, "", extraFamilies);
  return { ...fresh, sig, cached: false };
}

async function runKernel(kernelPath, job) {
  const py = await pythonCmd();
  const result = await run(py, [kernelPath], { stdin: JSON.stringify(job), timeoutMs: DATA_TIMEOUT_MS, cwd: path.dirname(kernelPath) });
  if (result.code !== 0) throw new Error(`kernel exit ${result.code}: ${(result.stderr || "").slice(-300)}`);
  const json = extractJson(result.stdout);
  if (!json) throw new Error(`kernel produced no JSON: ${(result.stdout || "").slice(-200)}`);
  return json;
}

async function datasetInspect(backend, source, extraFamilies = []) {
  try {
    const { meta, cached, sig } = await ensureKernel(backend, source, extraFamilies);
    return { result: { ...meta, cached, kernelId: sig } };
  } catch (error) {
    return { error: String(error.message ?? error) };
  }
}

async function datasetReturns(backend, source, strategy, params, extraFamilies = []) {
  try {
    const ensured = await ensureKernel(backend, source, extraFamilies);
    const job = { source, strategy, params };
    let out;
    try {
      out = await runKernel(ensured.kernel, job); // free: no LLM, just runs the cached kernel
    } catch (kernelError) {
      // the cached kernel choked on this job — regenerate once with the error
      // as a hint so the agent fixes that exact failure, then retry
      const hint = String(kernelError.message ?? kernelError).slice(-600);
      console.error(`[bridge] kernel re-run failed (${hint.slice(0, 120)}); regenerating with the error as a hint`);
      const regen = await generateKernel(backend, source, ensured.sig, hint, extraFamilies);
      out = await runKernel(regen.kernel, job);
      ensured.meta = regen.meta;
    }
    if (out.periodsPerYear === undefined && ensured.meta.periodsPerYear !== undefined) out.periodsPerYear = ensured.meta.periodsPerYear;
    if (!out.frequency && ensured.meta.frequency) out.frequency = ensured.meta.frequency;
    out.cached = ensured.cached;
    return { result: out };
  } catch (error) {
    return { error: String(error.message ?? error) };
  }
}

// --- /research/strategies: the agent reads the web for NEW strategy families --
// Web-only (no local file access), so it does not need big-data mode. Returns
// new families with a kernel-ready signalSpec + the URLs the agent actually read.
async function runClaudeResearch(prompt) {
  const args = [
    "-p",
    "--model",
    DATA_CLAUDE_MODEL,
    "--output-format",
    "json",
    "--max-turns",
    "24",
    "--permission-mode",
    "bypassPermissions",
    "--allowedTools",
    "WebSearch,WebFetch,Bash,Read,Write",
    "--append-system-prompt",
    "You are a quant research analyst. Use web search + fetch to read recent papers, news and institution research reports, then reply with ONLY the requested JSON object as your final message."
  ];
  const result = await run("claude", [...args], { stdin: prompt, timeoutMs: RESEARCH_TIMEOUT_MS, cwd: NEUTRAL_CWD });
  try {
    const envelope = JSON.parse(result.stdout);
    if (envelope && typeof envelope.result === "string") return { ...result, stdout: envelope.result };
  } catch {
    /* use raw stdout */
  }
  return result;
}

async function researchStrategies(backend, topic, existingKeys) {
  const prompt = `You are the research analyst of a quant desk. Search the web — recent academic / working papers, reputable financial news, and institution or sell-side research reports — for systematic CROSS-SECTIONAL equity strategies (factors) computable from DAILY or intraday PRICE/return data ALONE (no fundamentals, no news columns).

Also search messy investor information sources when useful: earnings-call transcripts, company releases, Reddit, X, forums, GitHub repos, industry reports, SEC filings, and regulatory filings.

Your job is not summarization. Convert what you read into tradable hypotheses, then compile each vague idea into a concrete cross-sectional signal. Keep retail / social sources as sentiment evidence only; do not treat them as proof.

The executable signalSpec must be price/return computable so the current kernel can backtest it, but the discoveryCard should still name any richer point-in-time data that would improve the serious version.

${topic ? `Focus on: ${topic}` : "Find genuinely useful, ideally lesser-known, price-based factors."}

Do NOT repeat families we already have: ${(existingKeys || []).join(", ") || "(none)"}.

Return 1-3 NEW families. Each needs a "signalSpec": a ONE-LINE cross-sectional signal formula in the SAME STYLE as these, computable from trailing price/return windows so a backtest kernel can implement it:
${SIGNAL_SPEC}

Reply with ONLY this JSON object (cite REAL URLs you actually fetched):
{"families":[{"key":"snake_case_id","name":"...","factorKind":"momentum|mean_reversion|low_volatility|quality_proxy|seasonality|lead_lag|pairs|vol_managed|trend_overlay|event_drift|earnings_revision|news_sentiment","rationaleKind":"risk_premium|behavioral|structural","rationale":"one-sentence economic story","construction":"how the portfolio is built","signalSpec":"<key>: <one-line formula from price/return windows>","holdingPeriods":[5],"netSharpe":[0.2,0.6],"costSensitivity":"low|medium|high","crowdingRisk":"low|medium|high","failureModes":["...","..."],"parameters":[{"name":"...","min":0,"max":0,"default":0,"step":0}],"keyPapers":["Author (Year) Title"],"references":["https://..."],"discoveryCard":{"phenomenon":"what is happening in the world","whyAlphaMayExist":"why mispricing or flow pressure may exist","tradableUniverse":"names/industries/ETFs this can trade","requiredData":["point-in-time prices","source timestamps"],"signalConstruction":"concrete signal recipe","timestampLag":"minimum lag before trading","holdingPeriod":"expected holding period","failureRisks":["lookahead risk","crowding risk"],"sourceCitations":[{"title":"...","url":"https://...","sourceType":"sec_filing|earnings_call|regulatory_filing|company_press_release|academic_paper|industry_report|sell_side|news|github|forum|reddit|x|anonymous_rumor|other","publishedAt":"YYYY-MM-DD","note":"why this source matters"}]},"compiledSignal":{"universe":"electrical equipment companies","feature":"frequency of theme mentions or price-derived proxy","rank":"30 day change in theme intensity","lag":"1 trading day","hold":"20 trading days","portfolio":"long_short","formula":"kernel-ready signal formula","rebalance":"rebalance rule"}}]}
Only include families whose signalSpec is genuinely computable from price/return data.`;
  try {
    const result = backend === "codex" ? await runCodexAgentic(prompt, { cwd: NEUTRAL_CWD, addDir: NEUTRAL_CWD }) : await runClaudeResearch(prompt);
    const json = extractJson(result.stdout);
    if (!json || !Array.isArray(json.families)) {
      return { error: `no families from ${backend}: ${(result.stderr || result.stdout || "").slice(-300)}` };
    }
    return { result: json };
  } catch (error) {
    return { error: String(error.message ?? error) };
  }
}

function send(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    const [claude, codex] = await Promise.all([checkCli("claude"), checkCli("codex")]);
    send(res, 200, { ok: true, claude, codex, claudeModel: CLAUDE_MODEL, codexModel: CODEX_MODEL, dataTools: ALLOW_DATA_TOOLS });
    return;
  }

  if (req.method === "POST" && (req.url === "/dataset/inspect" || req.url === "/dataset/returns")) {
    if (!ALLOW_DATA_TOOLS) {
      send(res, 403, { error: "big-data mode is off; restart the bridge with QRL_ALLOW_DATA_TOOLS=1 to let the CLI read local files/databases" });
      return;
    }
    let body = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", async () => {
      if (tooBig) return;
      try {
        const payload = JSON.parse(body);
        const backend = payload.backend === "codex" ? "codex" : "claude-code";
        const source = payload.source ?? {};
        if (!source.kind) {
          send(res, 400, { error: "missing source.kind" });
          return;
        }
        const started = Date.now();
        const extras = Array.isArray(payload.extraFamilies) ? payload.extraFamilies : [];
        const outcome =
          req.url === "/dataset/inspect"
            ? await datasetInspect(backend, source, extras)
            : await datasetReturns(backend, source, payload.strategy ?? {}, payload.params ?? {}, extras);
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        if (outcome.error) {
          console.error(`[bridge] ${req.url} ${backend} failed in ${secs}s: ${outcome.error.slice(0, 200)}`);
          send(res, 502, outcome);
        } else {
          console.log(`[bridge] ${req.url} ${backend} ok in ${secs}s`);
          send(res, 200, outcome);
        }
      } catch (error) {
        console.error("[bridge]", String(error));
        send(res, 500, { error: String(error) });
      }
    });
    return;
  }
  if (req.method === "POST" && req.url === "/condense") {
    let body = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", async () => {
      if (tooBig) return;
      try {
        const { backend, prompt, model } = JSON.parse(body);
        if (typeof prompt !== "string" || prompt.length === 0 || prompt.length > 20000) {
          send(res, 400, { error: "invalid prompt" });
          return;
        }
        // identical dialogue prompts reuse the prior reply instead of spawning
        // the CLI again
        const cacheKey = `${backend}:${createHash("sha1").update(prompt).digest("hex")}`;
        const hit = condenseCache.get(cacheKey);
        if (hit !== undefined) {
          send(res, 200, { text: hit, cached: true });
          return;
        }
        const started = Date.now();
        const text =
          backend === "codex" ? await condenseWithCodex(prompt, model) : await condenseWithClaude(prompt, model);
        if (condenseCache.size > 200) condenseCache.clear();
        condenseCache.set(cacheKey, text);
        console.log(`[bridge] ${backend} ok in ${((Date.now() - started) / 1000).toFixed(1)}s (${text.length} chars)`);
        send(res, 200, { text });
      } catch (error) {
        console.error("[bridge]", String(error));
        send(res, 500, { error: String(error) });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/research/strategies") {
    let body = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 200_000) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", async () => {
      if (tooBig) return;
      try {
        const payload = JSON.parse(body);
        const backend = payload.backend === "codex" ? "codex" : "claude-code";
        const topic = typeof payload.topic === "string" ? payload.topic.slice(0, 400) : "";
        const existingKeys = Array.isArray(payload.existingKeys) ? payload.existingKeys.map(String).slice(0, 60) : [];
        const started = Date.now();
        const outcome = await researchStrategies(backend, topic, existingKeys);
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        if (outcome.error) {
          console.error(`[bridge] /research ${backend} failed in ${secs}s: ${outcome.error.slice(0, 200)}`);
          send(res, 502, outcome);
        } else {
          console.log(`[bridge] /research ${backend} ok in ${secs}s (${outcome.result.families?.length ?? 0} families)`);
          send(res, 200, outcome);
        }
      } catch (error) {
        console.error("[bridge]", String(error));
        send(res, 500, { error: String(error) });
      }
    });
    return;
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Quant Research Lab bridge on http://127.0.0.1:${PORT}`);
  console.log(`  claude model: ${CLAUDE_MODEL} | codex model: ${CODEX_MODEL}`);
  console.log(`  dialogue + research brain: POST /condense`);
  console.log(`  discover strategies (web search): POST /research/strategies`);
  if (ALLOW_DATA_TOOLS) {
    console.log(`  BIG-DATA MODE ON: the agent writes a reusable backtest kernel ONCE per source, then it runs free`);
    console.log(`    data model: claude=${DATA_CLAUDE_MODEL} | codex reasoning=${DATA_REASONING} | kernel cache: ${KERNEL_DIR}`);
  } else {
    console.log(`  big-data mode OFF — set QRL_ALLOW_DATA_TOOLS=1 to let the CLI backtest large local/remote/DB datasets`);
  }
  console.log("  keep this window open while playing");
});
