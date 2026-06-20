import { useCallback, useEffect, useState } from "react";
import { Pause, Play, Sparkles, Trophy } from "lucide-react";
import { useAppStore } from "../store/AppStore";
import { navigate } from "../App";

// One-click "AI quant autopilot" for the main screen: anyone — no finance
// knowledge — clicks once and the AI researches strategies, validates them on 20y
// of history, and paper-invests the winners (the horse race), all automatically.
// The browser can't run the engine itself, so this drives the local bridge.
export function AutopilotBanner(): JSX.Element | null {
  const { settings } = useAppStore();
  const zh = settings.language === "zh";
  const base = (settings.bridgeUrl || "http://127.0.0.1:8787").replace(/\/$/, "");
  const [running, setRunning] = useState<boolean | null>(null);
  const [horses, setHorses] = useState(0);
  const [bridgeUp, setBridgeUp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${base}/race/state`);
      const json = await res.json();
      setBridgeUp(true);
      setRunning(Boolean(json.running));
      setHorses(json.state?.sleeves?.length ?? 0);
    } catch {
      setBridgeUp(false);
      setRunning(null);
    }
  }, [base]);

  useEffect(() => {
    poll();
    const t = window.setInterval(poll, 10000);
    return () => window.clearInterval(t);
  }, [poll]);

  const start = async () => {
    setBusy(true);
    try {
      await fetch(`${base}/race/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sleeves: 10,
          universe: "large",
          evictHours: 6,
          interval: 30,
          key: settings.paperApiKey || undefined,
          secret: settings.paperApiSecret || undefined
        })
      });
      await poll();
      navigate("/race");
    } catch {
      setBridgeUp(false);
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      await fetch(`${base}/race/stop`, { method: "POST" });
      await poll();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

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
            {zh ? `运行中 · ${horses} 条策略正在同场竞速并模拟投资` : `Running · ${horses} strategies racing and paper-investing for you`}
          </span>
        ) : bridgeUp === false ? (
          <span className="warn">
            {zh
              ? "引擎未启动 —— 双击项目里的 start.cmd（或运行 npm run dialogue-bridge），然后再点开始。"
              : "Engine not running — double-click start.cmd in the project (or run “npm run dialogue-bridge”), then press Start."}
          </span>
        ) : (
          <span>
            {zh
              ? "点一下：AI 自动找策略、用 20 年历史回测、把胜出的策略模拟投资——不需要任何金融知识（虚拟资金）。"
              : "One click: the AI finds strategies, backtests each on 20 years of history, and paper-invests the winners — no finance knowledge needed (simulated money)."}
          </span>
        )}
      </div>
      <div className="autopilot-actions">
        {running ? (
          <>
            <button className="autopilot-btn ghost" onClick={() => navigate("/race")}>
              <Trophy size={15} /> {zh ? "观看比赛" : "Watch"}
            </button>
            <button className="autopilot-btn stop" onClick={stop} disabled={busy}>
              <Pause size={15} /> {zh ? "停止" : "Stop"}
            </button>
          </>
        ) : (
          <button className="autopilot-btn" onClick={start} disabled={busy || bridgeUp === false}>
            <Play size={16} /> {busy ? "…" : zh ? "开始自动投资" : "Start investing"}
          </button>
        )}
      </div>
    </div>
  );
}
