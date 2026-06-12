// Quick verification snapshot of the running dev server (zh mode + loop).
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: "new",
  defaultViewport: { width: 1380, height: 820 }
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5198/#/office", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));
// switch to Chinese, start the loop
await page.evaluate(() => {
  const buttons = document.querySelectorAll(".hud-nav-button");
  buttons[buttons.length - 1].click();
});
await new Promise((r) => setTimeout(r, 600));
await page.click(".loop-controls .primary-button");
await new Promise((r) => setTimeout(r, 24000));
await page.screenshot({ path: path.join(root, "work", "capture", "verify_zh.png") });
console.log("saved verify_zh.png");
await browser.close();
