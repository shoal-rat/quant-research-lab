// Renders the README SVGs to PNG for visual verification.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await puppeteer.launch({
  executablePath: path.join(root, "work", "browsers", "chrome", "win64-149.0.7827.115", "chrome-win64", "chrome.exe"),
  headless: "new",
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "qrl-svg-")),
  args: ["--no-first-run", "--disable-gpu"]
});
const page = await browser.newPage();
for (const [name, w, h] of [["banner", 1200, 320], ["loop-diagram", 1100, 640], ["architecture", 1100, 560]]) {
  await page.setViewport({ width: w, height: h });
  const url = "file:///" + path.join(root, "docs", "media", `${name}.svg`).split(path.sep).join("/");
  await page.goto(url);
  await new Promise((resolve) => setTimeout(resolve, 600));
  await page.screenshot({ path: path.join(root, "work", "capture", `svg_${name}.png`) });
}
await browser.close();
console.log("rendered");
