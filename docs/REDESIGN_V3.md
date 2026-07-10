# Redesign v3 — "Find real alpha, transfer it to the real world"

Date: 2026-07-08. Basis: full-codebase audit (6 subsystem maps + synthesis). Baseline: 72 tests passing.

## Why redesign

The v2 lab has near-professional *validation* but a structurally capped *hypothesis space*:

1. **Closed menu.** `proposeStrategy` can only pick one of 18 hand-written families and jitter 1–3
   numeric parameters. The LLM discovery channel exists but is decorative: discovered families are
   `bridgeOnly` and `computeSignal` returns `null` for them — they can never be backtested, pooled,
   or promoted. "Recombine" averages shared numbers on one parent's chassis; there is no signal
   composition, no interactions, no regime conditioning.
2. **The OOS window is burned.** One fixed 58/42 split is simultaneously the refine-selection
   fitness, the bandit reward, and the promotion gate. After N iterations, "OOS" is in-sample by
   selection. DSR trials undercount (only `experiments.length`), and CSCV PBO is computed but never
   consulted by the gate.
3. **Execution fantasy.** Fills happen at the same close the signal was computed from; the random
   baseline pays flat commission while strategies pay spread+impact+borrow (gate compares against a
   cheaper competitor); missing returns silently earn zero (survivorship blind spot).
4. **Live results never feed back.** Paper-trading P&L is logged and ignored; the horse race can
   re-propose the config it evicted six hours ago; sleeves sell missing-price positions for $0,
   corrupting the eviction signal itself.
5. **Outright bugs capping the menu at ~14 of 18 families:** `lead_lag_spillover` is dead code
   (switch case says `lead_lag`), `pairs_statarb` ignores its entry/exit/formation parameters,
   `quality` is a price proxy, `fundamental_value` has zero rows in the bundle.

## The v3 architecture

### Pillar A — an open hypothesis space (the Alpha DSL + miner)

**A1. Alpha expression DSL** (`src/engines/alphaDsl.ts`). A tiny, safe, serializable expression
language evaluated cross-sectionally at bar *t* with trailing windows only (no lookahead by
construction). Terminals: `close, high, low, volume, returns, adv(n), industry-relative close`.
Time-series ops: `ts_mean, ts_std, ts_rank, ts_min, ts_max, ts_sum, delta, delay, ts_zscore,
ts_corr(x,y,n), ts_skew`. Scalar ops: `+ - * / neg abs log sign min max clamp pow2 sqrt`.
Factor primitives (the classic menu, callable inside expressions): `mom(lb,skip), rev(w),
vol(w), amihud(w), r52wk(w), range_vol(w), adv_log(w), peer_gap(w), quality_drift(w)`.
Every expression has a canonical string form (`rank`-free; ranking happens in the engine's
existing winsorize→neutralize→rank pipeline) and a complexity score (node count + window mass).

**A2. `formulaic_alpha` family.** New `StrategyFamily` whose `parameters.formula` carries a DSL
string; `computeSignal` gains one case that evaluates the compiled expression. This single case
makes three channels executable at once:
- **LLM-discovered families**: the bridge research path now asks for a `signalSpec` in DSL form;
  discovered families become `priceComputable` instead of `bridgeOnly` dead-ends.
- **Composites**: blending is just an expression — `0.6*zn(mom(120,5)) + 0.4*zn(neg(vol(20)))`.
- **Mined formulas**: the genetic miner (A3) breeds expression trees.

**A3. Genetic alpha miner** (`src/engines/alphaMiner.ts`). Population of expression trees seeded
from known-factor motifs + random growth; tournament selection; subtree crossover + point
mutation; parsimony pressure (complexity penalty, hard depth cap); **novelty requirement** —
offspring whose in-sample signal correlates > 0.75 with any pool member or already-tried formula
are discarded before ever being backtested. Fitness is computed **on the training region only**;
survivors go through the standard full gate like any other strategy. Every fitness evaluation
increments the global trial registry (A5) so DSR stays honest. The miner runs as a fifth bandit
arm (`mine`) so the desk narrates it like any other idea mode.

**A4. Regime conditioning as a searchable dimension.** `strategy.parameters.regimeGate ∈
{none, riskon, riskoff, highvol, lowvol}` evaluated from *benchmark* trailing stats (200-bar MA
sign, 20-bar vol tercile) at bar t; the engine zeroes exposure outside the gate. The bandit can
now search conditional versions of stale factors — the classic residual-alpha move.

**A5. Honest multiplicity.** A persistent **trial registry** counts every backtest ever run
(app iterations, miner evaluations, race sleeves) and feeds `deflatedSharpe(trials)`. CSCV PBO
joins the promotion gate as a hard check (reject if PBO > 0.5 with ≥ 20 trials). IC t-stats get a
Newey–West (HAC) correction for overlapping horizons.

**A6. The lockbox.** The final 12% of history is cut off from *everything* — signal search, miner
fitness, refine selection, bandit rewards, the visible OOS gate. A strategy touches the lockbox
exactly once: at promotion time. The gate requires lockbox Sharpe > 0 and lockbox-vs-OOS decay
< 60%. The number of lockbox evaluations is itself registered and displayed (it is the scarcest
resource in the lab).

### Pillar B — execution & transfer realism

**B1. t+1 fills.** Engine option `executionLag: 1` (default ON for promotion): signal at close t,
trade at close t+1 (or open t+1 when the dataset carries opens — `fetch-market-data.mjs` now
stores opens), position earns t+1→t+2. The gate publishes both lag-0 and lag-1 Sharpe; promotion
uses lag-1. Short-horizon families must survive the delay or die honestly.

**B2. Cost symmetry + vol-aware costs.** The random-rank baseline pays the *same*
`rebalanceCostFraction` as the strategy. Spread/borrow widen with trailing benchmark vol
(2008/2020 no longer trade at calm-market spreads).

**B3. Delisting honesty.** Stale forward-filled bars (unchanged close + null/zero volume) are
marked untradable at formation; a name whose data ends mid-position is closed at last known price
with a configurable haircut (default 30 bps) instead of silently earning zero forever.

**B4. Live reconciliation** (`scripts/` + `src/engines/liveReconcile.ts`). The horse race records
per-sleeve realized daily returns; a reconciler compares realized Sharpe/hit-rate against the
sleeve's backtest OOS expectation and (a) demotes strategies bleeding below the 5th percentile of
their backtest confidence band, (b) writes the verdicts into research memory so the bandit's
family stats include *live decay*, and (c) injects standings + eviction history + already-pooled
configs into every research prompt — the LLM stops re-proposing what just died.

**B5. Race ledger integrity.** Missing-price positions are carried at last known price (never
sold for $0); eviction rebalances only touch changed books; config dedupe is canonical
(sorted-key JSON). Deploy gate: research-failure default flips to *no-deploy*; deployment
requires lab candidate status (`--force` stays, loudly labeled).

**B6. Family repairs.** `lead_lag` key fixed; `pairs_statarb` honors entryZ/exitZ/formation;
`fundamental_value` fetch applies a 45-day filing lag; adjusted-close×raw-volume distortion
documented and ADV series kept consistent.

### Pillar C — the anime-movie office

**C1. Full art regeneration** in modern anime-film style (not chibi): 6 characters × 21 sprites
(4 idle dirs, 4 walk dirs, 4–5 role actions, 8 expressions) + avatars + README portraits + a
cinematic group key visual, generated via the Codex image pipeline
(`scripts/art-pipeline/gen_anime_art.py`), chroma-keyed and packed by
`build_anime_assets.py` into the existing manifest contract (256×320, feet baseline 96%).

**C2. Smooth motion.** rAF-driven movement (no more 110 ms setInterval steps), distance-
proportional walk durations, walk-cycle bobbing with sprite crossfade on pose change, preloaded
textures, y-proportional depth scaling + soft contact shadows.

**C3. Cinema layer.** Camera drift toward the active agent; expression cut-ins on engine events
(promotion, rejection, eviction) using the regenerated expression sprites; market-state mood
grading (calm teal → amber crunch → cool blue after close).

## Invariants that must not regress

- Bar-t signal earns bar-t+1 (or later) returns everywhere, including new DSL paths.
- Synthetic/mock results can never reach the pool, NAV, or the gate.
- All 72 baseline tests keep passing; new engines ship with their own tests.
- Paper only: no live-money path exists.

## Build order

M1 family repairs + cost symmetry + delisting honesty (small surgical diffs, tests)
M2 alpha DSL + formulaic family + engine case (tests: no-lookahead, eval correctness)
M3 miner + trial registry + lockbox + PBO/HAC gate wiring (tests)
M4 script-side: race ledger, reconciler, prompt feedback, deploy tightening
M5 art generation + integration + motion/cinema layer
M6 docs (EN/中文), README media, push
