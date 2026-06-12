import { AgentProfile } from "../types";

export const defaultAgents: AgentProfile[] = [
  {
    id: "agent-strategy",
    role: "strategy_researcher",
    name: "Mira Signal",
    defaultAssetPath: "/assets/design/agents/strategy.png",
    designSheetPath: "/assets/design/agents/strategy-sheet.png",
    crop: { scale: 1, x: 0, y: 0 },
    appearance: {
      themeColor: "#ef6f6c",
      hairColor: "#8b3e8f",
      bubbleColor: "#fff0f0",
      clothingStyle: "coral blazer, white skirt, marker pouch",
      bodyStyle: "chibi blazer"
    },
    catchphrases: [
      "This signal smells promising.",
      "Do not reject it yet. I have a hypothesis.",
      "Let me dig one layer deeper."
    ],
    personality: "Active, curious, fast to spot possible market structure.",
    defaultEmotion: "thinking",
    commonActions: ["thinking", "excited", "debating"],
    visible: true,
    casualChatter: true,
    exaggeratedEmotions: true
  },
  {
    id: "agent-code",
    role: "code_engineer",
    name: "Ren Compile",
    defaultAssetPath: "/assets/design/agents/code.png",
    designSheetPath: "/assets/design/agents/code-sheet.png",
    crop: { scale: 1, x: 0, y: 0 },
    appearance: {
      themeColor: "#3f88c5",
      hairColor: "#253858",
      bubbleColor: "#eaf5ff",
      clothingStyle: "blue hoodie, terminal badges, keyboard gloves",
      bodyStyle: "hoodie chibi"
    },
    catchphrases: [
      "If it runs, we are alive.",
      "The strategy is not broken. The column name changed.",
      "Let me patch this first."
    ],
    personality: "Pragmatic, terse, happier after green test output.",
    defaultEmotion: "coding",
    commonActions: ["coding", "tired", "checking_chart"],
    visible: true,
    casualChatter: true,
    exaggeratedEmotions: true
  },
  {
    id: "agent-risk",
    role: "risk_reviewer",
    name: "Sana Risk",
    defaultAssetPath: "/assets/design/agents/risk.png",
    designSheetPath: "/assets/design/agents/risk-sheet.png",
    crop: { scale: 1, x: 0, y: 0 },
    appearance: {
      themeColor: "#8f5a2a",
      hairColor: "#4a2f22",
      bubbleColor: "#fff7e8",
      clothingStyle: "tan suit, red pencil, heavy folder",
      bodyStyle: "folder chibi"
    },
    catchphrases: [
      "It must pass my desk first.",
      "This smells like lookahead bias.",
      "Pretty returns do not mean usable returns."
    ],
    personality: "Serious, protective, suspicious of beautiful curves.",
    defaultEmotion: "checking_chart",
    commonActions: ["checking_chart", "angry", "debating"],
    visible: true,
    casualChatter: false,
    exaggeratedEmotions: true
  },
  {
    id: "agent-skeptic",
    role: "skeptic_researcher",
    name: "Ivo Doubt",
    defaultAssetPath: "/assets/design/agents/skeptic.png",
    designSheetPath: "/assets/design/agents/skeptic-sheet.png",
    crop: { scale: 1, x: 0, y: 0 },
    appearance: {
      themeColor: "#6c6f7d",
      hairColor: "#6f7280",
      bubbleColor: "#f3f4f7",
      clothingStyle: "gray cardigan, folded sleeves, tiny notebook",
      bodyStyle: "cardigan chibi"
    },
    catchphrases: [
      "I do not buy it yet.",
      "Try another year first.",
      "This may just be luck."
    ],
    personality: "Calm, analytical, allergic to overfitting.",
    defaultEmotion: "whispering",
    commonActions: ["whispering", "debating", "thinking"],
    visible: true,
    casualChatter: true,
    exaggeratedEmotions: false
  },
  {
    id: "agent-manager",
    role: "experiment_manager",
    name: "Noa Ledger",
    defaultAssetPath: "/assets/design/agents/manager.png",
    designSheetPath: "/assets/design/agents/manager-sheet.png",
    crop: { scale: 1, x: 0, y: 0 },
    appearance: {
      themeColor: "#2f9c95",
      hairColor: "#165b61",
      bubbleColor: "#e8fffb",
      clothingStyle: "teal vest, clipboard, clock pin",
      bodyStyle: "lead chibi"
    },
    catchphrases: [
      "The conclusion must be reproducible.",
      "Stop arguing. Next iteration.",
      "Write it down."
    ],
    personality: "Organized, decisive, keeps the research loop moving.",
    defaultEmotion: "idle",
    commonActions: ["debating", "checking_chart", "walking"],
    visible: true,
    casualChatter: true,
    exaggeratedEmotions: false
  },
  {
    id: "agent-data",
    role: "data_manager",
    name: "Kira Timestamp",
    defaultAssetPath: "/assets/design/agents/data.png",
    designSheetPath: "/assets/design/agents/data-sheet.png",
    crop: { scale: 1, x: 0, y: 0 },
    appearance: {
      themeColor: "#7b61ff",
      hairColor: "#5930b5",
      bubbleColor: "#f1edff",
      clothingStyle: "violet utility dress, data tags, folder satchel",
      bodyStyle: "satchel chibi"
    },
    catchphrases: [
      "Align the data first.",
      "This timestamp is dirty.",
      "Do not use future data."
    ],
    personality: "Careful, detail-driven, sees timestamp problems early.",
    defaultEmotion: "confused",
    commonActions: ["checking_chart", "confused", "walking"],
    visible: true,
    casualChatter: true,
    exaggeratedEmotions: true
  }
];
