import { ArrowUpRight, BarChart3, Coffee, Database, FileCode2, Monitor, Users, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { navigate } from "../App";
import { getGeneratedAgentManifest } from "../lib/assets/agentAssetManifest";
import { officeAreaBounds, regionStyle, sceneHotspots, sceneLayout } from "../lib/office/sceneLayout";
import { useAppStore } from "../store/AppStore";
import { AgentProfile, OfficeAreaId } from "../types";
import { AgentSprite } from "./office/AgentSprite";
import { InWorldBacktestRig } from "./office/InWorldBacktestRig";
import { InWorldDataDisplay } from "./office/InWorldDataDisplay";
import { InWorldLeaderboard } from "./office/InWorldLeaderboard";
import { InWorldWhiteboard } from "./office/InWorldWhiteboard";
import { InWorldWorkstation } from "./office/InWorldWorkstation";
import { SceneDebugOverlay } from "./office/SceneDebugOverlay";
import { StatusBadge } from "./StatusBadge";
import { percent } from "./format";

const objectCopy: Record<OfficeAreaId, { title: string; icon: JSX.Element; empty: string }> = {
  workstations: { title: "Workstations", icon: <Monitor size={18} />, empty: "Code Engineer is waiting for a run." },
  whiteboard: { title: "Whiteboard", icon: <Wand2 size={18} />, empty: "No active hypothesis yet." },
  meeting: { title: "Meeting Table", icon: <Users size={18} />, empty: "No debate has started." },
  tea: { title: "Tea Corner", icon: <Coffee size={18} />, empty: "The kettle is quiet." },
  data_cabinet: { title: "Data Cabinet", icon: <Database size={18} />, empty: "Mock market and news data are ready." },
  leaderboard: { title: "Leaderboard Screen", icon: <BarChart3 size={18} />, empty: "No candidates to rank yet." },
  backtest_computer: { title: "Backtest Computer", icon: <FileCode2 size={18} />, empty: "No backtest has run yet." },
  window: { title: "Window", icon: <Monitor size={18} />, empty: "A calm place for idle thinking." }
};

function areaSummary(area: OfficeAreaId, experiment?: ReturnType<typeof useAppStore>["currentExperiment"]): string {
  if (!experiment) return objectCopy[area].empty;
  if (area === "whiteboard") return experiment.strategyHypothesis;
  if (area === "meeting") return experiment.debate.map((line) => `${line.speaker}: ${line.message}`).join(" ");
  if (area === "workstations") return experiment.generatedCode.split("\n").slice(0, 4).join(" ");
  if (area === "tea") return "Casual chatter is enabled. The desk swaps quick notes without overriding task states.";
  if (area === "data_cabinet") return experiment.dataUsed;
  if (area === "leaderboard") return `${experiment.strategyName}: ${experiment.managerDecision}`;
  if (area === "backtest_computer")
    return `OOS Sharpe ${experiment.outOfSampleResult.sharpeRatio.toFixed(2)}, max drawdown ${percent(
      experiment.outOfSampleResult.maxDrawdown
    )}, after costs ${percent(experiment.outOfSampleResult.returnAfterCosts)}.`;
  return objectCopy[area].empty;
}

export function OfficeScene(): JSX.Element {
  const { agents, agentRuntime, currentExperiment, setActiveObject, addManualBubble, settings } = useAppStore();
  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(null);
  const visibleAgents = useMemo(() => agents.filter((agent) => agent.visible), [agents]);
  const debugVisible = window.location.search.includes("sceneDebug") || window.location.hash.includes("debugScene");

  const clickArea = (area: OfficeAreaId) => {
    setActiveObject(area);
    const talker = visibleAgents.find((agent) => agent.role === "experiment_manager") ?? visibleAgents[0];
    if (talker) {
      addManualBubble({
        agentId: talker.id,
        role: talker.role,
        speaker: talker.name,
        message: objectCopy[area].title === "Tea Corner" ? "Tea break, but keep the loop warm." : objectCopy[area].title,
        tone: area === "tea" ? "drinking_tea" : "thinking"
      });
    }
  };

  const selectedAsset = selectedAgent ? getGeneratedAgentManifest(selectedAgent.role) : undefined;

  return (
    <section className={`office-scene ${settings.reducedAnimation ? "reduced" : ""}`} aria-label="Research office">
      <div className="office-floor office-stage">
        <img className="office-bg-layer" src={sceneLayout.background.asset} alt="" draggable={false} />

        <div className="dynamic-surface leaderboard-surface" style={regionStyle(sceneLayout.dynamicSurfaces.leaderboardScreen)}>
          <InWorldLeaderboard />
        </div>
        <div className="dynamic-surface whiteboard-surface" style={regionStyle(sceneLayout.dynamicSurfaces.whiteboardSurface)}>
          <InWorldWhiteboard />
        </div>
        <div className="dynamic-surface workstation-surface" style={regionStyle(sceneLayout.dynamicSurfaces.workstationMonitors)}>
          <InWorldWorkstation />
        </div>
        <div className="dynamic-surface backtest-surface" style={regionStyle(sceneLayout.dynamicSurfaces.backtestMonitors)}>
          <InWorldBacktestRig />
        </div>
        <div className="dynamic-surface data-display-surface" style={regionStyle(sceneLayout.dynamicSurfaces.dataCabinetDisplay)}>
          <InWorldDataDisplay />
        </div>

        {Object.entries(sceneHotspots).map(([key, hotspot]) => (
          <button
            key={key}
            className="scene-hotspot-button"
            style={regionStyle(hotspot)}
            onClick={() => clickArea(hotspot.area)}
            aria-label={`Open ${hotspot.label}`}
          >
            <span>{hotspot.label}</span>
          </button>
        ))}

        {Object.entries(officeAreaBounds).map(([key, area]) => (
          <span key={key} className="area-hotspot" style={{ left: `${area.x}%`, top: `${area.y}%` }} />
        ))}

        {visibleAgents.map((agent) => {
          const runtime = agentRuntime[agent.id];
          if (!runtime) return null;
          return (
            <AgentSprite
              key={agent.id}
              agent={agent}
              runtime={runtime}
              reducedMotion={settings.reducedAnimation}
              onClick={() => setSelectedAgent(agent)}
            />
          );
        })}

        <SceneDebugOverlay visible={debugVisible} />
      </div>

      {selectedAgent && (
        <div className="object-drawer agent-drawer">
          <button className="icon-close" onClick={() => setSelectedAgent(null)} aria-label="Close agent panel">
            x
          </button>
          <div className="drawer-heading">
            <span className="avatar-token avatar-image-token" style={{ background: selectedAgent.appearance.themeColor }}>
              <img src={selectedAgent.avatarDataUrl ?? selectedAsset?.avatar} alt="" />
            </span>
            <div>
              <h3>{selectedAgent.name}</h3>
              <p>{selectedAgent.role.replaceAll("_", " ")}</p>
            </div>
          </div>
          <p>{selectedAgent.personality}</p>
          <div className="mini-list">
            {selectedAgent.catchphrases.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
          <button className="secondary-button" onClick={() => navigate("/agents")}>
            Edit profile <ArrowUpRight size={14} />
          </button>
        </div>
      )}

      {currentExperiment && (
        <div className="office-current-card">
          <div>
            <small>Current experiment</small>
            <strong>{currentExperiment.strategyName}</strong>
          </div>
          <StatusBadge status={currentExperiment.status} />
          <button onClick={() => navigate(`/experiment/${currentExperiment.id}`)}>Open</button>
        </div>
      )}
    </section>
  );
}

export function OfficeObjectPanel(): JSX.Element | null {
  const { loop, setActiveObject, currentExperiment } = useAppStore();
  if (!loop.activeObject) return null;
  const copy = objectCopy[loop.activeObject];
  return (
    <aside className="object-drawer">
      <button className="icon-close" onClick={() => setActiveObject(undefined)} aria-label="Close object panel">
        x
      </button>
      <div className="drawer-heading">
        <span className="drawer-icon">{copy.icon}</span>
        <div>
          <h3>{copy.title}</h3>
          <p>{currentExperiment?.id ?? "No active experiment"}</p>
        </div>
      </div>
      <p>{areaSummary(loop.activeObject, currentExperiment)}</p>
      {loop.activeObject === "leaderboard" && (
        <button className="secondary-button" onClick={() => navigate("/leaderboard")}>
          Open leaderboard <ArrowUpRight size={14} />
        </button>
      )}
      {currentExperiment && loop.activeObject !== "tea" && (
        <button className="secondary-button" onClick={() => navigate(`/experiment/${currentExperiment.id}`)}>
          Full detail <ArrowUpRight size={14} />
        </button>
      )}
    </aside>
  );
}
