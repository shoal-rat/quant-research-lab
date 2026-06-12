import {
  ExperimentRecord,
  LLMCapabilities,
  OfficeSpeechContext,
  ProposalContext,
  ResearchMemory,
  RiskReview,
  SpeechBubble,
  StrategySpec
} from "../types";
import { proposeStrategy } from "./hypothesisEngine";

export class MockQuantLLMAdapter implements LLMCapabilities {
  async proposeHypothesis(context: ProposalContext): Promise<StrategySpec> {
    return proposeStrategy(context);
  }

  async generateStrategyLogic(strategy: StrategySpec): Promise<string> {
    const params = Object.entries(strategy.parameters)
      .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
      .join(",\n");
    return `// Controlled simulated strategy logic. Not executed in the browser.
export const strategy = {
  name: ${JSON.stringify(strategy.name)},
  factorKind: ${JSON.stringify(strategy.factorKind)},
  holdingPeriod: ${strategy.holdingPeriod},
  portfolioType: ${JSON.stringify(strategy.portfolioType)},
  parameters: {
${params}
  },
  signal(row, history) {
    // Replace this mock logic with a sandboxed research runtime.
    return rankComposite(row, history, strategy.parameters);
  }
};`;
  }

  async reviewRisk(experiment: ExperimentRecord): Promise<RiskReview> {
    return experiment.riskReview;
  }

  async challengeResult(experiment: ExperimentRecord): Promise<string> {
    const oos = experiment.outOfSampleResult;
    if (oos.deflatedSharpe !== undefined && oos.deflatedSharpe < 0.5) {
      return `This is trial number ${oos.trialsAtDiscovery} in the family; deflated for multiple testing, the Sharpe is ${(oos.deflatedSharpe * 100).toFixed(0)}% likely to be noise-beating. Not yet.`;
    }
    if (oos.alphaPoolCorrelation !== undefined && oos.alphaPoolCorrelation > 0.7) {
      return `It is ${(oos.alphaPoolCorrelation * 100).toFixed(0)}% correlated with what we already hold. A duplicate is not a discovery.`;
    }
    if (oos.overfittingRiskScore > 72) {
      return "The curve leans too hard on one regime. I want a walk-forward split before trusting it.";
    }
    if (oos.returnAfterCosts < 0) {
      return "After costs, the signal pays the broker before it pays us.";
    }
    if (oos.sharpeRatio < experiment.inSampleResult.sharpeRatio * 0.55) {
      return "The out-of-sample decay is too large to call this stable.";
    }
    return "The result is not absurd, but I want a tougher random baseline and another date split.";
  }

  async summarizeExperiment(experiment: ExperimentRecord): Promise<string> {
    return `${experiment.strategyName}: OOS Sharpe ${experiment.outOfSampleResult.sharpeRatio.toFixed(
      2
    )}, after-cost return ${(experiment.outOfSampleResult.returnAfterCosts * 100).toFixed(1)}%, status ${
      experiment.status
    }.`;
  }

  async suggestNextIteration(experiment: ExperimentRecord, memory: ResearchMemory[]): Promise<string> {
    if (experiment.status === "candidate") {
      return "Retest with a stricter transaction-cost assumption and a walk-forward split.";
    }
    if (experiment.status === "failed_to_run") {
      return "Simplify the factor definition and validate required columns before backtesting.";
    }
    if (experiment.outOfSampleResult.turnover > 0.82) {
      return "Add a rebalance buffer and compare three-day versus five-day holding periods.";
    }
    if (memory.some((item) => item.text.includes("transaction costs"))) {
      return "Use a lower-turnover signal family and preserve the same timestamp gate.";
    }
    return "Try the same intuition on another industry group and reduce the number of tuned parameters.";
  }

  async generateOfficeSpeech(context: OfficeSpeechContext): Promise<SpeechBubble[]> {
    const experiment = context.experiment;
    const lines: Array<[string, string]> = [];
    if (context.phase === "proposing") {
      lines.push(["agent-strategy", "I have a factor idea. Do not erase the board yet."]);
    } else if (context.phase === "data_check") {
      lines.push(["agent-data", "Checking timestamps before anyone celebrates."]);
    } else if (context.phase === "coding") {
      lines.push(["agent-code", "The mock sandbox is compiling the signal."]);
    } else if (context.phase === "risk_review" && experiment) {
      lines.push(["agent-risk", experiment.riskReview.summary]);
    } else if (context.phase === "debate" && experiment) {
      experiment.debate.slice(0, 4).forEach((line) => {
        const agent = context.agents.find((item) => item.role === line.role);
        if (agent) lines.push([agent.id, line.message]);
      });
    } else if (context.phase === "saved" && experiment) {
      lines.push(["agent-manager", experiment.managerDecision]);
    }

    return lines.map(([agentId, message], index) => {
      const agent = context.agents.find((item) => item.id === agentId) ?? context.agents[index % context.agents.length];
      return {
        id: `bubble-${context.timestamp}-${index}`,
        agentId: agent.id,
        role: agent.role,
        speaker: agent.name,
        message,
        createdAt: context.timestamp + index,
        tone: index % 2 === 0 ? "thinking" : "debating"
      };
    });
  }
}

export class ClaudeCodeAdapter implements LLMCapabilities {
  private readonly bridgeUrl = "/api/claude-code";
  private readonly model = "claude-opus-4-8";
  private readonly effort = "xhigh";

  async proposeHypothesis(context: ProposalContext): Promise<StrategySpec> {
    return this.callBridge("proposeHypothesis", { context });
  }

  async generateStrategyLogic(strategy: StrategySpec): Promise<string> {
    return this.callBridge("generateStrategyLogic", { strategy });
  }

  async reviewRisk(experiment: ExperimentRecord): Promise<RiskReview> {
    return this.callBridge("reviewRisk", { experiment });
  }

  async challengeResult(experiment: ExperimentRecord): Promise<string> {
    return this.callBridge("challengeResult", { experiment });
  }

  async summarizeExperiment(experiment: ExperimentRecord): Promise<string> {
    return this.callBridge("summarizeExperiment", { experiment });
  }

  async suggestNextIteration(experiment: ExperimentRecord, memory: ResearchMemory[]): Promise<string> {
    return this.callBridge("suggestNextIteration", { experiment, memory });
  }

  async generateOfficeSpeech(context: OfficeSpeechContext): Promise<SpeechBubble[]> {
    return this.callBridge("generateOfficeSpeech", { context });
  }

  private async callBridge<T>(capability: string, payload: unknown): Promise<T> {
    const response = await fetch(this.bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backend: "claude_code",
        model: this.model,
        effort: this.effort,
        dynamicWorkflow: true,
        capability,
        payload
      })
    });
    if (!response.ok) {
      throw new Error(`Claude Code bridge unavailable for ${capability}`);
    }
    return response.json() as Promise<T>;
  }
}

export class CodexAdapter implements LLMCapabilities {
  private readonly bridgeUrl = "/api/codex";
  private readonly model = "gpt-5.5";
  private readonly reasoningEffort = "high";

  async proposeHypothesis(context: ProposalContext): Promise<StrategySpec> {
    return this.callBridge("proposeHypothesis", { context });
  }

  async generateStrategyLogic(strategy: StrategySpec): Promise<string> {
    return this.callBridge("generateStrategyLogic", { strategy });
  }

  async reviewRisk(experiment: ExperimentRecord): Promise<RiskReview> {
    return this.callBridge("reviewRisk", { experiment });
  }

  async challengeResult(experiment: ExperimentRecord): Promise<string> {
    return this.callBridge("challengeResult", { experiment });
  }

  async summarizeExperiment(experiment: ExperimentRecord): Promise<string> {
    return this.callBridge("summarizeExperiment", { experiment });
  }

  async suggestNextIteration(experiment: ExperimentRecord, memory: ResearchMemory[]): Promise<string> {
    return this.callBridge("suggestNextIteration", { experiment, memory });
  }

  async generateOfficeSpeech(context: OfficeSpeechContext): Promise<SpeechBubble[]> {
    return this.callBridge("generateOfficeSpeech", { context });
  }

  private async callBridge<T>(capability: string, payload: unknown): Promise<T> {
    const response = await fetch(this.bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backend: "codex",
        model: this.model,
        reasoning: { effort: this.reasoningEffort },
        capability,
        payload
      })
    });
    if (!response.ok) {
      throw new Error(`Codex bridge unavailable for ${capability}`);
    }
    return response.json() as Promise<T>;
  }
}
