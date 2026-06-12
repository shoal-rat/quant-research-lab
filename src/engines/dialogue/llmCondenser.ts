import Anthropic from "@anthropic-ai/sdk";
import { AgentProfile, AgentState, ConversationLine, ConversationScript, ExperimentRecord, Settings } from "../../types";

// Condenses real research-loop facts into livelier in-character dialogue using
// a small, cheap model (Claude Haiku 4.5 or an OpenAI mini/instant model),
// called directly from the browser. Falls back to the local script on any
// failure so the office never goes silent.

const TONES: AgentState[] = [
  "idle",
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

const CACHE = new Map<string, ConversationLine[]>();
const CACHE_LIMIT = 60;
let anthropicClient: Anthropic | null = null;
let anthropicClientKey = "";

interface CondenseFacts {
  topicKey: string;
  phase: string;
  experiment?: ExperimentRecord;
}

function factsFor(script: ConversationScript, facts: CondenseFacts, agents: AgentProfile[]): string {
  const participants = agents
    .filter((agent) => script.participantIds.includes(agent.id))
    .map((agent) => `${agent.id} = ${agent.name}, ${agent.role.replaceAll("_", " ")}: ${agent.personality}`);
  const experiment = facts.experiment;
  const numbers = experiment
    ? {
        strategy: experiment.strategyName,
        family: experiment.familyKey,
        status: experiment.status,
        oosSharpe: experiment.outOfSampleResult.sharpeRatio,
        afterCostReturn: experiment.outOfSampleResult.returnAfterCosts,
        maxDrawdown: experiment.outOfSampleResult.maxDrawdown,
        deflatedSharpeProb: experiment.outOfSampleResult.deflatedSharpe,
        trials: experiment.outOfSampleResult.trialsAtDiscovery,
        poolCorrelation: experiment.outOfSampleResult.alphaPoolCorrelation,
        failedChecks: experiment.riskReview.checks.filter((check) => check.status === "fail").map((check) => check.label),
        ideaReasoning: experiment.ideaReasoning?.slice(0, 3)
      }
    : undefined;
  return JSON.stringify({
    topic: facts.topicKey,
    phase: facts.phase,
    participants,
    numbers,
    draftLines: script.lines.map((entry) => ({ agentId: entry.agentId, text: entry.text }))
  });
}

function linesSchema(participantIds: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            agentId: { type: "string", enum: participantIds },
            text: { type: "string" },
            tone: { type: "string", enum: TONES }
          },
          required: ["agentId", "text", "tone"],
          additionalProperties: false
        }
      }
    },
    required: ["lines"],
    additionalProperties: false
  };
}

const SYSTEM_PROMPT =
  "You write dialogue for a chibi anime quant research office. Rewrite the draft lines into a sharper, funnier exchange between the listed characters. Rules: keep every numeric fact exactly as given (Sharpe, percentages, trial counts); each line under 110 characters; characters genuinely respond to each other, not to the audience; stay in personality; 3 to 5 lines total; same language as the draft.";

function validate(lines: unknown, participantIds: string[]): ConversationLine[] | null {
  if (!Array.isArray(lines) || lines.length < 2) return null;
  const cleaned: ConversationLine[] = [];
  for (const entry of lines.slice(0, 6)) {
    if (!entry || typeof entry !== "object") return null;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.agentId !== "string" || !participantIds.includes(candidate.agentId)) return null;
    if (typeof candidate.text !== "string" || candidate.text.length === 0) return null;
    const tone = TONES.includes(candidate.tone as AgentState) ? (candidate.tone as AgentState) : "debating";
    cleaned.push({ agentId: candidate.agentId, text: candidate.text.slice(0, 140), tone });
  }
  return cleaned;
}

async function condenseWithAnthropic(
  script: ConversationScript,
  facts: CondenseFacts,
  agents: AgentProfile[],
  apiKey: string
): Promise<ConversationLine[] | null> {
  if (!anthropicClient || anthropicClientKey !== apiKey) {
    anthropicClient = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 9000 });
    anthropicClientKey = apiKey;
  }
  const response = await anthropicClient.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: linesSchema(script.participantIds) } },
    messages: [{ role: "user", content: factsFor(script, facts, agents) }]
  });
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  const parsed = JSON.parse(textBlock.text) as { lines?: unknown };
  return validate(parsed.lines, script.participantIds);
}

async function condenseWithOpenAI(
  script: ConversationScript,
  facts: CondenseFacts,
  agents: AgentProfile[],
  apiKey: string
): Promise<ConversationLine[] | null> {
  // Responses API with the cheapest current OpenAI model; reasoning effort
  // "minimal" keeps invisible reasoning tokens (and latency) near zero.
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-5.4-nano",
        store: false,
        reasoning: { effort: "minimal" },
        max_output_tokens: 700,
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: factsFor(script, facts, agents) }
        ],
        text: {
          format: { type: "json_schema", name: "dialogue", strict: true, schema: linesSchema(script.participantIds) }
        }
      })
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
    };
    const content =
      payload.output_text ??
      payload.output?.find((item) => item.type === "message")?.content?.find((block) => block.type === "output_text")?.text;
    if (!content) return null;
    const parsed = JSON.parse(content) as { lines?: unknown };
    return validate(parsed.lines, script.participantIds);
  } finally {
    window.clearTimeout(timer);
  }
}

export async function condenseConversation(
  script: ConversationScript,
  facts: CondenseFacts,
  agents: AgentProfile[],
  settings: Settings
): Promise<ConversationLine[] | null> {
  const backend = settings.dialogueBackend;
  if (backend === "local") return null;
  const cacheKey = `${backend}-${facts.topicKey}-${facts.experiment?.id ?? "none"}-${script.lines[0]?.text.slice(0, 24) ?? ""}`;
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;
  try {
    let lines: ConversationLine[] | null = null;
    if (backend === "anthropic" && settings.anthropicApiKey) {
      lines = await condenseWithAnthropic(script, facts, agents, settings.anthropicApiKey);
    } else if (backend === "openai" && settings.openaiApiKey) {
      lines = await condenseWithOpenAI(script, facts, agents, settings.openaiApiKey);
    }
    if (lines && lines.length >= 2) {
      if (CACHE.size > CACHE_LIMIT) CACHE.clear();
      CACHE.set(cacheKey, lines);
      return lines;
    }
    return null;
  } catch {
    return null;
  }
}
