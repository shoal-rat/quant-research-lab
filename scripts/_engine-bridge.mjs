// Bundles the TypeScript lab engine (validate-strategy.mts -> the real
// runRealBacktest + risk gate + walk-forward) into a Node-importable ESM module
// via esbuild, so the paper-trading scripts validate strategies through the EXACT
// same engine the in-browser lab uses (not a re-implementation). The output is
// gitignored (scripts/.engine-*.mjs).
import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let cached = null;

export async function loadValidator() {
  if (cached) return cached;
  const entry = path.join(here, "validate-strategy.mts");
  const out = path.join(here, ".engine-validate.mjs");
  await esbuild.build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    logLevel: "silent"
  });
  cached = await import(`${pathToFileURL(out).href}?t=${fs.statSync(out).mtimeMs}`);
  return cached;
}
