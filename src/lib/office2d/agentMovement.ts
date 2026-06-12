import { Agent2DExpression, FacingDirection } from "../assets/agent2dAssetManifest";
import { AgentProfile, AgentRuntime, ExperimentRecord, LoopPhase, OfficeAreaId, ResearchLoopState } from "../../types";
import { office2DZones, Office2DPoint, Office2DZoneId } from "./mapLayout";

export type Agent2DActivity = "idle" | "walking" | "working" | "debating" | "reacting";
export type Bubble2DType = "normal" | "thought" | "whisper" | "shout" | "explosion" | "sweat" | "debate" | "system";

export interface Agent2DRenderState {
  agentId: string;
  zone: Office2DZoneId;
  targetZone: Office2DZoneId;
  x: number;
  y: number;
  facing: FacingDirection;
  activity: Agent2DActivity;
  spriteName: string;
  expression?: Agent2DExpression;
  message?: string;
  bubbleType: Bubble2DType;
  bubbleShift?: "left" | "right";
  zIndex: number;
}

const idleZoneByArea: Record<OfficeAreaId, Office2DZoneId> = {
  workstations: "workstations",
  whiteboard: "whiteboard",
  meeting: "meeting",
  tea: "tea",
  data_cabinet: "data_cabinet",
  leaderboard: "leaderboard",
  backtest_computer: "backtest_computer",
  window: "window"
};

const fallbackZones: Record<AgentProfile["role"], Office2DZoneId> = {
  strategy_researcher: "whiteboard",
  code_engineer: "workstations",
  risk_reviewer: "meeting",
  skeptic_researcher: "meeting",
  experiment_manager: "manager_desk",
  data_manager: "data_cabinet"
};

function hasRiskWarnings(experiment?: ExperimentRecord): boolean {
  return Boolean(experiment?.riskReview.checks.some((check) => check.status !== "pass"));
}

function failedCost(experiment?: ExperimentRecord): boolean {
  return Boolean(experiment && experiment.outOfSampleResult.returnAfterCosts < 0);
}

function pointForZone(zone: Office2DZoneId, index: number): Office2DPoint {
  const positions = office2DZones[zone].idlePositions;
  const base = positions[index % positions.length] ?? office2DZones[zone].entry;
  const rowOffset = Math.floor(index / Math.max(1, positions.length));
  return { x: base.x + rowOffset * 26, y: base.y + rowOffset * 14 };
}

function facingForZone(zone: Office2DZoneId, activity: Agent2DActivity): FacingDirection {
  if (activity === "walking") return "front";
  if (zone === "leaderboard" || zone === "whiteboard" || zone === "data_cabinet") return "back";
  if (zone === "workstations" || zone === "backtest_computer") return "back";
  if (zone === "tea") return "left";
  if (zone === "manager_desk") return "right";
  return "front";
}

function bubbleTypeFromState(state: AgentRuntime["state"], phase: LoopPhase, role: AgentProfile["role"]): Bubble2DType {
  if (role === "experiment_manager" && (phase === "decision" || phase === "saved")) return "system";
  if (phase === "debate") return "debate";
  if (state === "whispering") return "whisper";
  if (state === "thinking") return "thought";
  if (state === "excited") return "shout";
  if (state === "angry") return "explosion";
  if (state === "confused" || state === "tired") return "sweat";
  return "normal";
}

export function phaseAction(
  agent: AgentProfile,
  loop: ResearchLoopState,
  experiment?: ExperimentRecord
): Pick<Agent2DRenderState, "targetZone" | "activity" | "spriteName" | "expression"> | undefined {
  const phase = loop.phase;
  const warnings = hasRiskWarnings(experiment);
  const rejected = experiment?.status === "rejected" || experiment?.status === "failed_to_run";
  const candidate = experiment?.status === "candidate";
  const costFail = failedCost(experiment);

  if (agent.role === "strategy_researcher") {
    if (phase === "proposing") return { targetZone: "whiteboard", activity: "working", spriteName: "writing-whiteboard" };
    if (phase === "coding") return { targetZone: "workstations", activity: "working", spriteName: "thinking" };
    if (phase === "backtesting") return { targetZone: "backtest_computer", activity: "reacting", spriteName: "eureka" };
    if (phase === "risk_review" && warnings) return { targetZone: "meeting", activity: "reacting", spriteName: "debating", expression: "worried" };
    if (phase === "debate") return { targetZone: "meeting", activity: "debating", spriteName: "debating" };
    if (phase === "decision" && candidate) return { targetZone: "leaderboard", activity: "reacting", spriteName: "eureka", expression: "delighted" };
    if (phase === "decision" && costFail) return { targetZone: "meeting", activity: "reacting", spriteName: "debating", expression: "embarrassed" };
    if (phase === "saved" && rejected) return { targetZone: "meeting", activity: "reacting", spriteName: "thinking", expression: "crying" };
  }

  if (agent.role === "code_engineer") {
    if (phase === "coding") return { targetZone: "workstations", activity: "working", spriteName: "coding" };
    if (phase === "backtesting") return { targetZone: "backtest_computer", activity: "working", spriteName: "deploy-victory" };
    if (phase === "risk_review" && experiment?.status === "failed_to_run") {
      return { targetZone: "workstations", activity: "reacting", spriteName: "bug-meltdown", expression: "shocked" };
    }
    if (phase === "decision" && candidate) {
      return { targetZone: "workstations", activity: "reacting", spriteName: "deploy-victory", expression: "delighted" };
    }
  }

  if (agent.role === "risk_reviewer") {
    if (phase === "risk_review") {
      return {
        targetZone: "meeting",
        activity: warnings ? "reacting" : "working",
        spriteName: warnings ? "audit-alarm" : "reviewing",
        expression: warnings ? "angry" : undefined
      };
    }
    if (phase === "decision" && rejected) return { targetZone: "meeting", activity: "reacting", spriteName: "rejection-stamp" };
    if (phase === "decision" && candidate) return { targetZone: "leaderboard", activity: "reacting", spriteName: "controlled-approval" };
    if (phase === "debate") return { targetZone: "meeting", activity: "debating", spriteName: "reviewing" };
  }

  if (agent.role === "skeptic_researcher") {
    if (phase === "risk_review" && warnings) return { targetZone: "whiteboard", activity: "reacting", spriteName: "gotcha", expression: "smug" };
    if (phase === "debate") return { targetZone: "meeting", activity: "debating", spriteName: "skeptical" };
    if (phase === "decision" && rejected) return { targetZone: "meeting", activity: "reacting", spriteName: "gotcha", expression: "smug" };
    if (phase === "decision" && costFail) return { targetZone: "meeting", activity: "reacting", spriteName: "silent-judgment", expression: "smug" };
  }

  if (agent.role === "experiment_manager") {
    if (phase === "proposing") return { targetZone: "meeting", activity: "working", spriteName: "presenting" };
    if (phase === "debate") return { targetZone: "meeting", activity: "debating", spriteName: "calling-meeting" };
    if (phase === "decision") return { targetZone: "leaderboard", activity: "reacting", spriteName: "final-verdict", expression: candidate ? "determined" : undefined };
    if (phase === "saved") return { targetZone: "leaderboard", activity: "reacting", spriteName: "team-encourage" };
  }

  if (agent.role === "data_manager") {
    if (phase === "data_check") {
      return {
        targetZone: "data_cabinet",
        activity: "working",
        spriteName: warnings ? "dirty-timestamp" : "checking-data",
        expression: warnings ? "worried" : undefined
      };
    }
    if (phase === "risk_review" && warnings) {
      return { targetZone: "data_cabinet", activity: "reacting", spriteName: "missing-data-panic", expression: "shocked" };
    }
    if (phase === "saved") return { targetZone: "data_cabinet", activity: "working", spriteName: "clean-data-pride" };
  }

  return undefined;
}

function runtimeSpriteName(runtime: AgentRuntime, facing: FacingDirection): string {
  if (runtime.state === "walking") return `walk-${facing}`;
  if (runtime.state === "idle") return `idle-${facing}`;
  if (runtime.state === "drinking_tea") return "idle-front";
  if (runtime.state === "thinking") return "thinking";
  if (runtime.state === "coding") return "coding";
  if (runtime.state === "debating") return "debating";
  if (runtime.state === "whispering") return "whispering";
  if (runtime.state === "checking_chart") return "checking-data";
  if (runtime.state === "excited") return "eureka";
  if (runtime.state === "angry") return "audit-alarm";
  if (runtime.state === "tired") return "tired";
  if (runtime.state === "confused") return "dirty-timestamp";
  return `idle-${facing}`;
}

export function deriveAgent2DState(
  agent: AgentProfile,
  runtime: AgentRuntime | undefined,
  visibleIndex: number,
  loop: ResearchLoopState,
  currentExperiment?: ExperimentRecord
): Agent2DRenderState {
  const runtimeZone = runtime ? idleZoneByArea[runtime.area] : undefined;
  const baseZone = runtimeZone ?? fallbackZones[agent.role];
  const priority = phaseAction(agent, loop, currentExperiment);
  const zone = priority?.targetZone ?? baseZone;
  const position = pointForZone(zone, visibleIndex);
  const activity: Agent2DActivity =
    priority?.activity ?? (runtime?.state === "walking" ? "walking" : runtime?.state === "debating" ? "debating" : "idle");
  const facing = facingForZone(zone, activity);
  const spriteName = priority?.spriteName ?? (runtime ? runtimeSpriteName(runtime, facing) : `idle-${facing}`);
  const expression = priority?.expression;
  const message = runtime?.message;

  return {
    agentId: agent.id,
    zone,
    targetZone: zone,
    x: position.x,
    y: position.y,
    facing,
    activity,
    spriteName,
    expression,
    message,
    bubbleType: bubbleTypeFromState(runtime?.state ?? agent.defaultEmotion, loop.phase, agent.role),
    zIndex: Math.round(position.y)
  };
}

