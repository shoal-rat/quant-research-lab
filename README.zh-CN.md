<div align="center">

<img src="docs/media/banner.svg" alt="量化研究室" width="100%"/>

<br/>

**一间自主运转的动漫量化研究室。六位 Q 版研究员日夜挖掘 Alpha——提出假设、回测、过风控闸门、辩论、迭代——而你，是这张桌子的老板。**

[English](README.md) · **简体中文**

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev)
[![Tests](https://img.shields.io/badge/tests-8%20passing-2f9c95)](#验证)
[![Wallpaper](https://img.shields.io/badge/桌面-动态壁纸-e9b455)](#-放到你的桌面上)
[![License](https://img.shields.io/badge/license-MIT-8f5a2a)](LICENSE)

<img src="docs/media/demo-office.gif" alt="研究循环运行中的办公室" width="92%"/>

*一次完整的研究迭代：白板上的新假设、数据审计、写代码、回测、风控闸门、会议桌四方辩论——角色嘴里说的每一个数字都是真的。*

</div>

---

## 这是什么？

量化研究室是一个**披着治愈系办公室外壳的自主研究循环**。从 v2.0 起，团队研究的是 **20 年真实美股数据**（32 只股票的日度复权收盘价，已打包内置，随时可用 `node scripts/fetch-market-data.mjs` 刷新）：真实的横截面回测、真实的成本、真实的样本外切分、穿越 2008 式行情的真实净值曲线。在关键的地方毫不含糊：

- 策略来自一个**15 个文献级策略家族的知识库**（动量、PEAD、新闻情绪、低波动/BAB、配对交易、产业链联动、季节性……），每个家族都带有扣除成本后的诚实 Sharpe 先验、失效模式和可调参数区间——不是随机起名器。
- 每次回测都要过**机械化风控闸门**：基于全桌试验登记册计算的 **Deflated Sharpe Ratio**（Bailey–López de Prado 多重检验贬损）、WorldQuant 风格的 **Alpha 池相关性惩罚**、成本/换手/回撤/随机基线检查。风控官只负责宣读结果，从不通融。
- 桌子有**记忆**：家族级统计、教训（“最近 12 次里有 4 次死在交易成本上”）、以及**血统**——有苗头的候选策略会被精修成 v2/v3 后代，而不是从零再来。反复挖同一个家族，它的边际收益会像真实的因子动物园一样衰减。

本项目只展示历史模拟，不构成投资建议，也不连接任何券商。

<div align="center">
<img src="docs/media/loop-diagram.svg" alt="自我迭代的研究循环" width="92%"/>
</div>

## 你是老板

<div align="center">
<img src="docs/media/demo-boss.gif" alt="老板指令、爱与鞭子" width="92%"/>
</div>

- **🗣️ 指令栏** —— 用中文或英文下达命令（“试试动量，持有5天”“被新闻情绪坑过了，换条路”）。全办公室立正反应、围绕指令吵一架，下一个假设就会朝你要的家族、周期和严格度倾斜。
- **❤️ 爱心** —— 表扬一位研究员：爱心爆开，士气上升，策略台的探索会更大胆。
- **🪢 鞭子** —— 批评一位：全桌窃窃私语，而且鞭打风控台会*真实地抬高晋升门槛*（状态判定更严、闸门更狠）。
- **🖱️ 点哪看哪** —— 排行榜大屏、数据柜、白板、会议桌、工位都能点开实时面板。办公室就是唯一的界面，没有多余的网站。
- **🌏 语言切换** —— 顶栏地球图标或设置页一键切换中/英文，界面与角色对话同步切换（数据面板保留英文金融术语，研究笔记保持原文）。

## 🖥️ 放到你的桌面上

<div align="center">
<img src="docs/media/demo-wallpaper.gif" alt="壁纸模式与老板悬浮球" width="92%"/>
</div>

```bash
npm run build:wallpaper
```

会生成可直接拖入 **Lively Wallpaper** 的 zip 和 **Wallpaper Engine** 工程。壁纸模式下循环自动运行、无任何界面元素（只留一枚状态小徽章），老板工具收进一颗**可拖动的皇冠悬浮球**——点开就是爱心、鞭子和指令输入框，直接在桌面上管理你的研究室。前台有全屏应用时壁纸自动暂停。

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

点顶栏 **▶ 开始**，看团队干活。下一道指令。鞭一个人。

## 角色对话的大脑

对话永远由本地生成：一个**150+ 双语剧本模板、约 460 句台词的创作库**，会根据实时研究状态选戏——实验结果、deflated-Sharpe 存活率、血统代数、老板指令、甚至全桌士气——并把真实数字填进台词里。免费、离线。

可选地，在设置 → “角色对话大脑”里接入小模型做个性化润色（任何失败都静默回退本地库）：

| 后端 | 认证方式 | 模型 |
|---|---|---|
| Anthropic API | 你的 API Key，浏览器直连 | `claude-haiku-4-5`（~$0.002/段） |
| OpenAI API | 你的 API Key，浏览器直连 | `gpt-5.4-nano`（~$0.0004/段） |
| **Claude Code CLI** | 你已有的订阅，无需 Key | `claude-haiku-4-5` |
| **Codex CLI** | 你已有的订阅，无需 Key | 账户默认模型 + 低推理档 |

CLI 后端通过一个本地小桥接器调用你已登录的命令行工具：

```bash
npm run dialogue-bridge     # 游玩期间保持运行；只绑定 127.0.0.1
```

## 架构

<div align="center">
<img src="docs/media/architecture.svg" alt="架构图" width="92%"/>
</div>

- `src/lib/office2d/officeDirector.ts` —— 角色大脑：路径点行走、对话编排（集合 → 轮流发言 → 散场）、老板反应与特效。
- `src/engines/` —— 确定性研究引擎：`strategyKnowledge`（15 家族）、`hypothesisEngine`（UCB 探索 / 血统精修 / 指令转向 + 推理链）、`backtestEngine`（deflated Sharpe、Alpha 衰减、池相关性）、`riskReviewEngine`（10 道机械闸门）、`researchMemory`。
- `src/engines/dialogue/` —— 数据驱动的本地对话生成 + 浏览器端小模型润色。
- `work/RESEARCH_DESIGN_DOC.md` —— 本项目背后的研究综述（RD-Agent(Q)、QuantEvolve、AlphaGen/AlphaAgent、FinMem/FinCon、Bailey–López de Prado、Harvey–Liu–Zhu、McLean–Pontiff），含精确公式与下文路线图。

## 验证

```bash
npm test           # 8 个引擎测试：确定性、成本单调性、deflated-Sharpe 收缩、指令解析、参数边界、闸门
npm run build      # tsc + vite
```

## 游戏层

你不是在看屏保，你是在经营一支基金：

- **老板经验值与头衔** —— 每个实验、候选、指令、爱与鞭都给经验值；从「实习老板」一路升到「量化教父」，升级有弹窗庆祝。
- **16 个成就** —— 从「墓园管理员」（攒 10 个被拒策略）到「基金 Sharpe 破 1」，双语、带解锁弹窗和奖杯墙。
- **虚拟基金净值**挂在顶栏，按候选池的真实组合表现计价。
- **基金与研究看板**（点会议桌）：池净值曲线、MAP-Elites 生态位网格、方向老虎机的实时后验、全桌 CSCV 过拟合概率。
- 候选晋升时**彩带庆祝**；**罕见办公室事件**（监管来访、咖啡机危机、期刊退稿）让办公室在两轮之间也活着。

## 路线图 —— ✅ v2.0 全部完成

- [x] **Thompson 采样方向老虎机**（RD-Agent(Q)）——「探索 / 精修 / 修复 / 杂交」四臂，后验由历史推导，选择过程写进推理链
- [x] **池级 ΔSharpe 奖励**（AlphaGen）—— 每个真实数据实验保存日收益序列，按“候选池 Sharpe 动了多少”计分
- [x] **MAP-Elites 生态位档案**（QuantEvolve）—— 家族 × 周期 × 风险网格引导探索流向空位，并渲染成办公室看板
- [x] **CSCV 回测过拟合概率（PBO）** —— 基于试验登记册的全桌统计，显示在看板上
- [x] **真实 LLM 研究循环** —— 把「研究大脑」设为 Claude Code / Codex CLI，假设（家族、参数、推介）由真实模型经本地桥接器产出，再经知识库校验
- [x] **真实市场数据** —— 32 只美股 20 年日度复权收盘价、真实横截面回测器、真实池相关性

下一步想法：质量家族接入基本面数据、游戏内一键刷新行情、多桌对抗。

## 贡献者

| | |
|---|---|
| **Weike Zhang**（[@shoal-rat](https://github.com/shoal-rat)） | 老板 · 创意与方向 · 美术资源 |
| **Claude**（Anthropic） | 全栈实现 · 研究综述 · 角色编剧 |

角色立绘、办公室场景与“爱与鞭子”套件为项目生成资源；策略先验在 [`src/engines/strategyKnowledge.ts`](src/engines/strategyKnowledge.ts) 中标注了原始论文。

**免责声明：** 仅为历史模拟 · 不连接券商 · 不构成投资建议。
