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
import { BridgeResearchAdapter } from "../engines/bridgeResearchAdapter";
import { DatasetProvider } from "../engines/dataset/types";
import { getDatasetProvider } from "../engines/dataset/datasetProvider";
import { ACHIEVEMENTS, computeLevel, computeXp, fundNav, BossLevel } from "../engines/progression";
import { deriveResearchMemory } from "../engines/researchMemory";
import { completeIteration, IterationDraft, prepareIteration } from "../engines/researchLoop";
import {
  bossDirectiveConversation,
  gossipConversation,
  ideaRevealConversation,
  lovedConversation,
  officeEventConversation,
  phaseConversation,
  whippedConversation
} from "../engines/dialogue/dialogueLocal";
import { condenseConversation } from "../engines/dialogue/llmCondenser";
import { phaseStatus, t } from "../i18n";
import { OfficeDirector } from "../lib/office2d/officeDirector";
import { isWallpaperMode } from "../lib/wallpaperMode";
import { readStored, writeStored } from "./persistence";

const STORAGE = {
  agents: "qrl.agents",
  settings: "qrl.settings",
  experiments: "qrl.experiments",
  loop: "qrl.loop",
  mood: "qrl.mood",
  achievements: "qrl.achievements",
  level: "qrl.level"
};

export interface GameToast {
  id: string;
  icon: string;
  title: string;
  detail: string;
}

export interface CliStatus {
  connected: boolean;
  checking: boolean;
  detail: string;
}

export interface DatasetStatus {
  ready: boolean;
  building: boolean;
  label: string;
  error?: string;
}

const defaultLoop: ResearchLoopState = {
  phase: "idle",
  running: false,
  autoRun: false,
  iteration: 0,
  loopCountCompleted: 0,
  statusMessage: phaseStatus("en", "idle")
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
  const merged = { ...defaultSettings, ...stored } as Settings & {
    dataSource?: "mock" | "real";
    researchBrain?: string;
  };
  // migrate pre-v3 settings: dataSource string -> dataset config
  if (!stored.dataset && merged.dataSource) {
    merged.dataset =
      merged.dataSource === "mock"
        ? { kind: "mock", label: "Deterministic mock simulator" }
        : { kind: "bundled", label: "Bundled US equities · 20y dailies" };
  }
  if (!merged.dataset) merged.dataset = { ...defaultSettings.dataset };
  // the local heuristic brain no longer exists; this is an LLM-native project
  if (merged.researchBrain !== "claude-code" && merged.researchBrain !== "codex") {
    merged.researchBrain = "claude-code";
  }
  delete merged.dataSource;
  return merged as Settings;
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
  bossLevel: BossLevel;
  fundValue: number;
  unlockedAchievements: Record<string, number>;
  toasts: GameToast[];
  cliStatus: CliStatus;
  datasetStatus: DatasetStatus;
  dismissToast: (id: string) => void;
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
  const [unlockedAchievements, setUnlockedAchievements] = useState<Record<string, number>>(() =>
    readStored(STORAGE.achievements, {})
  );
  const [toasts, setToasts] = useState<GameToast[]>([]);
  const advancingRef = useRef(false);
  const loopRef = useRef(loop);
  const agentsRef = useRef(agents);
  const settingsRef = useRef(settings);
  // LLM-native: the research brain is always a CLI (Claude Code / Codex) via
  // the bridge. The deterministic engine survives only inside the adapter, as
  // bookkeeping scaffold and a transient mid-run safety net — never selectable.
  const adapterRef = useRef<BridgeResearchAdapter>(new BridgeResearchAdapter(() => settingsRef.current));
  const datasetProviderRef = useRef<DatasetProvider | null>(null);
  const cliRef = useRef<CliStatus>({ connected: false, checking: true, detail: "" });
  const experimentsRef = useRef(experiments);
  const moodRef = useRef(mood);
  const pendingDirectiveRef = useRef<string | undefined>(undefined);
  const draftRef = useRef<IterationDraft | null>(null);
  const directorRef = useRef<OfficeDirector | null>(null);
  const wallpaperMode = useMemo(() => isWallpaperMode(), []);
  const [datasetStatus, setDatasetStatus] = useState<DatasetStatus>({
    ready: settings.dataset.kind === "mock" || settings.dataset.kind === "bundled",
    building: settings.dataset.kind !== "mock",
    label: settings.dataset.label
  });
  const [cliStatus, setCliStatus] = useState<CliStatus>({ connected: false, checking: true, detail: "" });

  if (!directorRef.current) {
    directorRef.current = new OfficeDirector(agents);
    if (import.meta.env.DEV) {
      // capture/debug hook for demo recordings; dev builds only
      (window as unknown as { __qrlDirector?: OfficeDirector }).__qrlDirector = directorRef.current;
    }
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
        statusMessage: phaseStatus(settingsRef.current.language, phase),
        currentExperimentId: experiment?.id ?? prev.currentExperimentId
      }));
      setAgentRuntime((prev) => runtimeForPhase(phase, agentsRef.current, prev, timestamp));
      // late phases narrate the finished experiment; early phases narrate the
      // freshly proposed draft (never the previous iteration's record)
      const earlyPhase = ["proposing", "data_check", "coding", "backtesting"].includes(phase);
      const script = phaseConversation({
        phase,
        experiment: earlyPhase ? undefined : experiment,
        draft: earlyPhase ? draftRef.current?.strategy : undefined,
        costBps: settingsRef.current.transactionCostBps,
        language: settingsRef.current.language,
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
          setLoop((prev) => ({ ...prev, running: false, autoRun: false, phase: "idle", statusMessage: t(settingsRef.current.language, "maxLoops") }));
          return;
        }
        // propose the new strategy NOW so every early phase narrates it
        const { explorationBias } = moraleBiases();
        const bossDirective = pendingDirectiveRef.current;
        pendingDirectiveRef.current = undefined;
        draftRef.current = await prepareIteration(adapterRef.current, {
          settings: activeSettings,
          memory: activeMemory,
          iteration: activeLoop.iteration + 1,
          experiments: activeExperiments,
          bossDirective,
          explorationBias,
          datasetProvider: datasetProviderRef.current
        });
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
        const draft =
          draftRef.current && draftRef.current.iteration === nextIterationNumber
            ? draftRef.current
            : await prepareIteration(adapterRef.current, {
                settings: activeSettings,
                memory: activeMemory,
                iteration: nextIterationNumber,
                experiments: activeExperiments,
                bossDirective: pendingDirectiveRef.current,
                explorationBias,
                datasetProvider: datasetProviderRef.current
              });
        draftRef.current = null;
        const experiment = await completeIteration(
          adapterRef.current,
          {
            settings: activeSettings,
            memory: activeMemory,
            iteration: nextIterationNumber,
            experiments: activeExperiments,
            explorationBias,
            strictnessBias,
            datasetProvider: datasetProviderRef.current
          },
          draft
        );
        setExperiments((prev) => [...prev, experiment]);
        setLoop((prev) => ({
          ...prev,
          iteration: nextIterationNumber,
          currentExperimentId: experiment.id,
          statusMessage: t(settingsRef.current.language, "backtestDone")
        }));
        const reveal = ideaRevealConversation({
          phase: "backtesting",
          experiment,
          language: settingsRef.current.language,
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
        if (experiment?.status === "candidate") {
          window.setTimeout(() => director.celebrate(), 1200);
        }
        // a rare scripted office event keeps the place alive (~every 3 loops)
        const completed = activeLoop.loopCountCompleted + 1;
        if (completed % 3 === 0 && Math.random() < 0.5) {
          window.setTimeout(() => {
            director.scheduleConversation(
              officeEventConversation({
                phase: "saved",
                language: settingsRef.current.language,
                agents: agentsRef.current,
                memory: deriveResearchMemory(experimentsRef.current),
                timestamp: Date.now()
              })
            );
          }, 14000);
        }
        setLoop((prev) => ({
          ...prev,
          loopCountCompleted: prev.loopCountCompleted + 1,
          running: prev.autoRun,
          statusMessage: experiment?.managerDecision ?? phaseStatus(settingsRef.current.language, "saved")
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
            language: settingsRef.current.language,
            agents: agentsRef.current,
            memory: deriveResearchMemory(experimentsRef.current),
            timestamp: now,
            morale: Math.round(
              agentsRef.current.reduce((sum, agent) => sum + (moodRef.current[agent.id]?.morale ?? 70), 0) /
                Math.max(1, agentsRef.current.length)
            )
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

  // build the active dataset provider whenever the dataset config (or the CLI
  // it would delegate to) changes; the loop reads datasetProviderRef.current
  useEffect(() => {
    let cancelled = false;
    const config = settings.dataset;
    if (config.kind === "mock") {
      datasetProviderRef.current = null;
      setDatasetStatus({ ready: true, building: false, label: config.label });
      return;
    }
    setDatasetStatus({ ready: false, building: true, label: config.label });
    void getDatasetProvider(config, { bridgeUrl: settings.bridgeUrl, brain: settings.researchBrain }).then((provider) => {
      if (cancelled) return;
      datasetProviderRef.current = provider;
      if (provider) {
        setDatasetStatus({ ready: true, building: false, label: provider.meta().label });
      } else {
        setDatasetStatus({
          ready: false,
          building: false,
          label: config.label,
          error:
            config.kind === "bridge"
              ? "bridge could not inspect the source — is the CLI connected and big-data mode on?"
              : config.kind === "upload"
              ? "no file loaded — pick a CSV in Settings"
              : "could not load this source"
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settings.dataset, settings.bridgeUrl, settings.researchBrain]);

  // CLI health: this is an LLM-native project, so research is gated on a live
  // Claude Code / Codex connection through the bridge
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`${settingsRef.current.bridgeUrl.replace(/\/$/, "")}/health`, { method: "GET" });
        const payload = (await response.json()) as { claude?: boolean; codex?: boolean };
        const want = settingsRef.current.researchBrain === "codex" ? payload.codex : payload.claude;
        const next: CliStatus = {
          connected: Boolean(want),
          checking: false,
          detail: want ? "" : `${settingsRef.current.researchBrain} CLI not detected by the bridge`
        };
        if (active) {
          cliRef.current = next;
          setCliStatus(next);
        }
      } catch {
        const next: CliStatus = { connected: false, checking: false, detail: "bridge offline — run npm run dialogue-bridge" };
        if (active) {
          cliRef.current = next;
          setCliStatus(next);
        }
      }
    };
    void check();
    const id = window.setInterval(check, 15000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [settings.bridgeUrl, settings.researchBrain]);

  // progression: achievements + level-up toasts (derived deterministically)
  const bossLevel = useMemo(
    () => computeLevel(computeXp({ experiments, bossEvents, mood })),
    [experiments, bossEvents, mood]
  );
  const fundValue = useMemo(() => fundNav(experiments), [experiments]);

  useEffect(() => {
    const input = { experiments, bossEvents, mood, settings };
    const fresh: GameToast[] = [];
    const next = { ...unlockedAchievements };
    let changed = false;
    for (const achievement of ACHIEVEMENTS) {
      if (!next[achievement.id] && achievement.earned(input)) {
        next[achievement.id] = Date.now();
        changed = true;
        fresh.push({
          id: `ach-${achievement.id}`,
          icon: achievement.icon,
          title: settings.language === "zh" ? achievement.name.zh : achievement.name.en,
          detail: settings.language === "zh" ? achievement.detail.zh : achievement.detail.en
        });
      }
    }
    const storedLevel = readStored(STORAGE.level, 1);
    if (bossLevel.level > storedLevel) {
      writeStored(STORAGE.level, bossLevel.level);
      fresh.push({
        id: `lvl-${bossLevel.level}`,
        icon: "\u{1F451}",
        title:
          settings.language === "zh"
            ? `\u5347\u7EA7\uFF01Lv.${bossLevel.level} ${bossLevel.title.zh}`
            : `Level up! Lv.${bossLevel.level} ${bossLevel.title.en}`,
        detail: settings.language === "zh" ? "\u6574\u4E2A\u529E\u516C\u5BA4\u90FD\u5728\u9F13\u638C\u3002" : "The whole office is applauding."
      });
    }
    if (changed) {
      setUnlockedAchievements(next);
      writeStored(STORAGE.achievements, next);
    }
    if (fresh.length > 0) {
      setToasts((prev) => [...prev, ...fresh].slice(-4));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => !fresh.some((item) => item.id === toast.id)));
      }, 6500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments, bossEvents, mood, settings.language]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

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
    // forced LLM-native: no research without a connected Claude Code / Codex CLI
    if (!cliRef.current.connected && !isWallpaperMode()) {
      setLoop((prev) => ({ ...prev, running: false, statusMessage: t(settingsRef.current.language, "connectCli") }));
      return;
    }
    setLoop((prev) => ({
      ...prev,
      running: true,
      autoRun: false,
      phase: prev.phase === "idle" ? "proposing" : prev.phase,
      statusMessage: prev.phase === "idle" ? phaseStatus(settingsRef.current.language, "proposing") : prev.statusMessage
    }));
    setAgentRuntime((prev) => runtimeForPhase("proposing", agentsRef.current, prev, Date.now()));
    void advancePhase();
  }, [advancePhase]);

  const pauseResearch = useCallback(() => {
    setLoop((prev) => ({ ...prev, running: false, autoRun: false, statusMessage: t(settingsRef.current.language, "pausedByUser") }));
  }, []);

  const toggleAutoRun = useCallback(() => {
    // compute from the committed ref and sync it eagerly so advancePhase sees
    // the post-toggle state; only kick the machine when turning ON
    if (!loopRef.current.autoRun && !cliRef.current.connected && !isWallpaperMode()) {
      setLoop((prev) => ({ ...prev, statusMessage: t(settingsRef.current.language, "connectCli") }));
      return;
    }
    const next = !loopRef.current.autoRun;
    setLoop((prev) => ({
      ...prev,
      running: next,
      autoRun: next,
      phase: prev.phase === "idle" && next ? "proposing" : prev.phase,
      statusMessage: next ? t(settingsRef.current.language, "autoRunOn") : t(settingsRef.current.language, "autoRunOff")
    }));
    if (next) {
      loopRef.current = { ...loopRef.current, running: true, autoRun: true };
      void advancePhase();
    } else {
      loopRef.current = { ...loopRef.current, running: false, autoRun: false };
    }
  }, [advancePhase]);

  const nextIteration = useCallback(() => {
    if (!cliRef.current.connected && !isWallpaperMode()) {
      setLoop((prev) => ({ ...prev, statusMessage: t(settingsRef.current.language, "connectCli") }));
      return;
    }
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
            language: settingsRef.current.language,
            agents: agentsRef.current,
            memory: deriveResearchMemory(experimentsRef.current),
            timestamp: Date.now(),
            bossText: trimmed
          })
        );
      }, 2400);
      setLoop((prev) => ({ ...prev, statusMessage: `${t(settingsRef.current.language, "directiveQueued")}"${trimmed.slice(0, 60)}"` }));
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
        language: settingsRef.current.language,
        agents: agentsRef.current,
        memory: deriveResearchMemory(experimentsRef.current),
        timestamp: now,
        targetAgentId: agentId,
        morale: moodRef.current[agentId]?.morale ?? 70
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
      bossLevel,
      fundValue,
      unlockedAchievements,
      toasts,
      cliStatus,
      datasetStatus,
      dismissToast,
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
      bossLevel,
      fundValue,
      unlockedAchievements,
      toasts,
      cliStatus,
      datasetStatus,
      dismissToast,
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
