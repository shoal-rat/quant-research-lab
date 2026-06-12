# Wires the retention layer into the AppStore.
import io

path = "src/store/AppStore.tsx"
text = io.open(path, encoding="utf-8").read()


def rep(old, new):
    global text
    assert old in text, f"NOT FOUND: {old[:80]!r}"
    text = text.replace(old, new, 1)


rep(
    'import { MockQuantLLMAdapter } from "../engines/llmAdapters";',
    'import { MockQuantLLMAdapter } from "../engines/llmAdapters";\n'
    'import { BridgeResearchAdapter } from "../engines/bridgeResearchAdapter";\n'
    'import { ACHIEVEMENTS, computeLevel, computeXp, fundNav, BossLevel } from "../engines/progression";',
)

rep(
    "import {\n  bossDirectiveConversation,\n  gossipConversation,\n  ideaRevealConversation,\n  lovedConversation,\n  phaseConversation,\n  whippedConversation\n} from \"../engines/dialogue/dialogueLocal\";",
    "import {\n  bossDirectiveConversation,\n  gossipConversation,\n  ideaRevealConversation,\n  lovedConversation,\n  officeEventConversation,\n  phaseConversation,\n  whippedConversation\n} from \"../engines/dialogue/dialogueLocal\";",
)

rep(
    'const STORAGE = {\n  agents: "qrl.agents",\n  settings: "qrl.settings",\n  experiments: "qrl.experiments",\n  loop: "qrl.loop",\n  mood: "qrl.mood"\n};',
    'const STORAGE = {\n  agents: "qrl.agents",\n  settings: "qrl.settings",\n  experiments: "qrl.experiments",\n  loop: "qrl.loop",\n  mood: "qrl.mood",\n  achievements: "qrl.achievements",\n  level: "qrl.level"\n};\n\nexport interface GameToast {\n  id: string;\n  icon: string;\n  title: string;\n  detail: string;\n}',
)

rep(
    "  currentExperiment?: ExperimentRecord;\n  director: OfficeDirector;\n  wallpaperMode: boolean;",
    "  currentExperiment?: ExperimentRecord;\n  director: OfficeDirector;\n  wallpaperMode: boolean;\n  bossLevel: BossLevel;\n  fundValue: number;\n  unlockedAchievements: Record<string, number>;\n  toasts: GameToast[];\n  dismissToast: (id: string) => void;",
)

rep(
    "  const adapterRef = useRef(new MockQuantLLMAdapter());",
    "  const adapterRef = useRef<MockQuantLLMAdapter | BridgeResearchAdapter>(new MockQuantLLMAdapter());",
)

rep(
    "  const [bossEvents, setBossEvents] = useState<BossEvent[]>([]);",
    "  const [bossEvents, setBossEvents] = useState<BossEvent[]>([]);\n"
    "  const [unlockedAchievements, setUnlockedAchievements] = useState<Record<string, number>>(() =>\n"
    "    readStored(STORAGE.achievements, {})\n"
    "  );\n"
    "  const [toasts, setToasts] = useState<GameToast[]>([]);",
)

progression_block = """  // research brain selection (local engine vs CLI via the bridge)
  useEffect(() => {
    adapterRef.current =
      settings.researchBrain === "local"
        ? new MockQuantLLMAdapter()
        : new BridgeResearchAdapter(() => settingsRef.current);
  }, [settings.researchBrain]);

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
        icon: "\\u{1F451}",
        title:
          settings.language === "zh"
            ? `\\u5347\\u7EA7\\uFF01Lv.${bossLevel.level} ${bossLevel.title.zh}`
            : `Level up! Lv.${bossLevel.level} ${bossLevel.title.en}`,
        detail: settings.language === "zh" ? "\\u6574\\u4E2A\\u529E\\u516C\\u5BA4\\u90FD\\u5728\\u9F13\\u638C\\u3002" : "The whole office is applauding."
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

  // Wallpaper mode: auto-run the loop forever."""

rep("  // Wallpaper mode: auto-run the loop forever.", progression_block)

old_decision = """      if (activeLoop.phase === "decision") {
        const experiment = experimentsRef.current.find((item) => item.id === loopRef.current.currentExperimentId) ?? current;
        await setPhase("saved", experiment);
        setLoop((prev) => ({"""
new_decision = """      if (activeLoop.phase === "decision") {
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
        setLoop((prev) => ({"""
rep(old_decision, new_decision)

rep(
    "      currentExperiment,\n      director,\n      wallpaperMode,\n      updateSettings,",
    "      currentExperiment,\n      director,\n      wallpaperMode,\n      bossLevel,\n      fundValue,\n      unlockedAchievements,\n      toasts,\n      dismissToast,\n      updateSettings,",
)
rep(
    "      currentExperiment,\n      director,\n      wallpaperMode,\n      updateSettings,\n      updateAgent,",
    "      currentExperiment,\n      director,\n      wallpaperMode,\n      bossLevel,\n      fundValue,\n      unlockedAchievements,\n      toasts,\n      dismissToast,\n      updateSettings,\n      updateAgent,",
)

io.open(path, "w", encoding="utf-8", newline="\n").write(text)
print("AppStore wired")
