import { useCallback, useEffect, useRef } from "react";
import { useStore } from "@/store/assistantStore";
import { parseCommand } from "@/lib/commandEngine";
import { EMOTIONAL_RESPONSES } from "@/lib/constants";
import { generateId, nowIso } from "@/lib/utils";
import { sounds } from "@/lib/soundEffects";
import type { WSIncoming, WSMessage } from "@/types";

// ============================================================================
// useAssistant — central brain. Connects to the Python bridge over WebSocket.
// If the bridge is unreachable it seamlessly switches to a local DEMO MODE
// so the whole UI remains fully interactive.
// ============================================================================

const RECONNECT_MAX = 30000;

// Emoji icons per command category — used in the live activity feed
const ICON_FOR_CATEGORY: Record<string, string> = {
  system: "🖥️", apps: "🚀", volume: "🔊", media: "🎵", files: "📁",
  clipboard: "📋", info: "📊", web: "🌐", screen: "📸", processes: "⚙️",
  network: "📡", reminders: "⏰", calculator: "🧮", password: "🔐",
  translator: "🌍", weather: "🌤️", qrcode: "📱", ocr: "👁️", disk: "💾",
  config: "🎛️", music: "🎧",
};

export function useAssistant() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(1000);
  const reconnectTimer = useRef<number | null>(null);
  const streamId = useRef<string | null>(null);

  const store = useStore;

  const streamText = useCallback((text: string, provider = "pika") => {
    const id = store.getState().addMessage({ role: "assistant", content: "", provider, isStreaming: true });
    const words = text.split(/(\s+)/);
    let i = 0;
    store.getState().setAiThinking(false);
    const tick = () => {
      if (i >= words.length) {
        store.getState().finalizeMessage(id);
        return;
      }
      store.getState().appendToMessage(id, words[i]);
      i++;
      window.setTimeout(tick, 18 + Math.random() * 30);
    };
    tick();
  }, [store]);

  // Process a user text input (from typing or voice)
  const processInput = useCallback((text: string) => {
    if (!text.trim()) return;
    store.getState().addMessage({ role: "user", content: text });
    store.getState().incCommands();

    const result = parseCommand(text);

    if (result.parsed && result.parsed.needsConfirmation) {
      store.getState().setPendingConfirmation({
        id: generateId(),
        message: result.reply,
        originalCommand: {
          type: "command",
          category: result.parsed.category,
          action: result.parsed.action,
          params: result.parsed.params,
          id: generateId(),
          timestamp: nowIso(),
        },
      });
      return;
    }

    if (result.parsed) {
      // Non-confirmation command
      if (result.openUrl) {
        window.open(result.openUrl, "_blank", "noopener");
      }
      // Log the action to the live activity feed (PiP + HUD)
      store.getState().logActivity(
        `${result.parsed.category}/${result.parsed.action}`,
        ICON_FOR_CATEGORY[result.parsed.category] ?? "⚡"
      );
      if (result.toast) store.getState().addToast(result.toast);
      if (result.parsed.category === "config" && result.parsed.action === "switch_provider") {
        store.getState().updateSettings({ aiProvider: String(result.parsed.params.provider) });
      }
      sounds.success();

      // Send to backend if connected
      const connected = store.getState().isConnected;
      if (connected && ws.current?.readyState === WebSocket.OPEN) {
        const msg: WSMessage = {
          type: "command",
          category: result.parsed.category,
          action: result.parsed.action,
          params: result.parsed.params,
          id: generateId(),
          timestamp: nowIso(),
        };
        ws.current.send(JSON.stringify(msg));
        streamText(`⌛ कमांड भेजी गई: ${result.reply.replace("📸 ", "").replace("🔊 ", "")}`, "pika");
      } else {
        sounds.error();
        store.getState().addToast({ type: "error", message: "त्रुटि: पीसी ब्रिज कनेक्ट नहीं है।" });
        streamText("❌ पीसी ब्रिज कनेक्ट नहीं है। कृपया start.bat चलाएं ताकि कमांड निष्पादित की जा सके।", "pika");
      }
      return;
    }

    // No command matched → conversation → LLM
    store.getState().setAiThinking(true);
    const connected = store.getState().isConnected;
    if (connected && ws.current?.readyState === WebSocket.OPEN) {
      const state = store.getState();
      const msg: WSMessage = {
        type: "query",
        params: {
          text,
          provider: state.settings.aiProvider,
          model: state.settings.providerModels[state.settings.aiProvider],
          apiKeys: state.settings.apiKeys,
        },
        id: generateId(),
        timestamp: nowIso(),
      };
      streamId.current = msg.id;
      ws.current.send(JSON.stringify(msg));
    } else {
      sounds.error();
      store.getState().setAiThinking(false);
      store.getState().addToast({ type: "error", message: "त्रुटि: पीसी ब्रिज कनेक्ट नहीं है।" });
      streamText("❌ पीसी ब्रिज कनेक्ट नहीं है। कृपया start.bat चलाएं ताकि एआई कार्य कर सके।", "pika");
    }
  }, [store, streamText]);

  // Approve/reject confirmation
  const resolveConfirmation = useCallback((approve: boolean) => {
    const pc = store.getState().pendingConfirmation;
    store.getState().setPendingConfirmation(null);
    if (!pc) return;
    if (approve) {
      sounds.success();
      store.getState().addToast({ type: "success", message: "कमांड निष्पादित" });
      if (store.getState().isConnected && ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(pc.originalCommand));
      }
      streamText("✅ किया गया! कमांड सफलतापूर्वक निष्पादित हुई।", "pika");
    } else {
      sounds.error();
      store.getState().addToast({ type: "info", message: "रद्द किया गया" });
      streamText("❌ ठीक है, रद्द कर दिया।", "pika");
    }
  }, [store, streamText]);

  // Handle incoming WS messages
  const handleMessage = useCallback((raw: string) => {
    let msg: WSIncoming;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "event") {
      switch (msg.event) {
        case "connection_ready":
          store.getState().setConnection("connected");
          break;
        case "system_status":
          store.getState().setSystemStatus(msg.data as never);
          break;
        case "voice_partial":
          store.getState().setPartial((msg.data as { text: string }).text ?? "");
          break;
        case "voice_final":
          store.getState().setPartial("");
          processInput((msg.data as { text: string }).text ?? "");
          break;
        case "tts_started":
          store.getState().setSpeaking(true);
          break;
        case "tts_ended":
          store.getState().setSpeaking(false);
          break;
        case "reminder_triggered":
          sounds.notification();
          store.getState().addToast({ type: "warning", message: `⏰ ${(msg.data as { text: string }).text}` });
          break;
        case "battery_alert":
          store.getState().addToast({ type: "warning", message: "🔋 बैटरी कम है!" });
          break;
        case "wake_word":
          sounds.notification();
          store.getState().addToast({ type: "info", message: "🎙️ Wake word detected — सुन रहा हूँ!" });
          break;
        case "shortcut_executed":
          sounds.success();
          store.getState().addToast({
            type: "success",
            message: `⚡ ${(msg.data as { message: string }).message}`,
          });
          break;
        case "tts_audio": {
          // Backend sent base64 audio (Edge TTS mp3 / pyttsx3 wav) — play it
          try {
            const d = msg.data as { audio: string; format: string };
            const mime = d.format === "wav" ? "audio/wav" : "audio/mpeg";
            const audio = new Audio(`data:${mime};base64,${d.audio}`);
            store.getState().setSpeaking(true);
            audio.onended = () => store.getState().setSpeaking(false);
            audio.play().catch(() => store.getState().setSpeaking(false));
          } catch {
            store.getState().setSpeaking(false);
          }
          break;
        }
      }
    } else if (msg.type === "llm_stream") {
      if (!streamId.current) return;
      if (!store.getState().messages.find((m) => m.id === streamId.current)) {
        store.getState().addMessage({ id: streamId.current, role: "assistant", content: "", provider: msg.provider, isStreaming: true });
        store.getState().setAiThinking(false);
      }
      if (msg.done) {
        store.getState().finalizeMessage(streamId.current);
        const finalMsg = store.getState().messages.find((m) => m.id === streamId.current);
        const cleanText = finalMsg ? finalMsg.content.replace(/\[COMMAND:.*?\]/g, "").trim() : "";

        if (cleanText) {
          const v = store.getState().settings.voiceSettings;
          if (v.ttsEngine === "edgetts") {
            sendRaw({
              type: "tts_speak",
              params: { text: cleanText, voice: v.language === "hi-IN" ? "hi-IN-MadhurNeural" : "en-US-Neural" },
              id: generateId(),
              timestamp: nowIso(),
            });
          } else if (v.ttsEngine === "webspeech") {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(cleanText);
            u.lang = v.language || "hi-IN";
            u.rate = v.speed || 1;
            store.getState().setSpeaking(true);
            u.onend = () => store.getState().setSpeaking(false);
            u.onerror = () => store.getState().setSpeaking(false);
            window.speechSynthesis.speak(u);
          }
        }

        if (msg.usage) {
          const userMsg = store.getState().messages.slice().reverse().find((m) => m.role === "user");
          store.getState().addUsageLog({
            provider: msg.provider,
            model: store.getState().settings.providerModels[msg.provider] ?? "default",
            query: userMsg?.content ?? "N/A",
            promptTokens: msg.usage.prompt_tokens ?? 0,
            completionTokens: msg.usage.completion_tokens ?? 0,
            totalTokens: msg.usage.total_tokens ?? 0,
          });
        }
        streamId.current = null;
      } else {
        store.getState().appendToMessage(streamId.current, msg.chunk);
      }
    } else if (msg.type === "response") {
      if (msg.status === "error") {
        store.getState().addToast({ type: "error", message: msg.message });
      } else {
        const resData = msg.data as { drives?: { name: string; percent: number; free: number; total: number }[]; thumbnail?: string } | null;
        if (resData && Array.isArray(resData.drives)) {
          store.getState().setDrives(resData.drives);
        }
        if (resData && resData.thumbnail) {
          store.getState().addMessage({
            role: "assistant",
            content: msg.message,
            image: resData.thumbnail,
            provider: "pika",
          });
        }
      }
    }
  }, [store, processInput]);

  const connect = useCallback(() => {
    let url = store.getState().settings.bridgeUrl;
    const hostname = window.location.hostname;
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      url = url.replace("localhost", hostname).replace("127.0.0.1", hostname);
    }
    store.getState().setConnection("connecting");
    try {
      const socket = new WebSocket(url);
      ws.current = socket;
      const failTimer = window.setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.close();
        }
      }, 4000);

      socket.onopen = () => {
        window.clearTimeout(failTimer);
        reconnectDelay.current = 1000;
        store.getState().setConnection("connected");
        sounds.connect();
        store.getState().addToast({ type: "success", message: "🔗 ब्रिज से कनेक्ट हो गया" });
      };
      socket.onmessage = (e) => handleMessage(typeof e.data === "string" ? e.data : "");
      socket.onerror = () => {
        // handled by onclose
      };
      socket.onclose = () => {
        window.clearTimeout(failTimer);
        const wasConnected = store.getState().isConnected;
        store.getState().setConnection("disconnected");
        if (wasConnected) {
          store.getState().addToast({ type: "error", message: "ब्रिज से कनेक्शन टूट गया, पुनः प्रयास..." });
        }
        reconnectTimer.current = window.setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, RECONNECT_MAX);
          connect();
        }, reconnectDelay.current);
      };
    } catch {
      store.getState().setConnection("error");
    }
  }, [store, handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    ws.current?.close();
    ws.current = null;
  }, []);

  const sendRaw = useCallback((msg: WSMessage) => {
    if (store.getState().isConnected && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, [store]);

  // Auto connect on mount + reminder clock
  useEffect(() => {
    connect();

    const clock = window.setInterval(() => {
      store.getState().tick();
      const now = Date.now();
      store.getState().reminders.forEach((r) => {
        if (r.status === "active" && r.triggerAt <= now) {
          store.getState().updateReminder(r.id, { status: "triggered" });
          sounds.notification();
          store.getState().addToast({ type: "warning", message: `⏰ ${r.text}` });
        }
      });
    }, 1000);

    return () => {
      window.clearInterval(clock);
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { processInput, resolveConfirmation, connect, disconnect, sendRaw };
}
