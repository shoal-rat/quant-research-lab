import { useEffect, useState } from "react";
import { BarChart3, Bot, FlaskConical, History, Images, Languages, LayoutGrid, Settings } from "lucide-react";
import { OfficePage } from "./pages/OfficePage";
import { ExperimentDetailPage } from "./pages/ExperimentDetailPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { AgentManagementPage } from "./pages/AgentManagementPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { AssetPreviewPage } from "./pages/AssetPreviewPage";
import { BoardPage } from "./pages/BoardPage";
import { ToastStack } from "./components/ToastStack";
import { GameModal } from "./components/GameModal";
import { LoopControls } from "./components/LoopControls";
import { phaseLabel, t } from "./i18n";
import { useAppStore } from "./store/AppStore";

type Route =
  | { name: "office" }
  | { name: "leaderboard" }
  | { name: "agents" }
  | { name: "asset-preview" }
  | { name: "settings" }
  | { name: "history" }
  | { name: "board" }
  | { name: "current" }
  | { name: "experiment"; id: string };

function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "");
  if (clean.startsWith("experiment/")) {
    return { name: "experiment", id: clean.split("/")[1] };
  }
  if (clean === "leaderboard") return { name: "leaderboard" };
  if (clean === "agents") return { name: "agents" };
  if (clean === "asset-preview") return { name: "asset-preview" };
  if (clean === "settings") return { name: "settings" };
  if (clean === "history") return { name: "history" };
  if (clean === "board") return { name: "board" };
  if (clean === "current") return { name: "current" };
  return { name: "office" };
}

export function navigate(path: string): void {
  window.location.hash = path;
}

// The office IS the game. Everything else is an overlay the boss clicks into.
export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const { loop, settings, experiments, currentExperiment, wallpaperMode, updateSettings, bossLevel, fundValue } = useAppStore();
  const lang = settings.language;

  useEffect(() => {
    const handler = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", handler);
    if (!window.location.hash) window.location.hash = "/office";
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const close = () => navigate("/office");

  const navItems = [
    { label: t(lang, "navBoard"), path: "/board", icon: LayoutGrid },
    { label: t(lang, "navHistory"), path: "/history", icon: History },
    { label: t(lang, "navLeaderboard"), path: "/leaderboard", icon: BarChart3 },
    { label: t(lang, "navAgents"), path: "/agents", icon: Bot },
    { label: t(lang, "navAssets"), path: "/asset-preview", icon: Images },
    { label: t(lang, "navSettings"), path: "/settings", icon: Settings }
  ];

  return (
    <div className={`game-shell ${wallpaperMode ? "wallpaper" : ""}`}>
      <OfficePage />

      {!wallpaperMode && (
        <header className="game-hud-top">
          <button className="brand-button" onClick={close} aria-label="Open office">
            <span className="brand-mark">
              <FlaskConical size={18} />
            </span>
            <span>
              <strong>{lang === "zh" ? "量化研究室" : "Quant Research Lab"}</strong>
              <small>{settings.researchTaskName}</small>
            </span>
          </button>
          <div className="hud-right">
            <span className="task-strip boss-chip" title={lang === "zh" ? bossLevel.title.zh : bossLevel.title.en}>
              <small>Lv.{bossLevel.level}</small>
              <small className="chip-title">{lang === "zh" ? bossLevel.title.zh : bossLevel.title.en}</small>
            </span>
            <span className="task-strip" title={lang === "zh" ? "虚拟基金净值" : "Virtual fund NAV"}>
              <small>${(fundValue / 1_000_000).toFixed(2)}M</small>
            </span>
            <span className="task-strip">
              <span className={`phase-dot ${loop.running ? "live" : ""}`} />
              <small>{experiments.length} {t(lang, "experiments")}</small>
            </span>
            <LoopControls />
            <nav className="hud-nav" aria-label="Panels">
              {navItems.map((item) => {
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
            </nav>
          </div>
        </header>
      )}

      {wallpaperMode && (
        <div className="wallpaper-chip">
          <span className={`phase-dot ${loop.running ? "live" : ""}`} />
          <span>{phaseLabel(lang, loop.phase)}</span>
          {currentExperiment && <small>{currentExperiment.strategyName}</small>}
        </div>
      )}

      {!wallpaperMode && route.name === "board" && (
        <GameModal title={t(lang, "boardTitle")} onClose={close} wide>
          <BoardPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "history" && (
        <GameModal title={t(lang, "historyTitle")} onClose={close} wide>
          <HistoryPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "leaderboard" && (
        <GameModal title={t(lang, "leaderboardTitle")} onClose={close} wide>
          <LeaderboardPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "agents" && (
        <GameModal title={t(lang, "agentsTitle")} onClose={close} wide>
          <AgentManagementPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "asset-preview" && (
        <GameModal title={t(lang, "assetsTitle")} onClose={close} wide>
          <AssetPreviewPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "settings" && (
        <GameModal title={t(lang, "settingsTitle")} onClose={close} wide>
          <SettingsPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "experiment" && (
        <GameModal title={t(lang, "experimentTitle")} onClose={close} wide>
          <ExperimentDetailPage id={route.id} />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "current" && (
        <GameModal title={t(lang, "currentTitle")} onClose={close} wide>
          {currentExperiment ? (
            <ExperimentDetailPage id={currentExperiment.id} />
          ) : (
            <div className="page-card">
              <h2>{t(lang, "noExperimentYet")}</h2>
              <p>{t(lang, "noExperimentHint")}</p>
            </div>
          )}
        </GameModal>
      )}
      <ToastStack />
    </div>
  );
}
