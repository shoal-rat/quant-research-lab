import { CSSProperties } from "react";
import { OfficeAreaId } from "../../types";

export interface SceneRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  borderRadius?: number;
  zIndex: number;
  perspective?: {
    skewX?: number;
    skewY?: number;
    scaleX?: number;
    scaleY?: number;
  };
}

export interface SceneHotspot extends SceneRegion {
  area: OfficeAreaId;
  label: string;
}

export const sceneLayout = {
  background: {
    width: 1672,
    height: 941,
    asset: "/assets/generated/office/office-bg.webp"
  },
  dynamicSurfaces: {
    leaderboardScreen: {
      x: 17.1,
      y: 4.1,
      width: 29.4,
      height: 27.2,
      borderRadius: 1.1,
      zIndex: 2,
      perspective: { skewX: -1.2, scaleY: 0.98 }
    },
    whiteboardSurface: {
      x: 57.4,
      y: 7.2,
      width: 35.3,
      height: 31.8,
      borderRadius: 1.0,
      zIndex: 2,
      perspective: { skewX: 0.4 }
    },
    workstationMonitors: {
      x: 75.2,
      y: 49.7,
      width: 21.8,
      height: 16.6,
      borderRadius: 0.8,
      zIndex: 3,
      perspective: { skewX: -2.0, scaleY: 0.9 }
    },
    backtestMonitors: {
      x: 30.3,
      y: 68.0,
      width: 29.2,
      height: 17.6,
      borderRadius: 0.9,
      zIndex: 3,
      perspective: { skewX: 2.4, scaleY: 0.9 }
    },
    dataCabinetDisplay: {
      x: 83.7,
      y: 10.1,
      width: 9.6,
      height: 5.8,
      borderRadius: 0.6,
      zIndex: 3,
      perspective: { skewX: -1.0, scaleY: 0.94 }
    }
  } satisfies Record<string, SceneRegion>,
  sceneObjects: {
    teaCorner: { x: 7.0, y: 31.8, width: 20.5, height: 35.0, borderRadius: 1.3, zIndex: 4 },
    meetingTable: { x: 34.6, y: 36.4, width: 32.2, height: 25.8, borderRadius: 1.1, zIndex: 4 },
    dataCabinet: { x: 78.3, y: 7.4, width: 18.8, height: 36.4, borderRadius: 1.1, zIndex: 4 },
    whiteboardInteractionHotspot: { x: 56.2, y: 6.0, width: 37.6, height: 34.8, borderRadius: 1.2, zIndex: 5 },
    leaderboardInteractionHotspot: { x: 16.0, y: 3.0, width: 31.5, height: 29.8, borderRadius: 1.2, zIndex: 5 },
    workstationInteractionHotspot: { x: 71.4, y: 46.7, width: 27.0, height: 25.0, borderRadius: 1.2, zIndex: 5 },
    backtestInteractionHotspot: { x: 28.2, y: 65.0, width: 33.0, height: 23.8, borderRadius: 1.2, zIndex: 5 }
  } satisfies Record<string, SceneRegion>
};

export const sceneHotspots: Record<string, SceneHotspot> = {
  whiteboardInteractionHotspot: {
    ...sceneLayout.sceneObjects.whiteboardInteractionHotspot,
    area: "whiteboard",
    label: "Whiteboard"
  },
  leaderboardInteractionHotspot: {
    ...sceneLayout.sceneObjects.leaderboardInteractionHotspot,
    area: "leaderboard",
    label: "Leaderboard"
  },
  workstationInteractionHotspot: {
    ...sceneLayout.sceneObjects.workstationInteractionHotspot,
    area: "workstations",
    label: "Workstation"
  },
  backtestInteractionHotspot: {
    ...sceneLayout.sceneObjects.backtestInteractionHotspot,
    area: "backtest_computer",
    label: "Backtest Rig"
  },
  teaCorner: {
    ...sceneLayout.sceneObjects.teaCorner,
    area: "tea",
    label: "Tea Corner"
  },
  dataCabinet: {
    ...sceneLayout.sceneObjects.dataCabinet,
    area: "data_cabinet",
    label: "Data Cabinet"
  },
  meetingTable: {
    ...sceneLayout.sceneObjects.meetingTable,
    area: "meeting",
    label: "Meeting Table"
  }
};

export const officeAreaBounds: Record<OfficeAreaId, { label: string; x: number; y: number; w: number; h: number }> = {
  workstations: { label: "Workstations", x: 73, y: 62, w: 21, h: 24 },
  whiteboard: { label: "Whiteboard", x: 58, y: 46, w: 27, h: 19 },
  meeting: { label: "Meeting Table", x: 36, y: 40, w: 30, h: 21 },
  tea: { label: "Tea Corner", x: 10, y: 54, w: 20, h: 19 },
  data_cabinet: { label: "Data Cabinet", x: 78, y: 42, w: 17, h: 22 },
  leaderboard: { label: "Leaderboard Screen", x: 21, y: 28, w: 22, h: 23 },
  backtest_computer: { label: "Backtest Computer", x: 34, y: 75, w: 23, h: 16 },
  window: { label: "Window", x: 5, y: 26, w: 12, h: 19 }
};

export function regionStyle(region: SceneRegion): CSSProperties {
  const transforms = [
    region.rotation ? `rotate(${region.rotation}deg)` : undefined,
    region.perspective?.skewX ? `skewX(${region.perspective.skewX}deg)` : undefined,
    region.perspective?.skewY ? `skewY(${region.perspective.skewY}deg)` : undefined,
    region.perspective?.scaleX || region.perspective?.scaleY
      ? `scale(${region.perspective.scaleX ?? 1}, ${region.perspective.scaleY ?? 1})`
      : undefined
  ].filter(Boolean);

  return {
    left: `${region.x}%`,
    top: `${region.y}%`,
    width: `${region.width}%`,
    height: `${region.height}%`,
    borderRadius: `${region.borderRadius ?? 0.8}vw`,
    zIndex: region.zIndex,
    transform: transforms.join(" "),
    transformOrigin: "center"
  };
}
