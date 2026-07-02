# 🚀 Pika AI — Added Advanced Features

This document highlights the futuristic systems and features built into Pika AI.

---

## 🌟 Advanced Systems

1. [LLM Dynamic Command Execution (Tool Use)](#1-llm-dynamic-command-execution-tool-use)
2. [PrismJS Code Highlighting (VS Code Theme)](#2-prismjs-code-highlighting-vs-code-theme)
3. [Token API Usage Tracking Dashboard](#3-token-api-usage-tracking-dashboard)
4. [Manual Speech Engine Selectors (STT/TTS)](#4-manual-speech-engine-selectors-stttts)
5. [Mobile Sync QR Code Integration](#5-mobile-sync-qr-code-integration)

---

## 1. LLM Dynamic Command Execution (Tool Use)

### ⚙️ How it Works
When commands do not match the local regex parser rules (e.g. spelling mistakes like `brightnesss`), the query is handled by the LLM. 
We updated the `SYSTEM_PROMPT` in `pc_bridge.py` to instruct the LLM to control the PC by appending a structured `[COMMAND: {"category": "...", "action": "...", "params": {...}}]` block at the end of its response. 
The Python bridge parses this command block on stream completion and executes the PC action dynamically.

---

## 2. PrismJS Code Highlighting (VS Code Theme)

### ⚙️ How it Works
Integrated the `prismjs` syntax highlighting package and loaded the Tomorrow theme (`prism-tomorrow.css`). 
When the LLM outputs a fenced code block, [MarkdownRenderer.tsx](file:///e:/daily/beta%20pika%20ai/pika-ai-assistant-prompt%20(9)/src/components/MarkdownRenderer.tsx) formats it via `Prism.highlight`, rendering tags, keywords, strings, and numbers in the standard VS Code dark-mode syntax style.

---

## 3. Token API Usage Tracking Dashboard

### ⚙️ How it Works
* **Backend:** Estimates prompt and completion tokens (via length metrics or API usage counts) and streams them to the client on query completion.
* **Frontend Store:** Logs these metrics in Zustand state `usageLogs`.
* **UI Dashboard:** Renders a gorgeous neon **AI टोकन उपयोग (API usage)** widget under Settings showing:
  * Total tokens consumed
  * Prompt vs Completion ratios
  * Details of recent queries, providers, and individual token splits.

---

## 4. Manual Speech Engine Selectors (STT/TTS)

### ⚙️ How it Works
Added manual dropdown selections under settings to let users customize:
* **Listening (STT):** Choose between **Web Speech (Online Browser)** mic capture or **Pika Voice (Offline PC Vosk)** speech recognition.
* **Speaking (TTS):** Choose between **Neural Voice (Online PC Edge TTS)** or **Local Voice (Offline Browser SpeechSynthesis)**.
* **Auto-Readout:** Triggers speech synthesis automatically once a response completes streaming on screen.

---

## 5. Mobile Sync QR Code Integration

### ⚙️ How it Works
* The bridge retrieves your actual LAN IP dynamically via socket connections.
* The Settings page generates a scan-ready QR code pointing to `http://<LAN_IP>:3000`.
* Double-clicking the launcher prints a large terminal QR code. Users can scan this with their phone to control their PC remotely instantly.
