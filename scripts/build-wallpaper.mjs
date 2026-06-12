// Builds the app and packages it as a live desktop wallpaper for
// Lively Wallpaper (free, https://github.com/rocksdanister/lively) and
// Wallpaper Engine (Steam). Output: wallpaper-package/ + a ready-to-drag zip.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const out = path.join(root, "wallpaper-package");
const zipPath = path.join(root, "quant-research-lab-wallpaper.zip");

console.log("[1/5] building app…");
execSync("npx vite build", { cwd: root, stdio: "inherit" });

console.log("[2/5] copying dist…");
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(dist, out, { recursive: true });

console.log("[3/5] flagging wallpaper mode in index.html…");
const indexPath = path.join(out, "index.html");
let html = fs.readFileSync(indexPath, "utf-8");
html = html.replace("<head>", "<head>\n    <script>window.__QRL_WALLPAPER__ = true;</script>");
fs.writeFileSync(indexPath, html);

console.log("[4/5] writing wallpaper manifests…");
const thumbnailSource = path.join(root, "public", "assets", "generated", "office-2d", "office-map-preview.png");
if (fs.existsSync(thumbnailSource)) {
  fs.copyFileSync(thumbnailSource, path.join(out, "thumbnail.png"));
  fs.copyFileSync(thumbnailSource, path.join(out, "preview.png"));
}

// Lively Wallpaper manifest (Type 1 = local web wallpaper)
fs.writeFileSync(
  path.join(out, "LivelyInfo.json"),
  JSON.stringify(
    {
      AppVersion: "2.2.0.0",
      Title: "Quant Research Lab",
      Thumbnail: "thumbnail.png",
      Preview: "preview.png",
      Desc: "Anime research agents autonomously mining alpha: hypotheses, backtests, risk reviews, and office gossip.",
      Author: "Quant Research Lab",
      License: "MIT",
      Contact: "",
      Type: 1,
      FileName: "index.html",
      Arguments: "",
      IsAbsolutePath: false,
      Tags: ["interactive", "quant", "anime"],
      Version: 1
    },
    null,
    2
  )
);

// Wallpaper Engine manifest
fs.writeFileSync(
  path.join(out, "project.json"),
  JSON.stringify(
    {
      title: "Quant Research Lab",
      description: "Anime research agents autonomously mining alpha on your desktop.",
      file: "index.html",
      preview: "preview.png",
      type: "web",
      tags: ["Anime", "Interactive"],
      visibility: "private"
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(out, "WALLPAPER_README.md"),
  `# Quant Research Lab — desktop wallpaper

## Lively Wallpaper (free, recommended)
1. Install Lively Wallpaper (Microsoft Store or https://github.com/rocksdanister/lively).
2. Drag \`quant-research-lab-wallpaper.zip\` onto the Lively window (or "+ Add Wallpaper" → choose the zip).
3. Done. The research loop auto-starts and the characters keep working, talking, and arguing on your desktop.
4. Optional: Settings → Wallpaper → Input → "Mouse on" lets you click characters and objects right on the desktop.
5. Lively pauses the wallpaper automatically when a fullscreen app or game is in front.

## Wallpaper Engine (Steam)
1. Open Wallpaper Engine → "Create Wallpaper" → drag \`index.html\` from this folder onto it.
2. It imports as a web wallpaper using the included project.json. Apply it like any wallpaper.
3. If the preview stays blank, the safest path is Lively (above), which uses Edge WebView2.

## Notes
- State (experiments, leaderboard, mood) is stored in the wallpaper browser's localStorage.
  In Lively, enable Settings → System → "Keep disk cache" to persist it across restarts.
- The wallpaper build auto-runs the loop and hides all panels. Use the normal app for the full game UI.
`
);

console.log("[5/5] zipping…");
fs.rmSync(zipPath, { force: true });
try {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${out.replaceAll("'", "''")}\\*' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force"`,
    { stdio: "inherit" }
  );
  console.log(`done: ${zipPath}`);
} catch {
  console.log(`zip step failed - zip the contents of ${out} manually (files at zip root).`);
}
console.log(`wallpaper folder: ${out}`);
