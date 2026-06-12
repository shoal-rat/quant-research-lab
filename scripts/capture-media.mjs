// Captures animated demo frames of the running lab with headless Edge.
// Usage: node scripts/capture-media.mjs  (dev server must be running on 5198)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = path.join(root, "work", "capture");
const BASE = "http://127.0.0.1:5198";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function outDir(name) {
  const dir = path.join(outRoot, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const frameCounters = new Map();

async function captureFrames(page, dir, count, intervalMs) {
  let index = frameCounters.get(dir) ?? 0;
  for (let captured = 0; captured < count; captured += 1) {
    await page.screenshot({ path: path.join(dir, `frame_${String(index).padStart(3, "0")}.png`) });
    index += 1;
    await sleep(intervalMs);
  }
  frameCounters.set(dir, index);
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  defaultViewport: { width: 1280, height: 760 },
  args: ["--disable-gpu", "--no-first-run"]
});

try {
  const page = await browser.newPage();

  // Scenario A: fresh office, loop running with conversations
  console.log("scenario A: office loop");
  await page.goto(`${BASE}/#/office`, { waitUntil: "networkidle2" });
  await sleep(3500);
  await page.click(".loop-controls .primary-button");
  await sleep(1500);
  await captureFrames(page, outDir("office"), 46, 750);

  // Scenario B: boss directive + love + whip
  console.log("scenario B: boss interactions");
  const bossDir = outDir("boss");
  await page.click(".boss-bar input");
  await page.type(".boss-bar input", "Try momentum with 5-day holds, be strict about costs!", { delay: 28 });
  await captureFrames(page, bossDir, 4, 420);
  await page.keyboard.press("Enter");
  await captureFrames(page, bossDir, 14, 540);
  await page.click(".love-whip-tool.love");
  await sleep(400);
  await page.click('.agent-2d-sprite[data-agent-id="agent-strategy"]');
  await captureFrames(page, bossDir, 9, 360);
  await page.click(".love-whip-tool.whip");
  await sleep(400);
  await page.click('.agent-2d-sprite[data-agent-id="agent-code"]');
  await captureFrames(page, bossDir, 12, 420);

  // Scenario C: wallpaper mode with boss orb
  console.log("scenario C: wallpaper + orb");
  await page.goto(`${BASE}/?wallpaper=1#/office`, { waitUntil: "networkidle2" });
  await sleep(4500);
  const wallpaperDir = outDir("wallpaper");
  await captureFrames(page, wallpaperDir, 10, 700);
  await page.click(".boss-orb");
  await sleep(500);
  await captureFrames(page, wallpaperDir, 6, 700);
  await page.click(".boss-orb-input input");
  await page.type(".boss-orb-input input", "找一条没人挤的路子", { delay: 40 });
  await captureFrames(page, wallpaperDir, 3, 500);
  await page.keyboard.press("Enter");
  await captureFrames(page, wallpaperDir, 13, 700);

  console.log("done:", outRoot);
} finally {
  await browser.close();
}
