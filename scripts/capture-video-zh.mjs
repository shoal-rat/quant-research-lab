// Captures all trailer footage in CHINESE mode (UI + dialogue + board in 中文)
// into work/video_zh/. Switches language first, then runs the loop so every
// bubble/card/board renders Chinese. Uses the re-arm + clearCards fixes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "work", "video_zh");
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
async function shoot(page, dir, n, interval, start = 0) {
  let i = start;
  for (let c = 0; c < n; c += 1) {
    await page.screenshot({ path: path.join(dir, `f_${String(i).padStart(4, "0")}.png`) });
    i += 1;
    await sleep(interval);
  }
  return i;
}
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
async function arm(page, mode) {
  await page.evaluate((m) => { const t = document.querySelector(`.love-whip-tool.${m}`); if (t) t.click(); }, mode);
  await sleep(180);
}
async function clickAgent(page, id) {
  await page.evaluate((aid) => { const el = document.querySelector(`.agent-2d-sprite[data-agent-id="${aid}"]`); if (el) el.click(); }, id);
}
async function toggleLang(page) {
  await page.evaluate(() => { const b = document.querySelectorAll(".hud-nav-button"); b[b.length - 1].click(); });
  await sleep(800);
}
async function setDirective(page, text) {
  await page.click(".boss-bar input");
  await page.evaluate((t) => {
    const input = document.querySelector(".boss-bar input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, t);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await page.keyboard.press("Enter");
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1.5 },
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "qrl-vidzh-")),
  args: ["--no-first-run", "--disable-gpu", "--force-color-profile=srgb"]
});
try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/#/office`, { waitUntil: "networkidle2" });
  await sleep(3500);

  // switch to Chinese FIRST, then warm up so all dialogue/cards/board are 中文
  await toggleLang(page);
  console.log("warm-up (zh)");
  await page.click(".loop-controls .primary-button");
  for (let i = 0; i < 90; i += 1) {
    await sleep(650);
    const n = await page.$(".loop-controls .secondary-button");
    if (n) await n.click();
    if (i % 30 === 0) console.log(`  warm ${i}/90`);
  }
  await clearCards(page);

  console.log("office_loop");
  await page.click(".loop-controls .primary-button").catch(() => {});
  await sleep(500);
  await shoot(page, clipDir("office_loop"), 150, 130);

  console.log("boss_directive");
  {
    const dir = clipDir("boss_directive");
    let idx = await shoot(page, dir, 6, 220);
    await setDirective(page, "试试低波动，只做多，盯紧成本");
    await shoot(page, dir, 76, 150, idx);
  }

  console.log("love_burst");
  {
    const dir = clipDir("love_burst");
    await clearCards(page);
    await arm(page, "love"); await clickAgent(page, "agent-strategy");
    let idx = await shoot(page, dir, 30, 110);
    await clearCards(page); await arm(page, "love"); await clickAgent(page, "agent-manager");
    idx = await shoot(page, dir, 26, 110, idx);
    await clearCards(page); await arm(page, "love"); await clickAgent(page, "agent-data");
    await shoot(page, dir, 22, 110, idx);
  }

  console.log("whip_gossip");
  {
    const dir = clipDir("whip_gossip");
    await clearCards(page);
    await arm(page, "whip"); await clickAgent(page, "agent-skeptic");
    let idx = await shoot(page, dir, 30, 115);
    await clearCards(page); await arm(page, "whip"); await clickAgent(page, "agent-risk");
    await shoot(page, dir, 26, 115, idx);
  }

  console.log("confetti");
  {
    const dir = clipDir("confetti");
    await clearCards(page);
    await page.click(".boss-bar input"); await sleep(150);
    await page.evaluate(() => window.__qrlDirector && window.__qrlDirector.celebrate());
    let idx = await shoot(page, dir, 60, 105);
    await page.evaluate(() => window.__qrlDirector && window.__qrlDirector.celebrate());
    await shoot(page, dir, 44, 105, idx);
  }

  console.log("board");
  {
    const dir = clipDir("board");
    await page.evaluate(() => { window.location.hash = "/board"; });
    await sleep(1400);
    await shoot(page, dir, 30, 200);
    await page.screenshot({ path: path.join(OUT, "board_still.png") });
    await page.evaluate(() => { window.location.hash = "/office"; });
    await sleep(700);
  }

  // bilingual beat: show it ALSO flips to English (source id "chinese")
  console.log("bilingual");
  {
    const dir = clipDir("chinese");
    await clearCards(page);
    let idx = await shoot(page, dir, 14, 150);     // a beat of Chinese office
    await toggleLang(page);                          // -> English
    idx = await shoot(page, dir, 22, 150, idx);
    await toggleLang(page);                          // back to Chinese
    await shoot(page, dir, 14, 150, idx);
  }

  console.log("wallpaper");
  {
    const dir = clipDir("wallpaper");
    const wp = await browser.newPage();
    await wp.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
    await wp.goto(`${BASE}/?wallpaper=1`, { waitUntil: "networkidle2" });
    await sleep(3500);
    let idx = await shoot(wp, dir, 34, 150);
    await wp.evaluate(() => { const orb = document.querySelector(".boss-orb, .boss-orb-button, [data-boss-orb]"); if (orb) orb.click(); });
    await shoot(wp, dir, 26, 150, idx);
    await wp.close();
  }

  console.log("ALL DONE (zh)");
} finally {
  await browser.close();
}
