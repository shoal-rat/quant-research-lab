// End-to-end verification of the v2.0 build: real-data loop, board, HUD
// chips, bubble anti-overlap, toasts.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: "new",
  defaultViewport: { width: 1380, height: 820 },
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "qrl-edge-")),
  args: ["--no-first-run", "--disable-gpu"]
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
await page.goto("http://127.0.0.1:5198/#/office", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 3000));

// run two full iterations fast via Next clicks
await page.click(".loop-controls .primary-button");
for (let i = 0; i < 18; i += 1) {
  await new Promise((r) => setTimeout(r, 1200));
  const next = await page.$(".loop-controls .secondary-button");
  if (next) await next.click();
}
await new Promise((r) => setTimeout(r, 1500));

const summary = await page.evaluate(() => {
  const experiments = JSON.parse(localStorage.getItem("qrl.experiments") ?? "[]");
  const last = experiments[experiments.length - 1];
  return {
    experiments: experiments.length,
    lastDataSource: last?.dataSource,
    lastDataUsed: last?.dataUsed?.slice(0, 80),
    lastSharpe: last?.outOfSampleResult?.sharpeRatio,
    hasReturns: Boolean(last?.dailyReturns?.length),
    returnsLen: last?.dailyReturns?.length ?? 0,
    poolDelta: last?.poolSharpeDelta,
    ideaMode: last?.ideaMode,
    hudChips: [...document.querySelectorAll(".task-strip")].map((node) => node.textContent?.trim()).slice(0, 3),
    achievements: Object.keys(JSON.parse(localStorage.getItem("qrl.achievements") ?? "{}"))
  };
});
console.log("LOOP SUMMARY:", JSON.stringify(summary, null, 1));

// bubble overlap check: while a bubble is visible, no other sprite's box
// intersects the bubble rect
const overlapReport = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const samples = [];
      const timer = setInterval(() => {
        const bubble = document.querySelector(".speech-bubble-2d");
        if (bubble) {
          const speaker = bubble.closest(".agent-2d-sprite");
          const bubbleRect = bubble.getBoundingClientRect();
          let overlaps = 0;
          for (const sprite of document.querySelectorAll(".agent-2d-sprite")) {
            if (sprite === speaker) continue;
            const img = sprite.querySelector("img");
            if (!img) continue;
            const rect = img.getBoundingClientRect();
            const xOverlap = Math.max(0, Math.min(rect.right, bubbleRect.right) - Math.max(rect.left, bubbleRect.left));
            const yOverlap = Math.max(0, Math.min(rect.bottom, bubbleRect.bottom) - Math.max(rect.top, bubbleRect.top));
            const area = xOverlap * yOverlap;
            if (area > rect.width * rect.height * 0.25) overlaps += 1;
          }
          samples.push(overlaps);
        }
        if (samples.length >= 8) {
          clearInterval(timer);
          resolve(samples);
        }
      }, 900);
      setTimeout(() => {
        clearInterval(timer);
        resolve(samples);
      }, 25000);
    })
);
console.log("BUBBLE OVERLAPS (sprites >25% covered, per sample):", JSON.stringify(overlapReport));

// the board modal
await page.evaluate(() => {
  window.location.hash = "/board";
});
await new Promise((r) => setTimeout(r, 1200));
const board = await page.evaluate(() => ({
  title: document.querySelector(".game-modal-head h2")?.textContent,
  fund: document.querySelector(".board-fund h2")?.textContent,
  nicheCells: document.querySelectorAll(".niche-cell").length,
  banditRows: document.querySelectorAll(".bandit-row").length,
  achievements: document.querySelectorAll(".achievement").length,
  unlockedShown: document.querySelectorAll(".achievement.unlocked").length
}));
console.log("BOARD:", JSON.stringify(board));
await page.screenshot({ path: path.join(root, "work", "capture", "verify_board.png") });

await page.evaluate(() => {
  window.location.hash = "/office";
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: path.join(root, "work", "capture", "verify_v2_office.png") });

console.log("PAGE ERRORS:", errors.length === 0 ? "none" : errors.slice(0, 3));
await browser.close();
