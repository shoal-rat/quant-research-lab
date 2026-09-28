import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { CAST, art } from "../lib/cast";
import { SOURCE_NAME, t } from "../lib/i18n";
import { setLang, useStore } from "../lib/store";
import type { CharId, Face } from "../lib/types";
import { director } from "../story/director";
import { Sheet } from "./Sheet";

export async function replayEpisode(id: number) {
  const events = await api.get<any[]>(`/api/episodes/${id}`);
  useStore.getState().set({ tab: "room", tearsheet: null });
  director.replay(events);
}

// ------------------------------------------------------------------ log
export function Log() {
  const lang = useStore((s) => s.lang);
  const zh = lang === "zh";
  const v = useStore((s) => s.dataVersion);
  const [eps, setEps] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  useEffect(() => {
    api.get("/api/episodes").then(setEps).catch(() => {});
    api.get("/api/lessons").then(setLessons).catch(() => {});
  }, [v]);
  return (
    <Sheet title={t("log", lang)} sub={zh ? "每一次研究会议都会留下记录——失败也是研究部的财产" : "Every meeting leaves a record — failures are club property too"} onClose={() => useStore.getState().set({ tab: "room" })} wide>
      <div className="grid2">
        <section className="box">
          <h4>{zh ? "会议记录" : "Meetings"}</h4>
          {!eps.length && <div className="empty">{t("empty", lang)}</div>}
          <div className="timeline">
            {eps.map((e) => (
              <div key={e.id} className={`tl v-${e.verdict}`} onClick={() => e.trial && useStore.getState().set({ tearsheet: e.trial })}>
                <span className="tl-n num">#{e.id}</span>
                <span className="tl-src">{SOURCE_NAME[e.source]?.[lang] ?? e.source}</span>
                <span className="tl-v">{e.verdict === "promote" ? (zh ? "采用" : "adopted") : e.verdict === "reserve" ? (zh ? "候补" : "reserve") : zh ? "驳回" : "rejected"}</span>
                <span className="tl-t num">{new Date(e.created * 1000).toLocaleString()}</span>
                <button className="tl-play" title={zh ? "重播这次会议" : "Replay this meeting"}
                  onClick={(ev) => { ev.stopPropagation(); replayEpisode(e.id); }}>▶</button>
              </div>
            ))}
          </div>
        </section>
        <section className="box">
          <h4>{zh ? "研究部笔记（会喂给下一次提案）" : "Club notes (fed into the next proposal)"}</h4>
          <div className="lessons">
            {lessons.map((l) => (
              <div key={l.id} className={`lesson k-${l.kind}`}>
                <span className="num">{l.universe}</span> {zh ? l.text_zh : l.text_en}
              </div>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ theory
export function Theory() {
  const lang = useStore((s) => s.lang);
  const zh = lang === "zh";
  const [th, setTh] = useState<any>(null);
  useEffect(() => {
    api.get("/api/theory").then(setTh).catch(() => {});
  }, []);
  return (
    <Sheet title={t("theory", lang)} sub={zh ? "澪部长的讲义：研究部的投资理论" : "President Mio's lecture notes: the club's investment doctrine"} onClose={() => useStore.getState().set({ tab: "room" })} wide>
      {th && (
        <div className="theory">
          <div className="doctrine">
            {(th.doctrine[lang] as any[]).map((d, i) => (
              <motion.div key={d.k} className="doc-card" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }}>
                <div className="doc-n num">{i + 1}</div>
                <h3>{d.k}</h3>
                <p>{d.v}</p>
              </motion.div>
            ))}
          </div>
          <section className="box">
            <h4>{zh ? "稀有度从哪来：预期实盘夏普" : "Where rarity comes from: expected live Sharpe"}</h4>
            <div className="formula">
              <div className="mono">E[SR<sub>live</sub>] = m + τ²/(τ² + se²) · (SR<sub>backtest</sub> − m)</div>
              <p>{zh
                ? "m 与 τ² 由研究部做过的全部同类试验估计（再和经济机制先验按 20 个伪样本混合）。se 是回测夏普的标准误（考虑偏度与肥尾）。如果研究部抽了很多卡、大部分是噪声，τ² 就会很小，收缩就会很猛——这就是'抽卡越多门槛越高'。此外还要过 DSR（N 次试验下的最大夏普期望）、前后一致、成本、稳定性和最后只开一次的保险箱。"
                : "m and τ² are estimated from every comparable trial the club has run (blended with the mechanism prior, 20 pseudo-observations). se is the Sharpe standard error (skew and fat tails included). Many noisy pulls → small τ² → heavy shrinkage: more pulls, higher bar. Candidates also face the DSR bar, train/valid consistency, costs, stability, and a lockbox opened exactly once."}</p>
            </div>
          </section>
          <section className="box">
            <h4>{zh ? "收益机制与先验" : "Return mechanisms & priors"}</h4>
            <div className="mechs">
              {Object.entries(th.mechanisms).map(([k, m]: any) => (
                <div key={k} className="mech">
                  <b>{zh ? m.zh : m.en}</b>
                  <span className="num">prior SR {m.prior.toFixed(2)} ± {m.sd.toFixed(2)}</span>
                  <p>{zh ? m.desc_zh : m.desc_en}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="box">
            <h4>{zh ? "策略族文献库" : "Mechanism library"}</h4>
            <div className="fams">
              {th.families.map((f: any) => (
                <div key={f.key} className="fam">
                  <div className="fam-head"><b>{zh ? f.zh : f.en}</b><span className="chip">{f.universe} · {f.mode}</span><span className="chip mech">{f.mechanism}</span></div>
                  <p>{zh ? f.story_zh : f.story_en}</p>
                  {(zh ? f.risk_zh : f.risk_en) && <p className="fam-risk">⚠ {zh ? f.risk_zh : f.risk_en}</p>}
                  <div className="fam-refs">{f.refs.join(" · ")}</div>
                  <div className="mono fam-tpl">{f.templates.join("   |   ")}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ settings
export function Settings() {
  const lang = useStore((s) => s.lang);
  const zh = lang === "zh";
  const s = useStore((x) => x.status);
  const set = (patch: any) => api.post("/api/settings", patch);
  const st = s?.settings ?? {};
  return (
    <Sheet title={t("settings", lang)} onClose={() => useStore.getState().set({ tab: "room" })}>
      <div className="settings">
        <label className="set-row"><span>{zh ? "语言" : "Language"}</span>
          <div className="seg"><button className={lang === "zh" ? "on" : ""} onClick={() => setLang("zh")}>中文</button><button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>English</button></div>
        </label>
        <label className="set-row"><span>{zh ? "会议间隔（秒）" : "Pause between meetings (s)"}</span>
          <input type="range" min={8} max={180} value={st.pace ?? 40} onChange={(e) => set({ pace: Number(e.target.value) })} /><b className="num">{st.pace ?? 40}</b>
        </label>
        <label className="set-row"><span>{zh ? "使用 LLM 研究大脑" : "Use the LLM brain"}</span>
          <input type="checkbox" checked={!!st.use_llm} onChange={(e) => set({ use_llm: e.target.checked })} />
        </label>
        <label className="set-row"><span>{zh ? "账户类型" : "Account type"}</span>
          <div className="seg">
            <button className={st.account === "margin" ? "on" : ""} onClick={() => set({ account: "margin" })}>{zh ? "保证金（可做空）" : "Margin (shorts ok)"}</button>
            <button className={st.account === "cash" ? "on" : ""} onClick={() => set({ account: "cash" })}>{zh ? "现金（只做多）" : "Cash (long only)"}</button>
          </div>
        </label>
        <label className="set-row"><span>{zh ? "收盘后自动刷新数据并推进模拟盘" : "Auto refresh data & paper after the close"}</span>
          <input type="checkbox" checked={!!st.auto_refresh} onChange={(e) => set({ auto_refresh: e.target.checked })} />
        </label>
        <div className="set-row"><span>{zh ? "市场数据" : "Market data"}</span>
          <span className="num">{Object.entries(s?.data ?? {}).map(([k, v]) => `${k}:${v ? "✓" : "✗"}`).join("  ")}</span>
          <button className="btn" onClick={() => api.post("/api/data/refresh")}>{zh ? "立即刷新" : "Refresh now"}</button>
        </div>
        <div className="set-row col"><span>{zh ? "研究大脑" : "Research brain"}</span>
          <div className="brain-box">
            <div>{zh ? "可用后端" : "Backends"}: <b>{s?.brain?.backends?.join(" → ") || "—"}</b></div>
            <div>{zh ? "暂停中" : "Benched"}: <b>{Object.entries(s?.brain?.benched ?? {}).map(([k, v]) => `${k} (${Math.round(Number(v) / 60)}m)`).join(", ") || "—"}</b></div>
            <div>{zh ? "上次使用" : "Last used"}: <b>{s?.brain?.last_backend ?? "—"}</b></div>
            {s?.brain?.last_error && <div className="fail small">{s.brain.last_error}</div>}
            <p className="note">{zh ? "顺序：Claude Code CLI → Anthropic API（若设置了 ANTHROPIC_API_KEY）→ Codex CLI → 离线（经典文献 + 遗传挖掘）。Claude 登录过期时请在终端运行 `claude` 重新登录。" : "Ladder: Claude Code CLI → Anthropic API (if ANTHROPIC_API_KEY) → Codex CLI → offline (library + miner). If Claude's login expired, run `claude` in a terminal to sign in again."}</p>
          </div>
        </div>
        <div className="set-row"><span>{zh ? "风控严格度（敲纱季 +4%，摸头 −2%）" : "Gate strictness (bonk Saki +4%, pat −2%)"}</span><b className="num">×{(s?.strictness ?? 1).toFixed(2)}</b></div>
        <p className="note">{zh ? "全部为模拟 / 纸面交易，没有任何实盘资金路径。不构成投资建议。" : "Paper / simulated trading only — there is no live-money path. Not investment advice."}</p>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ profile
const BIO: Record<CharId, { zh: string; en: string; grade: [string, string] }> = {
  akari: { zh: "元气满满的一年级生，每天读论文、刷新闻，脑子里永远有下一个假说。对自己的点子过于执着，被驳回会哭，但第二天又会带着新想法冲进部室。", en: "A first-year who reads papers and news all day and always has the next hypothesis. Too attached to her ideas — cries when rejected, bursts back in with a new one the next morning.", grade: ["一年级", "1st year"] },
  shiori: { zh: "沉默寡言的数据管理员，随身带着一块旧怀表。对时间戳有近乎偏执的执念——任何偷看未来的信号都逃不过她的前视模糊测试。", en: "A quiet data keeper with an antique pocket watch, obsessive about timestamps. No signal that peeks at the future escapes her look-ahead fuzz test.", grade: ["二年级", "2nd year"] },
  ren: { zh: "靠能量饮料续命的天才工程师，永远睡不醒。回测引擎是他写的：次日开盘成交、点差、冲击成本、融券费，一个都不少。喜欢猫。", en: "A genius engineer running on energy drinks, permanently sleepy. He wrote the backtester: next-open fills, spread, impact, borrow — nothing skipped. Likes cats.", grade: ["二年级", "2nd year"] },
  saki: { zh: "风纪委员出身的风控官，腰间别着一枚红色印章。成本、回撤、容量、稳定性——不合格的一律盖章驳回。嘴上很凶，其实只是不想看大家亏钱。", en: "A former disciplinary-committee member with a red stamp at her hip. Costs, drawdown, capacity, stability — failures get stamped. Harsh words; she just doesn't want anyone to lose money.", grade: ["二年级", "2nd year"] },
  iori: { zh: "自称能用右眼看穿过拟合的中二病学长。说话夸张，但每一句都有数学支撑：收缩夏普、紧缩夏普、多重检验、因子归因。", en: "A chuunibyou senior who claims his right eye sees through overfitting. Dramatic, but every line is backed by math: shrunk Sharpe, deflated Sharpe, multiple testing, factor attribution.", grade: ["三年级", "3rd year"] },
  mio: { zh: "从容优雅的部长，掌管部费基金。只问一件事：这个策略加进来，基金是不是更好了。温柔的笑容下是毫不留情的决断。", en: "The composed club president who runs the club fund. She asks one thing: is the fund better with this strategy in it? A gentle smile over merciless decisions.", grade: ["三年级", "3rd year"] },
};

export function Profile() {
  const id = useStore((s) => s.profile);
  return <AnimatePresence>{id && <ProfileInner key={id} id={id} />}</AnimatePresence>;
}

function ProfileInner({ id }: { id: CharId }) {
  const lang = useStore((s) => s.lang);
  const zh = lang === "zh";
  const club = useStore((s) => s.status?.club?.[id]);
  const [face, setFace] = useState<Face>("base");
  const c = CAST[id];
  const faces: Face[] = ["base", "joy", "angry", "shock", "sad", "special"];
  return (
    <motion.div className="profile-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => useStore.getState().set({ profile: null })}>
      <motion.div className="profile" style={{ ["--c" as any]: c.color }} onClick={(e) => e.stopPropagation()}
        initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }}>
        <div className="profile-art">
          <AnimatePresence initial={false}>
            <motion.img key={face} src={art.portrait(id, face)} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          </AnimatePresence>
        </div>
        <div className="profile-info">
          <div className="profile-role">{zh ? c.roleZh : c.roleEn} · {zh ? BIO[id].grade[0] : BIO[id].grade[1]}</div>
          <h2>{zh ? c.zh : c.en}</h2>
          <div className="profile-en">{zh ? c.en : c.zh}</div>
          <p className="profile-motto">「{zh ? c.mottoZh : c.mottoEn}」</p>
          <p className="profile-bio">{zh ? BIO[id].zh : BIO[id].en}</p>
          <div className="profile-aff">
            <span>{zh ? "好感度" : "Affection"}</span>
            <div className="aff big"><i style={{ width: `${club?.affection ?? 20}%` }} /></div>
            <b className="num">{club?.affection ?? 20}</b>
          </div>
          <div className="profile-counts num">🖐 {club?.pats ?? 0} · 🔨 {club?.bonks ?? 0}</div>
          <div className="faces">
            {faces.map((f) => (
              <button key={f} className={face === f ? "on" : ""} onClick={() => setFace(f)}>
                <img src={art.portrait(id, f)} alt={f} />
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => useStore.getState().set({ profile: null })}>{t("close", lang)}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ title
export function TitleScreen({ onEnter }: { onEnter: () => void }) {
  const lang = useStore((s) => s.lang);
  const zh = lang === "zh";
  return (
    <motion.div className="title" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.6 }} onClick={onEnter}>
      <img className="title-bg" src={art.bg("keyvisual")} alt="" />
      <div className="title-shade" />
      <motion.div className="title-logo" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, type: "spring" }}>
        <div className="title-academy">{t("academy", lang)} · STELLAR ORBIT ACADEMY</div>
        <div className="title-main">{zh ? "量化研究部" : "Quant Research Club"}<span>！</span></div>
        <div className="title-en">QUANT RESEARCH LAB</div>
      </motion.div>
      <motion.div className="title-start" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }}>
        {t("tapToStart", lang)}
      </motion.div>
      <div className="title-foot">{zh ? "全部为模拟交易 · 不构成投资建议 · 数据：Yahoo Finance（个人研究用途）" : "Paper trading only · not investment advice · data: Yahoo Finance (personal research use)"}</div>
      <button className="title-lang" onClick={(e) => { e.stopPropagation(); setLang(zh ? "en" : "zh"); }}>{zh ? "English" : "中文"}</button>
    </motion.div>
  );
}
