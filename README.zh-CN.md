<div align="center">

<img src="docs/media/banner.svg" alt="量化研究室" width="100%"/>

<br/>

**一间由 Claude Code 或 Codex 驱动的量化办公室：六位研究员提出想法、跑真实行情、记录证据，也会当场吵起来。**

[English](README.md) · **简体中文**

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![研究大脑](https://img.shields.io/badge/大脑-Claude%20Code%20%2F%20Codex-7b61ff)](#研究大脑)
[![自带数据](https://img.shields.io/badge/数据-自带数据集-c792ea)](#自带数据)
[![Tests](https://img.shields.io/badge/tests-28%20passing-2f9c95)](#验证)
[![壁纸](https://img.shields.io/badge/桌面-动态壁纸-e9b455)](#桌面模式)
[![License](https://img.shields.io/badge/license-MIT-8f5a2a)](LICENSE)

<img src="docs/media/demo-office.gif" alt="办公室在真实行情上跑研究循环" width="92%"/>

*一次办公室迭代：CLI 提出假设，老虎机选方向，回测使用真实价格，风控逐条过闸，桌子把结果写进档案。*

</div>

---

## 这是什么

Quant Research Lab 是一个套在量化研究循环外面的办公室模拟器。Claude Code 或 Codex 通过本地桥接器读取当前数据集，提出策略假设；浏览器负责后面的流程：数据检查、横截面回测、风控、辩论、决策和记忆。

项目内置 20 年美股价格。你也可以上传 CSV、使用远程文件，或连接不该塞进浏览器的大型本地数据源。

动画不是重点，重点是每次实验留下证据：

- 信号只用第 `t` 根 bar 的信息，收益从 `t+1` 开始算；
- 每轮都检查成本、换手、回撤、随机基线、池相关性和 deflated Sharpe；
- 桌子会记录家族教训、血统、MAP-Elites 生态位和边际衰减；
- 候选策略按它给组合基金增加的价值评分，而不是按单条漂亮曲线评分。

仅做历史模拟。不连接券商。不构成投资建议。

## 认识这张桌子

每位研究员只负责一件事。

| | 研究员 | 岗位 | 口头禅 |
|:---:|---|---|---|
| <img src="docs/media/portraits/mira.png" width="64" alt="Mira Signal"/> | **Mira Signal** | 策略 | *“这个信号有戏。”* |
| <img src="docs/media/portraits/ren.png" width="64" alt="Ren Compile"/> | **Ren Compile** | 工程 | *“能跑起来，我们就还活着。”* |
| <img src="docs/media/portraits/sana.png" width="64" alt="Sana Risk"/> | **Sana Risk** | 风控 | *“好看的收益不等于能用的收益。”* |
| <img src="docs/media/portraits/ivo.png" width="64" alt="Ivo Doubt"/> | **Ivo Doubt** | 怀疑论者 | *“这可能只是运气。”* |
| <img src="docs/media/portraits/noa.png" width="64" alt="Noa Ledger"/> | **Noa Ledger** | 实验主管 | *“别吵了，下一轮迭代。”* |
| <img src="docs/media/portraits/kira.png" width="64" alt="Kira Timestamp"/> | **Kira Timestamp** | 数据 | *“不许用未来数据。”* |

## 自带数据

在 **设置 -> 数据源** 里选择：

| 来源 | 内容 | 运行位置 |
|---|---|---|
| **内置** | 32 只美股大盘股，20 年日度复权收盘价 | 浏览器 |
| **上传 CSV / JSON** | 长表（`date,ticker,close[,industry]`）或宽表（`date` 加每只股票一列） | 浏览器 |
| **远程链接** | CSV 或 JSON，需要允许跨域 | 浏览器 |
| **大型本地文件 / 数据库** | Parquet、DuckDB、SQLite、Postgres、大文件或 URL | CLI 桥接器 |

大数据源留在原地。桥接器让 CLI 检查文件或数据库，算出收益序列，只把浏览器需要的结果传回来。这样大面板和私有数据不会进入前端。

时间频率不限。日线、小时、分钟、tick、周线、月线都会按实际采样间隔年化，不会被硬塞成日线。

刷新内置数据：

```bash
node scripts/fetch-market-data.mjs
```

启用大型数据源模式：

```bash
QRL_ALLOW_DATA_TOOLS=1 npm run dialogue-bridge
```

## 研究循环

<div align="center">
<img src="docs/media/loop-diagram.svg" alt="自我迭代的研究循环" width="92%"/>
</div>

循环本身很直接：

1. Thompson 采样老虎机选择研究方向。
2. CLI 根据当前数据画像提出假设。
3. 如果开启人工审核，先停下来等老板批准。
4. 跑无前视的横截面回测。
5. 附上 Workflow 2.0 审计。
6. 风控、怀疑论者和实验主管决定保留、重测还是埋葬。

## Research Workflow 2.0

Workflow 2.0 把一个想法变成可复盘的实验档案。每个完成的实验都会保存：

- 发现卡片：现象、可交易范围、所需数据和引用；
- 编译后的信号：特征、滞后、持有期、再平衡规则和公式；
- 来源可信度，以及相对已知因子和历史失败的 novelty 检查；
- point-in-time 数据合同；
- walk-forward 窗口、市场状态、衰减、容量、执行压力、特征质量、paper trading 状态、基线和研究 feed。

在设置里打开 **Human review before backtest**，系统会在提出假设后暂停。老板可以批准、拒绝，或写下修改意见，让团队重新生成想法。

## 研究大脑

研究需要一个本地桥接器和已经登录的 CLI。桥接器只绑定 `127.0.0.1`，调用你机器上已认证的命令行。

| 后端 | 认证 | 用途 |
|---|---|---|
| **Claude Code CLI** | 你的订阅，无需 API key | 假设、怀疑、策略发现，可选大型数据任务 |
| **Codex CLI** | 你的订阅，无需 API key | 同一路径；数据任务会提高 `model_reasoning_effort` |

运行应用时保持桥接器开启：

```bash
npm run dialogue-bridge
```

角色对话是单独的。它可以使用离线双语模板，也可以通过同一套桥接/API 设置改写对话。

## 只算一次，反复使用

<div align="center">
<img src="docs/media/agent-flow.svg" alt="智能体协作；内核只写一次，之后复用" width="94%"/>
</div>

连接大型数据源时，Kira 会为这个数据源写一个可复用的 `kernel.py`。它知道该数据的结构、频率和策略公式。内核缓存后，Ren 后续跑回测不需要再让 CLI 重写计算。

评分留在浏览器里确定性执行：deflated Sharpe、CSCV PBO、池相关性、风控闸门和晋升规则都不会反复重问模型。

## 发现新家族

知识库可以在游玩时增长。点 HUD 里的 **Discover**，或在指令栏写 `research options-skew factors`。桥接器会让 CLI 阅读近期论文、工作论文、财经新闻和机构资料，并返回带引用的结构化策略家族。

通过校验的发现会加入知识库，并显示在基金与研究看板上。对于桥接数据集，缓存内核会重新生成，让新公式可以被测试。

## 你是老板

<div align="center">
<img src="docs/media/demo-boss.gif" alt="老板指令、爱与鞭子" width="92%"/>
</div>

- **指令栏：** 输入中文或英文，下一轮想法会向你的家族、周期或严格度提示倾斜。
- **爱心：** 表扬研究员，提高士气，让探索更大胆。
- **鞭子：** 批评研究员。鞭打风控会让晋升门槛更严。
- **点击办公室：** 排行榜、数据柜、白板、会议桌和工位都能打开实时面板。

## 基金看板

<div align="center">
<img src="docs/media/board.png" alt="基金与研究看板：净值、生态位、老虎机后验、PBO" width="92%"/>
</div>

点会议桌打开基金与研究看板：

- 候选池计算出的虚拟基金净值；
- MAP-Elites 生态位网格；
- 方向老虎机后验；
- CSCV 回测过拟合概率；
- 最新 Workflow 2.0 审计摘要。

游戏层还有经验值、10 个老板头衔、16 个成就、晋升彩带、罕见办公室事件和壁纸模式。

## 双语

<div align="center">
<img src="docs/media/office-zh.png" alt="中文模式下的办公室" width="92%"/>
</div>

地球按钮会在英文和中文之间切换界面、对话、成就、看板、数据设置和研究大脑设置。指令栏在任一模式下都能听懂两种语言。

## 桌面模式

<div align="center">
<img src="docs/media/demo-wallpaper.gif" alt="壁纸模式与老板悬浮球" width="92%"/>
</div>

```bash
npm run build:wallpaper
```

命令会生成 Lively Wallpaper zip 和 Wallpaper Engine 工程。壁纸模式隐藏浏览器界面，循环自动运行，老板工具收进一颗可拖动的皇冠悬浮球。

| 宿主 | 用法 |
|---|---|
| [Lively Wallpaper](https://github.com/rocksdanister/lively) | 把 `quant-research-lab-wallpaper.zip` 拖进 Lively |
| Wallpaper Engine | 创建壁纸，然后拖入 `wallpaper-package/index.html` |
| 浏览器预览 | 打开 `/?wallpaper=1` |

## 快速开始

```bash
npm install
npm run dev
npm run dialogue-bridge
```

打开 Vite 地址，登录 Claude Code 或 Codex，等 HUD 圆点变绿，然后点 **Start research**。

## 架构

<div align="center">
<img src="docs/media/architecture.svg" alt="架构图" width="92%"/>
</div>

- `src/engines/dataset/`：provider 工厂、浏览器数据源、桥接数据源、CSV 解析和频率识别。
- `src/engines/bridgeResearchAdapter.ts`：CLI 策略提案和怀疑论路径。
- `src/engines/researchWorkflow.ts`：Workflow 2.0 审计构建器。
- `src/engines/`：策略知识库、假设引擎、老虎机、真实回测、池分析、风控和升级曲线。
- `scripts/dialogue-bridge.mjs`：本地桥接器，负责对话、研究、策略发现、数据检查和桥接收益。
- `src/lib/office2d/officeDirector.ts`：行走、对话、反应、气泡和事件。
- `work/RESEARCH_DESIGN_DOC.md`：评分模型背后的研究笔记和公式。

## 验证

```bash
npm test
npm run build
```

当前测试套件：28 个测试，覆盖真实数据跨度、无前视、成本单调性、CSV 长/宽表解析、provider 回测、桥接指标、频率识别、小时级年化、老虎机确定性、风控闸门、workflow 审计和升级曲线。

## 已兑现

- [x] Research Workflow 2.0：发现卡片、编译信号、来源可信度、novelty、point-in-time 合同、验证、容量、执行压力、paper trading、基线和研究 feed。
- [x] 通过本地桥接器使用 Claude Code / Codex 作为研究大脑。
- [x] 自带数据：上传、远程 URL、大型本地文件和数据库。
- [x] tick、分钟、小时、日、周、月频率感知指标。
- [x] 大型数据源缓存内核，后续回测复用。
- [x] 从论文、新闻和机构资料发现策略家族。
- [x] 内置 20 年美股行情。
- [x] Thompson bandit、池级 delta-Sharpe 奖励、MAP-Elites 生态位、CSCV PBO。
- [x] 游戏层：经验值、头衔、成就、基金净值、办公室事件、彩带、EN / 中文。

下一步想法：质量家族接入基本面数据、游戏内数据集浏览器、多桌对抗。

## 贡献者

| | |
|---|---|
| **Shoral Rat**（[@shoal-rat](https://github.com/shoal-rat)） | 创意、方向、美术和项目所有者 |

策略先验在 [`src/engines/strategyKnowledge.ts`](src/engines/strategyKnowledge.ts) 中标注了原始论文。

**免责声明：** 仅做历史模拟。不连接券商。不构成投资建议。
