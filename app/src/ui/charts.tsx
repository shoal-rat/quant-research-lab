import { useEffect, useMemo, useRef, useState } from "react";

/** Measure the container so charts draw at real pixel width (crisp, undistorted text). */
function useWidth(fallback = 600): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => {
      const cw = Math.round(es[0].contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

type Series = { data: [string, number][]; color: string; dash?: string; width?: number; fill?: boolean; label?: string };

const fmtDate = (d: string) => d.slice(0, 4);

export function LineChart({ series, h = 220, log = false, zero = false, pct = false, yfmt }: {
  series: Series[]; h?: number; log?: boolean; zero?: boolean; pct?: boolean; yfmt?: (v: number) => string;
}) {
  const [ref, W] = useWidth();
  const pad = { l: 46, r: 12, t: 10, b: 22 };
  const g = useMemo(() => {
    const all = series.flatMap((s) => s.data.map((p) => (log ? Math.log(Math.max(p[1], 1e-6)) : p[1])));
    if (!all.length) return null;
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (hi === lo) { hi += 1; lo -= 1; }
    const n = Math.max(...series.map((s) => s.data.length));
    const x = (i: number, len: number) => pad.l + (i / Math.max(1, len - 1)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - ((log ? Math.log(Math.max(v, 1e-6)) : v) - lo) / (hi - lo)) * (h - pad.t - pad.b);
    const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3);
    const ref = series[0]?.data ?? [];
    const xt = ref.length ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (ref.length - 1))) : [];
    return { x, y, ticks, lo, hi, n, xt, ref };
  }, [series, h, log, zero, W]);
  if (!g) return <div ref={ref} className="chart-empty">—</div>;
  const f = yfmt ?? ((v: number) => (pct ? `${(v * 100).toFixed(0)}%` : v.toFixed(2)));
  return (
    <div ref={ref} className="chart-wrap">
    <svg viewBox={`0 0 ${W} ${h}`} width={W} height={h} className="chart">
      {g.ticks.map((tv, i) => {
        const v = log ? Math.exp(tv) : tv;
        const yy = g.y(v);
        return (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={yy} y2={yy} stroke="#e3eef9" />
            <text x={pad.l - 6} y={yy + 4} textAnchor="end" className="axis">{f(v)}</text>
          </g>
        );
      })}
      {zero && <line x1={pad.l} x2={W - pad.r} y1={g.y(0)} y2={g.y(0)} stroke="#9aa7b8" strokeDasharray="3 3" />}
      {g.xt.map((i) => (
        <text key={i} x={g.x(i, g.ref.length)} y={h - 5} textAnchor="middle" className="axis">{fmtDate(g.ref[i][0])}</text>
      ))}
      {series.map((s, k) => {
        const d = s.data.map((p, i) => `${i ? "L" : "M"}${g.x(i, s.data.length).toFixed(1)},${g.y(p[1]).toFixed(1)}`).join("");
        return (
          <g key={k}>
            {s.fill && <path d={`${d}L${g.x(s.data.length - 1, s.data.length)},${g.y(zero ? 0 : g.lo)}L${pad.l},${g.y(zero ? 0 : g.lo)}Z`} fill={s.color} opacity="0.15" />}
            <path d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.2} strokeDasharray={s.dash} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
    </div>
  );
}

export function Bars({ items, h = 160, pct = false, fmt, colorFn }: {
  items: { label: string; value: number; color?: string }[]; h?: number; pct?: boolean; fmt?: (v: number) => string; colorFn?: (v: number) => string;
}) {
  const [ref, W] = useWidth();
  const pad = { l: 8, r: 8, t: 16, b: 22 };
  if (!items.length) return <div ref={ref} className="chart-empty">—</div>;
  const hi = Math.max(0, ...items.map((i) => i.value));
  const lo = Math.min(0, ...items.map((i) => i.value));
  const span = hi - lo || 1;
  const bw = (W - pad.l - pad.r) / items.length;
  const y = (v: number) => pad.t + ((hi - v) / span) * (h - pad.t - pad.b);
  const f = fmt ?? ((v: number) => (pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(2)));
  return (
    <div ref={ref} className="chart-wrap">
    <svg viewBox={`0 0 ${W} ${h}`} width={W} height={h} className="chart">
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#9aa7b8" />
      {items.map((it, i) => {
        const x = pad.l + i * bw + bw * 0.15;
        const y0 = y(Math.max(0, it.value));
        const hh = Math.abs(y(it.value) - y(0));
        const c = it.color ?? colorFn?.(it.value) ?? (it.value >= 0 ? "#33b6ff" : "#ff6f86");
        return (
          <g key={i}>
            <rect x={x} y={y0} width={bw * 0.7} height={Math.max(1, hh)} rx="3" fill={c} />
            {items.length <= 24 && <text x={x + bw * 0.35} y={it.value >= 0 ? y0 - 4 : y0 + hh + 12} textAnchor="middle" className="axis small">{f(it.value)}</text>}
            <text x={x + bw * 0.35} y={h - 6} textAnchor="middle" className="axis">{it.label}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

export function MonthHeat({ rows }: { rows: { y: number; m: number; r: number }[] }) {
  const years = [...new Set(rows.map((r) => r.y))].sort();
  const map = new Map(rows.map((r) => [`${r.y}-${r.m}`, r.r]));
  const color = (v: number | undefined) => {
    if (v === undefined) return "#f1f5fa";
    const a = Math.min(1, Math.abs(v) / 0.06);
    return v >= 0 ? `rgba(31,191,117,${0.12 + a * 0.8})` : `rgba(255,77,94,${0.12 + a * 0.8})`;
  };
  return (
    <div className="heat">
      <div className="heat-row head"><span />{Array.from({ length: 12 }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
      {years.map((y) => (
        <div key={y} className="heat-row">
          <span className="num">{y}</span>
          {Array.from({ length: 12 }, (_, i) => {
            const v = map.get(`${y}-${i + 1}`);
            return <span key={i} className="heat-cell" style={{ background: color(v) }} title={v === undefined ? "" : `${(v * 100).toFixed(1)}%`} />;
          })}
        </div>
      ))}
    </div>
  );
}

/** Prior vs posterior of the true Sharpe, with the observed backtest Sharpe marked. */
export function PosteriorPlot({ obs, se, post, postSd, prior, priorSd }: { obs: number; se: number; post: number; postSd: number; prior: number; priorSd: number }) {
  const [ref, W] = useWidth();
  const H = 190;
  const lo = Math.min(-0.8, obs - 3 * se, prior - 3 * priorSd);
  const hi = Math.max(1.6, obs + 3 * se, post + 3 * postSd);
  const x = (v: number) => 30 + ((v - lo) / (hi - lo)) * (W - 60);
  const pdf = (v: number, m: number, s: number) => Math.exp(-0.5 * ((v - m) / s) ** 2) / s;
  const peak = Math.max(pdf(post, post, postSd), pdf(prior, prior, priorSd), pdf(obs, obs, se));
  const y = (p: number) => H - 26 - (p / peak) * (H - 50);
  const curve = (m: number, s: number) => Array.from({ length: 121 }, (_, i) => { const v = lo + ((hi - lo) * i) / 120; return `${i ? "L" : "M"}${x(v).toFixed(1)},${y(pdf(v, m, s)).toFixed(1)}`; }).join("");
  const post0 = Array.from({ length: 121 }, (_, i) => { const v = Math.max(0, lo) + ((hi - Math.max(0, lo)) * i) / 120; return `${i ? "L" : "M"}${x(v).toFixed(1)},${y(pdf(v, post, postSd)).toFixed(1)}`; }).join("");
  return (
    <div ref={ref} className="chart-wrap">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chart">
      <line x1={x(0)} x2={x(0)} y1={10} y2={H - 26} stroke="#9aa7b8" strokeDasharray="4 4" />
      <path d={`${post0}L${x(hi)},${y(0)}L${x(Math.max(0, lo))},${y(0)}Z`} fill="#33b6ff" opacity="0.18" />
      <path d={curve(prior, priorSd)} fill="none" stroke="#b9c6d8" strokeWidth="2.5" strokeDasharray="6 5" />
      <path d={curve(obs, se)} fill="none" stroke="#ffb000" strokeWidth="2.5" />
      <path d={curve(post, postSd)} fill="none" stroke="#1590e8" strokeWidth="3.5" />
      {[{ v: obs, c: "#ffb000", t: "backtest" }, { v: post, c: "#1590e8", t: "posterior" }].map((m) => (
        <g key={m.t}>
          <line x1={x(m.v)} x2={x(m.v)} y1={14} y2={H - 26} stroke={m.c} strokeWidth="2" />
          <text x={x(m.v)} y={12} textAnchor="middle" className="axis" fill={m.c}>{m.v.toFixed(2)}</text>
        </g>
      ))}
      {[-0.5, 0, 0.5, 1, 1.5].filter((v) => v > lo && v < hi).map((v) => (
        <text key={v} x={x(v)} y={H - 8} textAnchor="middle" className="axis">{v.toFixed(1)}</text>
      ))}
    </svg>
    </div>
  );
}

export function Spark({ data, w = 120, h = 36, color = "#33b6ff" }: { data: [string, number][]; w?: number; h?: number; color?: string }) {
  if (!data?.length) return <svg width={w} height={h} />;
  const vals = data.map((d) => d[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, vals.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join("");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}><path d={d} fill="none" stroke={color} strokeWidth="2" /></svg>;
}
