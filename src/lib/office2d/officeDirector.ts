import {
  AgentProfile,
  AgentState,
  ConversationLine,
  ConversationScript,
  ExperimentRecord,
  LoopPhase,
  ResearchLoopState
} from "../../types";
import { Agent2DExpression, FacingDirection } from "../assets/agent2dAssetManifest";
import { Agent2DActivity, Agent2DRenderState, Bubble2DType, phaseAction } from "./agentMovement";
import { office2DZones, Office2DPoint, Office2DZoneId } from "./mapLayout";
import { buildWaypointPath } from "./pathfinding";

// The OfficeDirector owns all character presentation state: positions,
// walking paths, conversations, reactions, and boss-interaction effects.
// React components subscribe to its snapshots; the AppStore feeds it events.

const WALK_SPEED = 195; // map px per second
const ARRIVE_DISTANCE = 14;
const TICK_MS = 110;

export interface BossEffect {
  id: string;
  agentId: string;
  kind: "love" | "whip";
  until: number;
}

interface WalkPlan {
  path: Office2DPoint[];
  index: number;
  onArrive?: () => void;
}

interface Occupation {
  kind: "phase" | "conversation" | "reaction" | "wander";
  spriteName: string;
  activity: Agent2DActivity;
  expression?: Agent2DExpression;
  facing?: FacingDirection;
  until?: number;
}

interface DirectorAgent {
  profile: AgentProfile;
  x: number;
  y: number;
  zone: Office2DZoneId;
  facing: FacingDirection;
  walk?: WalkPlan;
  occupation?: Occupation;
  bubble?: { text: string; type: Bubble2DType; until: number };
  conversationId?: string;
}

interface ActiveConversation {
  script: ConversationScript;
  spotZone?: Office2DZoneId;
  state: "gathering" | "talking";
  lineIndex: number;
  lineUntil: number;
  startedAt: number;
  positions: Map<string, Office2DPoint>;
  upgraded: boolean;
}

export interface DirectorSnapshot {
  version: number;
  agents: Agent2DRenderState[];
  effects: BossEffect[];
  activeTopic?: string;
}

const toneSprite: Partial<Record<AgentState, string>> = {
  thinking: "thinking",
  coding: "coding",
  debating: "debating",
  whispering: "whispering",
  checking_chart: "checking-data",
  excited: "eureka",
  angry: "audit-alarm",
  tired: "tired",
  confused: "dirty-timestamp"
};

const toneBubble: Partial<Record<AgentState, Bubble2DType>> = {
  whispering: "whisper",
  thinking: "thought",
  excited: "shout",
  angry: "explosion",
  confused: "sweat",
  tired: "sweat",
  debating: "debate"
};

const fallbackZones: Record<AgentProfile["role"], Office2DZoneId> = {
  strategy_researcher: "whiteboard",
  code_engineer: "workstations",
  risk_reviewer: "meeting",
  skeptic_researcher: "meeting",
  experiment_manager: "manager_desk",
  data_manager: "data_cabinet"
};

const wanderZones: Office2DZoneId[] = ["tea", "window", "meeting", "whiteboard", "leaderboard", "backtest_computer"];

function facingBetween(from: Office2DPoint, to: Office2DPoint): FacingDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "front" : "back";
}

function zoneIdlePoint(zone: Office2DZoneId, slot: number): Office2DPoint {
  const positions = office2DZones[zone].idlePositions;
  const base = positions[slot % positions.length] ?? office2DZones[zone].entry;
  const ring = Math.floor(slot / positions.length);
  return { x: base.x + ring * 34 - 8 + (slot % 3) * 9, y: base.y + ring * 16 };
}

export class OfficeDirector {
  private agents = new Map<string, DirectorAgent>();
  private conversations: ActiveConversation[] = [];
  private effects: BossEffect[] = [];
  private listeners = new Set<() => void>();
  private snapshot: DirectorSnapshot = { version: 0, agents: [], effects: [] };
  private timer: number | null = null;
  private lastTick = 0;
  private rngState = 12345;
  private lastGossipAt = 0;
  private effectCounter = 0;
  private loopRunning = false;
  private chatterEnabled = true;
  onLineSpoken?: (line: ConversationLine, profile: AgentProfile) => void;
  condense?: (script: ConversationScript) => Promise<ConversationLine[] | null>;

  constructor(profiles: AgentProfile[]) {
    this.setAgents(profiles);
  }

  private random(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  setAgents(profiles: AgentProfile[]): void {
    const seen = new Set<string>();
    profiles.forEach((profile, index) => {
      seen.add(profile.id);
      const existing = this.agents.get(profile.id);
      if (existing) {
        existing.profile = profile;
        return;
      }
      const zone = fallbackZones[profile.role];
      const point = zoneIdlePoint(zone, index % 2);
      this.agents.set(profile.id, {
        profile,
        x: point.x,
        y: point.y,
        zone,
        facing: "front"
      });
    });
    [...this.agents.keys()].forEach((id) => {
      if (!seen.has(id)) this.agents.delete(id);
    });
  }

  start(): void {
    if (this.timer !== null) return;
    this.lastTick = Date.now();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): DirectorSnapshot => this.snapshot;

  setLoopRunning(running: boolean): void {
    this.loopRunning = running;
  }

  setChatterEnabled(enabled: boolean): void {
    this.chatterEnabled = enabled;
  }

  // ---- event intake -------------------------------------------------------

  onPhaseChange(phase: LoopPhase, loop: ResearchLoopState, experiment: ExperimentRecord | undefined, script?: ConversationScript): void {
    // assign role work targets for this phase
    this.agents.forEach((agent) => {
      if (agent.conversationId) return;
      const action = phaseAction(agent.profile, { ...loop, phase }, experiment);
      if (action) {
        this.walkTo(agent, action.targetZone, () => {
          agent.occupation = {
            kind: "phase",
            spriteName: action.spriteName,
            activity: action.activity,
            expression: action.expression
          };
        });
      }
    });
    if (script) {
      this.scheduleConversation(script);
    }
  }

  scheduleConversation(script: ConversationScript): void {
    if (script.lines.length === 0) return;
    const current = this.conversations[0];
    if (current && current.script.priority >= script.priority && Date.now() - current.startedAt < 25000) {
      return; // do not interrupt a same-or-higher priority chat that just started
    }
    this.conversations.forEach((conversation) => this.endConversation(conversation, true));
    this.conversations = [];

    const spotZone = script.spot !== "none" && script.spot in office2DZones ? (script.spot as Office2DZoneId) : undefined;
    const conversation: ActiveConversation = {
      script,
      spotZone,
      state: spotZone ? "gathering" : "talking",
      lineIndex: -1,
      lineUntil: 0,
      startedAt: Date.now(),
      positions: new Map(),
      upgraded: false
    };
    this.conversations.push(conversation);

    if (spotZone) {
      script.participantIds.forEach((agentId, index) => {
        const agent = this.agents.get(agentId);
        if (!agent) return;
        agent.conversationId = script.id;
        const point = zoneIdlePoint(spotZone, index);
        conversation.positions.set(agentId, point);
        this.walkToPoint(agent, spotZone, point);
      });
    } else {
      script.participantIds.forEach((agentId) => {
        const agent = this.agents.get(agentId);
        if (agent) agent.conversationId = script.id;
      });
    }

    // fire the cheap-model condenser; swap lines in if it returns in time
    if (this.condense) {
      void this.condense(script).then((lines) => {
        if (!lines) return;
        const active = this.conversations.find((item) => item.script.id === script.id);
        if (active && active.lineIndex <= 0 && !active.upgraded) {
          active.upgraded = true;
          active.script = { ...active.script, lines };
        }
      });
    }
  }

  bossReaction(kind: "directive" | "love" | "whip", targetAgentId?: string): void {
    const now = Date.now();
    if (kind === "directive") {
      this.agents.forEach((agent) => {
        agent.walk = undefined;
        agent.occupation = {
          kind: "reaction",
          spriteName: "idle-front",
          activity: "reacting",
          expression: this.random() > 0.5 ? "shocked" : "determined",
          facing: "front",
          until: now + 2600
        };
        agent.facing = "front";
      });
      return;
    }
    const target = targetAgentId ? this.agents.get(targetAgentId) : undefined;
    if (!target) return;
    this.effectCounter += 1;
    this.effects.push({
      id: `effect-${this.effectCounter}`,
      agentId: target.profile.id,
      kind,
      until: now + 2400
    });
    target.walk = undefined;
    target.occupation = {
      kind: "reaction",
      spriteName: kind === "love" ? "eureka" : "tired",
      activity: "reacting",
      expression: kind === "love" ? "delighted" : this.random() > 0.5 ? "shocked" : "crying",
      facing: "front",
      until: now + 3000
    };
    target.facing = "front";
  }

  // ---- movement -----------------------------------------------------------

  private walkTo(agent: DirectorAgent, zone: Office2DZoneId, onArrive?: () => void): void {
    const slot = Math.floor(this.random() * 3);
    this.walkToPoint(agent, zone, zoneIdlePoint(zone, slot), onArrive);
  }

  private walkToPoint(agent: DirectorAgent, zone: Office2DZoneId, point: Office2DPoint, onArrive?: () => void): void {
    const waypoints = buildWaypointPath(agent.zone, zone).slice(0, -1);
    const path = [...waypoints, point];
    agent.occupation = undefined;
    agent.walk = { path, index: 0, onArrive };
    agent.zone = zone;
  }

  private advanceWalk(agent: DirectorAgent, dt: number): void {
    const walk = agent.walk;
    if (!walk) return;
    let budget = WALK_SPEED * dt;
    while (budget > 0 && walk.index < walk.path.length) {
      const target = walk.path[walk.index];
      const dx = target.x - agent.x;
      const dy = target.y - agent.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= Math.max(budget, ARRIVE_DISTANCE)) {
        agent.x = target.x;
        agent.y = target.y;
        walk.index += 1;
        budget -= distance;
      } else {
        agent.facing = facingBetween(agent, target);
        agent.x += (dx / distance) * budget;
        agent.y += (dy / distance) * budget;
        budget = 0;
      }
    }
    if (walk.index >= walk.path.length) {
      agent.walk = undefined;
      walk.onArrive?.();
    }
  }

  // ---- conversations ------------------------------------------------------

  private endConversation(conversation: ActiveConversation, abrupt: boolean): void {
    conversation.script.participantIds.forEach((agentId) => {
      const agent = this.agents.get(agentId);
      if (!agent) return;
      agent.conversationId = undefined;
      if (abrupt) agent.bubble = undefined;
      agent.occupation = undefined;
    });
  }

  private tickConversation(now: number): void {
    const conversation = this.conversations[0];
    if (!conversation) return;

    if (conversation.state === "gathering") {
      const allArrived = conversation.script.participantIds.every((agentId) => {
        const agent = this.agents.get(agentId);
        return agent && !agent.walk;
      });
      if (allArrived || now - conversation.startedAt > 9000) {
        conversation.state = "talking";
        conversation.lineUntil = now + 250;
      }
      return;
    }

    if (now < conversation.lineUntil) return;

    conversation.lineIndex += 1;
    const lines = conversation.script.lines;
    if (conversation.lineIndex >= lines.length) {
      this.endConversation(conversation, false);
      this.conversations.shift();
      // disperse: send participants back toward their desks after a beat
      conversation.script.participantIds.forEach((agentId) => {
        const agent = this.agents.get(agentId);
        if (agent && this.random() > 0.45) {
          this.walkTo(agent, fallbackZones[agent.profile.role]);
        }
      });
      return;
    }

    const currentLine = lines[conversation.lineIndex];
    const speaker = this.agents.get(currentLine.agentId);
    if (!speaker) {
      conversation.lineUntil = now;
      return;
    }
    const duration = Math.min(6500, Math.max(2300, 1400 + currentLine.text.length * 46));
    conversation.lineUntil = now + duration;
    speaker.bubble = {
      text: currentLine.text,
      type: toneBubble[currentLine.tone] ?? "normal",
      until: now + duration - 150
    };
    speaker.occupation = {
      kind: "conversation",
      spriteName: toneSprite[currentLine.tone] ?? "idle-front",
      activity: "debating",
      facing: speaker.facing
    };
    this.onLineSpoken?.(currentLine, speaker.profile);

    // listeners turn toward the speaker
    conversation.script.participantIds.forEach((agentId) => {
      if (agentId === currentLine.agentId) return;
      const listener = this.agents.get(agentId);
      if (!listener || listener.walk) return;
      listener.facing = facingBetween(listener, speaker);
      listener.occupation = {
        kind: "conversation",
        spriteName: `idle-${facingBetween(listener, speaker)}`,
        activity: "idle",
        facing: listener.facing
      };
    });
  }

  // ---- idle wandering -----------------------------------------------------

  private maybeWander(now: number): void {
    if (!this.chatterEnabled) return;
    this.agents.forEach((agent) => {
      if (agent.walk || agent.conversationId) return;
      if (agent.occupation && agent.occupation.kind === "phase" && this.loopRunning) return;
      if (agent.occupation?.until && now < agent.occupation.until) return;
      if (this.random() < 0.006) {
        const zone = wanderZones[Math.floor(this.random() * wanderZones.length)];
        this.walkTo(agent, zone, () => {
          agent.occupation = {
            kind: "wander",
            spriteName: zone === "tea" ? "idle-left" : `idle-${agent.facing}`,
            activity: "idle",
            until: now + 6000 + this.random() * 9000
          };
        });
      }
    });
  }

  // ---- main tick ----------------------------------------------------------

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(0.3, (now - this.lastTick) / 1000);
    this.lastTick = now;

    this.agents.forEach((agent) => this.advanceWalk(agent, dt));
    this.tickConversation(now);
    this.maybeWander(now);

    // expire bubbles, occupations, effects
    this.agents.forEach((agent) => {
      if (agent.bubble && now > agent.bubble.until) agent.bubble = undefined;
      if (agent.occupation?.until && now > agent.occupation.until && agent.occupation.kind !== "phase") {
        agent.occupation = undefined;
      }
    });
    this.effects = this.effects.filter((effect) => now < effect.until);

    this.publish();
  }

  private publish(): void {
    const agents: Agent2DRenderState[] = [...this.agents.values()]
      .filter((agent) => agent.profile.visible)
      .map((agent) => {
        const walking = Boolean(agent.walk);
        const occupation = agent.occupation;
        const facing = occupation?.facing ?? agent.facing;
        const spriteName = walking
          ? `walk-${agent.facing}`
          : occupation?.spriteName ?? `idle-${facing}`;
        const activity: Agent2DActivity = walking ? "walking" : occupation?.activity ?? "idle";
        return {
          agentId: agent.profile.id,
          zone: agent.zone,
          targetZone: agent.zone,
          x: agent.x,
          y: agent.y,
          facing,
          activity,
          spriteName,
          expression: walking ? undefined : occupation?.expression,
          message: agent.bubble?.text,
          bubbleType: agent.bubble?.type ?? "normal",
          zIndex: Math.round(agent.y)
        };
      });
    this.snapshot = {
      version: this.snapshot.version + 1,
      agents,
      effects: [...this.effects],
      activeTopic: this.conversations[0]?.script.topicKey
    };
    this.listeners.forEach((listener) => listener());
  }

  agentPosition(agentId: string): Office2DPoint | undefined {
    const agent = this.agents.get(agentId);
    return agent ? { x: agent.x, y: agent.y } : undefined;
  }

  shouldGossip(now: number): boolean {
    if (this.conversations.length > 0) return false;
    if (!this.chatterEnabled) return false;
    if (now - this.lastGossipAt < 26000) return false;
    this.lastGossipAt = now;
    return true;
  }
}
