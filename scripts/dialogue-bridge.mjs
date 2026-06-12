// Local dialogue bridge: lets the browser app generate character dialogue
// through your already-authenticated Claude Code / Codex CLIs (cheapest
// models) instead of raw API keys.
//
//   npm run dialogue-bridge          # starts http://127.0.0.1:8787
//
// Endpoints:
//   GET  /health            -> { ok, claude, codex }
//   POST /condense          -> { text } | { error }
//        body: { backend: "claude-code" | "codex", prompt: string, model?: string }
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
const isWindows = process.platform === "win32";

// CLIs run from a neutral temp directory so they never pick up a project's
// CLAUDE.md/AGENTS.md context and start "helping" instead of writing dialogue.
const NEUTRAL_CWD = fs.mkdtempSync(path.join(os.tmpdir(), "qrl-bridge-"));

function run(command, args, { stdin, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: isWindows, windowsHide: true, cwd: NEUTRAL_CWD });
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
    send(res, 200, { ok: true, claude, codex, claudeModel: CLAUDE_MODEL, codexModel: CODEX_MODEL });
    return;
  }
  if (req.method === "POST" && req.url === "/condense") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
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
  console.log(`Quant Research Lab dialogue bridge on http://127.0.0.1:${PORT}`);
  console.log(`  claude model: ${CLAUDE_MODEL} | codex model: ${CODEX_MODEL}`);
  console.log("  the game calls POST /condense; keep this window open while playing");
});
