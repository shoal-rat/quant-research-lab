<div align="center">

<img src="docs/media/banner.svg" alt="Quant Research Lab" width="100%"/>

<br/>

**An LLM-native quant office. Six chibi researchers mine real market data for alpha — driven by Claude Code or Codex, on the dataset *you* point them at — while you rule the desk as the BOSS.**

**English** · [简体中文](README.zh-CN.md)

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![LLM-native](https://img.shields.io/badge/brain-Claude%20Code%20%2F%20Codex-7b61ff)](#the-research-brain-is-an-agentic-cli)
[![Your data](https://img.shields.io/badge/data-bring%20your%20own-c792ea)](#bring-your-own-data)
[![Tests](https://img.shields.io/badge/tests-21%20passing-2f9c95)](#verify)
[![Wallpaper](https://img.shields.io/badge/desktop-wallpaper%20ready-e9b455)](#-put-it-on-your-desktop)
[![License](https://img.shields.io/badge/license-MIT-8f5a2a)](LICENSE)

<img src="docs/media/demo-office.gif" alt="The office running a research loop on real market data" width="92%"/>

*One real research iteration: an agentic CLI proposes the hypothesis after reading the dataset, a Thompson bandit picks the direction, the backtest runs on real prices, risk gates fire, and the desk argues about it. Every number in every speech bubble is real.*

</div>

---

## What is this?

A **cozy anime office sim that is secretly a serious, LLM-native research loop**. The hypotheses are written by an agentic CLI — **Claude Code or Codex, your subscription, no API key** — that reads the actual data in front of it. The six researchers below run the full cycle: propose → data audit → cross-sectional backtest → mechanical risk gates → debate → promote or bury.

It ships with **20 years of real US prices**, but the whole thing is built to point at **your** data — a CSV you drop in, a remote URL, or a dataset far too large to fit in a browser, which the CLI reads *where it lives*.

It is honest where research sims usually cheat:

- 🧠 **The brain is an agentic CLI** — it profiles the real dataset (names, span, columns, stats) and grounds each hypothesis in what it actually sees, then validates against a knowledge base of 15 documented equity families.
- 🎰 **A Thompson-sampling bandit picks the research direction** — `explore / refine / repair / recombine`, with posteriors learned from how much each direction moved the fund.
- 🛡️ **Promotion is gated mechanically** — Bailey–López de Prado **deflated Sharpe** against the desk's global trial count, a WorldQuant-style **alpha-pool correlation penalty**, cost / turnover / drawdown / baseline checks. The risk officer reads the verdict; she never overrides it.
- 📉 **Candidates are scored by pool ΔSharpe** — a strategy is worth only what it adds to the fund's combined return series.
- 🪦 **The desk remembers** — per-family lessons, lineage, a MAP-Elites niche archive, and edge decay when the team re-mines a family.

Historical simulations only — no brokerage, no investment advice.

## Meet the desk

Each researcher is a **cooperating agent role**: Kira maps and reads the data, Mira proposes, Ren executes, Sana gates, Ivo refutes, Noa decides.

| | Researcher | Desk | Signature line |
|:---:|---|---|---|
| <img src="docs/media/portraits/mira.png" width="64" alt="Mira Signal"/> | **Mira Signal** | Strategy | *"This signal smells promising."* |
| <img src="docs/media/portraits/ren.png" width="64" alt="Ren Compile"/> | **Ren Compile** | Engineering | *"If it runs, we are alive."* |
| <img src="docs/media/portraits/sana.png" width="64" alt="Sana Risk"/> | **Sana Risk** | Risk | *"Pretty returns do not mean usable returns."* |
| <img src="docs/media/portraits/ivo.png" width="64" alt="Ivo Doubt"/> | **Ivo Doubt** | Skeptic | *"This may just be luck."* |
| <img src="docs/media/portraits/noa.png" width="64" alt="Noa Ledger"/> | **Noa Ledger** | Experiment manager | *"Stop arguing. Next iteration."* |
| <img src="docs/media/portraits/kira.png" width="64" alt="Kira Timestamp"/> | **Kira Timestamp** | Data | *"Do not use future data."* |

## Bring your own data

The dataset is pluggable. Pick a source in **Settings → Data source**:

| Source | What it is | Where it runs |
|---|---|---|
| **Bundled** | 20y of daily adjusted closes, 32 US large caps (shipped) | in-browser |
| **Upload CSV / JSON** | your own file — long (`date,ticker,close[,industry]`) or wide (`date` + one column per ticker) | in-browser |
| **Remote URL** | a CSV / JSON link (must allow CORS) | in-browser |
| **Large local file / database** | a big file, **Parquet, DuckDB, SQLite, Postgres**, or a URL — **read by the CLI where it lives** | the CLI, streamed |

The first three load straight into the browser. The fourth is the interesting one:

> **A dataset too big for the browser never enters it.** The connected agent reads the file or queries the database *in place* — streaming with DuckDB / chunked pandas, never loading it whole — computes the strategy's cross-sectional returns with no lookahead, and streams **only that return series** back. The browser turns it into the same honest metrics and gates the bundled engine produces. Nothing is downloaded; the architecture is ready for multi-gigabyte panels and live databases.

**Any frequency, any format.** Data isn't always daily. The agent *detects* the sampling frequency from the timestamps — tick, minute, **hourly**, daily, weekly, monthly — and reports the matching annualization factor, so the Sharpe is correct for whatever you feed it. The in-browser CSV path does the same: drop in an hourly file and it keeps every bar instead of collapsing them to a date. You describe *what* to compute; the agent figures out *how* for the shape your data happens to have.

Refresh the bundled set any time, keylessly:

```bash
node scripts/fetch-market-data.mjs     # 20y of daily data from Yahoo's public chart API
```

Point the CLI at a large source by starting the bridge in big-data mode:

```bash
QRL_ALLOW_DATA_TOOLS=1 npm run dialogue-bridge   # lets the CLI read local files / databases in place
```

## A research loop that earns its numbers

<div align="center">
<img src="docs/media/loop-diagram.svg" alt="The self-iterating research loop" width="92%"/>
</div>

Backtests are genuinely cross-sectional: signals at bar *t* earn bar *t+1* returns (no lookahead), long/short rank buckets, turnover-based costs, and a chronological in-sample / out-of-sample split — whether the prices come from the bundle, your CSV, or a database the agent is reading, at whatever frequency they arrive in.

## The research brain is an agentic CLI

This is the LLM-native part, and it is **required**: research will not start until a Claude Code or Codex CLI is connected (a red dot turns green; a gate banner clears). The CLI does what a fixed engine can't — it reads the dataset profile and reasons about *this* data.

| Backend | Auth | What it drives |
|---|---|---|
| **Claude Code CLI** | your subscription — no key | hypothesis + skeptic; in big-data mode a stronger model (**Claude Opus 4.8** by default) reads the file / DB, detects the frequency, and computes the returns |
| **Codex CLI** | your subscription — no key | same, on **GPT‑5.5‑Codex** with `model_reasoning_effort` turned up (`high`) for data work |

Big-data tasks ask the agent for a precise result (a profile, or the strategy's per-period returns + the annualization factor) and let it write and run the analysis code itself — using Claude Code's `--output-format json` structured output and Codex's higher reasoning effort. Tune the models with `QRL_DATA_CLAUDE_MODEL`, `QRL_DATA_REASONING`.

Everything goes through one tiny local bridge that shells out to your already-authenticated CLI and binds to `127.0.0.1` only:

```bash
npm run dialogue-bridge     # keep running while you play
```

Character **dialogue** is separate and always works offline from an authored bank of 151 bilingual templates; you can optionally route it through the same CLIs, or Claude/OpenAI API keys, for livelier banter.

## Cooperating agents, computed once

The desk is a **multi-agent system**, and the agents do the *format-dependent* work — because the shape of your data is unknown until they look at it. The trick is to never make them redo it.

<div align="center">
<img src="docs/media/agent-flow.svg" alt="Agents cooperate; the kernel is written once, then runs free" width="94%"/>
</div>

When a data source is connected, **Kira (the data agent) writes a reusable backtest kernel for it — once.** She reads the source in place, works out its schema and frequency, and emits a self-contained `kernel.py` that implements every strategy family for *that* data. The bridge caches it keyed by the source (a file edit busts the cache automatically). After that, **every backtest just runs the cached kernel — plain Python, no LLM, no tokens.** Ren executes, Sana gates, Ivo refutes, Noa decides; the bandit picks the next idea. One agent call per source, then the loop is free.

What stays deterministic is deliberate: the **honest scoring** — deflated Sharpe, CSCV PBO, pool correlation — runs in the browser so results are reproducible, not re-prompted. The agents adapt to the data; the system scores it the same way every time. Identical backtests and identical skeptic prompts are memoized too, so nothing is computed twice.

## Discover strategies from the literature

The knowledge base isn't fixed. Press the **🔭 Discover** button in the HUD (or tell the desk in the directive bar — *"research options-skew factors"*, *"读论文，找一些价量因子"*) and the agent **searches the web** — recent papers, working papers, financial news, institution research reports — for new price-based factors.

What comes back is validated and folded into the desk automatically:

- the new families join the **knowledge base** (with the citations the agent actually read, shown on the Fund & Research Board),
- the **research brain** can now propose them,
- and on a bridge dataset the **kernel regenerates to implement them** — because each backtest ships the discovered families' signal formulas, and a new one busts the kernel cache. No code edits, no redeploy.

So the loop literally grows new strategies while you watch. Honest scoring still gates everything: a freshly discovered factor has to survive the same deflated-Sharpe and pool-correlation checks as the textbook ones.

## Research Workflow 2.0

Each AI idea now becomes more than a backtest. The desk stores a structured discovery card, compiles the vague idea into a concrete signal, scores source credibility, checks novelty against known factors and prior failures, records point-in-time data requirements, and attaches walk-forward, regime, decay, capacity, execution, feature-store, baseline, paper-trading, and research-feed diagnostics to the experiment record.

Turn on **Human review before backtest** in Settings to pause after proposal. The boss can approve, reject, or edit the hypothesis before Kira, Ren, and Sana spend a real test on it.

## You are the BOSS

<div align="center">
<img src="docs/media/demo-boss.gif" alt="Boss directives, love and whip" width="92%"/>
</div>

- **🗣️ Directive bar** — type an order in English or Chinese (*"try momentum with 5-day holds"*, *"被新闻情绪坑过了，换条路"*). The next hypothesis is steered toward your families, horizons, and strictness.
- **❤️ Love** — praise a researcher: morale rises, the strategy desk explores more boldly.
- **🪢 Whip** — criticize one: the team gossips, and whipping the risk desk *genuinely raises the promotion bar*.
- **🖱️ Click anything** — leaderboard, data cabinet, whiteboard, meeting table, and workstations open live panels. The office is the only screen.

## Run a fund, not a screensaver

<div align="center">
<img src="docs/media/board.png" alt="Fund &amp; Research Board: NAV, niche archive, bandit posteriors, PBO" width="92%"/>
</div>

- **Virtual fund NAV** marked off the candidate pool's combined performance.
- **Boss XP and ten titles**, from *Intern Boss* to *量化教父*.
- **16 achievements** with unlock toasts and a trophy wall.
- **Fund & Research Board** (the meeting table): pool equity curve, MAP-Elites niche grid, the bandit's live posteriors, and the desk's CSCV **probability of backtest overfitting**.
- **Confetti** on a promotion; **rare office events** keep the place alive between runs.

## Fully bilingual

<div align="center">
<img src="docs/media/office-zh.png" alt="The office running in Chinese" width="92%"/>
</div>

Flip the globe icon and the whole game — UI, dialogue, achievements, board, the dataset & brain settings — switches between English and 中文. Directives are understood in both either way.

## 🖥️ Put it on your desktop

<div align="center">
<img src="docs/media/demo-wallpaper.gif" alt="Wallpaper mode with the boss orb" width="92%"/>
</div>

```bash
npm run build:wallpaper
```

Produces a **Lively Wallpaper zip** and a **Wallpaper Engine** project. The loop auto-runs chrome-free, and the boss tools collapse into a **draggable floating crown orb**. It pauses behind fullscreen apps.

| Host | How |
|---|---|
| [Lively Wallpaper](https://github.com/rocksdanister/lively) (free) | drag `quant-research-lab-wallpaper.zip` onto the Lively window |
| Wallpaper Engine (Steam) | Create Wallpaper → drag `wallpaper-package/index.html` |
| Just a browser | open `/?wallpaper=1` |

## Quick start

```bash
npm install
npm run dev             # open http://127.0.0.1:5173
npm run dialogue-bridge # in a second terminal — connect Claude Code or Codex
```

Sign in to Claude Code or Codex, watch the dot in the HUD turn green, press **▶ Start**, and the desk goes to work on the bundled data. Drop in your own CSV, or point it at a database, from Settings.

## Architecture

<div align="center">
<img src="docs/media/architecture.svg" alt="Architecture" width="92%"/>
</div>

- `src/engines/dataset/` — the pluggable dataset layer: `datasetProvider` (factory), `inMemoryProvider` (bundled / CSV / remote), `bridgeProvider` (large file / database via the CLI), `csvParse` (long + wide layouts).
- `src/engines/bridgeResearchAdapter.ts` — the CLI research brain; grounds each hypothesis in the dataset profile, validated against the knowledge base.
- `src/engines/` — deterministic research engines: `strategyKnowledge`, `hypothesisEngine` + `banditEngine`, `realBacktestEngine` (frequency-aware: `metricsFromReturnSeries` + a `periodsPerYear` that flows through Sharpe / annualization / deflated-Sharpe), `poolAnalytics` (ΔSharpe · MAP-Elites · CSCV PBO), `riskReviewEngine`, `progression`. `realMarket.detectFrequency` infers the bar size from the timestamps.
- `scripts/dialogue-bridge.mjs` — the local bridge: `/condense` for dialogue + brain, and `/dataset/inspect` + `/dataset/returns` so the agent can read a large dataset where it lives, at any frequency.
- `src/lib/office2d/officeDirector.ts` — character brain: walking, conversations, bubble anti-overlap, confetti.
- `work/RESEARCH_DESIGN_DOC.md` — the research synthesis (RD-Agent(Q), QuantEvolve, AlphaGen, Bailey–López de Prado, Harvey–Liu–Zhu, McLean–Pontiff) with exact formulas.

## Verify

```bash
npm test           # 24 engine tests: real-data span, no-lookahead, cost monotonicity, CSV long/wide parse,
                   # provider backtest, bridge metricsFromReturnSeries, frequency detection, frequency-aware
                   # annualization, intraday CSV, bandit determinism, gates, progression
npm run build      # tsc + vite
```

## What shipped

- [x] **Research Workflow 2.0** - discovery cards, idea-to-signal compilation, source credibility, novelty checks, point-in-time data contracts, walk-forward/regime/decay diagnostics, capacity and execution simulation, human review, paper trading, baselines, and a live research feed

- [x] **LLM-native research brain** — Claude Code / Codex only, required to run; hypotheses grounded in a live profile of the dataset
- [x] **Bring your own data** — upload CSV (long or wide) / JSON, or a remote URL, parsed in the browser
- [x] **Any frequency** — tick / minute / hourly / daily / weekly / monthly, detected from the timestamps; Sharpe annualized correctly for each
- [x] **Large data, never downloaded** — Parquet / DuckDB / SQLite / Postgres / big files read by the agent in place; only the per-period return series comes back
- [x] **Compute once, reuse free** — the agent writes a reusable backtest kernel per source, cached; every later backtest runs it with no LLM call. Identical backtests, skeptic prompts, and dialogue are memoized too
- [x] **Discover strategies from the web** — the agent reads papers / news / institution reports for new price factors and folds them into the knowledge base, the research brain, and the kernel automatically (with citations)
- [x] **Strong models for data work** — Claude Opus 4.8 / GPT‑5.5‑Codex with structured output and high reasoning effort
- [x] **20 years of real market data** bundled, with a real cross-sectional backtester and real pool correlations
- [x] **Thompson bandit**, **pool ΔSharpe reward**, **MAP-Elites niches**, **CSCV PBO**
- [x] **Game layer** — XP, 10 titles, 16 achievements, fund NAV, office events, confetti, full EN / 中文

Next ideas: per-name fundamentals for the quality family, an in-game dataset browser, multi-desk competition.

## Contributors

| | |
|---|---|
| **Weike Zhang** ([@shoal-rat](https://github.com/shoal-rat)) | The Boss · concept & direction · art assets |
| **Claude** (Anthropic) | full-stack implementation · research synthesis · character writing |

Built with Claude Code. Character art, office renders, and the Love & Whip set are project-generated assets. Strategy priors cite their original papers inside [`src/engines/strategyKnowledge.ts`](src/engines/strategyKnowledge.ts).

**Disclaimer:** historical simulations only · no brokerage connection · not investment advice.
