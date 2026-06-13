// Clean re-capture of the Chinese-mode clip (no lingering profile cards).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VID = path.join(root, "work", "video");
const CHROME = path.join(root, "work", "browsers", "chrome", "win64-149.0.7827.115", "chrome-win64", "chrome.exe");
const PORT = process.env.QRL_PORT || "5174";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = path.join(VID, "chinese");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

async function clearCards(page) {
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    document.querySelectorAll('.agent-profile-card, .profile-card, [class*="profile"] button, [aria-label="Close"], .modal-close')
      .forEach((el) => { try { el.click(); } catch (e) {} });
    const active = document.querySelector(".love-whip-tool.active");
    if (active) active.click();
  });
  await sleep(250);
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1.5 },
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "qrl-zh-")),
  args: ["--no-first-run", "--disable-gpu", "--force-color-profile=srgb"]
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/#/office`, { waitUntil: "networkidle2" });
  await sleep(3500);
  // switch to Chinese FIRST so all dialogue generates in Chinese
  await page.evaluate(() => {
    const b = document.querySelectorAll(".hud-nav-button");
    b[b.length - 1].click();
  });
  await sleep(700);
  await page.click(".loop-controls .primary-button");
  // run the loop in Chinese so bubbles + leaderboard cards are Chinese
  for (let i = 0; i < 22; i += 1) { await sleep(650); const n = await page.$(".loop-controls .secondary-button"); if (n) await n.click(); }
  await clearCards(page);
  let idx = 0;
  for (let c = 0; c < 18; c += 1) { await page.screenshot({ path: path.join(dir, `f_${String(idx++).padStart(4, "0")}.png`) }); await sleep(150); }
  await page.click(".boss-bar input");
  await page.evaluate(() => {
    const input = document.querySelector(".boss-bar input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "试试动量策略，持有五天");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.keyboard.press("Enter");
  for (let c = 0; c < 64; c += 1) { await page.screenshot({ path: path.join(dir, `f_${String(idx++).padStart(4, "0")}.png`) }); await sleep(150); }
  console.log("chinese re-captured:", idx, "frames");
} finally {
  await browser.close();
}
