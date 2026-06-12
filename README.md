<div align="center">

<img src="docs/media/banner.svg" alt="Quant Research Lab" width="100%"/>

<br/>

**An autonomous anime quant research office. Six chibi researchers hunt for alpha — propose, backtest, gate, debate, iterate — while you rule the desk as the BOSS**

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![Tests](https://img.shields.io/badge/tests-6%20passing-2f9c95)](#verify)
[![Wallpaper](https://img.shields.io/badge/desktop-wallpaper%20ready-e9b455)](#-put-it-on-your-desktop)
[![License](https://img.shields.io/badge/license-MIT-8f5a2a)](LICENSE)

<img src="docs/media/demo-office.gif" alt="The office running a research loop" width="92%"/>

*A full research iteration: hypothesis on the whiteboard, data audit, coding, backtest, risk gates, a four-way debate at the meeting table — every number the characters say is real.*

</div>

---

## What is this?

Quant Research Lab is an **LLM-native autonomous research loop wearing a cozy office sim as its face**. The simulation is honest where it matters:

- Strategies come from a **knowledge base of 15 documented equity families** (momentum, PEAD, news sentiment, low-vol/BAB, pairs, lead-lag, seasonality…) with literature-grounded net-of-cost Sharpe priors, failure modes, and parameter ranges — not a random name generator.
- Every backtest passes through **mechanical risk gates**: a Bailey–López de Prado **deflated Sharpe ratio** computed against the desk's global trial count, a WorldQuant-style **alpha-pool correlation penalty**, cost/turnover/drawdown/baseline checks. The risk officer reads the gates out loud; she never overrides them.
- The desk **remembers**: per-family stats, lessons ("transaction costs broke 4 of the last 12 runs"), and **lineage** — promising candidates get refined into v2/v3 children instead of starting from zero. Re-mining the same family decays its edge, exactly like the real factor zoo.

It displays historical simulations only. It is not investment advice and does not execute trades.

<div align="center">
<img src="docs/media/loop-diagram.svg" alt="The self-iterating research loop" width="92%"/>
</div>

## You are the BOSS

<div align="center">
<img src="docs/media/demo-boss.gif" alt="Boss directives, love and whip" width="92%"/>
</div>

- **🗣️ Directive bar** — type an order in English or Chinese (*"try momentum with 5-day holds"*, *"被新闻情绪坑过了，换条路"*). The whole office snaps to attention, argues about it, and the next hypothesis is steered toward your families, horizons, and strictness.
- **❤️ Love** — praise a researcher: hearts burst, morale rises, the strategy desk explores more boldly.
- **🪢 Whip** — criticize one: the team gossips about it, and whipping the risk desk *genuinely raises the promotion bar* (stricter status thresholds, harsher gates).
- **🖱️ Click anything** — the leaderboard screen, data cabinet, whiteboard, meeting table, and workstations all open live panels. The office is the only screen; there is no website around it.

## 🖥️ Put it on your desktop

<div align="center">
<img src="docs/media/demo-wallpaper.gif" alt="Wallpaper mode with the boss orb" width="92%"/>
</div>

```bash
npm run build:wallpaper
```

This produces a ready-to-drag **Lively Wallpaper zip** and a **Wallpaper Engine** project. On the wallpaper the loop auto-runs chrome-free, and the boss tools collapse into a **draggable floating crown orb** — tap it to unfold Love, Whip, and the directive input right on your desktop. The wallpaper pauses automatically when a fullscreen app is in front.

| Host | How |
|---|---|
| [Lively Wallpaper](https://github.com/rocksdanister/lively) (free) | drag `quant-research-lab-wallpaper.zip` onto the Lively window |
| Wallpaper Engine (Steam) | Create Wallpaper → drag `wallpaper-package/index.html` |
| Just a browser | open `/?wallpaper=1` |

## Quick start

```bash
npm install
npm run dev        # open http://127.0.0.1:5173
```

Press **▶ Start** in the top bar and watch the desk work. Give it a directive. Whip someone.

## The dialogue brain

Conversations are always generated locally from real loop data (free, offline). Optionally, Settings → *Character dialogue brain* routes them through a small, cheap model **called directly from your browser with your own key** (stored locally, sent only to the provider, silent fallback to local scripts):

| Backend | Model | ~Cost per conversation |
|---|---|---|
| Anthropic | `claude-haiku-4-5` (official SDK, structured outputs) | ~$0.002 |
| OpenAI | `gpt-5.4-nano` (Responses API, strict JSON schema) | ~$0.0004 |

## Architecture

<div align="center">
<img src="docs/media/architecture.svg" alt="Architecture" width="92%"/>
</div>

- `src/lib/office2d/officeDirector.ts` — character brain: waypoint walking, conversation orchestration (gather → speak in turns → disperse), boss reactions, burst effects.
- `src/engines/` — deterministic research engines: `strategyKnowledge` (15 families), `hypothesisEngine` (UCB explore / lineage refine / directive steering + reasoning traces), `backtestEngine` (deflated Sharpe, alpha decay, pool correlation), `riskReviewEngine` (10 mechanical gates), `researchMemory`.
- `src/engines/dialogue/` — data-grounded local scripts + the browser LLM condenser.
- `work/RESEARCH_DESIGN_DOC.md` — the research synthesis behind this design (RD-Agent(Q), QuantEvolve, AlphaGen/AlphaAgent, FinMem/FinCon, Bailey–López de Prado, Harvey–Liu–Zhu, McLean–Pontiff) including the exact formulas and the roadmap below.

## Verify

```bash
npm test           # 6 engine tests: determinism, cost monotonicity, deflated-Sharpe shrinkage, directive parsing, gates
npm run build      # tsc + vite
```

## Roadmap

From the research doc, in priority order:

- [ ] **Thompson-sampling direction bandit** (RD-Agent(Q)) — replace the explore/refine coin-flip with a posterior over `explore_new_family / refine_pool_best / repair_failure / recombine_winners`
- [ ] **Pool-level ΔSharpe reward** (AlphaGen) — score experiments by how much the *pool* improves, not standalone Sharpe
- [ ] **MAP-Elites niche archive** (QuantEvolve) — family × horizon × risk grid as the anti-collapse mechanism and an in-office "portfolio board"
- [ ] **PBO via CSCV** — probability of backtest overfitting as a research-review set piece
- [ ] Real LLM research loop through the Claude Code / Codex bridge adapters

## Credits

Built with Claude Code. Character art, office renders, and the Love & Whip set are project-generated assets. Strategy priors cite their original papers inside [`src/engines/strategyKnowledge.ts`](src/engines/strategyKnowledge.ts).

**Disclaimer:** historical simulations only · no brokerage connection · not investment advice.
