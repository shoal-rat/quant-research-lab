import { AgentRole, AgentState } from "../../types";
import { assetUrl } from "./publicAsset";

export interface GeneratedAgentManifest {
  id: string;
  displayName: string;
  role: AgentRole;
  scale: number;
  anchor: { x: number; y: number };
  avatar: string;
  sprites: Record<string, string>;
}

function legacyAsset(agentId: string, file: string): string {
  return assetUrl(`assets/generated/agents/${agentId}/${file}.png`);
}

function legacyAgent(
  id: string,
  displayName: string,
  role: AgentRole,
  scale: number,
  spriteNames: string[]
): GeneratedAgentManifest {
  return {
    id,
    displayName,
    role,
    scale,
    anchor: { x: 0.5, y: 0.92 },
    avatar: legacyAsset(id, "avatar"),
    sprites: Object.fromEntries(spriteNames.map((name) => [name, legacyAsset(id, name)]))
  };
}

export const generatedAgentManifest: GeneratedAgentManifest[] = [
  legacyAgent("strategy-researcher", "Strategy Researcher", "strategy_researcher", 1.03, [
    "idle",
    "walk",
    "thinking",
    "writing-whiteboard",
    "debating",
    "excited",
    "confused"
  ]),
  legacyAgent("code-engineer", "Code Engineer", "code_engineer", 1.02, [
    "idle",
    "walk",
    "coding",
    "frustrated",
    "tired",
    "fixed-bug",
    "drinking-coffee"
  ]),
  legacyAgent("risk-reviewer", "Risk Reviewer", "risk_reviewer", 1.04, [
    "idle",
    "walk",
    "reviewing",
    "angry",
    "rejecting",
    "table-slam",
    "serious"
  ]),
  legacyAgent("skeptic-researcher", "Skeptic Researcher", "skeptic_researcher", 1.02, [
    "idle",
    "walk",
    "skeptical",
    "whispering",
    "smirking",
    "deep-thinking",
    "debating"
  ]),
  legacyAgent("experiment-manager", "Experiment Manager", "experiment_manager", 1.05, [
    "idle",
    "walk",
    "presenting",
    "calling-meeting",
    "deciding",
    "updating-screen",
    "confident"
  ]),
  legacyAgent("data-manager", "Data Manager", "data_manager", 1.02, [
    "idle",
    "walk",
    "checking-data",
    "carrying-files",
    "confused",
    "problem-solved",
    "inspecting-timestamp"
  ])
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
