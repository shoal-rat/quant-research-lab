import { AgentProfile, AgentRuntime, AgentState, LoopPhase, OfficeAreaId, SpeechBubble } from "../types";
import { officeAreaBounds } from "../lib/office/sceneLayout";
import { clamp, seededRandom } from "./random";

export const OFFICE_AREAS: Record<OfficeAreaId, { label: string; x: number; y: number; w: number; h: number }> =
  officeAreaBounds;

const dailyStates: AgentState[] = ["idle", "walking", "thinking", "whispering", "drinking_tea", "checking_chart"];
const dailyAreas: OfficeAreaId[] = ["workstations", "whiteboard", "meeting", "tea", "data_cabinet", "window"];

function areaPoint(area: OfficeAreaId, agentIndex: number, jitterSeed: string): { x: number; y: number } {
  const rng = seededRandom(`${area}-${agentIndex}-${jitterSeed}`);
  const bounds = OFFICE_AREAS[area];
  const x = bounds.x + 4 + rng() * Math.max(1, bounds.w - 8);
  const y = bounds.y + 8 + rng() * Math.max(1, bounds.h - 11);
  return {
    x: clamp(x + (agentIndex % 3) * 1.2, 5, 95),
    y: clamp(y + Math.floor(agentIndex / 3) * 1.4, 17, 88)
  };
}

export function initialAgentRuntime(agents: AgentProfile[]): Record<string, AgentRuntime> {
  const seedAreas: OfficeAreaId[] = ["whiteboard", "workstations", "meeting", "data_cabinet", "leaderboard", "tea"];
  return Object.fromEntries(
    agents.map((agent, index) => {
      const area = seedAreas[index % seedAreas.length];
      const point = areaPoint(area, index, "initial");
      return [
        agent.id,
        {
          agentId: agent.id,
          state: agent.defaultEmotion,
          area,
          x: point.x,
          y: point.y,
          emotionNote: agent.defaultEmotion,
          priorityUntil: 0
        }
      ];
    })
  );
}

export function runtimeForPhase(
  phase: LoopPhase,
  agents: AgentProfile[],
  previous: Record<string, AgentRuntime>,
  timestamp: number
): Record<string, AgentRuntime> {
  const roleTargets: Partial<Record<AgentProfile["role"], { area: OfficeAreaId; state: AgentState; note: string }>> = {
    strategy_researcher:
      phase === "proposing" || phase === "human_review"
        ? { area: "whiteboard", state: "thinking", note: "writing hypothesis" }
        : phase === "debate"
          ? { area: "meeting", state: "debating", note: "defending signal" }
          : phase === "saved"
            ? { area: "leaderboard", state: "excited", note: "checking rank" }
            : undefined,
    data_manager:
      phase === "data_check"
        ? { area: "data_cabinet", state: "checking_chart", note: "auditing timestamps" }
        : phase === "backtesting"
          ? { area: "backtest_computer", state: "checking_chart", note: "checking data join" }
          : undefined,
    code_engineer:
      phase === "coding"
        ? { area: "workstations", state: "coding", note: "writing factor code" }
        : phase === "backtesting"
          ? { area: "backtest_computer", state: "checking_chart", note: "watching run" }
          : phase === "risk_review"
            ? { area: "workstations", state: "tired", note: "waiting for risk desk" }
            : undefined,
    risk_reviewer:
      phase === "human_review"
        ? { area: "meeting", state: "checking_chart", note: "pre-reviewing idea" }
        : phase === "risk_review"
        ? { area: "meeting", state: "angry", note: "reviewing flaws" }
        : phase === "debate"
          ? { area: "meeting", state: "debating", note: "presenting risk" }
          : undefined,
    skeptic_researcher:
      phase === "debate"
        ? { area: "meeting", state: "debating", note: "challenging result" }
        : phase === "risk_review"
          ? { area: "whiteboard", state: "whispering", note: "checking luck" }
          : undefined,
    experiment_manager:
      phase === "decision" || phase === "saved"
        ? { area: "leaderboard", state: "checking_chart", note: "recording decision" }
        : phase === "debate"
          ? { area: "meeting", state: "debating", note: "chairing debate" }
          : undefined
  };

  return Object.fromEntries(
    agents.map((agent, index) => {
      const target = roleTargets[agent.role];
      const current = previous[agent.id];
      if (target) {
        const point = areaPoint(target.area, index, `${phase}-${timestamp}`);
        return [
          agent.id,
          {
            agentId: agent.id,
            state: target.state,
            area: target.area,
            x: point.x,
            y: point.y,
            emotionNote: target.note,
            message: current?.message,
            priorityUntil: timestamp + 4500
          }
        ];
      }
      return [agent.id, current ?? initialAgentRuntime([agent])[agent.id]];
    })
  );
}

export function tickDailyBehavior(
  agents: AgentProfile[],
  previous: Record<string, AgentRuntime>,
  timestamp: number,
  casualChatter: boolean
): Record<string, AgentRuntime> {
  return Object.fromEntries(
    agents.map((agent, index) => {
      const current = previous[agent.id] ?? initialAgentRuntime([agent])[agent.id];
      if (current.priorityUntil > timestamp || !agent.visible) {
        return [agent.id, current];
      }
      const rng = seededRandom(`${agent.id}-${Math.floor(timestamp / 2900)}`);
      if (rng() < 0.42) {
        return [agent.id, current];
      }
      const area = dailyAreas[Math.floor(rng() * dailyAreas.length) % dailyAreas.length];
      const state =
        casualChatter && agent.casualChatter
          ? dailyStates[Math.floor(rng() * dailyStates.length) % dailyStates.length]
          : agent.defaultEmotion;
      const point = areaPoint(area, index, `daily-${timestamp}`);
      return [
        agent.id,
        {
          ...current,
          state,
          area,
          x: point.x,
          y: point.y,
          emotionNote: state,
          priorityUntil: timestamp + 1200
        }
      ];
    })
  );
}

export function attachBubbleToRuntime(
  bubbles: SpeechBubble[],
  runtime: Record<string, AgentRuntime>
): Record<string, AgentRuntime> {
  const next = { ...runtime };
  bubbles.forEach((bubble) => {
    const current = next[bubble.agentId];
    if (current) {
      next[bubble.agentId] = { ...current, message: bubble.message, state: bubble.tone };
    }
  });
  return next;
}
