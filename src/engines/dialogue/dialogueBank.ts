import {
  AgentState,
  ConversationLine,
  ConversationScript,
  ExperimentStatus,
  Language
} from "../../types";
import { seededRandom } from "../random";
import { getFamily } from "../strategyKnowledge";
import { DIALOGUE_TEMPLATES } from "./banks/generated";
import type { DialogueContext } from "./dialogueLocal";

// The template-bank engine: picks a context-matching script template from the
// authored library, interpolates real run data into it, and emits a
// conversation. dialogueLocal falls back to its hand-written scripts whenever
// no template matches.

export type BankWho = "strategy" | "code" | "risk" | "skeptic" | "manager" | "data" | "target" | "witness";

export interface BankLine {
  who: BankWho;
  tone: AgentState;
  en: string;
  zh: string;
}

export interface BankCond {
  statuses?: ExperimentStatus[];
  failures?: "some" | "none";
  deflatedBelow?: number;
  deflatedAbove?: number;
  generationAbove?: number;
  hasBoss?: boolean;
  moraleBelow?: number;
  moraleAbove?: number;
  targetRole?: "strategy" | "code" | "risk" | "skeptic" | "manager" | "data";
}

export interface BankTemplate {
  key: string;
  topic: string;
  spot: string;
  weight: number;
  cond?: BankCond;
  lines: BankLine[];
}

export interface BankFacts {
  values: Record<string, string>;
  status?: ExperimentStatus;
  failures?: "some" | "none";
  deflated?: number;
  generation?: number;
  hasBoss?: boolean;
  morale?: number;
  targetRole?: string;
  targetAgentId?: string;
  witnessAgentId?: string;
}

const ROLE_TO_ID: Record<string, string> = {
  strategy: "agent-strategy",
  code: "agent-code",
  risk: "agent-risk",
  skeptic: "agent-skeptic",
  manager: "agent-manager",
  data: "agent-data"
};

const VALID_TONES: AgentState[] = [
  "idle",
  "walking",
  "thinking",
  "coding",
  "debating",
  "whispering",
  "drinking_tea",
  "checking_chart",
  "excited",
  "angry",
  "tired",
  "confused"
];

let bankCounter = 0;

function condMatches(cond: BankCond | undefined, facts: BankFacts): boolean {
  if (!cond) return true;
  if (cond.statuses && (!facts.status || !cond.statuses.includes(facts.status))) return false;
  if (cond.failures && facts.failures !== cond.failures) return false;
  if (cond.deflatedBelow !== undefined && !(facts.deflated !== undefined && facts.deflated < cond.deflatedBelow)) return false;
  if (cond.deflatedAbove !== undefined && !(facts.deflated !== undefined && facts.deflated > cond.deflatedAbove)) return false;
  if (cond.generationAbove !== undefined && !(facts.generation !== undefined && facts.generation > cond.generationAbove)) return false;
  if (cond.hasBoss && !facts.hasBoss) return false;
  if (cond.moraleBelow !== undefined && !(facts.morale !== undefined && facts.morale < cond.moraleBelow)) return false;
  if (cond.moraleAbove !== undefined && !(facts.morale !== undefined && facts.morale > cond.moraleAbove)) return false;
  if (cond.targetRole && facts.targetRole !== cond.targetRole) return false;
  return true;
}

const PLACEHOLDER = /\{([a-zA-Z0-9]+)\}/g;

function placeholdersResolvable(template: BankTemplate, values: Record<string, string>): boolean {
  for (const line of template.lines) {
    for (const text of [line.en, line.zh]) {
      for (const match of text.matchAll(PLACEHOLDER)) {
        if (values[match[1]] === undefined) return false;
      }
    }
  }
  return true;
}

function interpolate(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (_, key: string) => values[key] ?? "");
}

function resolveWho(who: BankWho, facts: BankFacts): string | undefined {
  if (who === "target") return facts.targetAgentId;
  if (who === "witness") return facts.witnessAgentId;
  return ROLE_TO_ID[who];
}

export function bankConversation(
  topic: string,
  context: DialogueContext,
  facts: BankFacts,
  priority: number
): ConversationScript | undefined {
  const language: Language = context.language ?? "en";
  const candidates = DIALOGUE_TEMPLATES.filter(
    (template) =>
      template.topic === topic &&
      condMatches(template.cond, facts) &&
      placeholdersResolvable(template, facts.values) &&
      template.lines.length >= 2 &&
      template.lines.every(
        (line) => VALID_TONES.includes(line.tone) && Boolean(resolveWho(line.who, facts))
      )
  );
  if (candidates.length === 0) return undefined;

  const rng = seededRandom(`bank-${topic}-${facts.values.name ?? ""}-${Math.floor(context.timestamp / 9000)}`);
  const totalWeight = candidates.reduce((sum, template) => sum + Math.max(1, template.weight), 0);
  let roll = rng() * totalWeight;
  let chosen = candidates[0];
  for (const candidate of candidates) {
    roll -= Math.max(1, candidate.weight);
    if (roll <= 0) {
      chosen = candidate;
      break;
    }
  }

  const lines: ConversationLine[] = chosen.lines.map((line) => ({
    agentId: resolveWho(line.who, facts) as string,
    text: interpolate(language === "zh" ? line.zh : line.en, facts.values),
    tone: line.tone
  }));

  bankCounter += 1;
  return {
    id: `bank-${Date.now()}-${bankCounter}`,
    topicKey: topic,
    spot: chosen.spot,
    participantIds: [...new Set(lines.map((line) => line.agentId))],
    lines,
    priority
  };
}

function pctText(value: number | undefined, digits = 0): string | undefined {
  return value === undefined ? undefined : `${(value * 100).toFixed(digits)}%`;
}

// Builds the placeholder values + condition facts from the live context.
export function buildFacts(context: DialogueContext): BankFacts {
  const zh = context.language === "zh";
  const experiment = context.experiment;
  const draft = context.draft;
  const oos = experiment?.outOfSampleResult;
  const values: Record<string, string> = {};

  const put = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") values[key] = String(value);
  };

  put("name", draft?.name ?? experiment?.strategyName);
  const familyKey = draft?.familyKey ?? experiment?.familyKey;
  put("family", familyKey ? getFamily(familyKey).name : undefined);
  put("universe", draft?.universe.length ?? experiment?.backtestParameters.universe.length);
  put("holding", draft?.holdingPeriod ?? experiment?.backtestParameters.holdingPeriod);
  put("params", draft ? Object.keys(draft.parameters).length : experiment ? Object.keys(experiment.strategyParameters ?? {}).length : undefined);
  put("gen", (draft?.generation ?? experiment?.generation ?? 0) + 1);
  put("cost", context.costBps ?? experiment?.backtestParameters.transactionCostBps);
  put("boss", context.bossText ?? draft?.bossDirective ?? experiment?.bossDirective);

  if (oos) {
    put("sharpe", oos.sharpeRatio.toFixed(2));
    put("deflated", pctText(oos.deflatedSharpe));
    put("trials", oos.trialsAtDiscovery);
    put("corr", pctText(oos.alphaPoolCorrelation));
    put("dd", pctText(oos.maxDrawdown, 1));
    put("ret", pctText(oos.returnAfterCosts, 1));
    put("turnover", pctText(oos.turnover));
  }
  if (experiment) {
    put("checksPassed", experiment.riskReview.passedRiskChecks);
    put("checksTotal", experiment.riskReview.checks.length);
    put("suggestion", experiment.nextIterationSuggestion);
    const fails = experiment.riskReview.checks.filter((check) => check.status === "fail").map((check) => check.label.toLowerCase());
    const warns = experiment.riskReview.checks.filter((check) => check.status === "warn").map((check) => check.label.toLowerCase());
    if (fails.length > 0) put("failList", fails.join(zh ? "、" : ", "));
    if (warns.length > 0) put("warnList", warns.slice(0, 3).join(zh ? "、" : ", "));
  }
  const reasoning = draft?.ideaReasoning ?? experiment?.ideaReasoning;
  if (reasoning && reasoning.length > 0) {
    put("reason1", reasoning[0]);
    put("reason2", reasoning[Math.min(1, reasoning.length - 1)]);
  }
  if (context.memory.length > 0) {
    const item = context.memory[0];
    put("lesson", zh ? item.textZh ?? item.text : item.text);
  }
  if (context.targetAgentId) {
    const target = context.agents.find((agent) => agent.id === context.targetAgentId);
    put("targetName", target?.name);
  }

  const failures = experiment
    ? experiment.riskReview.checks.some((check) => check.status === "fail")
      ? "some"
      : "none"
    : undefined;

  // witness: a deterministic colleague that is not the target
  const witnessPool = context.agents.filter((agent) => agent.id !== context.targetAgentId);
  const witness = witnessPool.length > 0 ? witnessPool[Math.floor(context.timestamp / 1000) % witnessPool.length] : undefined;

  const targetRole = context.targetAgentId
    ? Object.entries(ROLE_TO_ID).find(([, id]) => id === context.targetAgentId)?.[0]
    : undefined;

  return {
    values,
    status: experiment?.status,
    failures,
    deflated: oos?.deflatedSharpe,
    generation: draft?.generation ?? experiment?.generation,
    hasBoss: Boolean(context.bossText ?? draft?.bossDirective),
    morale: context.morale,
    targetRole,
    targetAgentId: context.targetAgentId,
    witnessAgentId: witness?.id
  };
}
