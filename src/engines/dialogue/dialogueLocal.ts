import {
  AgentProfile,
  AgentState,
  ConversationLine,
  ConversationScript,
  ExperimentRecord,
  Language,
  LoopPhase,
  ResearchMemory,
  StrategySpec
} from "../../types";
import { pick, seededRandom } from "../random";
import { getFamily } from "../strategyKnowledge";
import { bankConversation, buildFacts } from "./dialogueBank";

export interface DialogueContext {
  phase: LoopPhase;
  experiment?: ExperimentRecord;
  // the not-yet-backtested strategy for the current iteration, so the early
  // phases narrate the NEW idea instead of the previous experiment
  draft?: StrategySpec;
  costBps?: number;
  language?: Language;
  agents: AgentProfile[];
  memory: ResearchMemory[];
  timestamp: number;
  bossText?: string;
  targetAgentId?: string;
  morale?: number;
}

const A = {
  strategy: "agent-strategy",
  code: "agent-code",
  risk: "agent-risk",
  skeptic: "agent-skeptic",
  manager: "agent-manager",
  data: "agent-data"
};

let conversationCounter = 0;

function script(
  topicKey: string,
  spot: string,
  lines: ConversationLine[],
  priority: number
): ConversationScript {
  conversationCounter += 1;
  return {
    id: `conv-${Date.now()}-${conversationCounter}`,
    topicKey,
    spot,
    participantIds: [...new Set(lines.map((line) => line.agentId))],
    lines,
    priority
  };
}

function line(agentId: string, text: string, tone: AgentState = "debating"): ConversationLine {
  return { agentId, text, tone };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function failedChecks(experiment: ExperimentRecord): string[] {
  return experiment.riskReview.checks
    .filter((check) => check.status === "fail")
    .map((check) => check.label.toLowerCase());
}

function warnChecks(experiment: ExperimentRecord): string[] {
  return experiment.riskReview.checks
    .filter((check) => check.status === "warn")
    .map((check) => check.label.toLowerCase());
}

const PHASE_PRIORITY: Record<string, number> = {
  proposing: 60,
  data_check: 55,
  coding: 55,
  backtesting: 55,
  risk_review: 70,
  debate: 80,
  decision: 75,
  saved: 75
};

export function phaseConversation(context: DialogueContext): ConversationScript | undefined {
  const { phase, experiment, draft, timestamp, memory } = context;
  const zh = context.language === "zh";
  const tx = (en: string, zhText: string) => (zh ? zhText : en);
  const rng = seededRandom(`phase-${phase}-${draft?.id ?? experiment?.id ?? "none"}-${Math.floor(timestamp / 10000)}`);

  // the authored template bank goes first; hand-written scripts are fallback
  if (phase in PHASE_PRIORITY) {
    const banked = bankConversation(phase, context, buildFacts(context), PHASE_PRIORITY[phase]);
    if (banked) return banked;
  }

  if (phase === "proposing") {
    const idea = draft?.ideaReasoning?.[0];
    const reasons = draft?.ideaReasoning?.slice(1, 3) ?? [
      tx(
        "I keep coming back to how flows, not fundamentals, set prices at this horizon.",
        "我一直在想：这个周期上定价的是资金流，不是基本面。"
      ),
      tx(
        "The pattern survived my eyeball test across two regimes. That is rare.",
        "这个模式在两种行情下都能扛住我的肉眼检验，很少见。"
      )
    ];
    return script(
      "proposing",
      "whiteboard",
      [
        line(
          A.strategy,
          idea
            ? tx(idea, `新假设上板：${idea}`)
            : tx("New hypothesis going on the board. Nobody erase it this time.", "新假设要上白板了，这次谁都不许擦。"),
          "thinking"
        ),
        line(
          A.data,
          tx(
            "Before you fall in love with it: which timestamps does the signal touch?",
            "在你爱上它之前先回答我：这个信号碰了哪些时间戳？"
          ),
          "checking_chart"
        ),
        line(A.strategy, pick(reasons, rng), "excited"),
        line(
          A.data,
          tx(
            "Fine. I will pull universe coverage and stamp every headline before you backtest.",
            "行。回测之前我会把股票池覆盖拉一遍，每条新闻都打上时间戳。"
          ),
          "idle"
        )
      ],
      60
    );
  }

  if (phase === "data_check") {
    const universeCount = draft?.universe.length ?? experiment?.backtestParameters.universe.length ?? 12;
    return script(
      "data_check",
      "data_cabinet",
      [
        line(
          A.data,
          tx(
            `Auditing ${universeCount} tickers: close prices, returns, and news stamps.`,
            `正在审计 ${universeCount} 只股票：收盘价、收益率、新闻时间戳。`
          ),
          "checking_chart"
        ),
        line(
          A.code,
          tx(
            "Anything dirty? I'd rather patch the join now than debug the curve later.",
            "有脏数据吗？我宁愿现在修表连接，也不想之后去查曲线。"
          ),
          "coding"
        ),
        line(
          A.data,
          pick(
            zh
              ? [
                  "有个供应商的时间戳比收盘晚了40分钟，我保险起见统一滞后一天。",
                  "覆盖很干净，信号窗口里没有任何未来数据泄漏。",
                  "有两条新闻是事后改的时间戳，已经踢出样本了。"
                ]
              : [
                  "One vendor stamp drifts 40 minutes after the close. I am lagging it a day to be safe.",
                  "Coverage is clean. No future data is leaking into the signal window.",
                  "Two headlines were re-stamped after publication. They are out of the sample."
                ],
            rng
          ),
          "confused"
        )
      ],
      55
    );
  }

  if (phase === "coding") {
    const paramCount = Object.keys(draft?.parameters ?? experiment?.strategyParameters ?? {}).length || 3;
    const strategyName = draft?.name ?? experiment?.strategyName ?? tx("the new signal", "新信号");
    const holding = draft?.holdingPeriod ?? experiment?.backtestParameters.holdingPeriod ?? 5;
    return script(
      "coding",
      "workstations",
      [
        line(
          A.code,
          tx(
            `Implementing ${strategyName}: ${paramCount} tunable parameters, ${holding}-day holds.`,
            `正在实现 ${strategyName}：${paramCount} 个可调参数，持有 ${holding} 天。`
          ),
          "coding"
        ),
        line(
          A.strategy,
          tx("Keep it lean. Every extra knob is another way to fool ourselves.", "写简单点。每多一个旋钮，就多一种骗自己的方式。"),
          "thinking"
        ),
        line(
          A.code,
          pick(
            zh
              ? [
                  "够简单了：排序、截断、持有，没有藏在工具函数里的私货。",
                  "编译通过。Kira一签字，沙盒就开跑。",
                  "要崩它就大声崩，我给每一列都加了断言。"
                ]
              : [
                  "Lean it is. Rank, clip, hold. No secret sauce hiding in helper functions.",
                  "Compiles clean. The sandbox run starts the moment Kira signs off the data.",
                  "If this breaks, it breaks loudly. I added assertions on every column."
                ],
            rng
          ),
          "coding"
        )
      ],
      55
    );
  }

  if (phase === "backtesting") {
    const costBps = context.costBps ?? experiment?.backtestParameters.transactionCostBps ?? 12;
    return script(
      "backtesting",
      "backtest_computer",
      [
        line(
          A.code,
          tx(
            "Simulation is running. In-sample first, then the untouched out-of-sample block.",
            "模拟跑起来了。先跑样本内，再跑没人碰过的样本外。"
          ),
          "checking_chart"
        ),
        line(
          A.data,
          tx(
            `Cost model is ${costBps} bps per side. No free lunches in this room.`,
            `成本模型单边 ${costBps} 个基点。这屋里没有免费的午餐。`
          ),
          "checking_chart"
        ),
        line(
          A.strategy,
          pick(
            zh
              ? ["曲线啊曲线，争点气。", "我不看了，跑完叫我。", "样本外要是顶得住，今晚我请喝奶茶。"]
              : ["Come on, curve, behave.", "I am not watching. Tell me when it's over.", "If the OOS half holds up, drinks on me."],
            rng
          ),
          "excited"
        )
      ],
      55
    );
  }

  if (phase === "risk_review" && experiment) {
    const fails = failedChecks(experiment);
    const warns = warnChecks(experiment);
    const oos = experiment.outOfSampleResult;
    const riskLine = zh
      ? fails.length > 0
        ? `有一票否决项：${fails.join("、")}。我的桌子过不去。`
        : warns.length > 0
          ? `没有硬伤，但我要标记${warns.slice(0, 2).join("和")}。`
          : "十项检查没有一项卡住，我反而有点起疑。"
      : fails.length > 0
        ? `Blocking issue: ${fails.join(", ")}. This does not pass my desk.`
        : warns.length > 0
          ? `No hard fail, but I am flagging ${warns.slice(0, 2).join(" and ")}.`
          : "Eight-plus checks and nothing blocking. I am almost suspicious.";
    return script(
      "risk_review",
      "meeting",
      [
        line(A.risk, riskLine, fails.length > 0 ? "angry" : "checking_chart"),
        line(
          A.code,
          tx(
            `OOS Sharpe is ${oos.sharpeRatio.toFixed(2)} after costs of ${pct(Math.abs(oos.returnAfterCosts))}. The implementation is not the problem.`,
            `扣完成本后样本外 Sharpe ${oos.sharpeRatio.toFixed(2)}，收益 ${pct(oos.returnAfterCosts)}。实现没有问题。`
          ),
          "debating"
        ),
        line(
          A.skeptic,
          tx(
            `Trial ${oos.trialsAtDiscovery} in this family. Deflated for multiple testing, the survival odds are ${(oos.deflatedSharpe * 100).toFixed(0)}%.`,
            `这是全桌第 ${oos.trialsAtDiscovery} 次尝试。做完多重检验贬损，存活概率只有 ${(oos.deflatedSharpe * 100).toFixed(0)}%。`
          ),
          "whispering"
        ),
        line(
          A.risk,
          fails.length > 0
            ? tx("Then it goes back. Pretty curves do not pay slippage.", "那就打回去。曲线再漂亮也付不起滑点。")
            : tx("Send it to debate. I want the skeptic's teeth in it.", "送去辩论吧，我要看怀疑论者咬一口。"),
          "debating"
        )
      ],
      70
    );
  }

  if (phase === "debate" && experiment) {
    if (zh) {
      // build Chinese debate lines from the numbers (the stored debate record
      // keeps English research-note wording)
      const oos = experiment.outOfSampleResult;
      const decision: Record<ExperimentRecord["status"], string> = {
        candidate: "晋升为候选策略，但要排一次压力复测。",
        retest_needed: "打回复测，这条边还不够干净。",
        rejected: "这个版本拒掉，留下教训，继续前进。",
        failed_to_run: "归档运行日志，简化实现再来。",
        archived: "归档：有信息量，但不值得占用桌面注意力。"
      };
      return script(
        "debate",
        "meeting",
        [
          line(A.strategy, `${experiment.backtestParameters.holdingPeriod} 天的结果有合理的市场故事，我可以讲清楚为什么。`, "debating"),
          line(
            A.risk,
            `${experiment.riskReview.passedRiskChecks}/${experiment.riskReview.checks.length} 项风控通过，回撤 ${pct(oos.maxDrawdown)}。`,
            "angry"
          ),
          line(
            A.skeptic,
            oos.deflatedSharpe < 0.5
              ? `贬损后的存活概率 ${(oos.deflatedSharpe * 100).toFixed(0)}%，在我这就是噪声。`
              : oos.alphaPoolCorrelation > 0.7
                ? `和现有持仓 ${(oos.alphaPoolCorrelation * 100).toFixed(0)}% 相关。复制品不算发现。`
                : "结果不算荒谬，但我还要一个更狠的随机基线。",
            "whispering"
          ),
          line(A.manager, decision[experiment.status], "idle")
        ],
        80
      );
    }
    const toneFor: Record<string, AgentState> = {
      strategy_researcher: "debating",
      risk_reviewer: "angry",
      skeptic_researcher: "whispering",
      experiment_manager: "idle"
    };
    const idByRole: Record<string, string> = {
      strategy_researcher: A.strategy,
      risk_reviewer: A.risk,
      skeptic_researcher: A.skeptic,
      experiment_manager: A.manager
    };
    const lines = experiment.debate
      .map((entry) => line(idByRole[entry.role] ?? A.manager, entry.message, toneFor[entry.role] ?? "debating"))
      .slice(0, 5);
    return script("debate", "meeting", lines, 80);
  }

  if (phase === "decision" && experiment) {
    if (zh) {
      const decision: Record<ExperimentRecord["status"], string> = {
        candidate: `${experiment.strategyName} 晋升候选，安排压力复测。`,
        retest_needed: `${experiment.strategyName} 打回复测，边还不干净。`,
        rejected: `${experiment.strategyName} 拒绝。教训写进记忆，往前走。`,
        failed_to_run: "这次跑挂了。归档日志，简化重跑。",
        archived: `${experiment.strategyName} 归档：有信息量，不占桌面。`
      };
      return script(
        "decision",
        "leaderboard",
        [
          line(A.manager, decision[experiment.status], "idle"),
          line(A.risk, "复测时把成本调高一档，再换一个日期切分。", "checking_chart")
        ],
        75
      );
    }
    return script(
      "decision",
      "leaderboard",
      [
        line(A.manager, experiment.managerDecision, "idle"),
        line(A.risk, experiment.riskReview.retestRecommendation, "checking_chart")
      ],
      75
    );
  }

  if (phase === "saved" && experiment) {
    const oos = experiment.outOfSampleResult;
    if (experiment.status === "candidate") {
      return script(
        "saved-candidate",
        "leaderboard",
        [
          line(
            A.manager,
            tx(
              `${experiment.strategyName} is promoted: OOS Sharpe ${oos.sharpeRatio.toFixed(2)}, deflated survival ${(oos.deflatedSharpe * 100).toFixed(0)}%.`,
              `${experiment.strategyName} 晋升了：样本外 Sharpe ${oos.sharpeRatio.toFixed(2)}，贬损后存活率 ${(oos.deflatedSharpe * 100).toFixed(0)}%。`
            ),
            "excited"
          ),
          line(
            A.strategy,
            tx("Told you the story was real. Lineage gets one more refinement next loop.", "就说这个故事是真的吧。下一轮这条血统还能再精修一代。"),
            "excited"
          ),
          line(
            A.skeptic,
            tx(
              "Celebrate after the stress retest. Half my graveyard looked this good once.",
              "等压力复测过了再庆祝。我的墓地里一半的曲线当年也这么好看。"
            ),
            "whispering"
          ),
          line(A.code, tx("Logging it. The pool just got one alpha bigger.", "记录完毕。Alpha池又大了一号。"), "coding")
        ],
        75
      );
    }
    if (experiment.status === "rejected") {
      return script(
        "saved-rejected",
        "meeting",
        [
          line(
            A.manager,
            tx(
              `${experiment.strategyName} is rejected. The lesson goes in memory: ${experiment.nextIterationSuggestion}`,
              `${experiment.strategyName} 被拒。教训写入记忆：${experiment.nextIterationSuggestion}`
            ),
            "idle"
          ),
          line(
            A.skeptic,
            pick(
              zh
                ? ["我讨厌自己总是对的。", "墓地又迎来一条漂亮曲线。", "果然是运气假扮的Alpha。"]
                : ["I hate being right this often.", "The graveyard welcomes another beautiful curve.", "Luck dressed as alpha, as suspected."],
              rng
            ),
            "whispering"
          ),
          line(
            A.strategy,
            pick(
              zh
                ? ["行吧。下一个保证不相关。", "还是会痛，每次都痛。", "记下了，成本闸门这招我v2要偷来用。"]
                : ["Fine. The next one is uncorrelated, I promise.", "It still hurts. Every time.", "Noted. I am stealing the cost gate idea for v2."],
              rng
            ),
            "tired"
          )
        ],
        70
      );
    }
    if (experiment.status === "failed_to_run") {
      return script(
        "saved-failed",
        "workstations",
        [
          line(A.code, tx("It crashed. Column mismatch, my fault, fix is two lines.", "跑挂了。列名对不上，我的锅，两行就能修。"), "tired"),
          line(A.manager, tx("Archive the log. Simplify, rerun, and stop apologizing.", "日志归档。简化、重跑，别道歉了。"), "idle")
        ],
        65
      );
    }
    return script(
      "saved-other",
      "leaderboard",
      [
        line(
          A.manager,
          tx(
            `${experiment.strategyName}: ${experiment.status === "retest_needed" ? "back for a retest with stricter costs." : "archived as informative."}`,
            `${experiment.strategyName}：${experiment.status === "retest_needed" ? "打回，用更严的成本复测。" : "归档，有信息量。"}`
          ),
          "idle"
        ),
        line(A.strategy, zh ? `下一步：${experiment.nextIterationSuggestion}` : experiment.nextIterationSuggestion, "thinking")
      ],
      65
    );
  }

  if (phase === "idle" && memory.length > 0) {
    return gossipConversation(context);
  }

  return undefined;
}

export function ideaRevealConversation(context: DialogueContext): ConversationScript | undefined {
  const { experiment, timestamp } = context;
  const zh = context.language === "zh";
  if (!experiment || !experiment.ideaReasoning || experiment.ideaReasoning.length === 0) return undefined;
  const banked = bankConversation("idea_reveal", context, buildFacts(context), 50);
  if (banked) return banked;
  const rng = seededRandom(`reveal-${experiment.id}`);
  const reasons = experiment.ideaReasoning;
  const lines = [
    line(A.strategy, zh ? `推理链第一条：${reasons[0]}` : reasons[0], "thinking"),
    line(
      A.skeptic,
      pick(
        zh
          ? ["那它什么时候失效？这段也讲给我听听。", "这个开场白我这个季度听过两次了。", "先说服数据，再来排队说服我。"]
          : [
              "And the part where it stops working? Walk me through that.",
              "I have heard this exact pitch twice this quarter.",
              "Convince the data first. I am second in line."
            ],
        rng
      ),
      "whispering"
    ),
    line(A.strategy, reasons[Math.min(1, reasons.length - 1)], "debating")
  ];
  if (reasons.length > 3) {
    lines.push(line(A.data, reasons[reasons.length - 1], "checking_chart"));
  }
  void timestamp;
  return script("idea-reveal", "whiteboard", lines, 50);
}

export function gossipConversation(context: DialogueContext): ConversationScript {
  const { memory, timestamp, experiment } = context;
  const zh = context.language === "zh";
  const banked = bankConversation("gossip", context, buildFacts(context), 20);
  if (banked) return banked;
  const rng = seededRandom(`gossip-${Math.floor(timestamp / 15000)}`);
  const spot = pick(["tea", "window", "meeting"], rng);
  const memoryItem = memory.length > 0 ? pick(memory, rng) : undefined;
  const lesson = memoryItem
    ? zh
      ? memoryItem.textZh ?? memoryItem.text
      : memoryItem.text
    : zh
      ? "到现在我们还没信过任何一条曲线。"
      : "We have not trusted a single curve yet.";

  const variants: ConversationLine[][] = zh
    ? [
        [
          line(A.skeptic, `茶水间冷知识：${lesson}`, "whispering"),
          line(A.strategy, "你连喝茶都要带统计数字，难怪没人约你。", "thinking"),
          line(A.skeptic, "数据约我，足够了。", "whispering")
        ],
        [
          line(A.code, "我又梦见 pandas 的索引了，救命。", "tired"),
          line(A.data, "改成梦时间戳吧，至少时间戳诚实。", "checking_chart"),
          line(A.code, "诚实，但迟到40分钟。", "tired")
        ],
        [
          line(A.manager, `桌面备忘：${lesson}`, "idle"),
          line(A.risk, "刻到白板上去，这次用不可擦的笔。", "checking_chart")
        ],
        [
          line(
            A.strategy,
            experiment ? `还在想 ${experiment.strategyName}。${getFamily(experiment.familyKey).name} 这个家族还有油水。` : "我有三个想法和零个批准，标准周二。",
            "thinking"
          ),
          line(A.risk, "想法不要钱，样本外 Sharpe 才贵。", "angry"),
          line(A.strategy, "总有一天我要把这句话裱起来，再向你收版权费。", "excited")
        ],
        [
          line(A.data, "谁把列名起成 close_final_v2_REAL 的，出来给全桌道歉。", "confused"),
          line(A.code, "是过去的我。过去的我拒绝接受采访。", "coding"),
          line(A.data, "过去的你是个祸害。", "confused")
        ],
        [
          line(A.skeptic, "Bailey 的数学说：随机试七次，通常就能挖出一条假 Sharpe 大于1的曲线。七次。", "whispering"),
          line(A.manager, "所以每一次试验都进登记册，贬损器只会越来越狠。", "idle"),
          line(A.skeptic, "这话听着像音乐。统计上验证过的音乐。", "whispering")
        ]
      ]
    : [
        [
          line(A.skeptic, `Tea fact: ${lesson}`, "whispering"),
          line(A.strategy, "You bring statistics to the tea corner. This is why nobody invites you anywhere.", "thinking"),
          line(A.skeptic, "The data invites me. That is enough.", "whispering")
        ],
        [
          line(A.code, "I dreamt in pandas indices again. Send help.", "tired"),
          line(A.data, "Dream in timestamps instead. At least those are honest.", "checking_chart"),
          line(A.code, "Honest and 40 minutes late, apparently.", "tired")
        ],
        [
          line(A.manager, `Desk memo: ${lesson}`, "idle"),
          line(A.risk, "Carve it into the whiteboard. In permanent marker this time.", "checking_chart")
        ],
        [
          line(
            A.strategy,
            experiment
              ? `Still thinking about ${experiment.strategyName}. The ${getFamily(experiment.familyKey).name} family has more in it.`
              : "I have three ideas and zero approvals. Standard Tuesday.",
            "thinking"
          ),
          line(A.risk, "Ideas are free. Out-of-sample Sharpe is expensive.", "angry"),
          line(A.strategy, "One day I will frame that quote and bill you for it.", "excited")
        ],
        [
          line(A.data, "Whoever named a column 'close_final_v2_REAL' owes the desk an apology.", "confused"),
          line(A.code, "It was past me. Past me is unreachable for comment.", "coding"),
          line(A.data, "Past you is a menace.", "confused")
        ],
        [
          line(A.skeptic, "Bailey's math says seven random tries usually produce one fake Sharpe above 1. Seven.", "whispering"),
          line(A.manager, "Which is why every trial goes in the registry and the deflator only gets harsher.", "idle"),
          line(A.skeptic, "Music to my ears. Statistically validated music.", "whispering")
        ]
      ];
  const lines = pick(variants, rng);
  return script("gossip", spot, lines, 20);
}

export function bossDirectiveConversation(context: DialogueContext): ConversationScript {
  const { bossText = "", timestamp } = context;
  const zh = context.language === "zh";
  const banked = bankConversation("boss_ack", context, buildFacts(context), 85);
  if (banked) return banked;
  const rng = seededRandom(`boss-${Math.floor(timestamp / 1000)}`);
  const urgent = /!|！|快|赶紧|now|asap|immediately/i.test(bossText);
  const ack = urgent
    ? pick(
        zh
          ? ["明白，老板。手里的全放下。", "收到，马上动。", "是，老板。整个桌面都在转向。"]
          : ["Understood, boss. Dropping everything.", "On it. Right now.", "Yes boss. The desk is moving."],
        rng
      )
    : pick(
        zh
          ? ["收到，老板。这条会进下一轮迭代。", "好主意。下一个假设就往这个方向掰。", "明白，提案队列刚刚变了。"]
          : [
              "Noted, boss. Folding it into the next iteration.",
              "Good call. We will steer the next hypothesis that way.",
              "Understood. The proposal queue just changed."
            ],
        rng
      );
  const quoted = `${bossText.slice(0, 70)}${bossText.length > 70 ? "…" : ""}`;
  return script(
    "boss-directive",
    "meeting",
    [
      line(A.manager, ack, urgent ? "excited" : "idle"),
      line(
        A.strategy,
        zh ? `老板要的是：「${quoted}」——我可以围绕它出一个假设。` : `Boss wants: "${quoted}" — I can shape a hypothesis around that.`,
        "thinking"
      ),
      line(
        A.risk,
        tx2(zh, "Steering is fine. The risk checks do not bend, boss or no boss.", "方向可以听老板的，但风控不弯腰，老板也一样。"),
        "angry"
      ),
      line(
        A.skeptic,
        pick(
          zh
            ? ["老板也有观点，挺好，那就测一测。", "指令也是假设，一样可能被拒。", "我会用同一把尺子量老板的主意。"]
            : [
                "Bold of the boss to have opinions. Let's test them.",
                "Directives are hypotheses too. They can also be rejected.",
                "I will hold the directive to the same standard as everything else."
              ],
          rng
        ),
        "whispering"
      )
    ],
    85
  );
}

function tx2(zh: boolean, en: string, zhText: string): string {
  return zh ? zhText : en;
}

// Rare scripted office events: pure flavor that makes the office feel alive.
export function officeEventConversation(context: DialogueContext): ConversationScript {
  const zh = context.language === "zh";
  const rng = seededRandom(`event-${Math.floor(context.timestamp / 5000)}`);
  const events: ConversationLine[][] = zh
    ? [
        [
          line(A.code, "咖啡机坏了。重复一遍：咖啡机坏了。", "tired"),
          line(A.manager, "启动应急预案：茶水角限流，按资历排队。", "idle"),
          line(A.skeptic, "我的生产率刚刚经历了一次负三西格玛事件。", "whispering")
        ],
        [
          line(A.data, "监管检查组下周过来。所有数据血缘文档现在开始补。", "checking_chart"),
          line(A.code, "“现在开始补”这五个字让我后背发凉。", "tired"),
          line(A.risk, "我反而很期待。终于有人和我标准一样了。", "checking_chart")
        ],
        [
          line(A.manager, "披萨到了！庆祝本周没有任何东西着火。", "excited"),
          line(A.code, "周还没结束呢。", "coding"),
          line(A.manager, "Ren，让我们享受这一刻。", "idle")
        ],
        [
          line(A.data, "数据供应商刚发了故障公告，今天的行情延迟两小时。", "confused"),
          line(A.skeptic, "完美。延迟的数据配延迟的满足。", "whispering"),
          line(A.manager, "今天的回测排到明天，大家去补文档。", "idle")
        ],
        [
          line(A.risk, "消防演习。所有人，包括正在回测的。", "angry"),
          line(A.strategy, "曲线正跑到2020年3月！我不能现在走！", "excited"),
          line(A.risk, "2020年3月正好教你什么叫风控。走。", "angry")
        ],
        [
          line(A.strategy, "期刊退稿信到了。“有趣但样本外证据不足”。", "tired"),
          line(A.skeptic, "他们引用了我的原话，我很感动。", "whispering"),
          line(A.manager, "把审稿意见贴在白板上，下个版本逐条回应。", "idle")
        ],
        [
          line(A.code, "新显示器到了！四千流明的K线，闪瞎我吧。", "excited"),
          line(A.data, "亮度调低点，别让回撤看起来更吓人。", "checking_chart")
        ],
        [
          line(A.manager, "年度审计季开始。接下来两周，每一笔模拟交易都要有出处。", "idle"),
          line(A.code, "连模拟交易都要审计？", "confused"),
          line(A.risk, "尤其是模拟交易。", "checking_chart")
        ]
      ]
    : [
        [
          line(A.code, "The coffee machine is down. I repeat: the coffee machine is down.", "tired"),
          line(A.manager, "Emergency protocol: tea corner rationing, queue by seniority.", "idle"),
          line(A.skeptic, "My productivity just had a negative three-sigma event.", "whispering")
        ],
        [
          line(A.data, "Regulators visit next week. All data-lineage docs get finished starting now.", "checking_chart"),
          line(A.code, "The words 'starting now' just lowered my body temperature.", "tired"),
          line(A.risk, "I am thrilled. Finally someone with my standards.", "checking_chart")
        ],
        [
          line(A.manager, "Pizza is here! Celebrating a week where nothing caught fire.", "excited"),
          line(A.code, "The week is not over.", "coding"),
          line(A.manager, "Let us have this, Ren.", "idle")
        ],
        [
          line(A.data, "Vendor outage notice: today's feed is delayed two hours.", "confused"),
          line(A.skeptic, "Perfect. Delayed data for delayed gratification.", "whispering"),
          line(A.manager, "Backtests move to tomorrow. Everyone, documentation day.", "idle")
        ],
        [
          line(A.risk, "Fire drill. Everyone out, including the backtest watchers.", "angry"),
          line(A.strategy, "The curve is in March 2020! I cannot leave now!", "excited"),
          line(A.risk, "March 2020 is exactly the risk lesson. Out.", "angry")
        ],
        [
          line(A.strategy, "Journal rejection arrived. 'Interesting but out-of-sample evidence is thin.'", "tired"),
          line(A.skeptic, "They quoted me verbatim. I am touched.", "whispering"),
          line(A.manager, "Pin the referee notes to the whiteboard. Next version answers every one.", "idle")
        ],
        [
          line(A.code, "New monitor day! Four thousand nits of candlesticks, blind me.", "excited"),
          line(A.data, "Turn the brightness down before the drawdowns look worse.", "checking_chart")
        ],
        [
          line(A.manager, "Audit season opens. For two weeks, every simulated trade needs a paper trail.", "idle"),
          line(A.code, "We audit the SIMULATED trades?", "confused"),
          line(A.risk, "Especially the simulated trades.", "checking_chart")
        ]
      ];
  const lines = pick(events, rng);
  return script("office_event", pick(["meeting", "tea", "workstations"], rng), lines, 45);
}

export function lovedConversation(context: DialogueContext): ConversationScript {
  const { targetAgentId = A.strategy, agents, timestamp } = context;
  const zh = context.language === "zh";
  const banked = bankConversation("love", context, buildFacts(context), 76);
  if (banked) return banked;
  const rng = seededRandom(`love-${targetAgentId}-${Math.floor(timestamp / 1000)}`);
  const target = agents.find((agent) => agent.id === targetAgentId);
  const name = target?.name ?? (zh ? "某人" : "Someone");
  const replies: Record<string, string[]> = zh
    ? {
        [A.strategy]: ["老板相信这个信号！新假设，双倍速度！", "被认可了！这一刻我要裱起来。"],
        [A.code]: ["老板盖章的代码，部署的是信心。", "下一个变量就用这个心情命名。"],
        [A.risk]: ["谢谢。标准照旧，毫不留情。", "表扬收下，检查项不变。"],
        [A.skeptic]: ["彩虹屁动摇不了我的先验。不过，谢了。", "记下了。怀疑值暂时下调3%。"],
        [A.manager]: ["整个桌面就靠这口气。都回去干活。", "老板的士气会传染整条循环，继续迭代。"],
        [A.data]: ["我和时间戳都倍感荣幸。", "数据干净，老板开心，天经地义。"]
      }
    : {
        [A.strategy]: ["The boss believes in the signal! New hypothesis, double speed!", "Validation! I am framing this moment."],
        [A.code]: ["Boss-approved code. Deploying confidence.", "I shall name the next variable after this feeling."],
        [A.risk]: ["Appreciated. The standards remain merciless.", "Praise accepted. Checks unchanged."],
        [A.skeptic]: ["Flattery does not move my priors. But thank you.", "Noted. Doubt levels temporarily reduced by 3%."],
        [A.manager]: ["The desk runs on this. Back to work, everyone.", "Boss morale transfers to the whole loop. Iterating."],
        [A.data]: ["The timestamps and I are honored.", "Clean data, happy boss. The natural order."]
      };
  const witness = pick(
    agents.filter((agent) => agent.id !== targetAgentId).map((agent) => agent.id),
    rng
  );
  return script(
    "love",
    "none",
    [
      line(targetAgentId, pick(replies[targetAgentId] ?? [zh ? "老板今天喜欢我！" : "The boss likes me today!"], rng), "excited"),
      line(
        witness,
        pick(
          zh
            ? [`${name} 拿到了爱心，我拿到的是bug单。`, "马屁精。", `实至名归，${name}。大部分时候吧。`]
            : [`${name} gets the heart and I get the bug tickets.`, "Teacher's pet.", `Well earned, ${name}. Mostly.`],
          rng
        ),
        "whispering"
      )
    ],
    76
  );
}

export function whippedConversation(context: DialogueContext): ConversationScript {
  const { targetAgentId = A.code, agents, timestamp } = context;
  const zh = context.language === "zh";
  const banked = bankConversation("whip", context, buildFacts(context), 76);
  if (banked) return banked;
  const rng = seededRandom(`whip-${targetAgentId}-${Math.floor(timestamp / 1000)}`);
  const target = agents.find((agent) => agent.id === targetAgentId);
  const name = target?.name ?? (zh ? "某人" : "Someone");
  const replies: Record<string, string[]> = zh
    ? {
        [A.strategy]: ["疼！好吧！少写诗，多拿样本外证据。", "明白。下一个想法会无聊但赚钱。"],
        [A.code]: ["是，老板。重构。安静地。永远地。", "那个bug严格来说是特性……我重构还不行吗。"],
        [A.risk]: ["鞭打风控只会让风控更严，正合我意。", "明白。所有人的门槛刚刚都抬高了。"],
        [A.skeptic]: ["连我的怀疑都被怀疑了，我敬这一鞭。", "有道理，我会更快地开始怀疑。"],
        [A.manager]: ["收到。今天循环就拧紧。", "问责从我开始。下一轮，更锋利。"],
        [A.data]: ["我把所有数据再审一遍，审两遍。", "时间戳会一尘不染的，老板。"]
      }
    : {
        [A.strategy]: ["Ow. Fine! Less poetry, more out-of-sample evidence.", "Understood. The next idea will be boring and profitable."],
        [A.code]: ["Yes boss. Refactoring. Silently. Forever.", "The bug was technically a feature. ...Refactoring."],
        [A.risk]: ["Whipping the risk desk only makes it stricter. As intended.", "Understood. The bar just went up for everyone."],
        [A.skeptic]: ["Even my doubt is doubted now. I respect it.", "Fair. I will be skeptical faster."],
        [A.manager]: ["Message received. The loop tightens today.", "Accountability starts with me. Next iteration, sharper."],
        [A.data]: ["I will re-audit everything. Twice.", "The timestamps will be spotless, boss."]
      };
  const witness = pick(
    agents.filter((agent) => agent.id !== targetAgentId).map((agent) => agent.id),
    rng
  );
  return script(
    "whip",
    "none",
    [
      line(targetAgentId, pick(replies[targetAgentId] ?? [zh ? "明白，老板。" : "Understood, boss."], rng), "tired"),
      line(
        witness,
        pick(
          zh
            ? [`又是鞭子。说实话，${name} 活该。`, "低调点，老板在开绩效模式。", `接下来一周 ${name} 会把「纪律」挂嘴边，烦死了。`]
            : [`The whip again. ${name} had it coming, honestly.`, "Stay low. Boss is in performance-review mood.", `${name} will be insufferable about discipline for a week now.`],
          rng
        ),
        "whispering"
      )
    ],
    76
  );
}
