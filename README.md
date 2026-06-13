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

| | Researcher | Desk | Signature line |
|---|---|---|---|
| 🔴 | **Mira Signal** | Strategy | "This signal smells promising." |
| 🔵 | **Ren Compile** | Engineering | "If it runs, we are alive." |
| 🟤 | **Sana Risk** | Risk | "Pretty returns do not mean usable returns." |
| ⚪ | **Ivo Doubt** | Skeptic | "This may just be luck." |
| 🟢 | **Noa Ledger** | Experiment manager | "Stop arguing. Next iteration." |
| 🟣 | **Kira Timestamp** | Data | "Do not use future data." |

## Bring your own data

The dataset is pluggable. Pick a source in **Settings → Data source**:

| Source | What it is | Where it runs |
|---|---|---|
| **Bundled** | 20y of daily adjusted closes, 32 US large caps (shipped) | in-browser |
| **Upload CSV / JSON** | your own file — long (`date,ticker,close[,industry]`) or wide (`date` + one column per ticker) | in-browser |
| **Remote URL** | a CSV / JSON link (must allow CORS) | in-browser |
| **Large local file / database** | a big file, **Parquet, DuckDB, SQLite, Postgres**, or a URL — **read by the CLI where it lives** | the CLI, streamed |

The first three load straight into the browser. The fourth is the interesting one:

> **A dataset too big for the browser never enters it.** The connected CLI reads the file or queries the database *in place* — streaming with DuckDB / chunked pandas, never loading it whole — computes the strategy's daily cross-sectional returns with no lookahead, and streams **only that return series** back. The browser turns it into the same honest metrics and gates the bundled engine produces. Nothing is downloaded; the architecture is ready for multi-gigabyte panels and live databases.

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

Backtests are genuinely cross-sectional: signals at day *t* earn day *t+1* returns (no lookahead), long/short rank buckets, turnover-based costs, and a chronological in-sample / out-of-sample split — whether the prices come from the bundle, your CSV, or a database the CLI is reading.

## The research brain is an agentic CLI

This is the LLM-native part, and it is **required**: research will not start until a Claude Code or Codex CLI is connected (a red dot turns green; a gate banner clears). The CLI does what a fixed engine can't — it reads the dataset profile and reasons about *this* data.

| Backend | Auth | What it drives |
|---|---|---|
| **Claude Code CLI** | your subscription — no key | hypothesis + skeptic, and (big-data mode) reads files / DBs and runs the backtest |
| **Codex CLI** | your subscription — no key | same, with `model_reasoning_effort` turned up for data work |

Everything goes through one tiny local bridge that shells out to your already-authenticated CLI and binds to `127.0.0.1` only:

```bash
npm run dialogue-bridge     # keep running while you play
```

Character **dialogue** is separate and always works offline from an authored bank of 151 bilingual templates; you can optionally route it through the same CLIs, or Claude/OpenAI API keys, for livelier banter.

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
- `src/engines/` — deterministic research engines: `strategyKnowledge`, `hypothesisEngine` + `banditEngine`, `realBacktestEngine` (+ `metricsFromDailyReturns` for the bridge path), `poolAnalytics` (ΔSharpe · MAP-Elites · CSCV PBO), `riskReviewEngine`, `progression`.
- `scripts/dialogue-bridge.mjs` — the local bridge: `/condense` for dialogue + brain, and `/dataset/inspect` + `/dataset/returns` so the CLI can read a large dataset where it lives.
- `src/lib/office2d/officeDirector.ts` — character brain: walking, conversations, bubble anti-overlap, confetti.
- `work/RESEARCH_DESIGN_DOC.md` — the research synthesis (RD-Agent(Q), QuantEvolve, AlphaGen, Bailey–López de Prado, Harvey–Liu–Zhu, McLean–Pontiff) with exact formulas.

## Verify

```bash
npm test           # 21 engine tests: real-data span, no-lookahead, cost monotonicity, CSV long/wide parse,
                   # provider backtest, bridge metricsFromDailyReturns, bandit determinism, gates, progression
npm run build      # tsc + vite
```

## What shipped

- [x] **LLM-native research brain** — Claude Code / Codex only, required to run; hypotheses grounded in a live profile of the dataset
- [x] **Bring your own data** — upload CSV (long or wide) / JSON, or a remote URL, parsed in the browser
- [x] **Large data, never downloaded** — Parquet / DuckDB / SQLite / Postgres / big files read by the CLI in place; only the daily return series comes back
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
