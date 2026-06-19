# Independent review record

This project's calculation/decision layer was hardened through an adversarial
review loop (a skeptical senior-quant panel that reads the source at `file:line`
and re-runs the tests), followed by a self-honesty audit of the claims made about
it. This file is the committed artifact behind those scores.

## Finance-expert review (methodology · alpha realism · code correctness)

Each round = 3 independent lenses + a synthesis, scoring 0–10 where **9 = a
professional quant would trust it for paper trading**.

| Round | Score | Outcome |
|---|---|---|
| 1 | **4.5 / 10** | 4 blockers: mock path promotable; neutralization was dead code; capacity faked on close-only data; news families silently traded as momentum. |
| 2 | **8.4 / 10** | Blockers fixed + verified in source. 2 gaps left: bridge random-baseline could pass on a sentinel 0; OOS-IC gate fell back to full-sample when sparse. |
| 3 | **9.0 / 10** | All gaps fixed; all three lenses independently scored 9; zero remaining blockers. |

What round 3 verified in source:

- No lookahead (signal at bar `t` earns `t+1`), pinned by a truncation/prefix-match test.
- Winsorize + sector-demean + beta-residualize run **live** before ranking and IC capture.
- Admission gate **fails closed**: pool-ΔSharpe must be defined & > 0; out-of-sample
  IC only (no full-sample fallback); walk-forward pass-rate ≥ 60%.
- Random-rank baseline is **measured**; the check **abstains** (never silently passes)
  when it cannot be measured.
- Synthetic / not-backtestable results are excluded from the gate, pool, NAV, XP, achievements.
- Leaf math validated against the Python stack (see below).

## Honesty audit (claims vs. code)

A separate audit verified every claim made about the project at `file:line` and by
re-running `tsc` / tests / `validate`. Overall honesty **8 → 10** after fixing a
cluster of precision/wording gaps:

- IS/OOS split is now genuinely **purged + embargoed** (`oosStart = splitIndex +
  holding + embargo`), not purge-only.
- The golden metric tests route Sharpe / annualized-return / max-drawdown / Calmar
  through the **production** `perfMetrics` functions the engine uses, so the
  library match is end-to-end. PSR is matched to an **in-house** Bailey/López de
  Prado reference (scipy `norm.cdf` + skew/kurtosis) — empyrical/quantstats have no
  PSR function — and is labelled as such.
- `vite build` exits 0; the chunk-size warning is resolved. A few informational
  node-externalization notices remain from the **optional** in-browser Anthropic
  SDK dialogue backend.
- The local simulator's costs are a **flat per-side commission** (no slippage /
  impact / borrow); its headline Sharpe is full-period in-sample.

## The two gates are NOT equivalent (precise statement)

There are two distinct gates, deliberately different:

1. **Lab pool-promotion gate** (`decideExperimentStatus`) — strict and
   **fail-closed**: a strategy only becomes a `candidate` (eligible for the pool /
   NAV) with positive OOS IC, positive pool-ΔSharpe, and a passing walk-forward.
2. **Deploy gate** (`validate-strategy.mts`, used by the paper connector) — a
   **looser "robust historical edge" bar** (OOS Sharpe ≥ 0.5, positive after-cost
   return, deflated Sharpe ≥ 50%, walk-forward ≥ 50%, beats random). It does **not**
   require lab `candidate` status, and it is **`--force`-overridable**. A
   lab-`rejected` strategy can still clear the deploy gate (e.g. long-only
   momentum, rejected on its 2008/2020 drawdown, which the deploy-time trend
   overlay is designed to avoid).

So: the promotion path is fail-closed; the deploy path is a separate, looser,
overridable check — not a second equivalent fail-closed gate.

## Reproduce

```
npm.cmd test                                   # unit + golden + integrity tests
npx tsc -b                                     # type-check (exit 0)
npx vite build                                 # build (exit 0)
python scripts/quant_reference/reference.py    # regenerate the Python golden values
node scripts/alpaca-paper.mjs validate --universe=large   # re-run the historical gate
```
