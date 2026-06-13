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
// The two /dataset/* routes are how a very large dataset is handled: the CLI
// reads it where it lives (a big local file, Parquet, DuckDB/SQLite/Postgres,
// or a URL) and streams back only the strategy's daily returns — nothing is
// downloaded into the browser. They run the CLI with code/file access, so they
// are OFF unless you start the bridge with QRL_ALLOW_DATA_TOOLS=1.
//
// The app builds the prompt and validates the JSON reply; this server only
// shells out to the CLI. It binds to 127.0.0.1 only.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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
const DATA_REASONING = process.env.QRL_DATA_REASONING ?? "high"; // codex effort: low|medium|high|xhigh
const DATA_CLAUDE_MODEL = process.env.QRL_DATA_CLAUDE_MODEL ?? "claude-opus-4-8"; // strongest for hard data work
// Off by default: these endpoints run the CLI with file/DB/code access on your
// machine. Opt in with QRL_ALLOW_DATA_TOOLS=1 when you want big-data mode.
const ALLOW_DATA_TOOLS = process.env.QRL_ALLOW_DATA_TOOLS === "1";
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

function tmpWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qrl-data-"));
}

// Local file-ish sources get their own directory mounted so the agent can read
// them; URL / Postgres sources run in a throwaway workspace.
function workspaceForSource(source) {
  const localKinds = new Set(["file", "parquet", "duckdb", "sqlite"]);
  if (localKinds.has(source.kind) && source.ref && fs.existsSync(source.ref)) {
    const dir = fs.statSync(source.ref).isDirectory() ? source.ref : path.dirname(source.ref);
    return { cwd: dir, addDir: dir, cleanup: false };
  }
  const dir = tmpWorkspace();
  return { cwd: dir, addDir: dir, cleanup: true };
}

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

async function datasetInspect(backend, source) {
  const workspace = workspaceForSource(source);
  const prompt = `Inspect this market dataset and report a compact profile. Do NOT load the whole thing into memory — read the header, then use COUNT / MIN / MAX / DISTINCT (duckdb or SQL) or chunked reads.

SOURCE: ${JSON.stringify(source)}

It is long-format price data (a date/timestamp column, a ticker/symbol column, an adjusted-close/price column, optionally an industry/sector column) OR wide-format (a date/timestamp column and one price column per ticker). Detect which.

Also detect the sampling FREQUENCY from the spacing between consecutive timestamps for one ticker: tick, minute, hourly, daily, weekly, or monthly. Report the matching periodsPerYear (minute≈98280, hourly≈1764, daily≈252, weekly≈52, monthly≈12). The timestamp column may include a time-of-day.

Reply with ONLY this JSON object:
{"label":"<short human label>","tickers":<distinct ticker count>,"rows":<total row count>,"start":"<min timestamp>","end":"<max timestamp>","frequency":"<tick|minute|hourly|daily|weekly|monthly>","periodsPerYear":<number>,"columns":{"date":"<col>","ticker":"<col or '' if wide>","close":"<col>","industry":"<col or ''>"},"note":"<one short caveat or layout note>"}`;
  try {
    const result = backend === "codex" ? await runCodexAgentic(prompt, workspace) : await runClaudeAgentic(prompt, workspace);
    const json = extractJson(result.stdout);
    if (!json) return { error: `no JSON from ${backend}: ${(result.stderr || result.stdout || "").slice(-300)}` };
    return { result: json };
  } finally {
    if (workspace.cleanup) fs.rmSync(workspace.cwd, { recursive: true, force: true });
  }
}

async function datasetReturns(backend, source, strategy, params) {
  const workspace = workspaceForSource(source);
  const prompt = `Backtest one strategy over this dataset and return its per-period return series at the data's NATIVE frequency. The dataset may be very large — stream it (duckdb, or pandas in chunks); do not hold it all in memory.

SOURCE: ${JSON.stringify(source)}
STRATEGY: ${JSON.stringify(strategy)}
DATE RANGE: ${params.start} to ${params.end}
TRANSACTION COST: ${params.transactionCostBps} bps per side

${SIGNAL_SPEC}

Detect the native frequency first. Compute the portfolio's after-cost return for every bar in range (hourly bars if the data is hourly, daily if daily, etc.). If there are more than 4000 bars, keep them all but you MAY round returns to 6 dp. Also compute the benchmark's per-bar return (a benchmark column if present, else an equal-weight index of all names), the average per-rebalance turnover, and an average concentration (mean Herfindahl of absolute weights, 0..1).

Reply with ONLY this JSON object:
{"dates":["<bar timestamp>", ...],"returns":[<after-cost per-bar return>, ...],"benchmarkReturns":[<per-bar>, ...],"frequency":"<tick|minute|hourly|daily|weekly|monthly>","periodsPerYear":<number>,"universe":<name count>,"turnover":<avg per-rebalance turnover>,"concentration":<0..1>,"note":"<one short note>"}
dates and returns MUST be the same length.`;
  try {
    const result = backend === "codex" ? await runCodexAgentic(prompt, workspace) : await runClaudeAgentic(prompt, workspace);
    const json = extractJson(result.stdout);
    if (!json) return { error: `no JSON from ${backend}: ${(result.stderr || result.stdout || "").slice(-300)}` };
    return { result: json };
  } finally {
    if (workspace.cleanup) fs.rmSync(workspace.cwd, { recursive: true, force: true });
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
        const outcome =
          req.url === "/dataset/inspect"
            ? await datasetInspect(backend, source)
            : await datasetReturns(backend, source, payload.strategy ?? {}, payload.params ?? {});
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
        const started = Date.now();
        const text =
          backend === "codex" ? await condenseWithCodex(prompt, model) : await condenseWithClaude(prompt, model);
        console.log(`[bridge] ${backend} ok in ${((Date.now() - started) / 1000).toFixed(1)}s (${text.length} chars)`);
        send(res, 200, { text });
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
  if (ALLOW_DATA_TOOLS) {
    console.log(`  BIG-DATA MODE ON: /dataset/inspect + /dataset/returns let the agent read local files/DBs at any frequency`);
    console.log(`    data model: claude=${DATA_CLAUDE_MODEL} | codex reasoning=${DATA_REASONING}`);
  } else {
    console.log(`  big-data mode OFF — set QRL_ALLOW_DATA_TOOLS=1 to let the CLI backtest large local/remote/DB datasets`);
  }
  console.log("  keep this window open while playing");
});
