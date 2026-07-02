#!/usr/bin/env bash
# Pika AI Assistant — Linux/Mac Launcher (Production)
set -e

# Setup ANSI colors for terminal output
G="\033[32m"
R="\033[31m"
C="\033[36m"
Y="\033[33m"
M="\033[35m"
N="\033[0m"

clear
echo -e "${M}  ██████╗ ██╗██╗  ██╗ █████╗      █████╗ ██╗"
echo -e "  ██╔══██╗██║██║ ██╔╝██╔══██╗    ██╔══██╗██║"
echo -e "  ██████╔╝██║█████╔╝ ███████║    ███████║██║"
echo -e "  ██╔═══╝ ██║██╔═██╗ ██╔══██║    ██╔══██║██║"
echo -e "  ██║     ██║██║  ██╗██║  ██║    ██║  ██║██║"
echo -e "  ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝${N}"
echo -e ""
echo -e "${C}  ══════════════════════════════════════════════════════════${N}"
echo -e "${C}     PIKA AI ASSISTANT Launcher v4.0.0 - Production Mode${N}"
echo -e "${C}  ══════════════════════════════════════════════════════════${N}"
echo -e ""

# --- [1/5] Checking Python ---
echo -e "${C}[1/5] Checking Python environment...${N}"
if ! command -v python3 >/dev/null 2>&1; then
  echo -e "${R}┌────────────────────────────────────────────────────────┐${N}"
  echo -e "${R}│ ❌ ERROR: Python 3 not found!                          │${N}"
  echo -e "${R}├────────────────────────────────────────────────────────┤${N}"
  echo -e "${R}│ Please install Python 3.10+ using your package manager  │${N}"
  echo -e "${R}│ (e.g. brew install python, apt install python3)        │${N}"
  echo -e "${R}└────────────────────────────────────────────────────────┘${N}"
  exit 1
fi
PY_VER=$(python3 --version)
echo -e "  [ ${G}✓${N} ] Python detected: ${Y}${PY_VER}${N}"

# --- [2/5] Checking Node.js ---
if ! command -v node >/dev/null 2>&1; then
  echo -e "${R}┌────────────────────────────────────────────────────────┐${N}"
  echo -e "${R}│ ❌ ERROR: Node.js not found!                           │${N}"
  echo -e "${R}├────────────────────────────────────────────────────────┤${N}"
  echo -e "${R}│ Please install Node.js (LTS version) from:             │${N}"
  echo -e "${R}│ https://nodejs.org or via your package manager.        │${N}"
  echo -e "${R}└────────────────────────────────────────────────────────┘${N}"
  exit 1
fi
NODE_VER=$(node -v)
echo -e "  [ ${G}✓${N} ] Node.js detected: ${Y}${NODE_VER}${N}"
echo -e ""

# --- [3/5] Setting up Virtual Environment (venv) ---
echo -e "${C}[3/5] Setting up isolated Python environment (venv)...${N}"
if [ ! -f "venv/bin/python" ]; then
  echo -e "  [ ${Y}i${N} ] Creating new virtual environment (venv)..."
  python3 -m venv venv
  echo -e "  [ ${G}✓${N} ] Virtual environment created successfully."
else
  echo -e "  [ ${G}✓${N} ] Virtual environment already exists."
fi
VENV_PY="venv/bin/python"

# --- [4/5] Install/Update Python Packages ---
echo -e ""
echo -e "${C}[4/5] Checking and updating Python dependencies...${N}"
if [ ! -f "requirements.txt" ]; then
  echo -e "  [ ${R}✗${N} ] requirements.txt not found! Skipping."
else
  echo -e "  [ ${Y}i${N} ] Running pip install [installing/updating]..."
  $VENV_PY -m pip install --upgrade pip --quiet >/dev/null 2>&1
  $VENV_PY -m pip install -r requirements.txt --quiet
  echo -e "  [ ${G}✓${N} ] Python dependencies are fully updated."
fi

# --- [5/5] Install/Update Node Packages ---
echo -e ""
echo -e "${C}[5/5] Checking and updating Node.js packages...${N}"
if [ -d "node_modules" ]; then
  echo -e "  [ ${Y}i${N} ] node_modules folder exists. Running quick check..."
else
  echo -e "  [ ${Y}i${N} ] node_modules not found. Performing full install..."
fi

if npm install --no-audit --no-fund --quiet --loglevel=error; then
  echo -e "  [ ${G}✓${N} ] Node.js packages are fully updated."
else
  echo -e "${R}┌────────────────────────────────────────────────────────┐${N}"
  echo -e "${R}│ ❌ ERROR: npm install failed!                          │${N}"
  echo -e "${R}├────────────────────────────────────────────────────────┤${N}"
  echo -e "${R}│ Please check your internet connection and try running  │${N}"
  echo -e "${R}│ 'npm install' manually.                                │${N}"
  echo -e "${R}└────────────────────────────────────────────────────────┘${N}"
  exit 1
fi

# --- [Launch] Starting PC Bridge + Web UI ---
echo -e ""
echo -e "${C}══════════════════════════════════════════════════════════${N}"
echo -e "${C}  LAUNCHING SYSTEMS${N}"
echo -e "${C}══════════════════════════════════════════════════════════${N}"
echo -e ""

echo -e "  [ ${Y}i${N} ] Starting PC Bridge..."
if [ -f "pc_bridge.py" ]; then
  $VENV_PY pc_bridge.py >/dev/null 2>&1 &
  BRIDGE_PID=$!
  trap "kill $BRIDGE_PID 2>/dev/null" EXIT
  echo -e "  [ ${G}✓${N} ] PC Bridge launched successfully (PID: $BRIDGE_PID)"
else
  echo -e "  [ ${R}✗${N} ] pc_bridge.py not found! PC control disabled."
fi

# LAN IP detection for mobile access
if [[ "$OSTYPE" == "darwin"* ]]; then
  LAN_IP=$(ipconfig getifaddr en0 || echo "127.0.0.1")
else
  LAN_IP=$(hostname -I | awk '{print $1}' || echo "127.0.0.1")
fi

echo -e "  [ ${Y}i${N} ] Launching Web browser..."
sleep 3
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3000"
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:3000"
fi

echo -e ""
echo -e "${G}  ┌────────────────────────────────────────────────────────┐${N}"
echo -e "${G}  │ 🚀 ALL SYSTEMS GO! Pika AI Assistant is running!      │${N}"
echo -e "${G}  ├────────────────────────────────────────────────────────┤${N}"
echo -e "${G}  │  Web UI:     ${Y}http://localhost:3000${N}                       ${G}│${N}"
echo -e "${G}  │  PC Bridge:  ${Y}ws://localhost:8765${N}                         ${G}│${N}"
echo -e "${G}  │                                                        │${N}"
echo -e "${G}  │  MOBILE SYNC (Same WiFi):                              │${N}"
echo -e "${G}  │  Url:        ${C}http://${LAN_IP}:3000${N}                        ${G}│${N}"
echo -e "${G}  └────────────────────────────────────────────────────────┘${N}"
echo -e ""

echo -e "  ${Y}Note: Keep this window open. Press Ctrl+C to stop services.${N}"
echo -e ""

npm run dev
