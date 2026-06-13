// Captures real-gameplay footage for the ~2-minute trailer using Chrome for
// Testing (immune to the user's running Edge). Dev server must be on PORT.
// Each clip is a folder of sequential PNGs under work/video/<clip>/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "work", "video");
const CHROME = path.join(root, "work", "browsers", "chrome", "win64-149.0.7827.115", "chrome-win64", "chrome.exe");
const PORT = process.env.QRL_PORT || "5174";
const BASE = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clipDir(name) {
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function shoot(page, dir, n, interval, startIndex = 0) {
  let i = startIndex;
  for (let c = 0; c < n; c += 1) {
    await page.screenshot({ path: path.join(dir, `f_${String(i).padStart(4, "0")}.png`) });
    i += 1;
    if (interval > 0) await sleep(interval);
  }
  return i;
}

async function setLoveWhip(page, mode) {
  await page.evaluate((m) => {
    const tool = document.querySelector(`.love-whip-tool.${m}`);
    if (tool) tool.click();
  }, mode);
}

async function clickAgent(page, id) {
  await page.evaluate((aid) => {
    const el = document.querySelector(`.agent-2d-sprite[data-agent-id="${aid}"]`);
    if (el) el.click();
  }, id);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1.5 },
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "qrl-vid-")),
  args: ["--no-first-run", "--disable-gpu", "--force-color-profile=srgb"]
});

try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/#/office`, { waitUntil: "networkidle2" });
  await sleep(3500);

  // ---- warm up: populate leaderboard, fund NAV, niches, bandit, board ----
  console.log("warm-up");
  await page.click(".loop-controls .primary-button");
  for (let i = 0; i < 90; i += 1) {
    await sleep(650);
    const next = await page.$(".loop-controls .secondary-button");
    if (next) await next.click();
    if (i % 30 === 0) console.log(`  warm ${i}/90`);
  }
  await sleep(600);

  // ---- office_loop: the signature wide footage ----
  console.log("office_loop");
  await page.click(".loop-controls .primary-button").catch(() => {});
  await sleep(500);
  await shoot(page, clipDir("office_loop"), 150, 130);

  // ---- boss_directive: type + submit + reactions ----
  console.log("boss_directive");
  {
    const dir = clipDir("boss_directive");
    let idx = await shoot(page, dir, 6, 200);
    await page.click(".boss-bar input");
    await page.type(".boss-bar input", "Try low-volatility, long only, watch the costs!", { delay: 38 });
    idx = await shoot(page, dir, 6, 220, idx);
    await page.keyboard.press("Enter");
    await shoot(page, dir, 70, 150, idx);
  }

  // ---- love_burst: hearts on a researcher (cute) ----
  console.log("love_burst");
  {
    const dir = clipDir("love_burst");
    await setLoveWhip(page, "love");
    await sleep(250);
    await clickAgent(page, "agent-strategy");
    let idx = await shoot(page, dir, 36, 110);
    await clickAgent(page, "agent-code");
    await shoot(page, dir, 30, 110, idx);
  }

  // ---- whip_gossip: criticize -> gossip (cute indignation) ----
  console.log("whip_gossip");
  {
    const dir = clipDir("whip_gossip");
    await setLoveWhip(page, "whip");
    await sleep(250);
    await clickAgent(page, "agent-skeptic");
    let idx = await shoot(page, dir, 34, 120);
    await clickAgent(page, "agent-risk");
    await shoot(page, dir, 30, 120, idx);
  }

  // ---- confetti: forced promotion celebration (peak cuteness) ----
  console.log("confetti");
  {
    const dir = clipDir("confetti");
    // clear love/whip mode so clicks don't interfere
    await page.evaluate(() => {
      const cancel = document.querySelector(".love-whip-tool.active");
      if (cancel) cancel.click();
    });
    await page.evaluate(() => window.__qrlDirector && window.__qrlDirector.celebrate());
    await shoot(page, dir, 64, 110);
    // a second burst for more material
    await page.evaluate(() => window.__qrlDirector && window.__qrlDirector.celebrate());
    await shoot(page, dir, 40, 110, 64);
  }

  // ---- board: Fund & Research Board ----
  console.log("board");
  {
    const dir = clipDir("board");
    await page.evaluate(() => { window.location.hash = "/board"; });
    await sleep(1400);
    await shoot(page, dir, 30, 200);
    await page.screenshot({ path: path.join(OUT, "board_still.png") });
  }

  // ---- chinese: full zh office reacting to a zh directive ----
  console.log("chinese");
  {
    const dir = clipDir("chinese");
    await page.evaluate(() => { window.location.hash = "/office"; });
    await sleep(700);
    await page.evaluate(() => {
      const buttons = document.querySelectorAll(".hud-nav-button");
      buttons[buttons.length - 1].click(); // language globe is the last HUD nav button
    });
    await sleep(900);
    let idx = await shoot(page, dir, 20, 150);
    await page.click(".boss-bar input");
    await page.evaluate(() => {
      const input = document.querySelector(".boss-bar input");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "试试动量策略，持有五天");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.keyboard.press("Enter");
    idx = await shoot(page, dir, 60, 150, idx);
    // switch back to English for any later runs
    await page.evaluate(() => {
      const buttons = document.querySelectorAll(".hud-nav-button");
      buttons[buttons.length - 1].click();
    });
  }

  // ---- wallpaper: chrome-free desktop mode + boss orb ----
  console.log("wallpaper");
  {
    const dir = clipDir("wallpaper");
    const wp = await browser.newPage();
    await wp.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
    await wp.goto(`${BASE}/?wallpaper=1`, { waitUntil: "networkidle2" });
    await sleep(3500);
    let idx = await shoot(wp, dir, 34, 150);
    // open the boss orb if present
    await wp.evaluate(() => {
      const orb = document.querySelector(".boss-orb, .boss-orb-button, [data-boss-orb]");
      if (orb) orb.click();
    });
    await shoot(wp, dir, 26, 150, idx);
    await wp.close();
  }

  console.log("ALL DONE");
} finally {
  await browser.close();
}
