<div align="center">

<img src="docs/media/banner.svg" alt="量化研究室" width="100%"/>

<br/>

**一间 LLM 原生的量化研究室。六位 Q 版研究员挖掘 Alpha——由 Claude Code 或 Codex 驱动，跑在*你*指定的数据集上——而他们只听命于一个人：你，这张桌子的老板。**

[English](README.md) · **简体中文**

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![LLM 原生](https://img.shields.io/badge/大脑-Claude%20Code%20%2F%20Codex-7b61ff)](#研究大脑是一个智能体-cli)
[![自带数据](https://img.shields.io/badge/数据-自带数据集-c792ea)](#自带你的数据)
[![Tests](https://img.shields.io/badge/tests-21%20passing-2f9c95)](#验证)
[![壁纸](https://img.shields.io/badge/桌面-动态壁纸-e9b455)](#-放到你的桌面上)
[![License](https://img.shields.io/badge/license-MIT-8f5a2a)](LICENSE)

<img src="docs/media/demo-office.gif" alt="办公室在真实行情上跑研究循环" width="92%"/>

*一次真实的研究迭代：智能体 CLI 读完数据后提出假设、方向老虎机选路线、回测跑在真实价格上、风控闸门逐条宣读、会议桌上吵成一团——气泡里的每一个数字都是真算出来的。*

</div>

---

## 这是什么？

一个**披着治愈系动漫办公室外壳、骨子里却是 LLM 原生研究循环的项目**。假设由智能体 CLI 写出——**Claude Code 或 Codex，用你自己的订阅，无需 API Key**——它会读取面前真实的数据再下笔。下面这六位研究员跑完整个流程：提出 → 数据审计 → 横截面回测 → 机械风控闸门 → 辩论 → 晋升或埋葬。

它内置了**20 年真实美股价格**，但整套架构是为指向**你的**数据而生的——你拖进来的一个 CSV、一个远程链接，或者一个大到塞不进浏览器的数据集——后者由 CLI 在数据*原地*读取。

在研究模拟最容易作弊的地方，它选择诚实：

- 🧠 **大脑是智能体 CLI**——它会先给真实数据集做画像（名称、跨度、列、统计），把每个假设建立在它真正看到的数据上，再用 15 个文献级策略家族的知识库校验。
- 🎰 **Thompson 采样老虎机决定研究方向**——`探索 / 精修 / 修复 / 杂交`，后验由“每个方向究竟让基金动了多少”学出来。
- 🛡️ **晋升由机械闸门决定**——按全桌试验数计算的 Bailey–López de Prado **Deflated Sharpe**、WorldQuant 式 **Alpha 池相关性惩罚**、成本/换手/回撤/随机基线检查。风控官只负责宣读结果，从不通融。
- 📉 **候选按池级 ΔSharpe 计分**——一个策略的价值只看它给基金合并收益序列加了多少。
- 🪦 **桌子有记忆**——家族教训、血统、MAP-Elites 生态位档案，以及反复挖同一家族时的边际衰减。

仅为历史模拟——不连接券商，不构成投资建议。

## 认识这张桌子

每位研究员都是一个**相互协作的智能体角色**：Kira 对接并读取数据，Mira 提假设，Ren 执行，Sana 把闸门，Ivo 反驳，Noa 拍板。

| | 研究员 | 岗位 | 口头禅 |
|:---:|---|---|---|
| <img src="docs/media/portraits/mira.png" width="64" alt="Mira Signal"/> | **Mira Signal** | 策略 | *“这个信号有戏。”* |
| <img src="docs/media/portraits/ren.png" width="64" alt="Ren Compile"/> | **Ren Compile** | 工程 | *“能跑起来，我们就还活着。”* |
| <img src="docs/media/portraits/sana.png" width="64" alt="Sana Risk"/> | **Sana Risk** | 风控 | *“好看的收益不等于能用的收益。”* |
| <img src="docs/media/portraits/ivo.png" width="64" alt="Ivo Doubt"/> | **Ivo Doubt** | 怀疑论者 | *“这可能只是运气。”* |
| <img src="docs/media/portraits/noa.png" width="64" alt="Noa Ledger"/> | **Noa Ledger** | 实验主管 | *“别吵了，下一轮迭代。”* |
| <img src="docs/media/portraits/kira.png" width="64" alt="Kira Timestamp"/> | **Kira Timestamp** | 数据 | *“不许用未来数据。”* |

## 自带你的数据

数据集是可插拔的。在 **设置 → 数据源** 里选择：

| 来源 | 是什么 | 在哪运行 |
|---|---|---|
| **内置** | 32 只美股大盘股 20 年日度复权收盘价（已打包） | 浏览器内 |
| **上传 CSV / JSON** | 你自己的文件——长表（`date,ticker,close[,industry]`）或宽表（`date` + 每列一只股票） | 浏览器内 |
| **远程链接** | 一个 CSV / JSON 链接（需允许跨域） | 浏览器内 |
| **大型本地文件 / 数据库** | 大文件、**Parquet、DuckDB、SQLite、Postgres**，或一个 URL——**由 CLI 在原地读取** | CLI，流式 |

前三种直接加载进浏览器。第四种才是重点：

> **塞不进浏览器的数据集，永远不会进入浏览器。** 已连接的智能体在数据*原地*读取文件或查询数据库——用 DuckDB / 分块 pandas 流式处理，绝不整体载入内存——计算该策略的横截面收益（无前视），只把**那条收益序列**回传。浏览器再把它变成与内置引擎相同的诚实指标与闸门。什么都不下载；这套架构为数 GB 级面板和在线数据库准备就绪。

**任意频率，任意格式。** 数据不一定是日线。智能体会从时间戳*自动识别*采样频率——tick、分钟、**小时**、日、周、月——并报告对应的年化因子，所以无论喂什么，Sharpe 都是对的。浏览器内的 CSV 路径也一样：拖进一个小时级文件，它会保留每一根 bar，而不是把它们塌缩成一天。你只描述*要算什么*，由智能体决定*在你这份数据的形状上怎么算*。

随时免密钥刷新内置数据集：

```bash
node scripts/fetch-market-data.mjs     # 从 Yahoo 公开 chart API 拉取 20 年日度行情
```

让 CLI 指向一个大型数据源——以大数据模式启动桥接器：

```bash
QRL_ALLOW_DATA_TOOLS=1 npm run dialogue-bridge   # 允许 CLI 在本机原地读取文件 / 数据库
```

## 一个对自己数字负责的研究循环

<div align="center">
<img src="docs/media/loop-diagram.svg" alt="自我迭代的研究循环" width="92%"/>
</div>

回测是真正的横截面：第 *t* 根 bar 算信号、吃第 *t+1* 根 bar 的收益（无前视）、多空分位组合、按换手计成本、按时间顺序切分样本内/样本外——无论价格来自内置包、你的 CSV，还是智能体正在读取的数据库，也无论它们是什么频率。

## 研究大脑是一个智能体 CLI

这是 LLM 原生的核心，而且是**必需的**：在连接 Claude Code 或 Codex 之前，研究不会开始（红点变绿、门禁横幅消失）。CLI 能做固定引擎做不到的事——读取数据画像，对*这份*数据做推理。

| 后端 | 认证 | 驱动什么 |
|---|---|---|
| **Claude Code CLI** | 你的订阅，无需 Key | 假设 + 怀疑；大数据模式下用更强的模型（默认 **Claude Opus 4.8**）读取文件 / 数据库、识别频率、算出收益 |
| **Codex CLI** | 你的订阅，无需 Key | 同上，跑在 **GPT‑5.5‑Codex** 上，数据任务调高推理档（`high`） |

大数据任务向智能体提出一个精确的诉求（一份画像，或该策略的每期收益 + 年化因子），让它自己写代码、跑代码——用上 Claude Code 的 `--output-format json` 结构化输出和 Codex 的更高推理档。可用 `QRL_DATA_CLAUDE_MODEL`、`QRL_DATA_REASONING` 调整模型。

两者都经过一个只绑定 `127.0.0.1` 的小桥接器，调用你已登录的命令行：

```bash
npm run dialogue-bridge     # 游玩期间保持运行
```

角色**对话**是独立的，永远可离线工作（151 个双语模板创作库）；你也可以选择让它走同一套 CLI，或用 Claude / OpenAI 的 API Key，换取更生动的吐槽。

## 智能体协作，只算一次

这张桌子是一个**多智能体系统**，由智能体来做所有*依赖格式*的计算——因为在它们看一眼之前，你的数据长什么样是未知的。关键在于：永远别让它们重复做同一件事。

<div align="center">
<img src="docs/media/agent-flow.svg" alt="智能体协作；内核只写一次，之后免费运行" width="94%"/>
</div>

当一个数据源接入时，**Kira（数据智能体）为它写一个可复用的回测内核——只写一次。** 她在原地读取数据、弄清它的结构与频率，产出一个自包含的 `kernel.py`，为*这份*数据实现所有策略家族。桥接器按数据源把它缓存起来（文件一改动，缓存自动失效）。此后，**每次回测都只是运行这个缓存内核——纯 Python，不调用 LLM，不花 token。** Ren 执行、Sana 把闸门、Ivo 反驳、Noa 拍板，老虎机选下一个想法。每个数据源一次智能体调用，之后整个循环都是免费的。

哪些保持确定性是有意为之：**诚实的打分**——deflated Sharpe、CSCV PBO、池相关性——都在浏览器里跑，所以结果可复现，而不是反复重问模型。智能体适配数据，系统每次都用同样的方式给它打分。相同的回测、相同的怀疑提问也都会被记忆化，绝不重复计算。

## 从文献里发现新策略

知识库不是固定的。点 HUD 里的 **🔭 发现** 按钮（或在指令栏里直接说——“研究期权偏度因子”“read papers on volume-price factors”），智能体就会**去搜网络**——最近的论文、工作论文、财经新闻、机构研报——寻找新的价量因子。

返回的内容经过校验后会自动并入这张桌子：

- 新家族加入**知识库**（连同智能体真正读过的引用，显示在基金与研究看板上），
- **研究大脑**之后就能提出它们，
- 在桥接数据集上，**回测内核会重新生成来实现它们**——因为每次回测都会把已发现家族的信号公式一起发过去，新增一个就会让内核缓存失效。无需改代码，无需重新部署。

于是循环真的会在你眼前长出新策略。诚实的打分依然把着闸门：一个刚发现的因子，必须和教科书因子一样通过 deflated-Sharpe 和池相关性检验。

## 你是老板

<div align="center">
<img src="docs/media/demo-boss.gif" alt="老板指令、爱与鞭子" width="92%"/>
</div>

- **🗣️ 指令栏**——用中文或英文下令（“试试动量，持有5天”“被新闻情绪坑过了，换条路”）。下一个假设就朝你要的家族、周期和严格度倾斜。
- **❤️ 爱心**——表扬一位研究员：士气上升，策略台的探索更大胆。
- **🪢 鞭子**——批评一位：全桌窃窃私语，而且鞭打风控台会*真实地抬高晋升门槛*。
- **🖱️ 点哪看哪**——排行榜、数据柜、白板、会议桌、工位都能点开实时面板。办公室就是唯一的界面。

## 你经营的是基金，不是屏保

<div align="center">
<img src="docs/media/board.png" alt="基金与研究看板：净值、生态位档案、老虎机后验、PBO" width="92%"/>
</div>

- **虚拟基金净值**，按候选池合并表现计价。
- **老板经验值与十级头衔**，从「实习老板」到「量化教父」。
- **16 个成就**，带解锁弹窗和奖杯墙。
- **基金与研究看板**（点会议桌）：池净值曲线、MAP-Elites 生态位网格、方向老虎机的实时后验、全桌 CSCV **回测过拟合概率**。
- 候选晋升时**彩带庆祝**；**罕见办公室事件**让办公室在两轮之间也活着。

## 完整双语

<div align="center">
<img src="docs/media/office-zh.png" alt="中文模式下的办公室" width="92%"/>
</div>

点地球图标，整个游戏——界面、对话、成就、看板、数据集与大脑设置——在英文与中文之间一键切换。指令栏在任一模式下都同时听得懂两种语言。

## 🖥️ 放到你的桌面上

<div align="center">
<img src="docs/media/demo-wallpaper.gif" alt="壁纸模式与老板悬浮球" width="92%"/>
</div>

```bash
npm run build:wallpaper
```

生成可拖入 **Lively Wallpaper** 的 zip 和 **Wallpaper Engine** 工程。循环自动运行、界面隐藏，老板工具收进一颗**可拖动的皇冠悬浮球**。前台有全屏应用时自动暂停。

| 宿主 | 用法 |
|---|---|
| [Lively Wallpaper](https://github.com/rocksdanister/lively)（免费） | 把 `quant-research-lab-wallpaper.zip` 拖到 Lively 窗口 |
| Wallpaper Engine（Steam） | 创建壁纸 → 拖入 `wallpaper-package/index.html` |
| 浏览器预览 | 打开 `/?wallpaper=1` |

## 快速开始

```bash
npm install
npm run dev             # 打开 http://127.0.0.1:5173
npm run dialogue-bridge # 另开一个终端——连接 Claude Code 或 Codex
```

登录 Claude Code 或 Codex，看 HUD 里的圆点变绿，点 **▶ 开始**，团队就会在内置数据上开工。想换数据？在设置里拖进你自己的 CSV，或指向一个数据库。

## 架构

<div align="center">
<img src="docs/media/architecture.svg" alt="架构图" width="92%"/>
</div>

- `src/engines/dataset/`——可插拔数据层：`datasetProvider`（工厂）、`inMemoryProvider`（内置 / CSV / 远程）、`bridgeProvider`（经 CLI 的大文件 / 数据库）、`csvParse`（长表 + 宽表）。
- `src/engines/bridgeResearchAdapter.ts`——CLI 研究大脑；把每个假设建立在数据画像之上，再经知识库校验。
- `src/engines/`——确定性研究引擎：`strategyKnowledge`、`hypothesisEngine` + `banditEngine`、`realBacktestEngine`（频率感知：`metricsFromReturnSeries` + 贯穿 Sharpe / 年化 / deflated-Sharpe 的 `periodsPerYear`）、`poolAnalytics`（ΔSharpe · MAP-Elites · CSCV PBO）、`riskReviewEngine`、`progression`。`realMarket.detectFrequency` 从时间戳推断 bar 大小。
- `scripts/dialogue-bridge.mjs`——本地桥接器：`/condense`（对话 + 大脑），以及 `/dataset/inspect` + `/dataset/returns`，让智能体在原地读取任意频率的大型数据集。
- `src/lib/office2d/officeDirector.ts`——角色大脑：行走、对话、气泡防重叠、彩带。
- `work/RESEARCH_DESIGN_DOC.md`——设计背后的研究综述（RD-Agent(Q)、QuantEvolve、AlphaGen、Bailey–López de Prado、Harvey–Liu–Zhu、McLean–Pontiff），含精确公式。

## 验证

```bash
npm test           # 24 个引擎测试：真实数据跨度、无前视、成本单调性、CSV 长/宽表解析、提供器回测、
                   # 桥接 metricsFromReturnSeries、频率识别、频率感知年化、小时级 CSV、老虎机确定性、闸门、升级曲线
npm run build      # tsc + vite
```

## 已兑现

- [x] **LLM 原生研究大脑**——仅支持 Claude Code / Codex，且为运行所必需；假设建立在数据集的实时画像之上
- [x] **自带你的数据**——上传 CSV（长表或宽表）/ JSON，或远程链接，在浏览器内解析
- [x] **任意频率**——tick / 分钟 / 小时 / 日 / 周 / 月，从时间戳自动识别；每种频率的 Sharpe 都正确年化
- [x] **大数据，永不下载**——Parquet / DuckDB / SQLite / Postgres / 大文件由智能体在原地读取，只回传每期收益序列
- [x] **只算一次，之后免费**——智能体为每个数据源写一个可复用回测内核并缓存；之后每次回测都直接运行它，不再调用 LLM。相同的回测、怀疑提问、对话也都会被记忆化
- [x] **从网络发现新策略**——智能体读论文 / 新闻 / 机构研报，挖掘新的价量因子，并连同引用自动并入知识库、研究大脑和回测内核
- [x] **数据任务用强模型**——Claude Opus 4.8 / GPT‑5.5‑Codex，结构化输出 + 高推理档
- [x] **20 年真实行情**内置，配真实横截面回测器与真实池相关性
- [x] **Thompson 老虎机**、**池级 ΔSharpe 奖励**、**MAP-Elites 生态位**、**CSCV PBO**
- [x] **游戏层**——经验值、十级头衔、16 成就、基金净值、办公室事件、彩带、完整 EN / 中文

下一步想法：质量家族接入基本面数据、游戏内数据集浏览器、多桌对抗。

## 贡献者

| | |
|---|---|
| **Weike Zhang**（[@shoal-rat](https://github.com/shoal-rat)） | 老板 · 创意与方向 · 美术资源 |
| **Claude**（Anthropic） | 全栈实现 · 研究综述 · 角色编剧 |

由 Claude Code 构建。角色立绘、办公室场景与“爱与鞭子”套件为项目生成资源；策略先验在 [`src/engines/strategyKnowledge.ts`](src/engines/strategyKnowledge.ts) 中标注了原始论文。

**免责声明：** 仅为历史模拟 · 不连接券商 · 不构成投资建议。
