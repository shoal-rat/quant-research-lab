import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { EquityPoint, ExperimentRecord } from "../types";

export function EquityCurveChart({ data }: { data: EquityPoint[] }): JSX.Element {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(75,55,45,0.12)" />
          <XAxis dataKey="date" minTickGap={28} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="equity" stroke="#2f9c95" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="benchmark" stroke="#9a7d63" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DrawdownChart({ data }: { data: EquityPoint[] }): JSX.Element {
  return (
    <div className="chart-box compact-chart">
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(75,55,45,0.12)" />
          <XAxis dataKey="date" hide />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Area type="monotone" dataKey="drawdown" stroke="#cc5c5c" fill="#f6b0a6" fillOpacity={0.55} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LeaderboardBarChart({ experiments }: { experiments: ExperimentRecord[] }): JSX.Element {
  const data = experiments.slice(0, 8).map((experiment) => ({
    name: experiment.strategyName.split(" ").slice(0, 2).join(" "),
    sharpe: experiment.outOfSampleResult.sharpeRatio,
    robustness: experiment.outOfSampleResult.robustnessScore,
    overfit: experiment.outOfSampleResult.overfittingRiskScore
  }));
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(75,55,45,0.12)" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="robustness" fill="#2f9c95" radius={[6, 6, 0, 0]} />
          <Bar dataKey="overfit" fill="#ef6f6c" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
