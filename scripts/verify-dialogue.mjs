// Verifies the bank-driven conversations and bubble safe-areas in both
// languages against the running dev server.
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
await page.click(".loop-controls .primary-button");

async function sampleBubbles(label, seconds) {
  const samples = [];
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline && samples.length < 6) {
    const sample = await page.evaluate(() => {
      const safe = document.querySelector(".speech-bubble-2d .bubble-safe");
      if (!safe) return null;
      const em = safe.querySelector("em");
      const bubble = safe.closest(".speech-bubble-2d");
      const emRect = em.getBoundingClientRect();
      const safeRect = safe.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      return {
        text: em.textContent.slice(0, 44),
        fitsSafe:
          emRect.left >= safeRect.left - 1 &&
          emRect.right <= safeRect.right + 1 &&
          emRect.top >= safeRect.top - 1 &&
          emRect.bottom <= safeRect.bottom + 1,
        onScreen: bubbleRect.left >= -4 && bubbleRect.right <= window.innerWidth + 4
      };
    });
    if (sample && !samples.some((s) => s.text === sample.text)) samples.push(sample);
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.log(label, JSON.stringify(samples, null, 1));
  return samples;
}

const en = await sampleBubbles("EN bubbles:", 40);
await page.screenshot({ path: path.join(root, "work", "capture", "verify_bank_en.png") });

// switch to Chinese mid-run
await page.evaluate(() => {
  const buttons = document.querySelectorAll(".hud-nav-button");
  buttons[buttons.length - 1].click();
});
const zh = await sampleBubbles("ZH bubbles:", 40);
await page.screenshot({ path: path.join(root, "work", "capture", "verify_bank_zh.png") });

const all = [...en, ...zh];
console.log("RESULT:", all.length, "samples;",
  all.every((s) => s.fitsSafe) ? "all fit safe area" : "SOME OVERFLOW",
  ";", all.every((s) => s.onScreen) ? "all on screen" : "SOME OFFSCREEN");
await browser.close();
