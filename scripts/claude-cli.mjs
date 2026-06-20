// Shared Claude Code research-CLI helper: runs `claude -p` with the prompt on
// STDIN (a long multi-line argv prompt is truncated by the Windows shell), parses
// the JSON result, and detects rate limits + their reset time so callers can run a
// model fallback ladder (opus -> sonnet -> sleep until reset).
import { spawn } from "node:child_process";

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

// Query Claude with a model fallback ladder; on the last model's rate limit, sleep
// until the reset time (or 1h) then retry. Returns the first parseable JSON object,
// or null if research is unavailable before `deadlineMs`.
export async function researchJson(prompt, { cwd, models = ["opus", "sonnet"], deadlineMs = Infinity, log = () => {} } = {}) {
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const r = await runClaude(prompt, model, cwd);
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
