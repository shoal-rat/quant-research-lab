import { useEffect, useState } from "react";
import { BarChart3, Bot, FlaskConical, History, Images, Settings } from "lucide-react";
import { OfficePage } from "./pages/OfficePage";
import { ExperimentDetailPage } from "./pages/ExperimentDetailPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { AgentManagementPage } from "./pages/AgentManagementPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { AssetPreviewPage } from "./pages/AssetPreviewPage";
import { GameModal } from "./components/GameModal";
import { LoopControls } from "./components/LoopControls";
import { useAppStore } from "./store/AppStore";

type Route =
  | { name: "office" }
  | { name: "leaderboard" }
  | { name: "agents" }
  | { name: "asset-preview" }
  | { name: "settings" }
  | { name: "history" }
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
  if (clean === "current") return { name: "current" };
  return { name: "office" };
}

export function navigate(path: string): void {
  window.location.hash = path;
}

// The office IS the game. Everything else is an overlay the boss clicks into.
export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const { loop, settings, experiments, currentExperiment, wallpaperMode } = useAppStore();

  useEffect(() => {
    const handler = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", handler);
    if (!window.location.hash) window.location.hash = "/office";
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const close = () => navigate("/office");

  const navItems = [
    { label: "History", path: "/history", icon: History },
    { label: "Leaderboard", path: "/leaderboard", icon: BarChart3 },
    { label: "Agents", path: "/agents", icon: Bot },
    { label: "Assets", path: "/asset-preview", icon: Images },
    { label: "Settings", path: "/settings", icon: Settings }
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
              <strong>Quant Research Lab</strong>
              <small>{settings.researchTaskName}</small>
            </span>
          </button>
          <div className="hud-right">
            <span className="task-strip">
              <span className={`phase-dot ${loop.running ? "live" : ""}`} />
              <small>{experiments.length} experiments</small>
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
            </nav>
          </div>
        </header>
      )}

      {wallpaperMode && (
        <div className="wallpaper-chip">
          <span className={`phase-dot ${loop.running ? "live" : ""}`} />
          <span>{loop.phase.replaceAll("_", " ")}</span>
          {currentExperiment && <small>{currentExperiment.strategyName}</small>}
        </div>
      )}

      {!wallpaperMode && route.name === "history" && (
        <GameModal title="Experiment History" onClose={close} wide>
          <HistoryPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "leaderboard" && (
        <GameModal title="Strategy Leaderboard" onClose={close} wide>
          <LeaderboardPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "agents" && (
        <GameModal title="Research Team" onClose={close} wide>
          <AgentManagementPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "asset-preview" && (
        <GameModal title="Asset Preview" onClose={close} wide>
          <AssetPreviewPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "settings" && (
        <GameModal title="Lab Settings" onClose={close} wide>
          <SettingsPage />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "experiment" && (
        <GameModal title="Experiment Detail" onClose={close} wide>
          <ExperimentDetailPage id={route.id} />
        </GameModal>
      )}
      {!wallpaperMode && route.name === "current" && (
        <GameModal title="Current Experiment" onClose={close} wide>
          {currentExperiment ? (
            <ExperimentDetailPage id={currentExperiment.id} />
          ) : (
            <div className="page-card">
              <h2>No experiment yet</h2>
              <p>Press Start in the top bar and the desk will produce its first hypothesis.</p>
            </div>
          )}
        </GameModal>
      )}
    </div>
  );
}
