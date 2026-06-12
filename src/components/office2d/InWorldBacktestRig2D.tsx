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

export function InWorldBacktestRig2D(): JSX.Element {
  const { currentExperiment, loop } = useAppStore();
  const sampled = useMemo(() => {
    const curve = currentExperiment?.equityCurve ?? [];
    const step = Math.ceil(Math.max(1, curve.length / 34));
    return curve.filter((_, index) => index % step === 0);
  }, [currentExperiment]);

  return (
    <div className="display-2d backtest-2d">
      <svg viewBox="0 0 150 58" aria-hidden="true">
        <polyline points={polyline(sampled, "benchmark", 150, 58)} className="benchmark-line" />
        <polyline points={polyline(sampled, "equity", 150, 58)} className="equity-line" />
      </svg>
      <svg viewBox="0 0 92 58" aria-hidden="true">
        <polyline points={polyline(sampled, "drawdown", 92, 58)} className="drawdown-line" />
      </svg>
      <div>
        <strong>{loop.phase === "backtesting" ? "RUN" : currentExperiment?.status ?? "IDLE"}</strong>
        <span>Sh {currentExperiment ? number(currentExperiment.outOfSampleResult.sharpeRatio) : "--"}</span>
        <span>Ret {currentExperiment ? percent(currentExperiment.outOfSampleResult.returnAfterCosts, 0) : "--"}</span>
      </div>
    </div>
  );
}

