import { CSSProperties } from "react";
import { sceneHotspots, sceneLayout, regionStyle } from "../../lib/office/sceneLayout";
import { useAppStore } from "../../store/AppStore";

export function SceneDebugOverlay({ visible }: { visible: boolean }): JSX.Element | null {
  const { agentRuntime, agents } = useAppStore();
  if (!visible) return null;

  return (
    <div className="scene-debug-overlay" aria-hidden="true">
      {Object.entries(sceneLayout.dynamicSurfaces).map(([key, region]) => (
        <div key={key} className="debug-region debug-surface" style={regionStyle(region)}>
          {key}
        </div>
      ))}
      {Object.entries(sceneHotspots).map(([key, region]) => (
        <div key={key} className="debug-region debug-hotspot" style={regionStyle(region)}>
          {region.label}
        </div>
      ))}
      {agents.map((agent) => {
        const runtime = agentRuntime[agent.id];
        if (!runtime) return null;
        return (
          <span
            key={agent.id}
            className="debug-agent-anchor"
            style={{ left: `${runtime.x}%`, top: `${runtime.y}%` } as CSSProperties}
          >
            {agent.name}
          </span>
        );
      })}
    </div>
  );
}
