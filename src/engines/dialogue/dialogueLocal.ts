import {
  AgentProfile,
  AgentState,
  ConversationLine,
  ConversationScript,
  ExperimentRecord,
  LoopPhase,
  ResearchMemory
} from "../../types";
import { pick, seededRandom } from "../random";
import { getFamily } from "../strategyKnowledge";

export interface DialogueContext {
  phase: LoopPhase;
  experiment?: ExperimentRecord;
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

export function phaseConversation(context: DialogueContext): ConversationScript | undefined {
  const { phase, experiment, timestamp, memory } = context;
  const rng = seededRandom(`phase-${phase}-${experiment?.id ?? "none"}-${Math.floor(timestamp / 10000)}`);

  if (phase === "proposing") {
    const idea = experiment?.ideaReasoning?.[0];
    const reasons = [
      "I keep coming back to how flows, not fundamentals, set prices at this horizon.",
      "The pattern survived my eyeball test across two regimes. That is rare.",
      "If the economic story is wrong, the backtest should kill it fast. Let's find out."
    ];
    return script(
      "proposing",
      "whiteboard",
      [
        line(A.strategy, idea ?? "New hypothesis going on the board. Nobody erase it this time.", "thinking"),
        line(A.data, "Before you fall in love with it: which timestamps does the signal touch?", "checking_chart"),
        line(A.strategy, pick(reasons, rng), "excited"),
        line(A.data, "Fine. I will pull universe coverage and stamp every headline before you backtest.", "idle")
      ],
      60
    );
  }

  if (phase === "data_check" && experiment) {
    return script(
      "data_check",
      "data_cabinet",
      [
        line(A.data, `Auditing ${experiment.backtestParameters.universe.length} tickers: close prices, returns, and news stamps.`, "checking_chart"),
        line(A.code, "Anything dirty? I'd rather patch the join now than debug the curve later.", "coding"),
        line(
          A.data,
          pick(
            [
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

  if (phase === "coding" && experiment) {
    const paramCount = Object.keys(experiment.strategyParameters ?? {}).length;
    return script(
      "coding",
      "workstations",
      [
        line(A.code, `Implementing ${experiment.strategyName}: ${paramCount} tunable parameters, ${experiment.backtestParameters.holdingPeriod}-day holds.`, "coding"),
        line(A.strategy, "Keep it lean. Every extra knob is another way to fool ourselves.", "thinking"),
        line(
          A.code,
          pick(
            [
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

  if (phase === "backtesting" && experiment) {
    return script(
      "backtesting",
      "backtest_computer",
      [
        line(A.code, "Simulation is running. In-sample first, then the untouched out-of-sample block.", "checking_chart"),
        line(A.data, `Cost model is ${experiment.backtestParameters.transactionCostBps} bps per side. No free lunches in this room.`, "checking_chart"),
        line(A.strategy, pick(["Come on, curve, behave.", "I am not watching. Tell me when it's over.", "If the OOS half holds up, drinks on me."], rng), "excited")
      ],
      55
    );
  }

  if (phase === "risk_review" && experiment) {
    const fails = failedChecks(experiment);
    const warns = warnChecks(experiment);
    const oos = experiment.outOfSampleResult;
    const riskLine =
      fails.length > 0
        ? `Blocking issue: ${fails.join(", ")}. This does not pass my desk.`
        : warns.length > 0
          ? `No hard fail, but I am flagging ${warns.slice(0, 2).join(" and ")}.`
          : "Eight-plus checks and nothing blocking. I am almost suspicious.";
    return script(
      "risk_review",
      "meeting",
      [
        line(A.risk, riskLine, fails.length > 0 ? "angry" : "checking_chart"),
        line(A.code, `OOS Sharpe is ${oos.sharpeRatio.toFixed(2)} after costs of ${pct(Math.abs(oos.returnAfterCosts))}. The implementation is not the problem.`, "debating"),
        line(
          A.skeptic,
          `Trial ${oos.trialsAtDiscovery} in this family. Deflated for multiple testing, the survival odds are ${(oos.deflatedSharpe * 100).toFixed(0)}%.`,
          "whispering"
        ),
        line(A.risk, fails.length > 0 ? "Then it goes back. Pretty curves do not pay slippage." : "Send it to debate. I want the skeptic's teeth in it.", "debating")
      ],
      70
    );
  }

  if (phase === "debate" && experiment) {
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
          line(A.manager, `${experiment.strategyName} is promoted: OOS Sharpe ${oos.sharpeRatio.toFixed(2)}, deflated survival ${(oos.deflatedSharpe * 100).toFixed(0)}%.`, "excited"),
          line(A.strategy, "Told you the story was real. Lineage gets one more refinement next loop.", "excited"),
          line(A.skeptic, "Celebrate after the stress retest. Half my graveyard looked this good once.", "whispering"),
          line(A.code, "Logging it. The pool just got one alpha bigger.", "coding")
        ],
        75
      );
    }
    if (experiment.status === "rejected") {
      return script(
        "saved-rejected",
        "meeting",
        [
          line(A.manager, `${experiment.strategyName} is rejected. The lesson goes in memory: ${experiment.nextIterationSuggestion}`, "idle"),
          line(A.skeptic, pick(["I hate being right this often.", "The graveyard welcomes another beautiful curve.", "Luck dressed as alpha, as suspected."], rng), "whispering"),
          line(A.strategy, pick(["Fine. The next one is uncorrelated, I promise.", "It still hurts. Every time.", "Noted. I am stealing the cost gate idea for v2."], rng), "tired")
        ],
        70
      );
    }
    if (experiment.status === "failed_to_run") {
      return script(
        "saved-failed",
        "workstations",
        [
          line(A.code, "It crashed. Column mismatch, my fault, fix is two lines.", "tired"),
          line(A.manager, "Archive the log. Simplify, rerun, and stop apologizing.", "idle")
        ],
        65
      );
    }
    return script(
      "saved-other",
      "leaderboard",
      [
        line(A.manager, `${experiment.strategyName}: ${experiment.status === "retest_needed" ? "back for a retest with stricter costs." : "archived as informative."}`, "idle"),
        line(A.strategy, experiment.nextIterationSuggestion, "thinking")
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
  if (!experiment || !experiment.ideaReasoning || experiment.ideaReasoning.length === 0) return undefined;
  const rng = seededRandom(`reveal-${experiment.id}`);
  const reasons = experiment.ideaReasoning;
  const lines = [
    line(A.strategy, reasons[0], "thinking"),
    line(A.skeptic, pick([
      "And the part where it stops working? Walk me through that.",
      "I have heard this exact pitch twice this quarter.",
      "Convince the data first. I am second in line."
    ], rng), "whispering"),
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
  const rng = seededRandom(`gossip-${Math.floor(timestamp / 15000)}`);
  const spot = pick(["tea", "window", "meeting"], rng);
  const lesson = memory.length > 0 ? pick(memory, rng).text : "We have not trusted a single curve yet.";

  const variants: ConversationLine[][] = [
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
      line(A.strategy, experiment ? `Still thinking about ${experiment.strategyName}. The ${getFamily(experiment.familyKey).name} family has more in it.` : "I have three ideas and zero approvals. Standard Tuesday.", "thinking"),
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
  const rng = seededRandom(`boss-${Math.floor(timestamp / 1000)}`);
  const urgent = /!|快|赶紧|now|asap|immediately/i.test(bossText);
  const ack = urgent
    ? pick(["Understood, boss. Dropping everything.", "On it. Right now.", "Yes boss. The desk is moving."], rng)
    : pick(["Noted, boss. Folding it into the next iteration.", "Good call. We will steer the next hypothesis that way.", "Understood. The proposal queue just changed."], rng);
  return script(
    "boss-directive",
    "meeting",
    [
      line(A.manager, ack, urgent ? "excited" : "idle"),
      line(A.strategy, `Boss wants: "${bossText.slice(0, 70)}${bossText.length > 70 ? "…" : ""}" — I can shape a hypothesis around that.`, "thinking"),
      line(A.risk, "Steering is fine. The risk checks do not bend, boss or no boss.", "angry"),
      line(A.skeptic, pick(["Bold of the boss to have opinions. Let's test them.", "Directives are hypotheses too. They can also be rejected.", "I will hold the directive to the same standard as everything else."], rng), "whispering")
    ],
    85
  );
}

export function lovedConversation(context: DialogueContext): ConversationScript {
  const { targetAgentId = A.strategy, agents, timestamp } = context;
  const rng = seededRandom(`love-${targetAgentId}-${Math.floor(timestamp / 1000)}`);
  const target = agents.find((agent) => agent.id === targetAgentId);
  const name = target?.name ?? "Someone";
  const replies: Record<string, string[]> = {
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
      line(targetAgentId, pick(replies[targetAgentId] ?? ["The boss likes me today!"], rng), "excited"),
      line(witness, pick([`${name} gets the heart and I get the bug tickets.`, "Teacher's pet.", `Well earned, ${name}. Mostly.`], rng), "whispering")
    ],
    40
  );
}

export function whippedConversation(context: DialogueContext): ConversationScript {
  const { targetAgentId = A.code, agents, timestamp } = context;
  const rng = seededRandom(`whip-${targetAgentId}-${Math.floor(timestamp / 1000)}`);
  const target = agents.find((agent) => agent.id === targetAgentId);
  const name = target?.name ?? "Someone";
  const replies: Record<string, string[]> = {
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
      line(targetAgentId, pick(replies[targetAgentId] ?? ["Understood, boss."], rng), "tired"),
      line(witness, pick([`The whip again. ${name} had it coming, honestly.`, "Stay low. Boss is in performance-review mood.", `${name} will be insufferable about discipline for a week now.`], rng), "whispering")
    ],
    40
  );
}
