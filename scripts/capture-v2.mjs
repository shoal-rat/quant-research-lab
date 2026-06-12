// Captures v2.0 demo media with Chrome for Testing (immune to the user's
// running Edge session). Dev server must be running on 5198.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(root, "work", "capture");
const CHROME = path.join(root, "work", "browsers", "chrome", "win64-149.0.7827.115", "chrome-win64", "chrome.exe");

function outDir(name) {
  const dir = path.join(outRoot, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const counters = new Map();

async function frames(page, dir, count, intervalMs) {
  let index = counters.get(dir) ?? 0;
  for (let captured = 0; captured < count; captured += 1) {
    await page.screenshot({ path: path.join(dir, `frame_${String(index).padStart(3, "0")}.png`) });
    index += 1;
    await sleep(intervalMs);
  }
  counters.set(dir, index);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  defaultViewport: { width: 1280, height: 760 },
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "qrl-chrome-")),
  args: ["--no-first-run", "--disable-gpu"]
});

try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5198/#/office", { waitUntil: "networkidle2" });
  await sleep(3500);

  // warm up: fast-forward many iterations off-camera so the leaderboard,
  // fund NAV, niche archive, bandit posteriors and PBO all have real content
  await page.click(".loop-controls .primary-button");
  for (let i = 0; i < 240; i += 1) {
    await sleep(900);
    const next = await page.$(".loop-controls .secondary-button");
    if (next) await next.click();
    if (i % 40 === 0) console.log(`warm-up ${i}/240`);
  }
  await sleep(800);

  // Scenario A: real-data loop running
  console.log("A: office real-data loop");
  await page.click(".loop-controls .primary-button").catch(() => {});
  await sleep(800);
  await frames(page, outDir("office2"), 46, 780);

  // Scenario B: boss interactions
  console.log("B: boss scene");
  const bossDir = outDir("boss2");
  await page.click(".boss-bar input");
  await page.type(".boss-bar input", "Try low volatility, long only, be strict about costs!", { delay: 26 });
  await frames(page, bossDir, 3, 420);
  await page.keyboard.press("Enter");
  await frames(page, bossDir, 13, 560);
  await page.click(".love-whip-tool.love");
  await sleep(380);
  await page.click('.agent-2d-sprite[data-agent-id="agent-strategy"]');
  await frames(page, bossDir, 8, 380);
  await page.click(".love-whip-tool.whip");
  await sleep(380);
  await page.click('.agent-2d-sprite[data-agent-id="agent-code"]');
  await frames(page, bossDir, 10, 420);

  // Scenario C: the Fund & Research Board (crisp PNG)
  console.log("C: board");
  await page.evaluate(() => {
    window.location.hash = "/board";
  });
  await sleep(1400);
  await page.screenshot({ path: path.join(outRoot, "board_v2.png") });

  // Scenario D: Chinese office still
  console.log("D: zh still");
  await page.evaluate(() => {
    window.location.hash = "/office";
  });
  await sleep(600);
  await page.evaluate(() => {
    const buttons = document.querySelectorAll(".hud-nav-button");
    buttons[buttons.length - 1].click();
  });
  await sleep(1500);
  await page.click(".boss-bar input");
  await page.evaluate(() => {
    const input = document.querySelector(".boss-bar input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "试试低波动，严格控制成本");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.keyboard.press("Enter");
  await sleep(8200);
  await page.screenshot({ path: path.join(outRoot, "office_zh.png") });

  console.log("done");
} finally {
  await browser.close();
}
