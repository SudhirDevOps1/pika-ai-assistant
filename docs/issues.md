# 🔍 Pika AI — Discovered Codebase Issues & Technical Causes

This document details all technical issues, bugs, and configuration anomalies discovered in the codebase.

---

## 📖 Table of Issues

1. [Batch Script Parsing & Instant-Close Crash](#1-batch-script-parsing--instant-close-crash)
2. [Python Bridge CP1252 Unicode Encoding Crash](#2-python-bridge-cp1252-unicode-encoding-crash)
3. [WebSocket Connection Failures for Mobile Clients](#3-websocket-connection-failures-for-mobile-clients)
4. [Linux/Mac Launcher System Python Dependency Conflicts (PEP 668)](#4-linuxmac-launcher-system-python-dependency-conflicts-pep-668)
5. [Text-Only Screenshots in Chat Panels](#5-text-only-screenshots-in-chat-panels)
6. [Non-Responsive Sidebar layouts on Mobile Views](#6-non-responsive-sidebar-layouts-on-mobile-views)
7. [Faux/Simulated Telemetry Feeds (Demo Mode Bloat)](#7-fauxsimulated-telemetry-feeds-demo-mode-bloat)

---

## 1. Batch Script Parsing & Instant-Close Crash

### ❌ Symptom
Double-clicking `start.bat` on Windows immediately opened and closed the terminal window in a fraction of a second, preventing the application from launching.

### ⚙️ Technical Cause
* **Parentheses in Directory Path:** The directory path contained spaces and parentheses: `E:\daily\beta pika ai\pika-ai-assistant-prompt (9)`. Windows `cmd.exe` has a parser bug where variables expanded inside parenthesized blocks (`if ( ... )` or `for ( ... )`) are misparsed. Any closing parenthesis `)` (even if double-quoted) is treated as the closing block boundary. This corrupted the batch file structure, causing CMD to try executing random parts of the script, resulting in syntax errors and immediate termination.
* **Unescaped Pipe Character (`|`):** The character `|` inside the final banner's echo statement was parsed by CMD as a pipeline redirection operator, which failed because the subsequent string was not a valid command.
* **Delayed Expansion swallowing:** Literal exclamation marks `!` in messages were eaten by CMD because Delayed Expansion was active.
* **Redirected Input:** The `timeout` command aborted with an error under background/redirected shells.

---

## 2. Python Bridge CP1252 Unicode Encoding Crash

### ❌ Symptom
Running `pc_bridge.py` or the test script `test_bridge.py` on Windows aborted execution with a python traceback:
`UnicodeEncodeError: 'charmap' codec can't encode characters...`

### ⚙️ Technical Cause
The server writes visual box-drawing and block characters (like `██████` or checkmarks `✓`, `✗`) to stdout. On Windows, Python's default stdout stream encoding resolved to CP1252 (Western European) instead of UTF-8, causing a crash when printing high-unicode values.

---

## 3. WebSocket Connection Failures for Mobile Clients

### ❌ Symptom
Opening the web interface on a mobile browser loaded the page, but no PC commands worked. The connection dot remained red and switched to Demo Mode.

### ⚙️ Technical Cause
The mobile browser executes the client code and attempts to connect to the bridge using `ws://localhost:8765`. For the mobile browser, `localhost` points to the phone itself, where no websocket bridge runs, resulting in connection failure.

---

## 4. Linux/Mac Launcher System Python Dependency Conflicts (PEP 668)

### ❌ Symptom
Executing `start.sh` on modern Linux/macOS distributions exited with a `PEP 668: externally-managed-environment` error, preventing packages from being installed.

### ⚙️ Technical Cause
The script did not configure virtual environment isolation and attempted to run `pip3 install` directly into the system python space, which is blocked by modern OS package management standards.

---

## 5. Text-Only Screenshots in Chat Panels

### ❌ Symptom
Taking a screenshot resulted in a simple text log in the chat bubble instead of showing the captured image.

### ⚙️ Technical Cause
The frontend was lacking type declarations for image paths inside the message interface, and `ChatMessage.tsx` had no image render blocks.

---

## 6. Non-Responsive Sidebar layouts on Mobile Views

### ❌ Symptom
The layout was not responsive on mobile screens; the sidebar squeezed the screen, making the interface unusable.

### ⚙️ Technical Cause
The sidebar component lacked mobile drawer layout rules and CSS responsiveness toggles.

---

## 7. Faux/Simulated Telemetry Feeds (Demo Mode Bloat)

### ❌ Symptom
When the backend Python bridge was disconnected, the frontend simulated CPU, RAM, and Battery usage data using random numbers instead of reflecting the actual offline status.

### ⚙️ Technical Cause
The React hooks contained mock interval loops and `demoMode` state variables that generated fake telemetry metrics to run a local simulation mode.

---

## 8. Path-Traversal & System Directory Security Bypass

### ❌ Symptom
Under certain conditions, a malicious or mistranslated request could read, delete, list, or open folders in protected system locations (like `C:\Windows`), bypassing directory security.

### ⚙️ Technical Cause
* **Regex slash-direction dependency:** The `is_path_safe` regex filters checked explicitly for backslashes `\\` to block folders like `C:\Windows`. If a client requested access using forward slashes (e.g. `C:/Windows/System32`), the path bypassed the regex.
* **Relative Path Traversal (`..`):** Using relative traversal patterns (e.g. `Documents/../../Windows`) bypassed literal string matches.
* **Lack of checks in Directory Actions:** The file actions `list` and `open_explorer` did not check `is_path_safe(p)` before executing, exposing system directories to indexing and browsing.

