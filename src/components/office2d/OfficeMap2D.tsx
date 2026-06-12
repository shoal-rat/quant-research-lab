import { ArrowUpRight } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { navigate } from "../../App";
import { getGeneratedAgent2DManifest } from "../../lib/assets/agent2dAssetManifest";
import { office2DAssets, office2DDisplays, office2DMapSize, office2DZones, rectToPercentStyle } from "../../lib/office2d/mapLayout";
import { t } from "../../i18n";
import { useAppStore } from "../../store/AppStore";
import { AgentProfile, OfficeAreaId } from "../../types";
import { StatusBadge } from "../StatusBadge";
import { Agent2DSprite } from "./Agent2DSprite";
import { InWorldBacktestRig2D } from "./InWorldBacktestRig2D";
import { InWorldDataDisplay2D } from "./InWorldDataDisplay2D";
import { InWorldLeaderboard2D } from "./InWorldLeaderboard2D";
import { InWorldWhiteboard2D } from "./InWorldWhiteboard2D";
import { InWorldWorkstation2D } from "./InWorldWorkstation2D";
import { OfficeDebug2D } from "./OfficeDebug2D";

const areaTitles: Record<OfficeAreaId, string> = {
  workstations: "Workstations",
  whiteboard: "Whiteboard",
  meeting: "Meeting Table",
  tea: "Tea Corner",
  data_cabinet: "Data Cabinet",
  leaderboard: "Leaderboard Screen",
  backtest_computer: "Backtest Rig",
  window: "Quiet Window"
};

const areaTitlesZh: Record<OfficeAreaId, string> = {
  workstations: "工位",
  whiteboard: "白板",
  meeting: "会议桌",
  tea: "茶水角",
  data_cabinet: "数据柜",
  leaderboard: "排行榜大屏",
  backtest_computer: "回测机",
  window: "安静窗边"
};

// Clicking an in-world object opens the matching detail overlay - the office
// is the only screen; everything else is a modal on top of it.
const areaRoutes: Partial<Record<OfficeAreaId, string>> = {
  leaderboard: "/leaderboard",
  data_cabinet: "/history",
  workstations: "/agents",
  whiteboard: "/current",
  meeting: "/current",
  backtest_computer: "/current"
};

const effectArt = {
  love: "/assets/generated/ui/love-whip/heart-burst.png",
  whip: "/assets/generated/ui/love-whip/whip-burst.png"
};

interface OfficeMap2DProps {
  bossTool?: "love" | "whip" | null;
  onBossToolUsed?: () => void;
}

export function OfficeMap2D({ bossTool, onBossToolUsed }: OfficeMap2DProps): JSX.Element {
  const { agents, currentExperiment, setActiveObject, addManualBubble, settings, director, applyBossAction, wallpaperMode } =
    useAppStore();
  const [selectedAgent, setSelectedAgent] = useState<AgentProfile | null>(null);
  const lang = settings.language;
  const snapshot = useSyncExternalStore(director.subscribe, director.getSnapshot);
  const visibleAgents = useMemo(() => agents.filter((agent) => agent.visible), [agents]);
  const debugVisible = window.location.search.includes("debug2d") || window.location.hash.includes("debug2d");

  const clickArea = (area: OfficeAreaId, label: string) => {
    if (wallpaperMode) return;
    setActiveObject(area);
    const route = areaRoutes[area];
    if (route) {
      navigate(route);
      return;
    }
    const talker = visibleAgents.find((agent) => agent.role === "experiment_manager") ?? visibleAgents[0];
    if (talker) {
      const teaLine = lang === "zh" ? "茶歇五分钟，循环不停转。" : "Short tea break. The loop keeps moving.";
      addManualBubble({
        agentId: talker.id,
        role: talker.role,
        speaker: talker.name,
        message: area === "tea" ? teaLine : label,
        tone: area === "tea" ? "drinking_tea" : "thinking"
      });
    }
  };

  const clickAgent = (agent: AgentProfile) => {
    if (bossTool) {
      applyBossAction(agent.id, bossTool);
      onBossToolUsed?.();
      return;
    }
    if (!wallpaperMode) setSelectedAgent(agent);
  };

  const selectedAsset = selectedAgent ? getGeneratedAgent2DManifest(selectedAgent.role) : undefined;

  return (
    <section
      className={`office-map-2d ${settings.reducedAnimation ? "reduced" : ""} ${bossTool ? `boss-tool-${bossTool}` : ""}`}
      aria-label="2D research office"
    >
      <div className="office2d-stage">
        <img className="office2d-map-base" src={office2DAssets.base} alt="" draggable={false} />

        <div className="office2d-display leaderboard" style={rectToPercentStyle(office2DDisplays.leaderboardScreen, 4)}>
          <InWorldLeaderboard2D />
        </div>
        <div className="office2d-display whiteboard" style={rectToPercentStyle(office2DDisplays.whiteboardSurface, 4)}>
          <InWorldWhiteboard2D />
        </div>
        <div className="office2d-display workstation" style={rectToPercentStyle(office2DDisplays.workstationMonitors, 5)}>
          <InWorldWorkstation2D />
        </div>
        <div className="office2d-display backtest" style={rectToPercentStyle(office2DDisplays.backtestMonitors, 5)}>
          <InWorldBacktestRig2D />
        </div>
        <div className="office2d-display data" style={rectToPercentStyle(office2DDisplays.dataCabinetDisplay, 5)}>
          <InWorldDataDisplay2D />
        </div>

        {Object.entries(office2DZones).map(([key, zone]) => {
          const area = zone.area;
          if (!area) return null;
          return (
            <button
              key={key}
              className="office2d-hotspot"
              style={rectToPercentStyle(zone.interaction, 18)}
              onClick={() => clickArea(area, lang === "zh" ? areaTitlesZh[area] : areaTitles[area])}
              aria-label={`Open ${zone.label}`}
            >
              <span>{lang === "zh" ? areaTitlesZh[area] : zone.label}</span>
            </button>
          );
        })}

        {snapshot.agents
          .slice()
          .sort((a, b) => a.y - b.y)
          .map((state) => {
            const agent = visibleAgents.find((item) => item.id === state.agentId);
            if (!agent) return null;
            return (
              <Agent2DSprite
                key={state.agentId}
                agent={agent}
                state={state}
                reducedMotion={settings.reducedAnimation}
                onClick={() => clickAgent(agent)}
              />
            );
          })}

        {snapshot.effects.map((effect) => {
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
        })}

        <img className="office2d-map-foreground" src={office2DAssets.foreground} alt="" draggable={false} />
        <OfficeDebug2D visible={debugVisible} agents={snapshot.agents} />
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
          <button className="secondary-button" onClick={() => navigate("/agents")}>
            {t(lang, "editProfile")} <ArrowUpRight size={14} />
          </button>
        </div>
      )}

      {currentExperiment && !wallpaperMode && (
        <div className="office-current-card">
          <div>
            <small>{t(lang, "currentExperiment")}</small>
            <strong>{currentExperiment.strategyName}</strong>
          </div>
          <StatusBadge status={currentExperiment.status} />
          <button onClick={() => navigate(`/experiment/${currentExperiment.id}`)}>{t(lang, "open")}</button>
        </div>
      )}
    </section>
  );
}
