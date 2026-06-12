import { CSSProperties } from "react";
import { OfficeAreaId } from "../../types";

export interface Office2DPoint {
  x: number;
  y: number;
}

export interface Office2DRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Office2DZoneId = OfficeAreaId | "manager_desk";

export interface Office2DZone {
  label: string;
  entry: Office2DPoint;
  bounds: Office2DRect;
  interaction: Office2DRect;
  idlePositions: Office2DPoint[];
  area?: OfficeAreaId;
}

export const office2DMapSize = { width: 1600, height: 900 };

export const office2DAssets = {
  base: "/assets/generated/office-2d/office-map-base.png",
  foreground: "/assets/generated/office-2d/office-map-foreground.png",
  preview: "/assets/generated/office-2d/office-map-preview.png",
  zones: "/assets/generated/office-2d/office-map-zones.json",
  collision: "/assets/generated/office-2d/office-map-collision.json"
};

export const office2DDisplays = {
  leaderboardScreen: { x: 318, y: 58, width: 340, height: 104, borderRadius: 8, zIndex: 3 },
  whiteboardSurface: { x: 812, y: 68, width: 370, height: 106, borderRadius: 4, zIndex: 3 },
  workstationMonitors: { x: 1130, y: 523, width: 286, height: 78, borderRadius: 8, zIndex: 4 },
  backtestMonitors: { x: 635, y: 625, width: 330, height: 76, borderRadius: 9, zIndex: 4 },
  dataCabinetDisplay: { x: 1268, y: 72, width: 96, height: 43, borderRadius: 4, zIndex: 4 }
} as const;

export const office2DWaypoints: Record<string, Office2DPoint> = {
  hub: { x: 800, y: 585 },
  topHall: { x: 800, y: 300 },
  leftHall: { x: 365, y: 565 },
  rightHall: { x: 1215, y: 520 },
  bottomHall: { x: 790, y: 705 }
};

export const office2DZones: Record<Office2DZoneId, Office2DZone> = {
  leaderboard: {
    label: "Leaderboard Screen",
    area: "leaderboard",
    entry: { x: 405, y: 280 },
    bounds: { x: 172, y: 55, width: 420, height: 210 },
    interaction: { x: 170, y: 60, width: 430, height: 220 },
    idlePositions: [
      { x: 360, y: 310 },
      { x: 440, y: 318 }
    ]
  },
  whiteboard: {
    label: "Whiteboard Zone",
    area: "whiteboard",
    entry: { x: 1068, y: 285 },
    bounds: { x: 900, y: 55, width: 480, height: 220 },
    interaction: { x: 895, y: 58, width: 500, height: 230 },
    idlePositions: [
      { x: 1030, y: 315 },
      { x: 1120, y: 318 }
    ]
  },
  data_cabinet: {
    label: "Data Cabinet Zone",
    area: "data_cabinet",
    entry: { x: 1390, y: 330 },
    bounds: { x: 1345, y: 72, width: 230, height: 280 },
    interaction: { x: 1345, y: 72, width: 230, height: 300 },
    idlePositions: [
      { x: 1372, y: 382 },
      { x: 1450, y: 390 }
    ]
  },
  meeting: {
    label: "Meeting Table Zone",
    area: "meeting",
    entry: { x: 800, y: 565 },
    bounds: { x: 540, y: 330, width: 520, height: 250 },
    interaction: { x: 520, y: 320, width: 560, height: 280 },
    idlePositions: [
      { x: 660, y: 585 },
      { x: 760, y: 600 },
      { x: 865, y: 592 },
      { x: 950, y: 575 }
    ]
  },
  tea: {
    label: "Tea Corner Zone",
    area: "tea",
    entry: { x: 310, y: 610 },
    bounds: { x: 70, y: 300, width: 310, height: 320 },
    interaction: { x: 68, y: 300, width: 330, height: 340 },
    idlePositions: [
      { x: 230, y: 628 },
      { x: 305, y: 650 }
    ]
  },
  backtest_computer: {
    label: "Backtest Rig Zone",
    area: "backtest_computer",
    entry: { x: 770, y: 655 },
    bounds: { x: 500, y: 640, width: 550, height: 215 },
    interaction: { x: 500, y: 630, width: 560, height: 230 },
    idlePositions: [
      { x: 675, y: 642 },
      { x: 840, y: 650 }
    ]
  },
  workstations: {
    label: "Code Workstation Zone",
    area: "workstations",
    entry: { x: 1190, y: 650 },
    bounds: { x: 1090, y: 535, width: 445, height: 300 },
    interaction: { x: 1085, y: 520, width: 455, height: 325 },
    idlePositions: [
      { x: 1175, y: 642 },
      { x: 1270, y: 660 }
    ]
  },
  manager_desk: {
    label: "Manager Control Zone",
    area: "meeting",
    entry: { x: 1150, y: 485 },
    bounds: { x: 1042, y: 292, width: 270, height: 190 },
    interaction: { x: 1035, y: 285, width: 288, height: 210 },
    idlePositions: [{ x: 1150, y: 492 }]
  },
  window: {
    label: "Quiet Window",
    area: "window",
    entry: { x: 150, y: 280 },
    bounds: { x: 50, y: 60, width: 120, height: 190 },
    interaction: { x: 50, y: 60, width: 140, height: 200 },
    idlePositions: [{ x: 165, y: 304 }]
  }
};

export const office2DCollision = {
  blocked: [
    { id: "leaderboard-wall", x: 180, y: 68, width: 390, height: 165 },
    { id: "whiteboard-wall", x: 920, y: 72, width: 438, height: 178 },
    { id: "data-cabinet", x: 1375, y: 75, width: 180, height: 240 },
    { id: "tea-counter", x: 92, y: 325, width: 245, height: 235 },
    { id: "meeting-table", x: 570, y: 360, width: 440, height: 178 },
    { id: "backtest-rig", x: 520, y: 675, width: 510, height: 162 },
    { id: "workstation", x: 1120, y: 560, width: 390, height: 235 },
    { id: "manager-desk", x: 1060, y: 312, width: 235, height: 150 }
  ],
  walkableBounds: { x: 45, y: 250, width: 1510, height: 590 }
};

export function rectToPercentStyle(rect: Office2DRect, zIndex?: number): CSSProperties {
  return {
    left: `${(rect.x / office2DMapSize.width) * 100}%`,
    top: `${(rect.y / office2DMapSize.height) * 100}%`,
    width: `${(rect.width / office2DMapSize.width) * 100}%`,
    height: `${(rect.height / office2DMapSize.height) * 100}%`,
    zIndex
  };
}

export function pointToPercentStyle(point: Office2DPoint, zIndex?: number): CSSProperties {
  return {
    left: `${(point.x / office2DMapSize.width) * 100}%`,
    top: `${(point.y / office2DMapSize.height) * 100}%`,
    zIndex
  };
}

