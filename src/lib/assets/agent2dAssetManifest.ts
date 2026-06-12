import { AgentRole } from "../../types";

export type Agent2DId =
  | "strategy-researcher"
  | "code-engineer"
  | "risk-reviewer"
  | "skeptic-researcher"
  | "experiment-manager"
  | "data-manager";

export type FacingDirection = "front" | "back" | "left" | "right";

export type Agent2DExpression =
  | "delighted"
  | "shocked"
  | "angry"
  | "smug"
  | "worried"
  | "crying"
  | "embarrassed"
  | "determined";

export interface Agent2DManifest {
  id: Agent2DId;
  role: AgentRole;
  displayName: string;
  scale: number;
  anchor: { x: number; y: number };
  avatar: string;
  sprites: Record<string, string>;
  expressions: Record<Agent2DExpression, string>;
}

const agentDefinitions: Array<{
  id: Agent2DId;
  role: AgentRole;
  displayName: string;
  workSprites: string[];
}> = [
  {
    id: "strategy-researcher",
    role: "strategy_researcher",
    displayName: "Strategy Researcher",
    workSprites: ["thinking", "writing-whiteboard", "debating", "eureka"]
  },
  {
    id: "code-engineer",
    role: "code_engineer",
    displayName: "Code Engineer",
    workSprites: ["coding", "bug-meltdown", "tired", "deploy-victory"]
  },
  {
    id: "risk-reviewer",
    role: "risk_reviewer",
    displayName: "Risk Reviewer",
    workSprites: ["reviewing", "audit-alarm", "rejection-stamp", "controlled-approval"]
  },
  {
    id: "skeptic-researcher",
    role: "skeptic_researcher",
    displayName: "Skeptic Researcher",
    workSprites: ["skeptical", "whispering", "gotcha", "silent-judgment"]
  },
  {
    id: "experiment-manager",
    role: "experiment_manager",
    displayName: "Experiment Manager",
    workSprites: ["presenting", "calling-meeting", "final-verdict", "team-encourage"]
  },
  {
    id: "data-manager",
    role: "data_manager",
    displayName: "Data Manager",
    workSprites: ["checking-data", "carrying-files", "dirty-timestamp", "missing-data-panic", "clean-data-pride"]
  }
];

export const directionalSpriteNames = [
  "idle-front",
  "idle-back",
  "idle-left",
  "idle-right",
  "walk-front",
  "walk-back",
  "walk-left",
  "walk-right"
] as const;

export const expressionNames: Agent2DExpression[] = [
  "delighted",
  "shocked",
  "angry",
  "smug",
  "worried",
  "crying",
  "embarrassed",
  "determined"
];

function spritePath(agentId: Agent2DId, sprite: string): string {
  return `/assets/generated/agents-2d/${agentId}/${sprite}.png`;
}

function expressionPath(agentId: Agent2DId, expression: Agent2DExpression): string {
  return `/assets/generated/agents-2d/${agentId}/expressions/${expression}.png`;
}

export const generatedAgent2DManifest: Agent2DManifest[] = agentDefinitions.map((definition) => ({
  id: definition.id,
  role: definition.role,
  displayName: definition.displayName,
  scale: 1,
  anchor: { x: 0.5, y: 0.9 },
  avatar: `/assets/generated/agents-2d/${definition.id}/avatar.png`,
  sprites: Object.fromEntries(
    [...directionalSpriteNames, ...definition.workSprites].map((sprite) => [sprite, spritePath(definition.id, sprite)])
  ),
  expressions: Object.fromEntries(
    expressionNames.map((expression) => [expression, expressionPath(definition.id, expression)])
  ) as Record<Agent2DExpression, string>
}));

const manifestByRole = new Map<AgentRole, Agent2DManifest>(generatedAgent2DManifest.map((agent) => [agent.role, agent]));

export function getGeneratedAgent2DManifest(role: AgentRole): Agent2DManifest | undefined {
  return manifestByRole.get(role);
}

export function resolveAgent2DSprite(
  role: AgentRole,
  spriteName: string | undefined,
  facing: FacingDirection,
  expression?: Agent2DExpression
): string | undefined {
  const manifest = getGeneratedAgent2DManifest(role);
  if (!manifest) return undefined;
  if (expression && manifest.expressions[expression]) return manifest.expressions[expression];
  if (spriteName && manifest.sprites[spriteName]) return manifest.sprites[spriteName];
  return manifest.sprites[`idle-${facing}`] ?? manifest.sprites["idle-front"];
}

