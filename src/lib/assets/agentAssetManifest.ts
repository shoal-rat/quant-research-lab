import { AgentRole, AgentState } from "../../types";

export interface GeneratedAgentManifest {
  id: string;
  displayName: string;
  role: AgentRole;
  scale: number;
  anchor: { x: number; y: number };
  avatar: string;
  sprites: Record<string, string>;
}

export const generatedAgentManifest: GeneratedAgentManifest[] = [
  {
    id: "strategy-researcher",
    displayName: "Strategy Researcher",
    role: "strategy_researcher",
    scale: 1.03,
    anchor: { x: 0.5, y: 0.92 },
    avatar: "/assets/generated/agents/strategy-researcher/avatar.png",
    sprites: {
      idle: "/assets/generated/agents/strategy-researcher/idle.png",
      walk: "/assets/generated/agents/strategy-researcher/walk.png",
      thinking: "/assets/generated/agents/strategy-researcher/thinking.png",
      "writing-whiteboard": "/assets/generated/agents/strategy-researcher/writing-whiteboard.png",
      debating: "/assets/generated/agents/strategy-researcher/debating.png",
      excited: "/assets/generated/agents/strategy-researcher/excited.png",
      confused: "/assets/generated/agents/strategy-researcher/confused.png"
    }
  },
  {
    id: "code-engineer",
    displayName: "Code Engineer",
    role: "code_engineer",
    scale: 1.02,
    anchor: { x: 0.5, y: 0.92 },
    avatar: "/assets/generated/agents/code-engineer/avatar.png",
    sprites: {
      idle: "/assets/generated/agents/code-engineer/idle.png",
      walk: "/assets/generated/agents/code-engineer/walk.png",
      coding: "/assets/generated/agents/code-engineer/coding.png",
      frustrated: "/assets/generated/agents/code-engineer/frustrated.png",
      tired: "/assets/generated/agents/code-engineer/tired.png",
      "fixed-bug": "/assets/generated/agents/code-engineer/fixed-bug.png",
      "drinking-coffee": "/assets/generated/agents/code-engineer/drinking-coffee.png"
    }
  },
  {
    id: "risk-reviewer",
    displayName: "Risk Reviewer",
    role: "risk_reviewer",
    scale: 1.04,
    anchor: { x: 0.5, y: 0.92 },
    avatar: "/assets/generated/agents/risk-reviewer/avatar.png",
    sprites: {
      idle: "/assets/generated/agents/risk-reviewer/idle.png",
      walk: "/assets/generated/agents/risk-reviewer/walk.png",
      reviewing: "/assets/generated/agents/risk-reviewer/reviewing.png",
      angry: "/assets/generated/agents/risk-reviewer/angry.png",
      rejecting: "/assets/generated/agents/risk-reviewer/rejecting.png",
      "table-slam": "/assets/generated/agents/risk-reviewer/table-slam.png",
      serious: "/assets/generated/agents/risk-reviewer/serious.png"
    }
  },
  {
    id: "skeptic-researcher",
    displayName: "Skeptic Researcher",
    role: "skeptic_researcher",
    scale: 1.02,
    anchor: { x: 0.5, y: 0.92 },
    avatar: "/assets/generated/agents/skeptic-researcher/avatar.png",
    sprites: {
      idle: "/assets/generated/agents/skeptic-researcher/idle.png",
      walk: "/assets/generated/agents/skeptic-researcher/walk.png",
      skeptical: "/assets/generated/agents/skeptic-researcher/skeptical.png",
      whispering: "/assets/generated/agents/skeptic-researcher/whispering.png",
      smirking: "/assets/generated/agents/skeptic-researcher/smirking.png",
      "deep-thinking": "/assets/generated/agents/skeptic-researcher/deep-thinking.png",
      debating: "/assets/generated/agents/skeptic-researcher/debating.png"
    }
  },
  {
    id: "experiment-manager",
    displayName: "Experiment Manager",
    role: "experiment_manager",
    scale: 1.05,
    anchor: { x: 0.5, y: 0.92 },
    avatar: "/assets/generated/agents/experiment-manager/avatar.png",
    sprites: {
      idle: "/assets/generated/agents/experiment-manager/idle.png",
      walk: "/assets/generated/agents/experiment-manager/walk.png",
      presenting: "/assets/generated/agents/experiment-manager/presenting.png",
      "calling-meeting": "/assets/generated/agents/experiment-manager/calling-meeting.png",
      deciding: "/assets/generated/agents/experiment-manager/deciding.png",
      "updating-screen": "/assets/generated/agents/experiment-manager/updating-screen.png",
      confident: "/assets/generated/agents/experiment-manager/confident.png"
    }
  },
  {
    id: "data-manager",
    displayName: "Data Manager",
    role: "data_manager",
    scale: 1.02,
    anchor: { x: 0.5, y: 0.92 },
    avatar: "/assets/generated/agents/data-manager/avatar.png",
    sprites: {
      idle: "/assets/generated/agents/data-manager/idle.png",
      walk: "/assets/generated/agents/data-manager/walk.png",
      "checking-data": "/assets/generated/agents/data-manager/checking-data.png",
      "carrying-files": "/assets/generated/agents/data-manager/carrying-files.png",
      confused: "/assets/generated/agents/data-manager/confused.png",
      "problem-solved": "/assets/generated/agents/data-manager/problem-solved.png",
      "inspecting-timestamp": "/assets/generated/agents/data-manager/inspecting-timestamp.png"
    }
  }
];

const baseStateMap: Record<AgentState, string> = {
  idle: "idle",
  walking: "walk",
  thinking: "thinking",
  coding: "coding",
  debating: "debating",
  whispering: "whispering",
  drinking_tea: "drinking-coffee",
  checking_chart: "checking-data",
  excited: "excited",
  angry: "angry",
  tired: "tired",
  confused: "confused"
};

const perAgentStateMap: Partial<Record<AgentRole, Partial<Record<AgentState, string>>>> = {
  strategy_researcher: {
    coding: "writing-whiteboard",
    checking_chart: "thinking",
    drinking_tea: "idle"
  },
  code_engineer: {
    thinking: "coding",
    debating: "frustrated",
    whispering: "tired",
    drinking_tea: "drinking-coffee",
    checking_chart: "coding",
    excited: "fixed-bug",
    angry: "frustrated",
    confused: "frustrated"
  },
  risk_reviewer: {
    thinking: "reviewing",
    coding: "reviewing",
    debating: "reviewing",
    whispering: "serious",
    drinking_tea: "serious",
    checking_chart: "reviewing",
    excited: "serious",
    confused: "rejecting"
  },
  skeptic_researcher: {
    thinking: "deep-thinking",
    coding: "deep-thinking",
    checking_chart: "skeptical",
    drinking_tea: "smirking",
    excited: "smirking",
    angry: "debating",
    confused: "skeptical"
  },
  experiment_manager: {
    thinking: "deciding",
    coding: "updating-screen",
    debating: "calling-meeting",
    whispering: "deciding",
    drinking_tea: "idle",
    checking_chart: "updating-screen",
    excited: "confident",
    angry: "calling-meeting",
    tired: "deciding",
    confused: "deciding"
  },
  data_manager: {
    thinking: "inspecting-timestamp",
    coding: "checking-data",
    debating: "carrying-files",
    whispering: "inspecting-timestamp",
    drinking_tea: "idle",
    checking_chart: "checking-data",
    excited: "problem-solved",
    angry: "confused",
    tired: "confused"
  }
};

export function getGeneratedAgentManifest(role: AgentRole): GeneratedAgentManifest | undefined {
  return generatedAgentManifest.find((agent) => agent.role === role);
}

export function stateToSpriteName(role: AgentRole, state: AgentState): string {
  return perAgentStateMap[role]?.[state] ?? baseStateMap[state];
}

export function resolveAgentSprite(role: AgentRole, state: AgentState): { manifest?: GeneratedAgentManifest; spriteName: string; src?: string } {
  const manifest = getGeneratedAgentManifest(role);
  const spriteName = stateToSpriteName(role, state);
  const src = manifest?.sprites[spriteName] ?? manifest?.sprites.idle;
  return { manifest, spriteName: manifest?.sprites[spriteName] ? spriteName : "idle", src };
}
