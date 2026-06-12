import { office2DWaypoints, office2DZones, Office2DPoint, Office2DZoneId } from "./mapLayout";

function corridorForZone(zone: Office2DZoneId): Office2DPoint[] {
  if (zone === "leaderboard" || zone === "whiteboard" || zone === "data_cabinet" || zone === "window") {
    return [office2DWaypoints.topHall];
  }
  if (zone === "tea") return [office2DWaypoints.leftHall];
  if (zone === "workstations" || zone === "manager_desk") return [office2DWaypoints.rightHall];
  if (zone === "backtest_computer") return [office2DWaypoints.bottomHall];
  return [];
}

export function buildWaypointPath(fromZone: Office2DZoneId, toZone: Office2DZoneId): Office2DPoint[] {
  const from = office2DZones[fromZone];
  const to = office2DZones[toZone];
  if (fromZone === toZone) return [to.entry];

  const points = [from.entry, ...corridorForZone(fromZone), office2DWaypoints.hub, ...corridorForZone(toZone), to.entry];
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
}

export function pointKey(point: Office2DPoint): string {
  return `${Math.round(point.x)},${Math.round(point.y)}`;
}

