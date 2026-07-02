# 🗺️ Pika AI — Future Roadmap & Extensions

This document outlines upcoming capabilities, architectural upgrades, and features planned for future versions of Pika AI.

---

## 📅 Roadmap Plan

### 🚀 Milestone 1: Electron Desktop Packaging (v5.0.0)
* **Goal:** Package Pika AI as a native cross-platform desktop application (`.exe`, `.dmg`, `.deb`).
* **Implementation:** Use **Electron** or **Tauri** to bundle the Vite frontend.
* **Auto-Launch:** Configure the desktop app to start the Python PC Bridge automatically in a child process on launch.

### 🎤 Milestone 2: Custom Offline Wake Word Training (v5.5.0)
* **Goal:** Enable custom wake word recognition (e.g. "Suno Pika") offline.
* **Implementation:** Integrate **Sherpa-onnx** or **OpenWakeWord** on the Python backend, replacing simple threshold-based detection with deep-learning keyword spotting.

### 🌐 Milestone 3: Multilingual UI & Voice Toggle (v6.0.0)
* **Goal:** Add full localization and language toggles.
* **Implementation:** Implement React i18next to translate the Web UI. Connect the selected language state directly to the TTS/STT engines so switching languages instantly loads corresponding Vosk offline models and Edge-TTS voices.

### 🤖 Milestone 4: Native Tool-Use Agents (v7.0.0)
* **Goal:** Enable the assistant to execute complex multi-step workflows.
* **Implementation:** Support LangChain/LangGraph agent frameworks. Let the LLM reason over system states, search files, run scripts, and inspect progress loops autonomously.

---

## 🤝 How to Help
If you are interested in contributing to any of these features, please check our [Contributing Section](../README.md#-contributing) in the main README!
