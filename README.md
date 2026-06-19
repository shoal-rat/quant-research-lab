<div align="center">

<img src="docs/media/banner.svg" alt="Quant Research Lab" width="100%"/>

<br/>

**An LLM-driven quant office where six researchers test real market ideas, keep score, and argue with the data.**

**English** · [简体中文](README.zh-CN.md)

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![Brain](https://img.shields.io/badge/brain-Claude%20Code%20%2F%20Codex-7b61ff)](#research-brain)
[![Data](https://img.shields.io/badge/data-bring%20your%20own-c792ea)](#bring-your-own-data)
[![Tests](https://img.shields.io/badge/tests-28%20passing-2f9c95)](#verify)
[![Wallpaper](https://img.shields.io/badge/desktop-wallpaper%20ready-e9b455)](#desktop-mode)
[![License](https://img.shields.io/badge/license-MIT-8f5a2a)](LICENSE)

<img src="docs/media/demo-office.gif" alt="The office running a research loop on real market data" width="92%"/>

*A run in the office: the CLI proposes a hypothesis, the bandit picks a direction, the backtester uses real prices, risk gates vote, and the desk records the result.*

</div>

---

## What This Is

Quant Research Lab is an office sim wrapped around a quant research loop. Claude Code or Codex reads the active dataset through a local bridge, proposes a strategy, and the browser runs the rest of the desk: data checks, cross-sectional backtest, risk review, debate, decision, and memory.

It ships with 20 years of US equity prices. You can also use a CSV, a remote file, or a large local source that should stay outside the browser.

The important part is not the animation. It is the audit trail:

- every signal is tested with bar `t` information earning bar `t+1` returns;
- costs, turnover, drawdown, random baselines, pool correlation, and deflated Sharpe are checked every run;
- the desk records family lessons, lineage, MAP-Elites niches, and decay;
- promoted candidates are judged by what they add to the combined fund, not by a pretty isolated chart.

Historical simulations only. No brokerage connection. Not investment advice.

### What's measured vs. illustrative

A senior-quant review pushed the calculation layer to be honest about its own limits:

- **Measured from data** — cross-sectional backtest (no lookahead: bar `t` signal earns `t+1`), signals **winsorized + sector/beta-neutralized before ranking**, costs on turnover, Sharpe/Sortino/Calmar/PSR, Alphalens **IC (with a separate out-of-sample IC used by the admission gate)**, deflated Sharpe, purged + embargoed walk-forward, regime split **by the benchmark** (not by the strategy's own P&L), and a **measured random-rank baseline**. Every leaf formula is checked against the Python `empyrical`/`scipy`/`statsmodels` stack (`scripts/quant_reference`).
- **Illustrative scaffolds** — capacity, market impact, borrow, and execution-stress numbers are algebra over turnover/concentration on a **close-only** panel (no volume/ADV/spread feed), so they are flagged `illustrative` in the UI and `maxDeployableCapital` is `n/a` until a real liquidity feed is connected.
- **Not promotable** — a family the active dataset cannot actually backtest (e.g. a news/earnings factor on price-only data) runs the mock simulator for illustration only, is labelled **"Illustrative — no real data"**, and is **never** scored, pooled, counted in NAV, or promoted.

## Meet The Desk

Each researcher owns one job.

| | Researcher | Desk | Signature line |
|:---:|---|---|---|
| <img src="docs/media/portraits/mira.png" width="64" alt="Mira Signal"/> | **Mira Signal** | Strategy | *"This signal smells promising."* |
| <img src="docs/media/portraits/ren.png" width="64" alt="Ren Compile"/> | **Ren Compile** | Engineering | *"If it runs, we are alive."* |
| <img src="docs/media/portraits/sana.png" width="64" alt="Sana Risk"/> | **Sana Risk** | Risk | *"Pretty returns do not mean usable returns."* |
| <img src="docs/media/portraits/ivo.png" width="64" alt="Ivo Doubt"/> | **Ivo Doubt** | Skeptic | *"This may just be luck."* |
| <img src="docs/media/portraits/noa.png" width="64" alt="Noa Ledger"/> | **Noa Ledger** | Experiment manager | *"Stop arguing. Next iteration."* |
| <img src="docs/media/portraits/kira.png" width="64" alt="Kira Timestamp"/> | **Kira Timestamp** | Data | *"Do not use future data."* |

## Bring Your Own Data

Pick a source in **Settings -> Data source**.

| Source | What it is | Where it runs |
|---|---|---|
| **Bundled** | 20y of daily adjusted closes for 32 US large caps | Browser |
| **Upload CSV / JSON** | Long format (`date,ticker,close[,industry]`) or wide format (`date` plus one ticker per column) | Browser |
| **Remote URL** | CSV or JSON, if the server allows CORS | Browser |
| **Large local file / database** | Parquet, DuckDB, SQLite, Postgres, a big file, or a URL | CLI bridge |

Large sources stay where they are. The bridge asks the CLI to inspect the file or database, compute the return series, and send back only the results needed by the browser. That keeps big panels and private datasets out of the client.

Any timestamp frequency is allowed. Daily, hourly, minute, tick, weekly, and monthly bars are annualized from the detected sampling interval instead of being forced into a daily assumption.

Refresh the bundled dataset:

```bash
node scripts/fetch-market-data.mjs
```

Use large-source mode:

```bash
QRL_ALLOW_DATA_TOOLS=1 npm run dialogue-bridge
```

## Research Loop

<div align="center">
<img src="docs/media/loop-diagram.svg" alt="The self-iterating research loop" width="92%"/>
</div>

The loop is deliberately plain:

1. Pick a research direction with a Thompson-sampling bandit.
2. Ask the CLI for a hypothesis grounded in the current data profile.
3. Pause for human review if that setting is enabled.
4. Run a no-lookahead cross-sectional backtest.
5. Attach the Workflow 2.0 audit.
6. Let the risk, skeptic, and manager roles decide what to do next.

## Research Workflow 2.0

Workflow 2.0 turns a proposed idea into a record the desk can inspect later. Each completed experiment now stores:

- a discovery card with phenomenon, universe, required data, and citations;
- a compiled signal with feature, lag, hold, rebalance rule, and formula;
- source credibility and novelty checks against known factors and prior failures;
- point-in-time data contracts;
- walk-forward windows, regime notes, decay, capacity, execution stress, feature-store quality, paper-trading status, baselines, and a research feed.

Enable **Human review before backtest** in Settings to stop after proposal. The boss can approve, reject, or edit the idea before the desk spends a real backtest on it.

## Research Brain

Research requires a local bridge connected to an authenticated CLI. The bridge binds to `127.0.0.1` and shells out to the tools already signed in on your machine.

| Backend | Auth | Used for |
|---|---|---|
| **Claude Code CLI** | Your subscription, no API key | Hypothesis, skeptic, strategy discovery, optional large-data work |
| **Codex CLI** | Your subscription, no API key | Same path, with `model_reasoning_effort` raised for data tasks |

Run the bridge while the app is open:

```bash
npm run dialogue-bridge
```

Dialogue is separate. The characters can speak from the offline bilingual template bank, or you can route conversation rewriting through the same bridge/API settings.

## Compute Once, Reuse

<div align="center">
<img src="docs/media/agent-flow.svg" alt="Agents cooperate; the kernel is written once, then reused" width="94%"/>
</div>

When a large source is connected, Kira writes a reusable `kernel.py` for that source. The kernel knows the schema, frequency, and strategy formulas. After it is cached, Ren can run later backtests without asking the CLI to rebuild the calculation.

Scoring stays deterministic in the browser: deflated Sharpe, CSCV PBO, pool correlation, risk gates, and promotion rules are not re-prompted.

## Discover New Families

The knowledge base can grow during play. Press **Discover** in the HUD or write a directive such as `research options-skew factors`. The bridge asks the CLI to read recent papers, working papers, financial news, and institution notes, then returns structured strategy families with citations.

Accepted discoveries are added to the knowledge base and shown on the Fund & Research Board. On bridge datasets, the cached kernel is regenerated so new formulas can be tested.

## You Are The Boss

<div align="center">
<img src="docs/media/demo-boss.gif" alt="Boss directives, love and whip" width="92%"/>
</div>

- **Directive bar:** type English or Chinese instructions. The next idea is biased toward your family, horizon, or strictness hint.
- **Love:** praise a researcher to raise morale and loosen exploration.
- **Whip:** criticize a researcher. Whipping risk makes the promotion gate stricter.
- **Click the office:** the leaderboard, data cabinet, whiteboard, meeting table, and workstations open live panels.

## Fund Board

<div align="center">
<img src="docs/media/board.png" alt="Fund and Research Board: NAV, niche archive, bandit posteriors, PBO" width="92%"/>
</div>

The meeting table opens the Fund & Research Board:

- virtual fund NAV from the candidate pool;
- MAP-Elites niche grid;
- bandit posterior state;
- CSCV probability of backtest overfitting;
- latest Workflow 2.0 audit summary.

The game layer adds XP, 10 boss titles, 16 achievements, confetti on promotion, rare office events, and wallpaper mode.

## Bilingual

<div align="center">
<img src="docs/media/office-zh.png" alt="The office running in Chinese" width="92%"/>
</div>

The globe button switches the UI, dialogue, achievements, board, data settings, and brain settings between English and Chinese. The directive bar accepts either language in either mode.

## Desktop Mode

<div align="center">
<img src="docs/media/demo-wallpaper.gif" alt="Wallpaper mode with the boss orb" width="92%"/>
</div>

```bash
npm run build:wallpaper
```

The command creates a Lively Wallpaper zip and a Wallpaper Engine project. Wallpaper mode runs the loop without browser chrome and moves boss tools into a draggable crown orb.

| Host | How |
|---|---|
| [Lively Wallpaper](https://github.com/rocksdanister/lively) | Drag `quant-research-lab-wallpaper.zip` onto Lively |
| Wallpaper Engine | Create Wallpaper, then drag in `wallpaper-package/index.html` |
| Browser preview | Open `/?wallpaper=1` |

## Quick Start

```bash
npm install
npm run dev
npm run dialogue-bridge
```

Open the Vite URL, sign in to Claude Code or Codex, wait for the HUD dot to turn green, then press **Start research**.

## Architecture

<div align="center">
<img src="docs/media/architecture.svg" alt="Architecture" width="92%"/>
</div>

- `src/engines/dataset/`: provider factory, in-browser data provider, bridge provider, CSV parser, frequency detection.
- `src/engines/bridgeResearchAdapter.ts`: CLI-backed strategy proposal and skeptic path.
- `src/engines/researchWorkflow.ts`: Workflow 2.0 audit builder.
- `src/engines/`: strategy knowledge, hypothesis engine, bandit, real backtest, pool analytics, risk review, progression.
- `scripts/dialogue-bridge.mjs`: local bridge for dialogue, research, strategy discovery, dataset inspection, and bridge returns.
- `src/lib/office2d/officeDirector.ts`: walking, conversations, reactions, bubbles, and events.
- `work/RESEARCH_DESIGN_DOC.md`: research notes and formulas behind the scoring model.

## Verify

```bash
npm test
npm run build
```

Current suite: 28 tests covering real-data span, no-lookahead behavior, cost monotonicity, CSV long/wide parsing, provider backtests, bridge metrics, frequency detection, intraday annualization, bandit determinism, gates, workflow audit, and progression.

## What Shipped

- [x] Research Workflow 2.0: discovery cards, compiled signals, source credibility, novelty, point-in-time contracts, validation, baselines, and research feed (capacity / execution stress / paper trading are clearly-labelled illustrative scaffolds pending a liquidity feed).
- [x] Claude Code / Codex research brain through a local bridge.
- [x] Bring-your-own data: upload, remote URL, large local files, and databases.
- [x] Frequency-aware metrics for tick, minute, hourly, daily, weekly, and monthly bars.
- [x] Cached large-data kernels for repeated backtests.
- [x] Strategy-family discovery from papers, news, and institution notes.
- [x] 20 years of bundled US market data.
- [x] Thompson bandit, pool delta-Sharpe reward, MAP-Elites niches, CSCV PBO.
- [x] Game layer: XP, titles, achievements, fund NAV, office events, confetti, EN / 中文.

Next ideas: fundamentals for the quality family, an in-game dataset browser, and multi-desk competition.

## Credits

| | |
|---|---|
| **Shoral Rat** ([@shoal-rat](https://github.com/shoal-rat)) | Concept, direction, art, and project ownership |

Strategy priors cite their original papers inside [`src/engines/strategyKnowledge.ts`](src/engines/strategyKnowledge.ts).

**Disclaimer:** historical simulations only. No brokerage connection. Not investment advice.
