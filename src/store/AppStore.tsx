import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { defaultAgents } from "../data/defaultAgents";
import { defaultSettings } from "../data/defaultSettings";
import {
  AgentMood,
  AgentProfile,
  AgentRuntime,
  BossEvent,
  ExperimentRecord,
  LoopPhase,
  PerformanceMetrics,
  ResearchLoopState,
  ResearchMemory,
  Settings,
  SpeechBubble
} from "../types";
import {
  attachBubbleToRuntime,
  initialAgentRuntime,
  runtimeForPhase,
  tickDailyBehavior
} from "../engines/agentStateMachine";
import { MockQuantLLMAdapter } from "../engines/llmAdapters";
import { deriveResearchMemory } from "../engines/researchMemory";
import { runResearchIteration } from "../engines/researchLoop";
import {
  bossDirectiveConversation,
  gossipConversation,
  ideaRevealConversation,
  lovedConversation,
  phaseConversation,
  whippedConversation
} from "../engines/dialogue/dialogueLocal";
import { condenseConversation } from "../engines/dialogue/llmCondenser";
import { OfficeDirector } from "../lib/office2d/officeDirector";
import { isWallpaperMode } from "../lib/wallpaperMode";
import { readStored, writeStored } from "./persistence";

const STORAGE = {
  agents: "qrl.agents",
  settings: "qrl.settings",
  experiments: "qrl.experiments",
  loop: "qrl.loop",
  mood: "qrl.mood"
};

const phaseText: Record<LoopPhase, string> = {
  idle: "Waiting for a research task.",
  proposing: "Strategy Researcher is proposing a hypothesis.",
  data_check: "Data Manager is checking timestamps and universe coverage.",
  coding: "Code Engineer is generating controlled strategy logic.",
  backtesting: "Backtest computer is simulating the experiment.",
  risk_review: "Risk Reviewer is checking bias, costs, drawdown, and robustness.",
  debate: "The research desk is debating the result.",
  decision: "Experiment Manager is making the final call.",
  saved: "Experiment saved to memory."
};

const defaultLoop: ResearchLoopState = {
  phase: "idle",
  running: false,
  autoRun: false,
  iteration: 0,
  loopCountCompleted: 0,
  statusMessage: phaseText.idle
};

const factorToFamily: Record<string, string> = {
  news_sentiment: "news_sentiment_momentum",
  momentum: "xs_momentum",
  mean_reversion: "short_term_reversal",
  low_volatility: "low_volatility",
  event_drift: "pead",
  quality_proxy: "quality"
};

function normalizeMetrics(metrics: PerformanceMetrics): PerformanceMetrics {
  return {
    ...metrics,
    deflatedSharpe: metrics.deflatedSharpe ?? 0.5,
    trialsAtDiscovery: metrics.trialsAtDiscovery ?? 1,
    alphaPoolCorrelation: metrics.alphaPoolCorrelation ?? 0
  };
}

function normalizeExperiments(stored: ExperimentRecord[]): ExperimentRecord[] {
  return stored.map((experiment) => ({
    ...experiment,
    familyKey: experiment.familyKey ?? factorToFamily[(experiment as { factorKind?: string }).factorKind ?? ""] ?? "xs_momentum",
    generation: experiment.generation ?? 0,
    ideaMode: experiment.ideaMode ?? "explore",
    ideaReasoning: experiment.ideaReasoning ?? [],
    strategyParameters: experiment.strategyParameters ?? {},
    inSampleResult: normalizeMetrics(experiment.inSampleResult),
    outOfSampleResult: normalizeMetrics(experiment.outOfSampleResult),
    fullResult: normalizeMetrics(experiment.fullResult)
  }));
}

function normalizeAgents(stored: AgentProfile[]): AgentProfile[] {
  return defaultAgents.map((fallback) => {
    const saved = stored.find((agent) => agent.id === fallback.id);
    return saved ? { ...fallback, ...saved, appearance: { ...fallback.appearance, ...saved.appearance } } : fallback;
  });
}

function normalizeSettings(stored: Settings): Settings {
  return { ...defaultSettings, ...stored };
}

function defaultMood(agentId: string): AgentMood {
  return { agentId, morale: 70, praises: 0, scolds: 0, lastBossActionAt: 0 };
}

interface AppStoreValue {
  agents: AgentProfile[];
  settings: Settings;
  experiments: ExperimentRecord[];
  loop: ResearchLoopState;
  agentRuntime: Record<string, AgentRuntime>;
  bubbles: SpeechBubble[];
  memory: ResearchMemory[];
  mood: Record<string, AgentMood>;
  bossEvents: BossEvent[];
  currentExperiment?: ExperimentRecord;
  director: OfficeDirector;
  wallpaperMode: boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  updateAgent: (id: string, patch: Partial<AgentProfile>) => void;
  restoreAgent: (id: string) => void;
  replaceAgents: (agents: AgentProfile[]) => void;
  startResearch: () => void;
  pauseResearch: () => void;
  toggleAutoRun: () => void;
  nextIteration: () => void;
  setActiveObject: (area?: ResearchLoopState["activeObject"]) => void;
  clearExperiments: () => void;
  addManualBubble: (bubble: Omit<SpeechBubble, "id" | "createdAt">) => void;
  sendBossDirective: (text: string) => void;
  applyBossAction: (agentId: string, kind: "love" | "whip") => void;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

function freshBubbles(bubbles: SpeechBubble[]): SpeechBubble[] {
  const cutoff = Date.now() - 30000;
  return bubbles.filter((bubble) => bubble.createdAt >= cutoff).slice(-12);
}

export function AppStoreProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [agents, setAgents] = useState<AgentProfile[]>(() => normalizeAgents(readStored(STORAGE.agents, defaultAgents)));
  const [settings, setSettings] = useState<Settings>(() => normalizeSettings(readStored(STORAGE.settings, defaultSettings)));
  const [experiments, setExperiments] = useState<ExperimentRecord[]>(() =>
    normalizeExperiments(readStored(STORAGE.experiments, []))
  );
  const [loop, setLoop] = useState<ResearchLoopState>(() => {
    const stored = readStored(STORAGE.loop, defaultLoop);
    return { ...stored, running: false, autoRun: false, phase: stored.phase === "idle" ? "idle" : "saved" };
  });
  const [agentRuntime, setAgentRuntime] = useState<Record<string, AgentRuntime>>(() => initialAgentRuntime(defaultAgents));
  const [bubbles, setBubbles] = useState<SpeechBubble[]>([]);
  const [mood, setMood] = useState<Record<string, AgentMood>>(() => readStored(STORAGE.mood, {}));
  const [bossEvents, setBossEvents] = useState<BossEvent[]>([]);
  const adapterRef = useRef(new MockQuantLLMAdapter());
  const advancingRef = useRef(false);
  const loopRef = useRef(loop);
  const agentsRef = useRef(agents);
  const settingsRef = useRef(settings);
  const experimentsRef = useRef(experiments);
  const moodRef = useRef(mood);
  const pendingDirectiveRef = useRef<string | undefined>(undefined);
  const directorRef = useRef<OfficeDirector | null>(null);
  const wallpaperMode = useMemo(() => isWallpaperMode(), []);

  if (!directorRef.current) {
    directorRef.current = new OfficeDirector(agents);
  }
  const director = directorRef.current;

  useEffect(() => {
    loopRef.current = loop;
    director.setLoopRunning(loop.running);
  }, [director, loop]);

  useEffect(() => {
    agentsRef.current = agents;
    director.setAgents(agents);
    setAgentRuntime((prev) => ({ ...initialAgentRuntime(agents), ...prev }));
    writeStored(STORAGE.agents, agents);
  }, [agents, director]);

  useEffect(() => {
    settingsRef.current = settings;
    director.setChatterEnabled(settings.casualOfficeChatter);
    writeStored(STORAGE.settings, settings);
    document.documentElement.dataset.theme = settings.themeMode;
    document.documentElement.dataset.reducedMotion = settings.reducedAnimation ? "true" : "false";
  }, [director, settings]);

  useEffect(() => {
    experimentsRef.current = experiments;
    writeStored(STORAGE.experiments, experiments);
  }, [experiments]);

  useEffect(() => {
    writeStored(STORAGE.loop, loop);
  }, [loop]);

  useEffect(() => {
    moodRef.current = mood;
    writeStored(STORAGE.mood, mood);
  }, [mood]);

  const memory = useMemo(() => deriveResearchMemory(experiments), [experiments]);
  const currentExperiment = useMemo(
    () => experiments.find((experiment) => experiment.id === loop.currentExperimentId) ?? experiments[experiments.length - 1],
    [experiments, loop.currentExperimentId]
  );
  const currentExperimentRef = useRef(currentExperiment);
  useEffect(() => {
    currentExperimentRef.current = currentExperiment;
  }, [currentExperiment]);

  const pushBubbles = useCallback((nextBubbles: SpeechBubble[]) => {
    if (nextBubbles.length === 0) return;
    setBubbles((prev) => freshBubbles([...prev, ...nextBubbles]));
    setAgentRuntime((prev) => attachBubbleToRuntime(nextBubbles, prev));
  }, []);

  // Conversation lines spoken in the office also feed the ticker.
  useEffect(() => {
    director.onLineSpoken = (line, profile) => {
      pushBubbles([
        {
          id: `line-${Date.now()}-${Math.random().toFixed(4)}`,
          agentId: profile.id,
          role: profile.role,
          speaker: profile.name,
          message: line.text,
          createdAt: Date.now(),
          tone: line.tone
        }
      ]);
    };
    director.condense = (script) =>
      condenseConversation(
        script,
        {
          topicKey: script.topicKey,
          phase: loopRef.current.phase,
          experiment: currentExperimentRef.current
        },
        agentsRef.current,
        settingsRef.current
      );
    director.start();
    return () => director.stop();
  }, [director, pushBubbles]);

  const moraleBiases = useCallback(() => {
    const moods = moodRef.current;
    const strategyMood = moods["agent-strategy"] ?? defaultMood("agent-strategy");
    const riskMood = moods["agent-risk"] ?? defaultMood("agent-risk");
    const skepticMood = moods["agent-skeptic"] ?? defaultMood("agent-skeptic");
    const explorationBias = Math.max(-2, Math.min(2, (strategyMood.praises - strategyMood.scolds) * 0.5));
    const strictnessBias = Math.max(0, Math.min(4, riskMood.scolds + skepticMood.scolds));
    return { explorationBias, strictnessBias };
  }, []);

  const setPhase = useCallback(
    async (phase: LoopPhase, experiment?: ExperimentRecord) => {
      const timestamp = Date.now();
      setLoop((prev) => ({
        ...prev,
        phase,
        statusMessage: phaseText[phase],
        currentExperimentId: experiment?.id ?? prev.currentExperimentId
      }));
      setAgentRuntime((prev) => runtimeForPhase(phase, agentsRef.current, prev, timestamp));
      const conversationExperiment = ["risk_review", "debate", "decision", "saved"].includes(phase)
        ? experiment
        : undefined;
      const script = phaseConversation({
        phase,
        experiment: conversationExperiment ?? (phase === "data_check" || phase === "coding" || phase === "backtesting" ? experiment : undefined),
        agents: agentsRef.current,
        memory: deriveResearchMemory(experimentsRef.current),
        timestamp
      });
      director.onPhaseChange(phase, loopRef.current, experiment, script);
    },
    [director]
  );

  const advancePhase = useCallback(async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      const activeLoop = loopRef.current;
      const activeSettings = settingsRef.current;
      const activeExperiments = experimentsRef.current;
      const activeMemory = deriveResearchMemory(activeExperiments);
      const current = activeExperiments.find((experiment) => experiment.id === activeLoop.currentExperimentId);

      if (activeLoop.phase === "idle" || activeLoop.phase === "saved") {
        if (activeLoop.phase === "saved" && activeLoop.autoRun && activeLoop.loopCountCompleted >= activeSettings.maximumLoopCount) {
          setLoop((prev) => ({ ...prev, running: false, autoRun: false, phase: "idle", statusMessage: "Maximum loop count reached." }));
          return;
        }
        await setPhase("proposing", current);
        return;
      }

      if (activeLoop.phase === "proposing") {
        await setPhase("data_check", current);
        return;
      }

      if (activeLoop.phase === "data_check") {
        await setPhase("coding", current);
        return;
      }

      if (activeLoop.phase === "coding") {
        await setPhase("backtesting", current);
        const nextIterationNumber = activeLoop.iteration + 1;
        const { explorationBias, strictnessBias } = moraleBiases();
        const bossDirective = pendingDirectiveRef.current;
        pendingDirectiveRef.current = undefined;
        const experiment = await runResearchIteration(adapterRef.current, {
          settings: activeSettings,
          memory: activeMemory,
          iteration: nextIterationNumber,
          experiments: activeExperiments,
          bossDirective,
          explorationBias,
          strictnessBias
        });
        setExperiments((prev) => [...prev, experiment]);
        setLoop((prev) => ({
          ...prev,
          iteration: nextIterationNumber,
          currentExperimentId: experiment.id,
          statusMessage: "Backtest complete. Risk desk is opening the folder."
        }));
        const reveal = ideaRevealConversation({
          phase: "backtesting",
          experiment,
          agents: agentsRef.current,
          memory: activeMemory,
          timestamp: Date.now()
        });
        if (reveal) director.scheduleConversation(reveal);
        return;
      }

      if (activeLoop.phase === "backtesting") {
        const experiment = experimentsRef.current.find((item) => item.id === loopRef.current.currentExperimentId) ?? current;
        await setPhase("risk_review", experiment);
        return;
      }

      if (activeLoop.phase === "risk_review") {
        const experiment = experimentsRef.current.find((item) => item.id === loopRef.current.currentExperimentId) ?? current;
        await setPhase("debate", experiment);
        return;
      }

      if (activeLoop.phase === "debate") {
        const experiment = experimentsRef.current.find((item) => item.id === loopRef.current.currentExperimentId) ?? current;
        await setPhase("decision", experiment);
        return;
      }

      if (activeLoop.phase === "decision") {
        const experiment = experimentsRef.current.find((item) => item.id === loopRef.current.currentExperimentId) ?? current;
        await setPhase("saved", experiment);
        setLoop((prev) => ({
          ...prev,
          loopCountCompleted: prev.loopCountCompleted + 1,
          running: prev.autoRun,
          statusMessage: experiment?.managerDecision ?? phaseText.saved
        }));
      }
    } finally {
      advancingRef.current = false;
    }
  }, [director, moraleBiases, setPhase]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setAgentRuntime((prev) =>
        tickDailyBehavior(agentsRef.current, prev, Date.now(), settingsRef.current.casualOfficeChatter)
      );
      setBubbles(freshBubbles);
      // idle gossip with real desk facts
      const now = Date.now();
      const phase = loopRef.current.phase;
      if ((!loopRef.current.running || phase === "idle" || phase === "saved") && director.shouldGossip(now)) {
        director.scheduleConversation(
          gossipConversation({
            phase,
            experiment: currentExperimentRef.current,
            agents: agentsRef.current,
            memory: deriveResearchMemory(experimentsRef.current),
            timestamp: now
          })
        );
      }
    }, 2600);
    return () => window.clearInterval(interval);
  }, [director]);

  useEffect(() => {
    if (!loop.running) return;
    const interval = window.setInterval(() => {
      if (window.__qrlWallpaperPaused) return;
      void advancePhase();
    }, settings.reducedAnimation ? 2400 : 7200);
    return () => window.clearInterval(interval);
  }, [advancePhase, loop.running, settings.reducedAnimation]);

  // Wallpaper hosts pause us when a fullscreen app is in front.
  useEffect(() => {
    const handler = (event: Event) => {
      const paused = (event as CustomEvent).detail === true;
      if (paused) director.stop();
      else director.start();
    };
    window.addEventListener("qrl-wallpaper-paused", handler);
    return () => window.removeEventListener("qrl-wallpaper-paused", handler);
  }, [director]);

  // Wallpaper mode: auto-run the loop forever.
  useEffect(() => {
    if (!wallpaperMode) return;
    const timer = window.setTimeout(() => {
      setLoop((prev) => ({ ...prev, running: true, autoRun: true, phase: prev.phase === "idle" ? "proposing" : prev.phase }));
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [wallpaperMode]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateAgent = useCallback((id: string, patch: Partial<AgentProfile>) => {
    setAgents((prev) => prev.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)));
  }, []);

  const restoreAgent = useCallback((id: string) => {
    const defaultAgent = defaultAgents.find((agent) => agent.id === id);
    if (!defaultAgent) return;
    setAgents((prev) => prev.map((agent) => (agent.id === id ? defaultAgent : agent)));
  }, []);

  const startResearch = useCallback(() => {
    setLoop((prev) => ({
      ...prev,
      running: true,
      autoRun: false,
      phase: prev.phase === "idle" ? "proposing" : prev.phase,
      statusMessage: prev.phase === "idle" ? phaseText.proposing : prev.statusMessage
    }));
    setAgentRuntime((prev) => runtimeForPhase("proposing", agentsRef.current, prev, Date.now()));
    void advancePhase();
  }, [advancePhase]);

  const pauseResearch = useCallback(() => {
    setLoop((prev) => ({ ...prev, running: false, autoRun: false, statusMessage: "Paused by user." }));
  }, []);

  const toggleAutoRun = useCallback(() => {
    setLoop((prev) => {
      const autoRun = !prev.autoRun;
      return {
        ...prev,
        running: autoRun,
        autoRun,
        phase: prev.phase === "idle" && autoRun ? "proposing" : prev.phase,
        statusMessage: autoRun ? "Auto Run is advancing the desk." : "Auto Run stopped."
      };
    });
    void advancePhase();
  }, [advancePhase]);

  const nextIteration = useCallback(() => {
    setLoop((prev) => ({ ...prev, running: false, autoRun: false }));
    void advancePhase();
  }, [advancePhase]);

  const setActiveObject = useCallback((area?: ResearchLoopState["activeObject"]) => {
    setLoop((prev) => ({ ...prev, activeObject: area }));
  }, []);

  const clearExperiments = useCallback(() => {
    setExperiments([]);
    setLoop(defaultLoop);
  }, []);

  const replaceAgents = useCallback((nextAgents: AgentProfile[]) => {
    setAgents(nextAgents);
  }, []);

  const addManualBubble = useCallback((bubble: Omit<SpeechBubble, "id" | "createdAt">) => {
    pushBubbles([{ ...bubble, id: `manual-${Date.now()}`, createdAt: Date.now() }]);
  }, [pushBubbles]);

  const sendBossDirective = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      pendingDirectiveRef.current = trimmed;
      setBossEvents((prev) => [
        ...prev.slice(-19),
        { id: `boss-${Date.now()}`, kind: "directive", text: trimmed, createdAt: Date.now() }
      ]);
      director.bossReaction("directive");
      window.setTimeout(() => {
        director.scheduleConversation(
          bossDirectiveConversation({
            phase: loopRef.current.phase,
            experiment: currentExperimentRef.current,
            agents: agentsRef.current,
            memory: deriveResearchMemory(experimentsRef.current),
            timestamp: Date.now(),
            bossText: trimmed
          })
        );
      }, 2400);
      setLoop((prev) => ({ ...prev, statusMessage: `Boss directive queued for the next hypothesis: "${trimmed.slice(0, 60)}"` }));
    },
    [director]
  );

  const applyBossAction = useCallback(
    (agentId: string, kind: "love" | "whip") => {
      const now = Date.now();
      setMood((prev) => {
        const entry = prev[agentId] ?? defaultMood(agentId);
        const morale = Math.max(0, Math.min(100, entry.morale + (kind === "love" ? 12 : -15)));
        return {
          ...prev,
          [agentId]: {
            ...entry,
            morale,
            praises: entry.praises + (kind === "love" ? 1 : 0),
            scolds: entry.scolds + (kind === "whip" ? 1 : 0),
            lastBossAction: kind,
            lastBossActionAt: now
          }
        };
      });
      setBossEvents((prev) => [
        ...prev.slice(-19),
        { id: `boss-${now}`, kind, targetAgentId: agentId, createdAt: now }
      ]);
      director.bossReaction(kind, agentId);
      const context = {
        phase: loopRef.current.phase,
        experiment: currentExperimentRef.current,
        agents: agentsRef.current,
        memory: deriveResearchMemory(experimentsRef.current),
        timestamp: now,
        targetAgentId: agentId
      };
      window.setTimeout(() => {
        director.scheduleConversation(kind === "love" ? lovedConversation(context) : whippedConversation(context));
      }, 1700);
    },
    [director]
  );

  const value = useMemo<AppStoreValue>(
    () => ({
      agents,
      settings,
      experiments,
      loop,
      agentRuntime,
      bubbles,
      memory,
      mood,
      bossEvents,
      currentExperiment,
      director,
      wallpaperMode,
      updateSettings,
      updateAgent,
      restoreAgent,
      replaceAgents,
      startResearch,
      pauseResearch,
      toggleAutoRun,
      nextIteration,
      setActiveObject,
      clearExperiments,
      addManualBubble,
      sendBossDirective,
      applyBossAction
    }),
    [
      agents,
      settings,
      experiments,
      loop,
      agentRuntime,
      bubbles,
      memory,
      mood,
      bossEvents,
      currentExperiment,
      director,
      wallpaperMode,
      updateSettings,
      updateAgent,
      restoreAgent,
      replaceAgents,
      startResearch,
      pauseResearch,
      toggleAutoRun,
      nextIteration,
      setActiveObject,
      clearExperiments,
      addManualBubble,
      sendBossDirective,
      applyBossAction
    ]
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const context = useContext(AppStoreContext);
  if (!context) {
    throw new Error("useAppStore must be used inside AppStoreProvider");
  }
  return context;
}
