// Renders the README SVGs to PNG for visual verification.
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: "new"
});
const page = await browser.newPage();
for (const [name, w, h] of [["banner", 1200, 320], ["loop-diagram", 1100, 560], ["architecture", 1100, 430]]) {
  await page.setViewport({ width: w, height: h });
  const url = "file:///" + path.join(root, "docs", "media", `${name}.svg`).split(path.sep).join("/");
  await page.goto(url);
  await new Promise((resolve) => setTimeout(resolve, 600));
  await page.screenshot({ path: path.join(root, "work", "capture", `svg_${name}.png`) });
}
await browser.close();
console.log("rendered");
