<div align="center">

<img src="docs/media/banner.svg" alt="量化研究室" width="100%"/>

<br/>

**六位 Q 版研究员在 20 年真实行情里挖 Alpha——提出假设、回测、过闸门、辩论、晋升——而他们只听命于一个人：你，这张桌子的老板。**

[English](README.md) · **简体中文**

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![真实数据](https://img.shields.io/badge/数据-20年真实行情-c792ea)](#一个对自己数字负责的研究循环)
[![Tests](https://img.shields.io/badge/tests-17%20passing-2f9c95)](#验证)
[![语言](https://img.shields.io/badge/界面-EN%20%2F%20中文-3f88c5)](#完整双语)
[![壁纸](https://img.shields.io/badge/桌面-动态壁纸-e9b455)](#-放到你的桌面上)
[![License](https://img.shields.io/badge/license-MIT-8f5a2a)](LICENSE)

<a href="https://github.com/shoal-rat/quant-research-lab/blob/main/docs/media/promo.mp4"><img src="docs/media/promo-poster.png" alt="观看 2 分钟预告片" width="92%"/></a>

🎬 **[▶ 观看 2 分钟预告片 —— 含旁白与声音](https://github.com/shoal-rat/quant-research-lab/blob/main/docs/media/promo.mp4)** · 全程真实游玩 *（在 GitHub 上点击即可在浏览器内播放）*

<br/>

<img src="docs/media/demo-office.gif" alt="办公室在真实行情上跑研究循环" width="92%"/>

*一次真实的研究迭代：方向老虎机选路线、白板上写假设、回测跑在 20 年日度行情上、风控闸门逐条宣读、会议桌上吵成一团——气泡里的每一个数字都是真算出来的。*

</div>

---

## 这是什么？

一个**披着治愈系动漫办公室外壳、骨子里却很较真的自主研究循环**。下面这六位研究员自己跑完整个流程——假设 → 数据审计 → 真实横截面回测 → 机械风控闸门 → 辩论 → 晋升或埋葬——数据是**内置的真实行情：32 只美股大盘股约 5,000 个交易日的日度复权收盘价（2006 → 2026）**。你不用写一行代码，你只需要管好*他们*。

在研究模拟最容易作弊的地方，它选择诚实：

- 🧠 **想法来自知识库，不是随机起名器**——14 个文献级策略家族（动量、PEAD、低波动/BAB、配对、产业链联动、季节性……），每个都带扣除成本后的 Sharpe 先验、失效模式和参数区间。
- 🎰 **Thompson 采样老虎机决定研究方向**——`探索 / 精修 / 修复 / 杂交`四条臂，后验由“每个方向究竟让基金动了多少”学出来。
- 🛡️ **晋升由机械闸门决定**——按全桌试验数计算的 Bailey–López de Prado **Deflated Sharpe**、WorldQuant 式 **Alpha 池相关性惩罚**、成本/换手/回撤/随机基线检查。风控官只负责宣读结果，从不通融。
- 📉 **候选按池级 ΔSharpe 计分**——一个策略的价值不看单兵数据，只看它给基金合并收益序列加了多少。
- 🪦 **桌子有记忆**——家族教训、血统（好苗子精修成 v2/v3 后代）、MAP-Elites 生态位档案，以及反复挖同一家族时的边际衰减。和真实的因子动物园一模一样。

仅为历史模拟——不连接券商，不构成投资建议。

## 认识这张桌子

| | 研究员 | 岗位 | 口头禅 |
|---|---|---|---|
| 🔴 | **Mira Signal** | 策略 | “这个信号有戏。” |
| 🔵 | **Ren Compile** | 工程 | “能跑起来，我们就还活着。” |
| 🟤 | **Sana Risk** | 风控 | “好看的收益不等于能用的收益。” |
| ⚪ | **Ivo Doubt** | 怀疑论者 | “这可能只是运气。” |
| 🟢 | **Noa Ledger** | 实验主管 | “别吵了，下一轮迭代。” |
| 🟣 | **Kira Timestamp** | 数据 | “不许用未来数据。” |

他们会在工位之间走动、八卦你刚刚鞭过谁、在会议桌上四方对辩——而且张口就是自己真实的回测数字。

## 一个对自己数字负责的研究循环

<div align="center">
<img src="docs/media/loop-diagram.svg" alt="自我迭代的研究循环" width="92%"/>
</div>

内置数据集在 `public/assets/data/market-real.json`（32 只股票 · 约 5,000 个交易日 · 复权收盘价），随时可以免密钥刷新：

```bash
node scripts/fetch-market-data.mjs     # 从 Yahoo 公开 chart API 拉取 20 年日度行情
```

回测是真正的横截面：第 *t* 日算信号、吃第 *t+1* 日收益（无前视）、多空分位组合、按换手计成本、按时间顺序切分样本内/样本外。想用旧的合成模拟器？设置 → 数据源 一键切换——两条路走完全相同的闸门。

## 你是老板

<div align="center">
<img src="docs/media/demo-boss.gif" alt="老板指令、爱与鞭子" width="92%"/>
</div>

- **🗣️ 指令栏**——用中文或英文下令（“试试动量，持有5天”“被新闻情绪坑过了，换条路”）。全办公室立正、围绕指令吵一架，下一个假设就朝你要的家族、周期和严格度倾斜。
- **❤️ 爱心**——表扬一位研究员：爱心爆开，士气上升，策略台的探索更大胆。
- **🪢 鞭子**——批评一位：全桌窃窃私语，而且鞭打风控台会*真实地抬高晋升门槛*（状态判定更严、闸门更狠）。
- **🖱️ 点哪看哪**——排行榜大屏、数据柜、白板、会议桌、工位都能点开实时面板。办公室就是唯一的界面，外面没有多余的网站。

## 你经营的是基金，不是屏保

<div align="center">
<img src="docs/media/board.png" alt="基金与研究看板：净值、生态位档案、老虎机后验、PBO" width="92%"/>
</div>

- **虚拟基金净值**挂在顶栏，按候选池在真实数据上的合并表现计价。
- **老板经验值与十级头衔**——每个实验、候选、指令、爱与鞭都给经验值；从「实习老板」一路升到「量化教父」。
- **16 个成就**——从「墓园管理员」（攒 10 个被拒策略）到「基金 Sharpe 破 1」，带解锁弹窗和奖杯墙。
- **基金与研究看板**（点会议桌）：池净值曲线、MAP-Elites 生态位网格、方向老虎机的实时后验、全桌 CSCV **回测过拟合概率**。
- 候选晋升时**彩带庆祝**；**罕见办公室事件**（监管来访、咖啡机危机、期刊退稿）让办公室在两轮之间也活着。

## 完整双语

<div align="center">
<img src="docs/media/office-zh.png" alt="中文模式下的办公室" width="92%"/>
</div>

点顶栏地球图标，整个游戏——界面、对话、成就、看板——在英文与中文之间一键切换。指令栏在任一模式下都同时听得懂两种语言。

## 🖥️ 放到你的桌面上

<div align="center">
<img src="docs/media/demo-wallpaper.gif" alt="壁纸模式与老板悬浮球" width="92%"/>
</div>

```bash
npm run build:wallpaper
```

生成可直接拖入 **Lively Wallpaper** 的 zip 和 **Wallpaper Engine** 工程。壁纸上循环自动运行、界面全部隐藏，老板工具收进一颗**可拖动的皇冠悬浮球**——点开就是爱心、鞭子和指令输入框。前台有全屏应用时自动暂停。

| 宿主 | 用法 |
|---|---|
| [Lively Wallpaper](https://github.com/rocksdanister/lively)（免费） | 把 `quant-research-lab-wallpaper.zip` 拖到 Lively 窗口 |
| Wallpaper Engine（Steam） | 创建壁纸 → 拖入 `wallpaper-package/index.html` |
| 浏览器预览 | 打开 `/?wallpaper=1` |

## 快速开始

```bash
npm install
npm run dev        # 打开 http://127.0.0.1:5173
```

点 **▶ 开始**，看团队干活。下一道指令。鞭一个人。打开看板。

## 两颗可插拔的大脑

**对话大脑。** 对话永远先由本地生成：**151 个双语剧本模板（约 460 句台词）**，按实时研究状态选戏——实验结果、deflated-Sharpe 存活率、血统、指令、士气——并把真实数字填进台词。免费、离线。可选地接小模型做个性化润色（任何失败都静默回退本地库）：

| 后端 | 认证 | 模型 |
|---|---|---|
| Anthropic API | 你的 API Key，浏览器直连 | `claude-haiku-4-5`（~$0.002/段） |
| OpenAI API | 你的 API Key，浏览器直连 | `gpt-5.4-nano`（~$0.0004/段） |
| **Claude Code CLI** | 你已有的订阅，无需 Key | `claude-haiku-4-5` |
| **Codex CLI** | 你已有的订阅，无需 Key | 账户默认模型 + 低推理档 |

**研究大脑。** 把 设置 → 研究大脑 切到 CLI 后端，*假设本身*——家族、参数、推介词——就由真实模型读取全桌记忆和近期结果后产出，再经知识库校验才进入循环。

两者共用一个只绑定本机的小桥接器，调用你已登录的命令行工具：

```bash
npm run dialogue-bridge     # 游玩期间保持运行；只绑定 127.0.0.1
```

## 架构

<div align="center">
<img src="docs/media/architecture.svg" alt="架构图" width="92%"/>
</div>

- `src/lib/office2d/officeDirector.ts`——角色大脑：路径点行走、对话编排（集合 → 轮流发言 → 散场）、气泡防重叠、老板反应、彩带。
- `src/engines/`——确定性研究引擎：`strategyKnowledge`、`hypothesisEngine` + `banditEngine`、`realBacktestEngine`、`poolAnalytics`（ΔSharpe · MAP-Elites · CSCV PBO）、`riskReviewEngine`、`researchMemory`、`progression`。
- `src/engines/dialogue/`——151 模板创作库 + LLM 润色器；`scripts/dialogue-bridge.mjs`——CLI 桥接器。
- `work/RESEARCH_DESIGN_DOC.md`——设计背后的研究综述（RD-Agent(Q)、QuantEvolve、AlphaGen、FinMem/FinCon、Bailey–López de Prado、Harvey–Liu–Zhu、McLean–Pontiff），含精确公式。

## 验证

```bash
npm test           # 17 个引擎测试：真实数据跨度、无前视、成本单调性、老虎机确定性、ΔSharpe/PBO 合理性、生态位精英性、闸门、升级曲线
npm run build      # tsc + vite
```

## v2.0 —— 路线图全部兑现

- [x] **20 年真实行情** + 真实横截面回测器 + 真实池相关性
- [x] **Thompson 采样方向老虎机**（RD-Agent(Q)），后验由历史推导，选择写进推理链
- [x] **池级 ΔSharpe 奖励**（AlphaGen）——策略按“给基金加了多少”计分
- [x] **MAP-Elites 生态位档案**（QuantEvolve）——家族 × 周期 × 风险网格引导探索流向空位
- [x] **CSCV 回测过拟合概率**，直接显示在看板上
- [x] **真实 LLM 研究循环**，经 Claude Code / Codex CLI
- [x] **游戏层**——经验值、十级头衔、16 成就、基金净值、办公室事件、彩带

下一步想法：质量家族接入基本面数据、游戏内一键刷新行情、多桌对抗。

## 贡献者

| | |
|---|---|
| **Weike Zhang**（[@shoal-rat](https://github.com/shoal-rat)） | 老板 · 创意与方向 · 美术资源 |
| **Claude**（Anthropic） | 全栈实现 · 研究综述 · 角色编剧 |

由 Claude Code 构建。角色立绘、办公室场景与“爱与鞭子”套件为项目生成资源；策略先验在 [`src/engines/strategyKnowledge.ts`](src/engines/strategyKnowledge.ts) 中标注了原始论文。

**免责声明：** 仅为历史模拟 · 不连接券商 · 不构成投资建议。
