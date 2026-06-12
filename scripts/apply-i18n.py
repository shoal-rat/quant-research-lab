# One-shot i18n wiring for the game-chrome components.
import io

def patch(path, replacements):
    with io.open(path, encoding="utf-8") as fh:
        text = fh.read()
    for old, new in replacements:
        assert old in text, f"NOT FOUND in {path}: {old[:80]!r}"
        text = text.replace(old, new)
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print("patched", path)


patch("src/App.tsx", [
    (
        'import { BarChart3, Bot, FlaskConical, History, Images, Settings } from "lucide-react";',
        'import { BarChart3, Bot, FlaskConical, History, Images, Languages, Settings } from "lucide-react";',
    ),
    (
        'import { useAppStore } from "./store/AppStore";',
        'import { phaseLabel, t } from "./i18n";\nimport { useAppStore } from "./store/AppStore";',
    ),
    (
        "  const { loop, settings, experiments, currentExperiment, wallpaperMode } = useAppStore();",
        "  const { loop, settings, experiments, currentExperiment, wallpaperMode, updateSettings } = useAppStore();\n  const lang = settings.language;",
    ),
    (
        """  const navItems = [
    { label: "History", path: "/history", icon: History },
    { label: "Leaderboard", path: "/leaderboard", icon: BarChart3 },
    { label: "Agents", path: "/agents", icon: Bot },
    { label: "Assets", path: "/asset-preview", icon: Images },
    { label: "Settings", path: "/settings", icon: Settings }
  ];""",
        """  const navItems = [
    { label: t(lang, "navHistory"), path: "/history", icon: History },
    { label: t(lang, "navLeaderboard"), path: "/leaderboard", icon: BarChart3 },
    { label: t(lang, "navAgents"), path: "/agents", icon: Bot },
    { label: t(lang, "navAssets"), path: "/asset-preview", icon: Images },
    { label: t(lang, "navSettings"), path: "/settings", icon: Settings }
  ];""",
    ),
    (
        """            <span>
              <strong>Quant Research Lab</strong>
              <small>{settings.researchTaskName}</small>
            </span>""",
        """            <span>
              <strong>{lang === "zh" ? "量化研究室" : "Quant Research Lab"}</strong>
              <small>{settings.researchTaskName}</small>
            </span>""",
    ),
    (
        "              <small>{experiments.length} experiments</small>",
        '              <small>{experiments.length} {t(lang, "experiments")}</small>',
    ),
    (
        """              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.path} className="hud-nav-button" onClick={() => navigate(item.path)} title={item.label}>
                    <Icon size={16} />
                  </button>
                );
              })}
            </nav>""",
        """              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.path} className="hud-nav-button" onClick={() => navigate(item.path)} title={item.label}>
                    <Icon size={16} />
                  </button>
                );
              })}
              <button
                className="hud-nav-button"
                onClick={() => updateSettings({ language: lang === "zh" ? "en" : "zh" })}
                title={t(lang, "navLanguage")}
              >
                <Languages size={16} />
              </button>
            </nav>""",
    ),
    (
        '          <span>{loop.phase.replaceAll("_", " ")}</span>',
        "          <span>{phaseLabel(lang, loop.phase)}</span>",
    ),
    ('title="Experiment History"', 'title={t(lang, "historyTitle")}'),
    ('title="Strategy Leaderboard"', 'title={t(lang, "leaderboardTitle")}'),
    ('title="Research Team"', 'title={t(lang, "agentsTitle")}'),
    ('title="Asset Preview"', 'title={t(lang, "assetsTitle")}'),
    ('title="Lab Settings"', 'title={t(lang, "settingsTitle")}'),
    ('title="Experiment Detail"', 'title={t(lang, "experimentTitle")}'),
    ('title="Current Experiment"', 'title={t(lang, "currentTitle")}'),
    (
        """              <h2>No experiment yet</h2>
              <p>Press Start in the top bar and the desk will produce its first hypothesis.</p>""",
        """              <h2>{t(lang, "noExperimentYet")}</h2>
              <p>{t(lang, "noExperimentHint")}</p>""",
    ),
])

patch("src/components/LoopControls.tsx", [
    (
        'import { useAppStore } from "../store/AppStore";',
        'import { phaseLabel, t } from "../i18n";\nimport { useAppStore } from "../store/AppStore";',
    ),
    (
        "  const { loop, startResearch, pauseResearch, nextIteration, toggleAutoRun } = useAppStore();",
        "  const { loop, settings, startResearch, pauseResearch, nextIteration, toggleAutoRun } = useAppStore();\n  const lang = settings.language;",
    ),
    (
        '        {loop.phase.replaceAll("_", " ")}',
        "        {phaseLabel(lang, loop.phase)}",
    ),
    ('title="Pause"', 'title={t(lang, "pause")}'),
    ('title="Start research"', 'title={t(lang, "start")}'),
    ('title="Next step"', 'title={t(lang, "nextStep")}'),
    ('title="Auto run"', 'title={t(lang, "autoRun")}'),
])

patch("src/components/BossBar.tsx", [
    (
        'import { useAppStore } from "../store/AppStore";',
        'import { t } from "../i18n";\nimport { useAppStore } from "../store/AppStore";',
    ),
    (
        "  const { sendBossDirective, bossEvents } = useAppStore();",
        "  const { sendBossDirective, bossEvents, settings } = useAppStore();\n  const lang = settings.language;",
    ),
    (
        """        placeholder={
          lastDirective?.text
            ? `Last order: ${lastDirective.text.slice(0, 60)}`
            : "Give the desk a directive… e.g. \\"try momentum with 5-day holds\\" / \\"被新闻情绪坑过了，换条路\\""
        }""",
        """        placeholder={
          lastDirective?.text
            ? `${t(lang, "bossLastOrder")}${lastDirective.text.slice(0, 60)}`
            : t(lang, "bossPlaceholder")
        }""",
    ),
    ('aria-label="Send directive"', 'aria-label={t(lang, "bossSend")}'),
])

patch("src/components/LoveWhipPanel.tsx", [
    (
        'import { useAppStore } from "../store/AppStore";',
        'import { t } from "../i18n";\nimport { useAppStore } from "../store/AppStore";',
    ),
    (
        "  const { mood, agents } = useAppStore();",
        "  const { mood, agents, settings } = useAppStore();\n  const lang = settings.language;",
    ),
    (
        "        <span className=\"love-whip-title\">Love &amp; Whip</span>",
        "        <span className=\"love-whip-title\">{t(lang, \"loveWhipTitle\")}</span>",
    ),
    (
        '          title="Praise a researcher (morale up, bolder ideas)"',
        '          title={t(lang, "loveTip")}',
    ),
    (
        '          title="Criticize a researcher (morale down, stricter desk)"',
        '          title={t(lang, "whipTip")}',
    ),
    ("          <span>LOVE</span>", '          <span>{t(lang, "love")}</span>'),
    ("          <span>WHIP</span>", '          <span>{t(lang, "whip")}</span>'),
    (
        '          <span title="Average desk morale">{avgMorale}% morale</span>',
        '          <span title={t(lang, "morale")}>{avgMorale}% {t(lang, "morale")}</span>',
    ),
    (
        "        {tool && <p className=\"love-whip-hint\">Click a researcher…</p>}",
        "        {tool && <p className=\"love-whip-hint\">{t(lang, \"clickResearcher\")}</p>}",
    ),
])

patch("src/components/BossOrb.tsx", [
    (
        'import { useAppStore } from "../store/AppStore";',
        'import { t } from "../i18n";\nimport { useAppStore } from "../store/AppStore";',
    ),
    (
        "  const { sendBossDirective } = useAppStore();",
        "  const { sendBossDirective, settings } = useAppStore();\n  const lang = settings.language;",
    ),
    ("              <span>Love</span>", '              <span>{t(lang, "love")}</span>'),
    ("              <span>Whip</span>", '              <span>{t(lang, "whip")}</span>'),
    (
        '              placeholder="Boss directive…"',
        '              placeholder={t(lang, "bossDirective")}',
    ),
    (
        '      {tool && !open && <span className="boss-orb-hint">click a researcher</span>}',
        '      {tool && !open && <span className="boss-orb-hint">{t(lang, "clickResearcher")}</span>}',
    ),
])

patch("src/components/SpeechTicker.tsx", [
    (
        'import { useAppStore } from "../store/AppStore";',
        'import { t } from "../i18n";\nimport { useAppStore } from "../store/AppStore";',
    ),
    (
        "  const { bubbles } = useAppStore();",
        "  const { bubbles, settings } = useAppStore();",
    ),
    (
        '          <span className="quiet-line">The office is waiting for a research run.</span>',
        '          <span className="quiet-line">{t(settings.language, "quietOffice")}</span>',
    ),
])

patch("src/components/office2d/OfficeMap2D.tsx", [
    (
        'import { useAppStore } from "../../store/AppStore";',
        'import { t } from "../../i18n";\nimport { useAppStore } from "../../store/AppStore";',
    ),
    (
        "  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(null);",
        "  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(null);\n  const lang = settings.language;",
    ),
    (
        """            <small>Current experiment</small>
            <strong>{currentExperiment.strategyName}</strong>""",
        """            <small>{t(lang, "currentExperiment")}</small>
            <strong>{currentExperiment.strategyName}</strong>""",
    ),
    (
        "          <button onClick={() => navigate(`/experiment/${currentExperiment.id}`)}>Open</button>",
        '          <button onClick={() => navigate(`/experiment/${currentExperiment.id}`)}>{t(lang, "open")}</button>',
    ),
    (
        """          <button className="secondary-button" onClick={() => navigate("/agents")}>
            Edit profile <ArrowUpRight size={14} />
          </button>""",
        """          <button className="secondary-button" onClick={() => navigate("/agents")}>
            {t(lang, "editProfile")} <ArrowUpRight size={14} />
          </button>""",
    ),
])

print("all components patched")
