import { Agent2DRenderState } from "../../lib/office2d/agentMovement";
import {
  office2DCollision,
  office2DDisplays,
  office2DWaypoints,
  office2DZones,
  pointToPercentStyle,
  rectToPercentStyle
} from "../../lib/office2d/mapLayout";

export function OfficeDebug2D({ visible, agents }: { visible: boolean; agents: Agent2DRenderState[] }): JSX.Element | null {
  if (!visible) return null;

  return (
    <div className="office2d-debug-overlay">
      {Object.entries(office2DDisplays).map(([key, rect]) => (
        <span key={key} className="debug-2d-region display" style={rectToPercentStyle(rect, 810)}>
          {key}
        </span>
      ))}
      {office2DCollision.blocked.map((rect) => (
        <span key={rect.id} className="debug-2d-region blocked" style={rectToPercentStyle(rect, 811)}>
          {rect.id}
        </span>
      ))}
      {Object.entries(office2DZones).map(([key, zone]) => (
        <span key={key} className="debug-2d-region zone" style={rectToPercentStyle(zone.bounds, 812)}>
          {zone.label}
        </span>
      ))}
      {Object.entries(office2DWaypoints).map(([key, point]) => (
        <span key={key} className="debug-2d-point waypoint" style={pointToPercentStyle(point, 820)}>
          {key}
        </span>
      ))}
      {agents.map((agent) => (
        <span key={agent.agentId} className="debug-2d-point agent" style={pointToPercentStyle({ x: agent.x, y: agent.y }, 830)}>
          {agent.agentId} {Math.round(agent.x)},{Math.round(agent.y)} z{agent.zIndex} to {agent.targetZone}
        </span>
      ))}
    </div>
  );
}
