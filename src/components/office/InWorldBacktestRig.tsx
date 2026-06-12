import { useMemo } from "react";
import { useAppStore } from "../../store/AppStore";
import { EquityPoint } from "../../types";
import { number, percent } from "../format";

function polyline(points: EquityPoint[], key: "equity" | "benchmark" | "drawdown", width: number, height: number): string {
  if (points.length === 0) return "";
  const values = points.map((point) => point[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((point[key] - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function InWorldBacktestRig(): JSX.Element {
  const { currentExperiment, loop } = useAppStore();
  const curve = currentExperiment?.equityCurve ?? [];
  const sampled = useMemo(() => curve.filter((_, index) => index % Math.ceil(Math.max(1, curve.length / 32)) === 0), [curve]);

  return (
    <div className="inworld-monitor-cluster backtest-display">
      <div className="monitor-pane chart-pane">
        <svg viewBox="0 0 220 92" aria-hidden="true">
          <polyline points={polyline(sampled, "benchmark", 220, 92)} className="benchmark-line" />
          <polyline points={polyline(sampled, "equity", 220, 92)} className="equity-line" />
        </svg>
      </div>
      <div className="monitor-pane drawdown-pane">
        <svg viewBox="0 0 120 72" aria-hidden="true">
          <polyline points={polyline(sampled, "drawdown", 120, 72)} className="drawdown-line" />
        </svg>
      </div>
      <div className="monitor-pane metric-pane">
        <span>Sharpe {currentExperiment ? number(currentExperiment.outOfSampleResult.sharpeRatio) : "--"}</span>
        <span>Cost {currentExperiment ? percent(currentExperiment.outOfSampleResult.returnAfterCosts) : "--"}</span>
        <span>{loop.phase === "backtesting" ? "RUNNING" : currentExperiment?.status ?? "IDLE"}</span>
      </div>
    </div>
  );
}
