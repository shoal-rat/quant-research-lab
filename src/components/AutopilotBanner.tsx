import { useState } from "react";
import { Pause, Sparkles, Trophy } from "lucide-react";
import { useAppStore } from "../store/AppStore";
import { navigate } from "../App";

// Main-screen status for the ONE research+invest process. It reads the shared race
// mirror from the store (a single poller) — it does NOT start anything itself; the
// green ▶ in the HUD is the single start. Here it just explains and shows progress.
export function AutopilotBanner(): JSX.Element | null {
  const { settings, raceState, stopRace } = useAppStore();
  const zh = settings.language === "zh";
  const [minimized, setMinimized] = useState(false);
  const { running, bridgeUp, strategies, activity } = raceState;

  if (minimized) {
    return (
      <button className="autopilot-mini" onClick={() => setMinimized(false)} title="AI Autopilot">
        <Sparkles size={15} />
        {running ? (zh ? "自动投资中" : "Autopilot on") : zh ? "一键自动投资" : "Autopilot"}
      </button>
    );
  }

  return (
    <div className={`autopilot-banner ${running ? "live" : ""}`}>
      <button className="autopilot-close" onClick={() => setMinimized(true)} aria-label="minimize">
        –
      </button>
      <div className="autopilot-icon">
        <Sparkles size={22} />
      </div>
      <div className="autopilot-text">
        <strong>{zh ? "AI 量化自动驾驶" : "AI Quant Autopilot"}</strong>
        {running ? (
          <span>
            {zh ? `运行中 · ${strategies || "…"} 条策略 · ` : `Running · ${strategies || "…"} strategies · `}
            {activity}
          </span>
        ) : bridgeUp === false ? (
          <span className="warn">
            {zh
              ? "引擎未启动 —— 双击项目里的 start.cmd（或运行 npm run dialogue-bridge），然后点上方绿色 ▶ 开始。"
              : "Engine not running — double-click start.cmd in the project (or run “npm run dialogue-bridge”), then press the green ▶ Start."}
          </span>
        ) : (
          <span>
            {zh
              ? "点上方那颗绿色 ▶ 开始键：AI 会自动找策略、用 20 年历史回测、把胜出的策略模拟投资——不需要任何金融知识（虚拟资金）。"
              : "Press the green ▶ Start button up top: the AI finds strategies, backtests each on 20 years of history, and paper-invests the winners — no finance knowledge needed (simulated money)."}
          </span>
        )}
      </div>
      <div className="autopilot-actions">
        {running && (
          <>
            <button className="autopilot-btn ghost" onClick={() => navigate("/race")}>
              <Trophy size={15} /> {zh ? "观看比赛" : "Watch"}
            </button>
            <button className="autopilot-btn stop" onClick={stopRace}>
              <Pause size={15} /> {zh ? "停止" : "Stop"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
