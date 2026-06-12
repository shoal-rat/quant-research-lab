# Wires the board route, HUD chips, toasts, confetti, and settings.
import io


def patch(path, pairs):
    text = io.open(path, encoding="utf-8").read()
    for old, new in pairs:
        assert old in text, f"NOT FOUND in {path}: {old[:80]!r}"
        text = text.replace(old, new, 1)
    io.open(path, "w", encoding="utf-8", newline="\n").write(text)
    print("patched", path)


# ---- i18n keys ----
patch("src/i18n.ts", [
    (
        '  language: { en: "Language", zh: "语言" }\n} satisfies',
        '  language: { en: "Language", zh: "语言" },\n'
        '  boardTitle: { en: "Fund & Research Board", zh: "基金与研究看板" },\n'
        '  navBoard: { en: "Board", zh: "看板" }\n} satisfies',
    ),
])

# ---- App.tsx: route + HUD chips + toasts ----
patch("src/App.tsx", [
    (
        'import { BarChart3, Bot, FlaskConical, History, Images, Languages, Settings } from "lucide-react";',
        'import { BarChart3, Bot, FlaskConical, History, Images, Languages, LayoutGrid, Settings } from "lucide-react";',
    ),
    (
        'import { AssetPreviewPage } from "./pages/AssetPreviewPage";',
        'import { AssetPreviewPage } from "./pages/AssetPreviewPage";\nimport { BoardPage } from "./pages/BoardPage";\nimport { ToastStack } from "./components/ToastStack";',
    ),
    (
        '  | { name: "history" }\n  | { name: "current" }',
        '  | { name: "history" }\n  | { name: "board" }\n  | { name: "current" }',
    ),
    (
        '  if (clean === "history") return { name: "history" };',
        '  if (clean === "history") return { name: "history" };\n  if (clean === "board") return { name: "board" };',
    ),
    (
        '  const { loop, settings, experiments, currentExperiment, wallpaperMode, updateSettings } = useAppStore();',
        '  const { loop, settings, experiments, currentExperiment, wallpaperMode, updateSettings, bossLevel, fundValue } = useAppStore();',
    ),
    (
        '  const navItems = [\n    { label: t(lang, "navHistory"), path: "/history", icon: History },',
        '  const navItems = [\n    { label: t(lang, "navBoard"), path: "/board", icon: LayoutGrid },\n    { label: t(lang, "navHistory"), path: "/history", icon: History },',
    ),
    (
        '            <span className="task-strip">\n              <span className={`phase-dot ${loop.running ? "live" : ""}`} />\n              <small>{experiments.length} {t(lang, "experiments")}</small>\n            </span>',
        '            <span className="task-strip boss-chip" title={lang === "zh" ? bossLevel.title.zh : bossLevel.title.en}>\n'
        '              <small>Lv.{bossLevel.level}</small>\n'
        '              <small className="chip-title">{lang === "zh" ? bossLevel.title.zh : bossLevel.title.en}</small>\n'
        '            </span>\n'
        '            <span className="task-strip" title={lang === "zh" ? "虚拟基金净值" : "Virtual fund NAV"}>\n'
        '              <small>${(fundValue / 1_000_000).toFixed(2)}M</small>\n'
        '            </span>\n'
        '            <span className="task-strip">\n              <span className={`phase-dot ${loop.running ? "live" : ""}`} />\n              <small>{experiments.length} {t(lang, "experiments")}</small>\n            </span>',
    ),
    (
        '      {!wallpaperMode && route.name === "history" && (',
        '      {!wallpaperMode && route.name === "board" && (\n'
        '        <GameModal title={t(lang, "boardTitle")} onClose={close} wide>\n'
        '          <BoardPage />\n'
        '        </GameModal>\n'
        '      )}\n'
        '      {!wallpaperMode && route.name === "history" && (',
    ),
    (
        '    </div>\n  );\n}',
        '      <ToastStack />\n    </div>\n  );\n}',
    ),
])

# ---- OfficeMap2D: meeting -> board, confetti effect rendering ----
patch("src/components/office2d/OfficeMap2D.tsx", [
    (
        '  whiteboard: "/current",\n  meeting: "/current",',
        '  whiteboard: "/current",\n  meeting: "/board",',
    ),
    (
        """        {snapshot.effects.map((effect) => {
          const position = director.agentPosition(effect.agentId);
          if (!position) return null;
          return (
            <img
              key={effect.id}
              className={`boss-effect boss-effect-${effect.kind}`}
              src={effectArt[effect.kind]}
              style={{
                left: `${(position.x / office2DMapSize.width) * 100}%`,
                top: `${(position.y / office2DMapSize.height) * 100}%`
              }}
              alt=""
              draggable={false}
            />
          );
        })}""",
        """        {snapshot.effects.map((effect) => {
          if (effect.kind === "confetti") {
            return (
              <div
                key={effect.id}
                className="confetti-burst"
                style={{
                  left: `${((effect.x ?? 390) / office2DMapSize.width) * 100}%`,
                  top: `${((effect.y ?? 250) / office2DMapSize.height) * 100}%`
                }}
              >
                {Array.from({ length: 22 }, (_, index) => (
                  <i key={index} style={{ "--ci": index } as React.CSSProperties} />
                ))}
              </div>
            );
          }
          const position = director.agentPosition(effect.agentId);
          if (!position) return null;
          return (
            <img
              key={effect.id}
              className={`boss-effect boss-effect-${effect.kind}`}
              src={effectArt[effect.kind as "love" | "whip"]}
              style={{
                left: `${(position.x / office2DMapSize.width) * 100}%`,
                top: `${(position.y / office2DMapSize.height) * 100}%`
              }}
              alt=""
              draggable={false}
            />
          );
        })}""",
    ),
])

# ---- SettingsPage: data source + research brain ----
patch("src/pages/SettingsPage.tsx", [
    (
        '          <label className="field">\n            <span>Language / 语言</span>',
        """          <label className="field">
            <span>Data source / 数据源</span>
            <select value={settings.dataSource} onChange={(event) => set("dataSource", event.target.value as Settings["dataSource"])}>
              <option value="real">Real market data (20y dailies, bundled)</option>
              <option value="mock">Deterministic mock simulator</option>
            </select>
          </label>
          <label className="field">
            <span>Research brain</span>
            <select value={settings.researchBrain} onChange={(event) => set("researchBrain", event.target.value as Settings["researchBrain"])}>
              <option value="local">Local engine (bandit + knowledge base)</option>
              <option value="claude-code">Claude Code CLI (via bridge)</option>
              <option value="codex">Codex CLI (via bridge)</option>
            </select>
          </label>
          <label className="field">
            <span>Language / 语言</span>""",
    ),
])

print("UI wired")
