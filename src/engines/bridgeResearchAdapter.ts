import {
  ExperimentRecord,
  LLMCapabilities,
  OfficeSpeechContext,
  ProposalContext,
  ResearchMemory,
  RiskReview,
  Settings,
  SpeechBubble,
  StrategySpec
} from "../types";
import { MockQuantLLMAdapter } from "./llmAdapters";
import { proposeStrategy } from "./hypothesisEngine";
import { STRATEGY_FAMILIES } from "./strategyKnowledge";
import { clamp } from "./random";

// Research brain via the local CLI bridge: the hypothesis (family, horizon,
// parameters, and the economic pitch) comes from Claude Code / Codex running
// on the player's subscription; everything is validated against the knowledge
// base and falls back to the local engine on any failure.

interface BridgeChoice {
  familyKey?: string;
  holdingPeriod?: number;
  portfolioType?: string;
  parameters?: Record<string, number>;
  hypothesis?: string;
  reasoning?: string[];
}

export class BridgeResearchAdapter implements LLMCapabilities {
  private readonly fallback = new MockQuantLLMAdapter();
  // the skeptic's objection is a pure function of the rounded metrics, so two
  // experiments with the same numbers reuse one CLI call instead of two
  private readonly challengeCache = new Map<string, string>();

  constructor(private readonly getSettings: () => Settings) {}

  private async callBridge(prompt: string, timeoutMs = 90000): Promise<string | null> {
    const settings = this.getSettings();
    const backend = settings.researchBrain === "codex" ? "codex" : "claude-code";
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${settings.bridgeUrl.replace(/\/$/, "")}/condense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ backend, prompt })
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { text?: string };
      return payload.text ?? null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async proposeHypothesis(context: ProposalContext): Promise<StrategySpec> {
    // the local engine handles bandit/lineage bookkeeping; the CLI refines or
    // overrides the family/parameter choice with its own reasoning, grounded in
    // a profile of the dataset actually loaded
    const local = proposeStrategy(context);
    const computable = context.computableFamilies;
    const families = computable
      ? STRATEGY_FAMILIES.filter((family) => computable.includes(family.key))
      : STRATEGY_FAMILIES;
    const familyTable = families
      .map(
        (family) =>
          `${family.key}: ${family.name} | params ${family.parameters
            .map((parameter) => `${parameter.name}[${parameter.min}..${parameter.max}]`)
            .join(", ")} | holdings ${family.holdingPeriods.join("/")} | net Sharpe prior ${family.netSharpe[0]}-${family.netSharpe[1]}`
      )
      .join("\n");
    const recent = context.experiments
      .slice(-6)
      .map(
        (experiment) =>
          `${experiment.strategyName} (${experiment.familyKey}): ${experiment.status}, OOS Sharpe ${experiment.outOfSampleResult.sharpeRatio}, deflated ${experiment.outOfSampleResult.deflatedSharpe}`
      )
      .join("\n");
    const prompt = `You are the strategy researcher of a quant desk. Pick the next experiment.
${context.datasetProfile ? `\nDATASET IN FRONT OF YOU:\n${context.datasetProfile}\n` : ""}
AVAILABLE FAMILIES:
${familyTable}

RECENT RESULTS:
${recent || "(none yet)"}

DESK MEMORY:
${context.memory.map((item) => `- ${item.text}`).join("\n") || "(empty)"}
${context.bossDirective ? `\nBOSS DIRECTIVE (must respect): ${context.bossDirective}` : ""}

The local engine suggests: ${local.familyKey} with ${JSON.stringify(local.parameters)} holding ${local.holdingPeriod}d. You may keep or change it.

Reply with ONLY a JSON object: {"familyKey": "...", "holdingPeriod": 1|3|5|20, "portfolioType": "long_short"|"long_only", "parameters": {<numbers within the documented ranges>}, "hypothesis": "<one-sentence economic story>", "reasoning": ["<why this, citing the recent results or memory>", "<main failure mode you accept>"]}`;

    const text = await this.callBridge(prompt);
    if (!text) return local;
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      const choice = JSON.parse(text.slice(start, end + 1)) as BridgeChoice;
      const family = families.find((item) => item.key === choice.familyKey);
      if (!family) return local;

      const parameters: Record<string, number | string | boolean> = {};
      family.parameters.forEach((parameter) => {
        const proposed = Number(choice.parameters?.[parameter.name]);
        const value = Number.isFinite(proposed) ? proposed : parameter.default;
        const snapped = parameter.min + Math.round((clamp(value, parameter.min, parameter.max) - parameter.min) / parameter.step) * parameter.step;
        parameters[parameter.name] = Number(clamp(snapped, parameter.min, parameter.max).toFixed(4));
      });
      const holding = ([1, 3, 5, 20] as const).includes(choice.holdingPeriod as 1 | 3 | 5 | 20)
        ? (choice.holdingPeriod as 1 | 3 | 5 | 20)
        : local.holdingPeriod;

      const reasoning = [
        `Research brain (${this.getSettings().researchBrain} CLI) picked ${family.name} over the local suggestion.`,
        ...(Array.isArray(choice.reasoning) ? choice.reasoning.slice(0, 3).map(String) : []),
        ...local.ideaReasoning.slice(-2)
      ];

      return {
        ...local,
        name: `${family.name} ${local.ideaMode === "refine" ? local.name.split(" ").pop() : "Directive"}`.replace("Directive", "Brain"),
        familyKey: family.key,
        factorKind: family.factorKind,
        factorLogic: family.construction,
        hypothesis: typeof choice.hypothesis === "string" && choice.hypothesis.length > 10 ? choice.hypothesis : family.rationale,
        holdingPeriod: holding,
        portfolioType: choice.portfolioType === "long_only" ? "long_only" : choice.portfolioType === "long_short" ? "long_short" : local.portfolioType,
        parameters,
        ideaReasoning: reasoning
      };
    } catch {
      return local;
    }
  }

  async generateStrategyLogic(strategy: StrategySpec): Promise<string> {
    return this.fallback.generateStrategyLogic(strategy);
  }

  async reviewRisk(experiment: ExperimentRecord): Promise<RiskReview> {
    return this.fallback.reviewRisk(experiment);
  }

  async challengeResult(experiment: ExperimentRecord): Promise<string> {
    const oos = experiment.outOfSampleResult;
    const cacheKey = [
      experiment.familyKey,
      Math.round(oos.sharpeRatio * 10),
      Math.round(oos.maxDrawdown * 100),
      Math.round(oos.deflatedSharpe * 100),
      oos.trialsAtDiscovery,
      Math.round(oos.alphaPoolCorrelation * 100)
    ].join(":");
    const cached = this.challengeCache.get(cacheKey);
    if (cached) return cached;
    const prompt = `You are a merciless quant skeptic. One sentence (max 140 chars) challenging this backtest. Facts: OOS Sharpe ${oos.sharpeRatio}, after-cost return ${(oos.returnAfterCosts * 100).toFixed(1)}%, max drawdown ${(oos.maxDrawdown * 100).toFixed(1)}%, deflated-Sharpe survival ${(oos.deflatedSharpe * 100).toFixed(0)}% over ${oos.trialsAtDiscovery} trials, pool correlation ${(oos.alphaPoolCorrelation * 100).toFixed(0)}%. Reply with ONLY the sentence.`;
    const text = await this.callBridge(prompt, 45000);
    if (text && text.trim().length > 10 && text.length < 300) {
      const objection = text.trim().replace(/^["']|["']$/g, "");
      if (this.challengeCache.size > 80) this.challengeCache.clear();
      this.challengeCache.set(cacheKey, objection);
      return objection;
    }
    return this.fallback.challengeResult(experiment);
  }

  async summarizeExperiment(experiment: ExperimentRecord): Promise<string> {
    return this.fallback.summarizeExperiment(experiment);
  }

  async suggestNextIteration(experiment: ExperimentRecord, memory: ResearchMemory[]): Promise<string> {
    return this.fallback.suggestNextIteration(experiment, memory);
  }

  async generateOfficeSpeech(context: OfficeSpeechContext): Promise<SpeechBubble[]> {
    return this.fallback.generateOfficeSpeech(context);
  }
}
