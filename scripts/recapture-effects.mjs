// Clean re-capture of love_burst / whip_gossip / confetti. Love & Whip are
// single-use, so the tool is re-armed before every sprite click (a click with
// no active tool opens a profile card). Cards are dismissed before celebrate().
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

function clipDir(name) {
  const dir = path.join(VID, name);
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
  await page.evaluate((m) => {
    const t = document.querySelector(`.love-whip-tool.${m}`);
    if (t) t.click();
  }, mode);
  await sleep(180);
}
async function clickAgent(page, id) {
  await page.evaluate((aid) => {
    const el = document.querySelector(`.agent-2d-sprite[data-agent-id="${aid}"]`);
    if (el) el.click();
  }, id);
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1.5 },
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "qrl-fx-")),
  args: ["--no-first-run", "--disable-gpu", "--force-color-profile=srgb"]
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/#/office`, { waitUntil: "networkidle2" });
  await sleep(3500);
  await page.click(".loop-controls .primary-button");
  for (let i = 0; i < 24; i += 1) { await sleep(600); const n = await page.$(".loop-controls .secondary-button"); if (n) await n.click(); }
  await sleep(500);

  // love_burst — re-arm before each click so every click bursts hearts
  console.log("love_burst");
  {
    const dir = clipDir("love_burst");
    await clearCards(page);
    await arm(page, "love"); await clickAgent(page, "agent-strategy");
    let idx = await shoot(page, dir, 30, 110);
    await clearCards(page);
    await arm(page, "love"); await clickAgent(page, "agent-manager");
    idx = await shoot(page, dir, 26, 110, idx);
    await clearCards(page);
    await arm(page, "love"); await clickAgent(page, "agent-data");
    await shoot(page, dir, 22, 110, idx);
  }

  // whip_gossip
  console.log("whip_gossip");
  {
    const dir = clipDir("whip_gossip");
    await clearCards(page);
    await arm(page, "whip"); await clickAgent(page, "agent-skeptic");
    let idx = await shoot(page, dir, 30, 115);
    await clearCards(page);
    await arm(page, "whip"); await clickAgent(page, "agent-risk");
    await shoot(page, dir, 26, 115, idx);
  }

  // confetti — fully clean, no lingering cards/tools
  console.log("confetti");
  {
    const dir = clipDir("confetti");
    await clearCards(page);
    await page.click(".boss-bar input"); // defocus any selection
    await sleep(150);
    await page.evaluate(() => window.__qrlDirector && window.__qrlDirector.celebrate());
    let idx = await shoot(page, dir, 60, 105);
    await page.evaluate(() => window.__qrlDirector && window.__qrlDirector.celebrate());
    await shoot(page, dir, 44, 105, idx);
  }
  console.log("DONE");
} finally {
  await browser.close();
}
