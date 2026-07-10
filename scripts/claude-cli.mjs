// Shared research-CLI helper: runs `claude -p` (or the Codex CLI as the last rung
// of the ladder) with the prompt on STDIN (a long multi-line argv prompt is
// truncated by the Windows shell), parses the JSON result, and detects rate limits
// + their reset time so callers can run a model fallback ladder
// (opus -> sonnet -> codex -> sleep until reset).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function extractJson(text) {
  const m = text && text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export function parseResetTime(s) {
  const u = s.match(/reset[^0-9]{0,14}(\d{10})/i);
  if (u) return new Date(Number(u[1]) * 1000);
  const t = s.match(/reset[s]?\b[^0-9]{0,14}(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (t) {
    let h = Number(t[1]);
    const min = Number(t[2] || 0);
    const ap = (t[3] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    const d = new Date();
    d.setHours(h, min, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d;
  }
  return null;
}

export function runClaude(prompt, model, cwd) {
  return new Promise((resolve) => {
    const cp = spawn(
      "claude",
      ["-p", "--model", model, "--output-format", "json", "--allowedTools", "WebSearch,WebFetch", "--permission-mode", "bypassPermissions"],
      { cwd, shell: process.platform === "win32" }
    );
    let out = "";
    let err = "";
    cp.stdout.on("data", (d) => (out += d));
    cp.stderr.on("data", (d) => (err += d));
    cp.on("error", (e) => resolve({ ok: false, error: String(e), rateLimited: false }));
    try {
      cp.stdin.write(prompt);
      cp.stdin.end();
    } catch {
      /* stdin closed on spawn error */
    }
    cp.on("close", () => {
      const blob = `${out}\n${err}`;
      const rateLimited = /usage limit|rate.?limit|too many requests|\b429\b|limit reached|overloaded/i.test(blob);
      const resetAt = parseResetTime(blob);
      let text = "";
      try {
        const j = JSON.parse(out);
        if (j.is_error) {
          resolve({ ok: false, error: String(j.result || "error"), rateLimited, resetAt });
          return;
        }
        text = j.result ?? j.text ?? "";
      } catch {
        text = out;
      }
      if (rateLimited && !extractJson(text)) {
        resolve({ ok: false, rateLimited: true, resetAt, error: "rate limited" });
        return;
      }
      resolve({ ok: true, text, rateLimited, resetAt });
    });
  });
}

// The Codex CLI ships inside the ChatGPT desktop app; resolve it so the research
// ladder still works when `claude` is logged out or rate limited.
export function codexBinary() {
  if (process.env.QRL_CODEX_BIN && existsSync(process.env.QRL_CODEX_BIN)) return process.env.QRL_CODEX_BIN;
  for (const candidate of [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/Applications/Codex.app/Contents/Resources/codex"
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return "codex"; // hope PATH has it (npm i -g @openai/codex, linux, etc.)
}

const CODEX_TIMEOUT_MS = 5 * 60 * 1000;

export function runCodex(prompt, cwd) {
  return new Promise((resolve) => {
    // --output-last-message gives just the final answer, so JSON extraction is
    // not confused by the agent transcript on stdout
    const outDir = mkdtempSync(path.join(os.tmpdir(), "qrl-codex-"));
    const outFile = path.join(outDir, "last.txt");
    const cp = spawn(
      codexBinary(),
      ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--output-last-message", outFile, "-"],
      { cwd, shell: false }
    );
    let err = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        rmSync(outDir, { recursive: true, force: true });
      } catch {
        /* temp cleanup is best-effort */
      }
      resolve(result);
    };
    const timer = setTimeout(() => {
      try {
        cp.kill("SIGKILL");
      } catch {
        /* already gone */
      }
      finish({ ok: false, error: "codex timeout", rateLimited: false });
    }, CODEX_TIMEOUT_MS);
    cp.stdout.on("data", () => {});
    cp.stderr.on("data", (d) => (err += d));
    cp.on("error", (e) => {
      clearTimeout(timer);
      finish({ ok: false, error: String(e), rateLimited: false });
    });
    try {
      cp.stdin.write(prompt);
      cp.stdin.end();
    } catch {
      /* stdin closed on spawn error */
    }
    cp.on("close", (code) => {
      clearTimeout(timer);
      let text = "";
      try {
        text = readFileSync(outFile, "utf8");
      } catch {
        text = "";
      }
      const rateLimited = /usage limit|rate.?limit|too many requests|\b429\b|limit reached/i.test(err);
      if (!text && code !== 0) {
        finish({ ok: false, error: `codex exit ${code}: ${err.slice(0, 200)}`, rateLimited, resetAt: parseResetTime(err) });
        return;
      }
      finish({ ok: true, text, rateLimited, resetAt: null });
    });
  });
}

// Query the research brain with a fallback ladder (claude opus -> claude sonnet ->
// codex); on the last rung's rate limit, sleep until the reset time (or 1h) then
// retry. Returns the first parseable JSON object, or null if research is
// unavailable before `deadlineMs`.
export async function researchJson(prompt, { cwd, models = ["opus", "sonnet", "codex"], deadlineMs = Infinity, log = () => {} } = {}) {
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const r = model === "codex" ? await runCodex(prompt, cwd) : await runClaude(prompt, model, cwd);
    if (r.ok) {
      const parsed = extractJson(r.text || "");
      if (parsed) return { parsed, model };
      log({ model, msg: "unparseable", sample: (r.text || "").slice(0, 140) });
    }
    if (r.rateLimited) {
      if (i < models.length - 1) {
        log({ model, msg: "rate limited -> next model", resetAt: r.resetAt?.toISOString() });
        continue;
      }
      const waitMs = r.resetAt ? r.resetAt.getTime() - Date.now() : 60 * 60 * 1000;
      log({ model, msg: "all models limited; sleeping to reset", until: r.resetAt?.toISOString(), waitMin: Math.round(waitMs / 60000) });
      await new Promise((res) => setTimeout(res, Math.max(0, waitMs) + 30_000));
      if (Date.now() < deadlineMs) return researchJson(prompt, { cwd, models, deadlineMs, log });
      return null;
    }
    log({ model, msg: "failed (non-limit), trying next", error: r.error });
  }
  return null;
}
