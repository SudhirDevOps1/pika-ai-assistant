import { create } from "zustand";
import type {
  AppSettings,
  ChatMessage,
  ControlSubTab,
  PendingConfirmation,
  Reminder,
  SystemStatus,
  TabName,
  Toast,
  ToolsSubTab,
} from "@/types";
import { generateId, nowIso } from "@/lib/utils";

const defaultSettings: AppSettings = {
  theme: "dark",
  language: "hi",
  aiProvider: "groq",
  providerModels: {
    groq: "llama-3.3-70b-versatile",
    gemini: "gemini-2.0-flash",
    mistral: "mistral-small-latest",
    cerebras: "llama-3.3-70b",
    openrouter: "meta-llama/llama-3.3-70b-instruct:free",
    zai: "glm-4-flash",
    deepseek: "deepseek-chat",
  },
  apiKeys: {},
  voiceSettings: { language: "hi-IN", speed: 1, pitch: 0 },
  bridgeUrl: "ws://localhost:8765",
  wakeWordEnabled: false,
  soundEffects: true,
  pipMode: false,
  particles: true,
  accentColor: "#00f0ff",
  secondaryAccentColor: "#ff00ff",
  customProviders: [],
};

interface AssistantState {
  // Connection
  isConnected: boolean;
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  demoMode: boolean;

  // Chat
  messages: ChatMessage[];
  isAiThinking: boolean;

  // Voice
  isListening: boolean;
  isSpeaking: boolean;
  partialTranscript: string;
  voiceWaveformData: number[];

  // System
  systemStatus: SystemStatus | null;

  // UI
  activeTab: TabName;
  controlSubTab: ControlSubTab;
  toolsSubTab: ToolsSubTab;
  sidebarExpanded: boolean;
  uiMode: import("@/types").UiMode;
  setUiMode: (m: import("@/types").UiMode) => void;

  // Data
  reminders: Reminder[];
  clipboardHistory: { id: string; content: string; at: string }[];
  commandsExecuted: number;
  nowMs: number;
  drives: { name: string; percent: number; free: number; total: number }[];
  setDrives: (d: { name: string; percent: number; free: number; total: number }[]) => void;
  activityLog: { id: string; text: string; at: number; icon: string }[];
  logActivity: (text: string, icon?: string) => void;
  usageLogs: {
    id: string;
    provider: string;
    model: string;
    query: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    timestamp: string;
  }[];
  addUsageLog: (log: Omit<AssistantState["usageLogs"][0], "id" | "timestamp">) => void;

  // Settings
  settings: AppSettings;

  // API Health
  apiHealth: Record<string, import("@/types").ProviderHealth>;
  setApiHealth: (provider: string, health: import("@/types").ProviderHealth) => void;

  // Toasts & confirmation
  toasts: Toast[];
  pendingConfirmation: PendingConfirmation | null;

  // Actions
  setConnection: (status: AssistantState["connectionStatus"]) => void;
  setDemoMode: (v: boolean) => void;
  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp"> & { id?: string }) => string;
  appendToMessage: (id: string, chunk: string) => void;
  finalizeMessage: (id: string) => void;
  clearMessages: () => void;
  setAiThinking: (v: boolean) => void;
  setListening: (v: boolean) => void;
  setSpeaking: (v: boolean) => void;
  setPartial: (t: string) => void;
  setWaveform: (d: number[]) => void;
  setSystemStatus: (s: SystemStatus) => void;
  setActiveTab: (t: TabName) => void;
  setControlSubTab: (t: ControlSubTab) => void;
  setToolsSubTab: (t: ToolsSubTab) => void;
  toggleSidebar: () => void;
  updateSettings: (p: Partial<AppSettings>) => void;
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  setPendingConfirmation: (c: PendingConfirmation | null) => void;
  addReminder: (r: Reminder) => void;
  updateReminder: (id: string, patch: Partial<Reminder>) => void;
  addClipboard: (content: string) => void;
  incCommands: () => void;
  tick: () => void;
}

export const useStore = create<AssistantState>((set) => ({
  isConnected: false,
  connectionStatus: "disconnected",
  demoMode: false,

  messages: [
    {
      id: generateId(),
      role: "assistant",
      content:
        "नमस्ते! ⚡ मैं **पिका** हूँ — आपका निजी AI असिस्टेंट।\n\nमुझसे हिंदी, English या Hinglish में बात करें। जैसे: `open chrome`, `volume 50%`, `battery dikhao`, या कुछ भी पूछें!",
      timestamp: nowIso(),
      provider: "pika",
    },
  ],
  isAiThinking: false,

  isListening: false,
  isSpeaking: false,
  partialTranscript: "",
  voiceWaveformData: new Array(20).fill(0.1),

  systemStatus: null,

  activeTab: "chat",
  controlSubTab: "system",
  toolsSubTab: "calculator",
  sidebarExpanded: true,
  uiMode: "standard",
  setUiMode: (m) => set({ uiMode: m }),

  reminders: [],
  clipboardHistory: [],
  commandsExecuted: 0,
  nowMs: Date.now(),

  settings: defaultSettings,

  apiHealth: {},

  toasts: [],
  pendingConfirmation: null,

  setConnection: (status) =>
    set({ connectionStatus: status, isConnected: status === "connected" }),
  setDemoMode: (v) => set({ demoMode: v }),

  addMessage: (msg) => {
    const id = msg.id ?? generateId();
    set((s) => ({
      messages: [...s.messages, { ...msg, id, timestamp: nowIso() }],
    }));
    return id;
  },
  appendToMessage: (id, chunk) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + chunk, isStreaming: true } : m
      ),
    })),
  finalizeMessage: (id) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, isStreaming: false } : m)),
    })),
  clearMessages: () => set({ messages: [] }),
  setAiThinking: (v) => set({ isAiThinking: v }),
  setListening: (v) => set({ isListening: v }),
  setSpeaking: (v) => set({ isSpeaking: v }),
  setPartial: (t) => set({ partialTranscript: t }),
  setWaveform: (d) => set({ voiceWaveformData: d }),
  setSystemStatus: (s) => set({ systemStatus: s }),
  setActiveTab: (t) => set({ activeTab: t }),
  setControlSubTab: (t) => set({ controlSubTab: t }),
  setToolsSubTab: (t) => set({ toolsSubTab: t }),
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
  addToast: (t) =>
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id: generateId() }] })),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  setPendingConfirmation: (c) => set({ pendingConfirmation: c }),
  addReminder: (r) => set((s) => ({ reminders: [...s.reminders, r] })),
  updateReminder: (id, patch) =>
    set((s) => ({
      reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),
  addClipboard: (content) =>
    set((s) => ({
      clipboardHistory: [
        { id: generateId(), content, at: nowIso() },
        ...s.clipboardHistory,
      ].slice(0, 50),
    })),
  incCommands: () => set((s) => ({ commandsExecuted: s.commandsExecuted + 1 })),
  tick: () => set({ nowMs: Date.now() }),
  setApiHealth: (provider, health) =>
    set((s) => ({ apiHealth: { ...s.apiHealth, [provider]: health } })),

  drives: [],
  setDrives: (d) => set({ drives: d }),
  activityLog: [],
  logActivity: (text, icon = "⚡") =>
    set((s) => ({
      activityLog: [{ id: generateId(), text, at: Date.now(), icon }, ...s.activityLog].slice(0, 30),
    })),
  usageLogs: [],
  addUsageLog: (log) =>
    set((s) => ({
      usageLogs: [
        { ...log, id: generateId(), timestamp: nowIso() },
        ...s.usageLogs,
      ].slice(0, 100),
    })),
}));
