import { useCallback, useEffect, useState } from "react";
import { Flag, Pause, Play, Trophy } from "lucide-react";
import { useAppStore } from "../store/AppStore";

interface Sleeve {
  id: string;
  name: string;
  familyKey: string;
  nav: number;
  navStart: number;
  ret?: number;
  drawdown?: number;
  validated: boolean;
  targets: string[];
  pedigree: { oosSharpe: number; oosICt: number | null };
}
interface RaceState {
  running: boolean;
  params?: { until: string; sleeves: number; interval: number; evictHours: number; universe: string };
  state: {
    startedAt: string;
    deadline: string;
    sleeves: Sleeve[];
    evicted: Array<{ name: string; ret: number; finalNav: number; evictedAt: string }>;
  } | null;
}

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`);

export function RacePage(): JSX.Element {
  const { settings } = useAppStore();
  const zh = settings.language === "zh";
  const base = (settings.bridgeUrl || "http://127.0.0.1:8787").replace(/\/$/, "");
  const [data, setData] = useState<RaceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sleeves, setSleeves] = useState(10);
  const [universe, setUniverse] = useState<"large" | "bundled">("large");
  const [evictHours, setEvictHours] = useState(6);
  const [interval, setIntervalH] = useState(30);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${base}/race/state`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError(zh ? "连不上桥接器——先运行 npm run dialogue-bridge" : "Can't reach the bridge — run `npm run dialogue-bridge` first");
    }
  }, [base, zh]);

  useEffect(() => {
    poll();
    const t = window.setInterval(poll, 15000);
    return () => window.clearInterval(t);
  }, [poll]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/race/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sleeves,
          universe,
          evictHours,
          interval,
          key: settings.paperApiKey || undefined,
          secret: settings.paperApiSecret || undefined
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      await poll();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
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

  const running = data?.running ?? false;
  const horses = [...(data?.state?.sleeves ?? [])].sort((a, b) => b.nav - a.nav);
  const best = Math.max(1e-9, ...horses.map((h) => Math.abs(h.ret ?? 0)), 1);
  const deadline = data?.state?.deadline ?? data?.params?.until;
  const remaining = deadline ? (new Date(deadline).getTime() - Date.now()) / 3600000 : null;

  return (
    <div className="race-page">
      <div className="page-heading">
        <div>
          <small>Live strategy tournament · paper / simulated</small>
          <h1>🏇 {zh ? "策略赛马" : "Strategy Horse Race"}</h1>
          <p>
            {zh
              ? "并行研究多条策略，各占账户一格，用实时价格同场竞速；定期淘汰最差、换上新晋最佳，冠军自动镜像到你的模拟账户。"
              : "Strategies researched in parallel, each given a sleeve of the account, raced on live prices. The worst is periodically evicted and replaced by a fresh best; the leader is mirrored to your paper account."}
          </p>
        </div>
        <div className="race-controls">
          {running ? (
            <button className="primary-button stop" onClick={stop} disabled={busy}>
              <Pause size={16} /> {zh ? "停止" : "Stop"}
            </button>
          ) : (
            <button className="primary-button" onClick={start} disabled={busy}>
              <Play size={16} /> {zh ? "开始比赛" : "Start race"}
            </button>
          )}
        </div>
      </div>

      {!running && (
        <div className="race-config">
          <label>{zh ? "马匹数" : "Horses"}<input type="number" min={3} max={16} value={sleeves} onChange={(e) => setSleeves(Number(e.target.value))} /></label>
          <label>{zh ? "淘汰间隔(小时)" : "Evict every (h)"}<input type="number" min={1} max={24} value={evictHours} onChange={(e) => setEvictHours(Number(e.target.value))} /></label>
          <label>{zh ? "刷新(分钟)" : "Refresh (min)"}<input type="number" min={10} max={120} value={interval} onChange={(e) => setIntervalH(Number(e.target.value))} /></label>
          <label>{zh ? "股票池" : "Universe"}
            <select value={universe} onChange={(e) => setUniverse(e.target.value as "large" | "bundled")}>
              <option value="large">S&P500 + NDX (513)</option>
              <option value="bundled">Bundled (60)</option>
            </select>
          </label>
        </div>
      )}

      <div className={`race-status ${running ? "live" : ""}`}>
        <span className="race-dot" />
        {running
          ? zh ? `比赛进行中 · ${horses.length} 匹 · 剩余 ${remaining !== null ? remaining.toFixed(1) : "?"} 小时` : `Race live · ${horses.length} horses · ${remaining !== null ? remaining.toFixed(1) : "?"}h left`
          : zh ? "未开始（点“开始比赛”，之后可随时关闭网页，比赛在桥接器里继续）" : "Not running (hit Start — then you can close this page; the race keeps running in the bridge)"}
      </div>

      {error && <div className="paper-error">⚠ {error}</div>}

      {horses.length > 0 && (
        <div className="race-track">
          {horses.map((h, i) => {
            const ret = h.ret ?? 0;
            const width = 10 + (Math.abs(ret) / best) * 70;
            return (
              <div className={`lane ${i === 0 ? "leader" : ""}`} key={h.id}>
                <div className="lane-rank">{i === 0 ? <Trophy size={15} /> : i + 1}</div>
                <div className="lane-body">
                  <div className="lane-head">
                    <strong>{h.name}</strong>
                    {h.validated ? <span className="lane-badge ok">validated</span> : <span className="lane-badge">unproven</span>}
                    <span className="lane-ped">OOS {h.pedigree.oosSharpe?.toFixed(2)}{h.pedigree.oosICt !== null ? ` · IC t ${h.pedigree.oosICt?.toFixed(1)}` : ""}</span>
                    <span className={`lane-ret ${ret >= 0 ? "up" : "down"}`}>{pct(ret)}</span>
                  </div>
                  <div className="lane-bar-wrap">
                    <div className={`lane-bar ${ret >= 0 ? "up" : "down"}`} style={{ width: `${width}%` }} />
                    <span className="lane-nav">${Math.round(h.nav).toLocaleString("en-US")}</span>
                  </div>
                  <div className="lane-targets">{(h.targets || []).slice(0, 8).join(" · ") || (zh ? "（空仓）" : "(cash)")}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data?.state?.evicted && data.state.evicted.length > 0 && (
        <div className="race-evicted">
          <h3><Flag size={14} /> {zh ? "已淘汰" : "Eliminated"}</h3>
          {data.state.evicted.slice(-6).reverse().map((e, i) => (
            <span key={i} className="evicted-chip">{e.name} <small className={e.ret >= 0 ? "up" : "down"}>{pct(e.ret)}</small></span>
          ))}
        </div>
      )}

      <p className="race-foot">
        {zh
          ? "需要先在终端运行桥接器（npm run dialogue-bridge，并设置 QRL_ALPACA_KEY_FILE）。它是真正干活的引擎——网页只是遥控器。仅模拟盘。"
          : "Requires the bridge running in a terminal (npm run dialogue-bridge, with QRL_ALPACA_KEY_FILE set). That's the engine doing the work — this page is just the remote. Paper/simulated only."}
      </p>
    </div>
  );
}
