# Quant Research Lab — v2 Design Doc
## Autonomous loop upgrade, honest statistics, wallpaper packaging, browser LLM condenser

Current state: fixed 6-strategy bank, deterministic mock backtests, linear phase chain `proposing -> data_check -> coding -> backtesting -> risk_review -> debate -> decision -> saved`. This doc upgrades that into a self-iterating research office grounded in RD-Agent(Q), QuantEvolve, AlphaGen, AlphaAgent, QuantaAlpha, FinMem/FinAgent/FinCon, plus institutional backtest hygiene (Bailey/López de Prado, Harvey-Liu-Zhu, McLean-Pontiff, WorldQuant gates).

---

# Part A — The 10 Loop Mechanics (prioritized)

Priority key: **P0** = changes the search dynamics, ship first. **P1** = compounding quality. **P2** = polish.

### A1. (P0) Trial Registry + Alpha-Pool Marginal Scoring with Correlation Penalty (AlphaGen + RD-Agent + WorldQuant)
The single most important change. Replace "is this strategy's Sharpe good?" with "does the *pool* improve when we add it?"

- Global `trialRegistry: { id, familyKey, params, dailyPnl: number[], sharpe, hypothesisCardId, lineage }[]`. **Every** backtest ever run appends here and increments a monotonic `trialCounter M` (feeds multiple-testing math in Part B; nothing is ever deleted, only flagged retired).
- `alphaPool`: the accepted strategies. Admission gate (WorldQuant BRAIN numbers):
  - `sharpe >= 1.25` gross at pool entry evaluation window (or your tuned floor),
  - daily turnover in `[0.01, 0.70]`,
  - `fitness = sqrt(|annualReturn| / max(turnover, 0.125)) * sharpe >= 1.0`,
  - **correlation penalty:** `maxPoolCorr = max Pearson(candidate.dailyPnl, member.dailyPnl)` over trailing 504 days; reject if `> 0.7` **unless** `candidate.sharpe >= 1.10 * bestCorrelatedIncumbent.sharpe` (documented override). Self-correlation vs the agent's own prior submissions > 0.7 fails immediately.
- Pool weights `∝ fitness * (1 - maxCorr)`; report **pool-level Sharpe delta** as the headline reward of each experiment (AlphaGen's insight: score marginal contribution, not standalone metrics — two 0.97-correlated alphas with opposite weights can beat either alone, so the corr gate is admission hygiene, the marginal pool delta is the *reward*).
- UI: the pool is the agents' shared "fund"; the decision phase displays `ΔpoolSharpe` not raw Sharpe.

### A2. (P0) Hypothesis Cards + Alignment Gate (AlphaAgent + QuantEvolve)
Every run of `proposing` must emit a 6-field card before anything else happens:
1. testable claim grounded in an economic mechanism (cite the family's `rationale` from the knowledge base),
2. rationale (why now / what condition),
3. quantitative objective (e.g. "net Sharpe > 0.4, maxDD < 15%"),
4. expected insight **on success AND on failure**,
5. risks / overfitting concerns,
6. follow-up ideas.

Then an **alignment gate** in `data_check`/`coding`: one LLM check "does the parameter spec implement the claim?", one "does the code/config match the spec?" — reject mismatches before backtesting (AlphaAgent: +81% hit ratio with this and the complexity penalty). Complexity caps (QuantaAlpha-style, adapted to a parametric bank): ≤ 3 parameters changed vs parent, no parameter pushed to its extreme bound without justification text.

### A3. (P0) Thompson-Sampling Direction Bandit (RD-Agent(Q))
Replace "LLM decides what to do next" with a ~60-line statistical scheduler — RD-Agent's ablation showed the bandit beat both random AND LLM-chosen direction.
- Arms (3–5): `explore_new_family`, `refine_pool_best`, `repair_recent_failure`, `recombine_winners` (and optionally `regime_overlay_work`).
- Each arm keeps a Bayesian linear regression over a small state vector: recent `ΔpoolSharpe`, pool size, mean pool correlation, fraction of last-5 experiments that passed gates, count of untested families.
- Per cycle: sample `θ̃ ~ N(μ, P⁻¹)` per arm, pick argmax predicted reward, run the experiment, update the chosen arm's posterior with the realized `ΔpoolSharpe`.
- This IS the exploration-vs-refinement policy. The anime "director" character can narrate the bandit's pick ("we've been refining too long, exploring seasonality").

### A4. (P0) Hard Mechanical Risk/Overfit Gate (FinCon CVaR + hygiene stack)
`risk_review` stops being an LLM opinion. It becomes a deterministic checklist computed by the mock engine (all formulas in Part B): cost gate → t ≥ 3.0 + BHY haircut > 0 → DSR ≥ 0.95 → MinTRL satisfied → max drawdown / CVaR not worse than family prior → turnover band → pool correlation. The risk-officer character *reads out* the gate results in character; she never overrides them. Pre-backtest cheap checks (CogAlpha): an LLM judge asks "any future-information leakage in this construction?" and ">30% NaN risk?".

### A5. (P1) Lineage + Targeted Mutation (QuantaAlpha)
Give every strategy a `lineage: { parentId, mutationNode, generation }`.
- On a failed experiment, the reflection step identifies the **single most blameworthy node** (hypothesis? family choice? a specific parameter? holding period?), rewrites only that, keeps the frozen prefix, and reruns — QuantaAlpha's largest ablation effect (−0.0292 IC without it).
- **Crossover:** splice proven elements from two pool members (e.g. winner A's signal family + winner B's vol-managed overlay + a hypothesis-template that has produced ≥2 pool admissions).
- Seed each fresh epoch with 8–10 diversified directions varying family / holding period / mechanism kind (risk_premium vs behavioral vs structural).
- UI payoff: a family-tree visualization is *exactly* what a wallpaper wants to show.

### A6. (P1) MAP-Elites Niche Archive (QuantEvolve)
A grid keyed by `familyKind × holdingBucket(intraday-ish/weekly/monthly/quarterly) × riskBucket(by MDD)`. A new strategy only replaces its niche incumbent if better on validation score. Parent selection: 50% best elite, 50% diverse member; generation context includes "cousins" (2 best + 3 perturbed + 2 random). QuantEvolve ablation: 16 bins kept improving to gen 150; 1–4 bins stalled at gen 50 — the archive is the anti-collapse mechanism. The grid doubles as the on-screen "research portfolio" board.

### A7. (P1) Outcome-Reinforced Layered Memory (FinMem + FinAgent)
Per-experiment memory record: `{ hypothesisCard, params, metrics, analysis, retrievalQuery }` — note the **dedicated retrieval-query string** distinct from the display summary (FinAgent trick).
- Retrieval score = `exp(-Δt/halfLife) + cosineSim(query, retrievalQuery) + importance/100`.
- Layers by half-life: tactical lessons 14d, family-level lessons 90d, structural beliefs 365d.
- **Reinforcement:** when a memory is cited in an experiment that later passes all gates, `importance += 5` and recency resets — useful lessons migrate to deeper layers; purge when recency < 0.05 or importance < 5. In a browser app cosine can be a cheap token-overlap/Jaccard score; the LLM condenser (Part D) can also rank top-K candidates.

### A8. (P1) Episodic Verbal Reinforcement / Reflection (FinCon CVRF + TradingAgents repo)
Every K experiments (K≈8): take the best and worst recent experiments, summarize each conceptually, ask "why did A beat B," and write the answer as a **belief delta** routed only to the relevant specialist's prompt (e.g. only the proposer learns "short-horizon reversal keeps dying on costs; require liquidity-provision framing"). FinCon ablations: +37 to +85pp CR; converges in ~4 episodes. Also adopt the TradingAgents decision-log trick: when revisiting a family, inject the *realized* outcome of past decisions on that family plus a one-paragraph reflection.

### A9. (P2) Two-Speed Loop (QuantAgent)
Inner loop: writer/judge characters iterate cheaply on a candidate (template critique or LLM if key present) until a score threshold or max 3 iterations — no backtest. Outer loop: only the survivor gets the (expensive-pretend) full backtest, and **only outer-loop results write to memory**. Maps cleanly onto your phases: inner = `proposing↔data_check↔coding` micro-cycles; outer = `backtesting` onward. Use the cheap LLM for inner critique, nothing or the same cheap LLM for outer narration.

### A10. (P2) Selective Consensus instead of Theatrical Debate (TrustTrade + FinMem risk persona)
Replace the open-ended `debate` phase with: 2–3 **independent** graded takes (each agent scores the candidate 0–10 with one cited reason, no cross-talk), then weight by agreement — discount the outlier unless it cites a hard gate result. Keep ONE adaptive risk persona: if the pool's cumulative PnL over the last 3 sim-days < 0, the risk officer flips to a conservative prompt and gate thresholds tighten by 10% (FinMem: adaptive persona +54.7% vs −19.4% fixed-aggressive). Debate stays as theater for the wallpaper, but the *verdict* is the agreement-weighted score.

**Cross-cutting cautions to encode:** gate any "expert prior" by asset class; never show the LLM raw price arrays or split boundaries (schema-level summaries only); multi-seed every headline number (run each accepted strategy on ≥5 seeds, show std).

---

# Part B — Mock Backtest Engine Statistics (exact formulas)

All closed-form; needs only `Phi` (Abramowitz–Stegun erf), `PhiInv` (Acklam), a t-CDF (incomplete-beta approx), Pearson correlation, a combination enumerator, and a seeded PRNG (mulberry32). Everything deterministic given the seed.

### B0. Return simulation that makes the stats meaningful
For each backtest, draw a **true** annual net Sharpe `SR_true` from the family's `netSharpeRange` (seeded), then generate `T` daily returns with mean `SR_true * vol / sqrt(252)`, target vol, and family-appropriate skew/kurtosis (e.g. momentum families: skew ≈ −0.5..−1.2, kurtosis 5–10; quality/low-vol: skew ≈ 0, kurtosis 4). Inject skew/kurt via a mixture: with prob p≈0.02 draw from a fat left-tail component. The *observed* Sharpe then naturally deviates from truth, and the hygiene statistics below have real work to do — overfit strategies (true SR ~0, lucky sample) get caught.

### B1. Probabilistic Sharpe Ratio (PSR)
```
SR̂   = per-period (daily) observed Sharpe, NOT annualized
PSR(SR*) = Phi( ((SR̂ − SR*) * sqrt(T − 1)) / sqrt(1 − γ3*SR̂ + ((γ4 − 1)/4)*SR̂²) )
```
Inputs available in the sim: `T` = number of simulated daily returns, `γ3` = sample skewness, `γ4` = sample kurtosis (normal = 3).

### B2. Expected max Sharpe under the null (False Strategy Theorem)
```
SR0 = sqrt(V[SR]) * ( (1 − γ)*PhiInv(1 − 1/N) + γ*PhiInv(1 − 1/(N*e)) )
γ = 0.5772156649 (Euler–Mascheroni), e = 2.71828
```
- `V[SR]` = cross-sectional variance of per-period Sharpes across the trial registry.
- `N` = **effective** number of independent trials: greedily cluster registry PnL series at |ρ| > 0.7 and use the cluster count.

### B3. Deflated Sharpe Ratio — the headline gate
```
DSR = PSR(SR0) = Phi( ((SR̂ − SR0) * sqrt(T − 1)) / sqrt(1 − γ3*SR0 + ((γ4 − 1)/4)*SR0²) )
Gate: DSR >= 0.95
```
Hard-code the cautionary stat into agent dialogue: only ~7 trials are needed to find a spurious 2-year backtest with in-sample SR > 1.0 whose true SR is zero.

### B4. Minimum Track Record Length
```
MinTRL = 1 + (1 − γ3*SR̂ + ((γ4 − 1)/4)*SR̂²) * ( PhiInv(0.95) / (SR̂ − SR*) )²
Gate: T >= MinTRL  (SR* = 0 or the cost hurdle)
```

### B5. Multiple-testing haircut (Harvey-Liu-Zhu)
```
tStat = SR̂_daily * sqrt(T)            // equivalently SR_annual * sqrt(years)
pS    = 2 * (1 − tCDF(|tStat|, T−1))
Independent approx:  pM = 1 − (1 − pS)^Neff
BHY (recommended):   p(i)_BHY = min( p(i+1)_BHY, (M * c(M) / i) * p(i) ),  c(M) = Σ_{j=1..M} 1/j
Invert:  HSR = tinv(1 − pM/2, T−1) / sqrt(T);   haircut = (SR̂ − HSR) / SR̂
Gate: tStat >= 3.0 AND HSR > 0
```
`M` = the global trial counter (every parameter combo ever simulated). Calibration to surface in UI: 20y monthly SR 0.75 with 200 trials → ~60% haircut; SR < 0.4 → haircut almost always > 50%; SR > 1.0 → ≤ ~25%. (The "just halve it" folklore is wrong in both directions.)

### B6. Turnover-cost gate (run FIRST — cheapest, kills most)
```
oneWayCost = spreadBps/2e4 + Y * sigmaDaily * sqrt(Q / ADV),  Y = 0.7
netSharpe  = grossSharpe − (annualTurnover * costPerUnitTurnover) / annualVol
costShare  = 1 − netAlpha / grossAlpha
Gates: netSharpe >= threshold (pool floor), costShare <= 0.5, turnover ∈ [1%, 70%] daily
Capacity:  bisect AUM until netReturn(AUM) <= 0 on the sqrt-impact curve
```
Apply per simulated rebalance using the family's holding period to derive turnover. Rule of thumb for dialogue: "it costs roughly one day's volatility to trade one day's volume."

### B7. Decay & retirement (McLean-Pontiff + monitors)
- **Publication decay schedule:** any strategy from a published family runs live at `SR_live = SR_backtest * 0.74` at deployment, decaying exponentially toward `* 0.42` with half-life ~2.5 sim-years (26% OOS decay → 58% post-publication). Families flagged `crowdingRisk: high` decay faster (half-life 1.5y).
- **Retirement triggers** (evaluate per sim-week on trailing 252d, retire on any 2 of 4):
  1. trailing `PSR(0) < 0.95` for 3 consecutive evaluations;
  2. live drawdown > 95th percentile of the seeded-bootstrap DD distribution from the backtest (ladder: cut 50% at half the limit, full stop at limit; >20% DD = professional ceiling);
  3. regress rolling Sharpe on time: slope t-stat < −2 AND projected SR crosses the cost hurdle;
  4. CUSUM break on PnL mean.
- **Regime table:** 2-state seeded k-means on (return, vol) → per-regime Sharpe in every report; a strategy catastrophic in one regime needs an explicit regime gate or is rejected.

### B8. Optional depth (post-MVP): PBO via CSCV
Keep the `T × N` registry matrix; S = 10 sequential blocks → C(10,5) = 252 combinations; for each, find the IS winner and its OOS rank; `PBO = fraction of combos where the IS winner ranks below the OOS median`; reject PBO > 0.05. Also emit the degradation slope (regress SR_OOS on SR_IS — negative slope = overfit family). Fully deterministic, great "research review" set-piece for the agents.

### Gate ordering (matters for pacing and cost)
1. cost gate (B6) → 2. t≥3 + BHY (B5) → 3. DSR + MinTRL (B3/B4) → 4. family prior multiplier (knowledge-base netSharpeRange already encodes it) → 5. pool admission (A1) → 6. live monitors (B7).

---

# Part C — Wallpaper Packaging Recipe

### C0. Vite build rules (both targets)
```ts
// vite.config.ts
export default defineConfig({ base: './', build: { target: 'es2015' } })
```
- `base: './'` unconditionally (works under Lively's `https://<hash>.localhost` virtual host AND Wallpaper Engine's file context).
- HashRouter only (no history API on file-ish origins).
- Bundle every asset locally — zero CDN imports. `body { margin:0; overflow:hidden; width:100vw; height:100vh }`. Design fluid to 21:9.
- For Wallpaper Engine add `vite-plugin-singlefile` (or post-strip `type="module"`/`crossorigin` from dist/index.html) — `file://` origin `null` can refuse module scripts. Lively/WebView2 doesn't need it, but one file://-safe bundle serves both.

### C1. Lively Wallpaper (free path)
Zip layout — everything at zip ROOT, no wrapper folder:
```
quant-lab.zip
├── LivelyInfo.json
├── index.html            ← Vite entry
├── assets/               ← Vite output
├── LivelyProperties.json ← optional user controls
├── thumbnail.jpg
└── preview.gif
```
`LivelyInfo.json` (Type 1 = web):
```json
{
  "AppVersion": "2.2.0.0",
  "Title": "Quant Research Lab",
  "Thumbnail": "thumbnail.jpg",
  "Preview": "preview.gif",
  "Desc": "Anime agents running an autonomous quant research loop",
  "Author": "you",
  "License": "MIT",
  "Contact": "https://github.com/you/quant-research-lab",
  "Type": 1,
  "FileName": "index.html",
  "Arguments": "--pause-event true",
  "IsAbsolutePath": false,
  "Tags": ["interactive", "react", "quant"],
  "Version": 1
}
```
`LivelyProperties.json` (drives the in-app sim):
```json
{
  "simSpeed":   { "type": "slider", "text": "Simulation speed", "min": 0, "max": 10, "step": 1, "value": 3, "help": "Experiments per minute" },
  "accentColor":{ "type": "color",  "text": "Accent color", "value": "#7C5CFF" },
  "showDebate": { "type": "checkbox", "text": "Show debate bubbles", "value": true }
}
```
In `main.tsx`, BEFORE React mounts (Lively calls it once per property at load):
```ts
(window as any).livelyPropertyListener = (name: string, val: any) => settingsStore.set(name, val);
(window as any).livelyWallpaperPlaybackChanged = (d: { IsPaused: boolean }) => sim.setPaused(d.IsPaused);
```
Install: drag the zip onto the Lively window (imports to library) — or drag `dist/index.html` for dev. **Persistence:** Lively default is memory cache (localStorage wiped on exit unless the user enables disk cache) → persist sim state via LivelyProperties values where possible and treat localStorage/IndexedDB as a cache; serialize the research-lab state compactly and accept cold starts gracefully. Mouse input works by default (standard DOM events; `:hover` CSS unreliable — use JS mousemove); keyboard via Settings → Wallpaper → Interaction. Honor `--pause-event`: stop the rAF loop and the sim scheduler when paused (rendering pauses but JS keeps running).

### C2. Wallpaper Engine (Steam)
1. Build single-file dist. 2. WE → Create Wallpaper → drag `dist/index.html` onto the button → it copies into `projects\myprojects\` and generates `project.json`. 3. Add properties in the editor; publish via Workshop → Share.
`project.json` essentials:
```json
{
  "title": "Quant Research Lab",
  "description": "Anime agents mining alpha on your desktop",
  "file": "index.html",
  "preview": "preview.jpg",
  "type": "web",
  "general": {
    "properties": {
      "simspeed":   { "order": 0, "text": "Simulation speed", "type": "slider", "value": 3, "min": 0, "max": 10 },
      "accentcolor":{ "order": 1, "text": "Accent color", "type": "color", "value": "0.49 0.36 1.0" }
    }
  },
  "visibility": "public"
}
```
Top-level module scope (NOT inside onload/effects — it can miss early events):
```ts
(window as any).wallpaperPropertyListener = {
  applyUserProperties(p: any) {
    if (p.simspeed) settingsStore.set('simSpeed', p.simspeed.value);
    if (p.accentcolor) settingsStore.set('accent', weColorToCss(p.accentcolor.value)); // "0.49 0.36 1.0" → rgb()
  },
  setPaused(paused: boolean) { sim.setPaused(paused); }
};
```
Property ids lowercase ASCII; colors are space-separated 0–1 floats. localStorage persists but has known multi-instance and screensaver-wipe bugs → durable settings go in user properties. Video assets: `.webm/.ogg` only. Mouse: standard DOM events; track dragging with mousedown/mouseup (MouseEvent.buttons is unreliable in mousemove); users can disable wallpaper mouse input, so nothing critical may be click-only.

---

# Part D — Browser LLM Condenser (dialogue from sim events)

Purpose: condense N structured sim events (gate failures, pool admissions, retirements, debate verdicts) into 3–4 short in-character lines. BYOK only — key from a settings panel into localStorage, sent only to the provider; never bundle a key. One `Condenser` interface, two providers, one deterministic template fallback.

### D1. Anthropic — `claude-haiku-4-5` ($1/$5 per MTok; cheapest current Claude, no newer 2026 Haiku exists)
```js
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": userKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true"   // official CORS opt-in; verified working
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5",            // pinned: claude-haiku-4-5-20251001
    max_tokens: 400,                       // hard cap; check stop_reason
    temperature: 0.9,                      // Haiku still supports temperature
    system: CHARACTER_SYSTEM_PROMPT,       // byte-stable voice cards + output contract
    messages: [{ role: "user", content: JSON.stringify(events) }], // compact, no whitespace
    output_config: { format: { type: "json_schema", schema: DIALOGUE_SCHEMA } }
  })
});
const msg = await res.json();
if (msg.stop_reason === "max_tokens") throw new TruncatedError(); // JSON may be cut even with schema
const dialogue = JSON.parse(msg.content.find(b => b.type === "text").text);
```
Notes: structured outputs are supported on Haiku 4.5 (schema compiled on first call, cached 24h server-side); do NOT send `output_config.effort` (errors on Haiku); skip `cache_control` (Haiku's 4096-token cache minimum exceeds a condenser prompt). Don't build on assistant prefill — works on Haiku only, 400s on every newer family.

### D2. OpenAI — `gpt-5.4-nano` ($0.20/$1.25 per MTok; cheapest current OpenAI model)
```js
const res = await fetch("https://api.openai.com/v1/responses", {   // CORS passes with raw fetch; do NOT use the SDK (x-stainless-* headers trip preflights)
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${userKey}` },
  body: JSON.stringify({
    model: "gpt-5.4-nano",
    store: false,                          // stateless
    reasoning: { effort: "minimal" },      // ESSENTIAL: kills invisible reasoning tokens/latency
    max_output_tokens: 500,                // reasoning tokens count against this — don't set razor-thin
    input: [
      { role: "system", content: CHARACTER_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(events) }
    ],
    text: { format: { type: "json_schema", name: "dialogue", schema: DIALOGUE_SCHEMA, strict: true } }
  })
});
const data = await res.json();
const dialogue = JSON.parse(data.output_text ?? data.output.find(o => o.type === "message").content[0].text);
```
No temperature on gpt-5.x reasoning models — ask for variety in the prompt. `gpt-5.5-instant` is ChatGPT product naming, not an API model; `gpt-4o-mini`/`gpt-5-nano` are superseded — don't use in new code.

### D3. Shared JSON schema — fixed-keys trick (works on both strict modes; neither supports minItems/maxItems/maxLength)
```json
{
  "type": "object",
  "properties": {
    "line1": { "$ref": "#/$defs/line" }, "line2": { "$ref": "#/$defs/line" },
    "line3": { "$ref": "#/$defs/line" }, "line4": { "$ref": "#/$defs/line" }
  },
  "required": ["line1","line2","line3","line4"],
  "additionalProperties": false,
  "$defs": { "line": {
    "type": "object",
    "properties": {
      "speaker": { "type": "string", "enum": ["MIKO","REN","HANA","DIRECTOR"] },
      "text": { "type": "string" }
    },
    "required": ["speaker","text"], "additionalProperties": false } }
}
```
Enforce line *length* in the prompt ("each under 12 words"), speakers via enum. Both strict modes need `additionalProperties:false` everywhere and all props in `required`.

### D4. Reliability shell (always wrap both providers)
- `AbortController` timeout ~10s (browsers have no native fetch timeout).
- Retry ONLY 429 / 5xx / Anthropic 529, max 2, backoff `500*2^n + jitter`, honor `retry-after`. Never retry 400/401/403 (surface to user; hammering 401s can flag a key).
- Validate shape after parse (4 lines, known speakers); one silent retry for malformed/refusal/truncation, then fall back.
- **Deterministic template fallback always exists** — canned per-event-type lines (`"{agent}: {strategy} failed the DSR gate at {dsr}!"`). The wallpaper must never block on the LLM; the loop runs fully offline by default, the LLM is garnish.
- Coalesce: debounce sim events into one in-flight call; abort-and-supersede if new events arrive mid-flight; never run concurrent condenser calls.
- Cost reality: ~800 in / ~150 out tokens → nano ≈ $0.00035/call (~2,800/$), Haiku ≈ $0.0016/call (~640/$). Nano is 4–5× cheaper; Haiku writes better dialogue. Support both behind one interface; let the user pick.

---

# Part E — Build order
1. **M1 (engine):** trial registry, seeded return generator with family-true Sharpes (B0), cost gate, PSR/DSR/MinTRL, HLZ haircut, pool + correlation penalty. Knowledge base (this deliverable) replaces the fixed 6-strategy bank.
2. **M2 (loop):** hypothesis cards + alignment gate, direction bandit, mechanical risk gate wired into `risk_review`, selective-consensus verdict in `debate`.
3. **M3 (evolution):** lineage + targeted mutation/crossover, MAP-Elites archive UI, decay/retirement monitors + regime table.
4. **M4 (memory/reflection):** layered memory with outcome reinforcement, CVRF episodic reflection, two-speed loop.
5. **M5 (ship):** LLM condenser with fallback; Lively zip + WE project packaging; pause hooks; properties panels.
