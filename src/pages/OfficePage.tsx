import { useState } from "react";
import { OfficeScene } from "../components/OfficeScene";
import { SpeechTicker } from "../components/SpeechTicker";
import { BossBar } from "../components/BossBar";
import { BossOrb } from "../components/BossOrb";
import { LoveWhipPanel } from "../components/LoveWhipPanel";
import { OfficeMap2D } from "../components/office2d/OfficeMap2D";
import { useAppStore } from "../store/AppStore";

// The single game screen: the office stage plus the boss's instruments.
// In wallpaper mode the instruments collapse into a draggable floating ball.
export function OfficePage(): JSX.Element {
  const { settings, wallpaperMode } = useAppStore();
  const [bossTool, setBossTool] = useState<"love" | "whip" | null>(null);

  return (
    <div className={`game-screen ${wallpaperMode ? "wallpaper" : ""}`}>
      <div className="game-stage-wrap">
        {settings.officeViewMode === "legacy3d" ? (
          <OfficeScene />
        ) : (
          <OfficeMap2D bossTool={bossTool} onBossToolUsed={() => setBossTool(null)} />
        )}
      </div>
      {!wallpaperMode && <LoveWhipPanel tool={bossTool} onPickTool={setBossTool} />}
      {!wallpaperMode && (
        <div className="game-bottom-stack">
          <SpeechTicker />
          <BossBar />
        </div>
      )}
      {wallpaperMode && <BossOrb tool={bossTool} onPickTool={setBossTool} />}
    </div>
  );
}
