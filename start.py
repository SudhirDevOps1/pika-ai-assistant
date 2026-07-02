#!/usr/bin/env python3
"""
Pika AI Assistant — Cross-platform Python launcher.
Works on Windows, macOS and Linux. Use this if start.bat doesn't work for you.

Usage:
    python start.py
"""
import os
import platform
import subprocess
import sys
import time
from pathlib import Path

os.environ["PYTHONUTF8"] = "1"

# Force UTF-8 encoding on standard streams to prevent Windows CP1252 charmap encoding errors
import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass


ROOT = Path(__file__).parent.resolve()
os.chdir(ROOT)

IS_WIN = platform.system() == "Windows"
PY = sys.executable

ANSI = {
    "reset": "\033[0m", "bold": "\033[1m",
    "cyan": "\033[96m", "purple": "\033[95m",
    "green": "\033[92m", "yellow": "\033[33m",
    "red": "\033[91m", "dim": "\033[90m", "white": "\033[97m",
}

def color(c, t): return f"{ANSI.get(c, '')}{t}{ANSI['reset']}"

BANNER = f"""
{color('purple', '  ██████╗ ██╗██╗  ██╗ █████╗      █████╗ ██╗')}
{color('purple', '  ██╔══██╗██║██║ ██╔╝██╔══██╗    ██╔══██╗██║')}
{color('purple', '  ██████╔╝██║█████╔╝ ███████║    ███████║██║')}
{color('purple', '  ██╔═══╝ ██║██╔═██╗ ██╔══██║    ██╔══██║██║')}
{color('purple', '  ██║     ██║██║  ██╗██║  ██║    ██║  ██║██║')}
{color('purple', '  ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝')}
{color('cyan', '  ══════════════════════════════════════════════════════════')}
{color('cyan', '     PIKA AI ASSISTANT Launcher v4.0.0 - Production Mode')}
{color('cyan', '  ══════════════════════════════════════════════════════════')}
{color('dim', f'  Project: {ROOT}')}
{color('dim', f'  Python:  {sys.version.split()[0]} ({PY})')}
{color('dim', f'  OS:      {platform.system()} {platform.release()}')}
"""

def step(n, name):
    print(f"\n{color('yellow', f'[{n}/5]')} {color('white', name)}")

def ok(msg): print(f"  {color('green', '[OK]')} {msg}")
def warn(msg): print(f"  {color('yellow', '[WARN]')} {msg}")
def err(msg): print(f"  {color('red', '[ERROR]')} {msg}")

def run(cmd, check=True):
    return subprocess.run(cmd, shell=isinstance(cmd, str), check=check)

print(BANNER)

# 1. Create venv (isolated) + install Python packages inside it
step(1, "Setting up Virtual Environment + Python packages...")
VENV_DIR = ROOT / "venv"
VENV_PY = VENV_DIR / ("Scripts/python.exe" if IS_WIN else "bin/python")
if not VENV_PY.exists():
    print(f"  {color('dim', '► Creating venv (first time, ~30s)...')}")
    if run([PY, "-m", "venv", str(VENV_DIR)], check=False).returncode != 0:
        warn("venv creation failed — falling back to system Python")
        VENV_PY = Path(PY)
    else:
        ok("venv created")
else:
    ok("venv exists (skipped)")

BRIDGE_PY = str(VENV_PY) if VENV_PY.exists() else PY
req = ROOT / "requirements.txt"
if req.exists():
    run([BRIDGE_PY, "-m", "pip", "install", "-r", str(req), "--quiet", "--disable-pip-version-check"], check=False)
    ok("Python packages ready (venv isolated)")
else:
    warn("requirements.txt not found, skipping")

# 2. Install Node packages
step(2, "Checking and updating Node.js packages...")
if (ROOT / "node_modules").exists():
    print(f"  {color('dim', 'node_modules folder exists. Running quick check for updates...')}")
else:
    print(f"  {color('dim', 'node_modules not found. Performing full install...')}")

if run(["npm", "install", "--no-audit", "--no-fund", "--quiet", "--loglevel=error"], check=False).returncode == 0:
    ok("Node.js packages are fully updated")
else:
    err("npm install failed — check internet and try again")
    sys.exit(1)

# 3. Start PC Bridge
step(3, "Starting PC Bridge (Vosk STT + Edge TTS)...")
bridge_py = ROOT / "pc_bridge.py"
if bridge_py.exists():
    if IS_WIN:
        subprocess.Popen(
            ["start", "Pika AI - PC Bridge", "/min", "/d", str(ROOT), "cmd", "/c",
             'title Pika PC Bridge [ws://localhost:8765] && color 0A && venv\\Scripts\\python.exe -X utf8 pc_bridge.py'],
            shell=True,
        )
    else:
        # macOS / Linux — run in background using the venv python
        subprocess.Popen([BRIDGE_PY, str(bridge_py)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok("PC Bridge started on ws://localhost:8765 (minimized/background)")
else:
    warn("pc_bridge.py not found — PC control features will be disabled")

# 4. Detect LAN IP
step(4, "Detecting LAN IP for mobile access...")
lan = "YOUR_PC_IP"
try:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    lan = s.getsockname()[0]
    s.close()
except Exception:
    pass
ok(f"LAN IP: {color('cyan', f'http://{lan}:3000')}")

# 5. Start Web UI
step(5, "Starting Web UI (Vite dev server)...")
print()
for i in range(3):
    print(f"  {color('dim', '.')}", end="", flush=True)
    time.sleep(1)
print()
print()
import webbrowser
webbrowser.open("http://localhost:3000")

print(f"{color('cyan', '╔══════════════════════════════════════════════════╗')}")
print(f"{color('cyan', '║')}  {color('green', 'ALL SYSTEMS GO!')}                                  {color('cyan', '║')}")
print(f"{color('cyan', '║')}                                                  {color('cyan', '║')}")
print(f"{color('cyan', '║')}  {color('white', 'Web UI:')}     {color('cyan', 'http://localhost:3000')}                  {color('cyan', '║')}")
print(f"{color('cyan', '║')}  {color('white', 'PC Bridge:')}  {color('cyan', 'ws://localhost:8765')}                    {color('cyan', '║')}")
print(f"{color('cyan', '║')}                                                  {color('cyan', '║')}")
print(f"{color('cyan', '║')}  {color('purple', 'PHONE (same WiFi):')}                          {color('cyan', '║')}")
url_str = f"   http://{lan}:3000"
padding = 47 - len(url_str)
print(f"{color('cyan', '║')}  {color('cyan', url_str)}{' ' * padding}{color('cyan', '║')}")
print(f"{color('cyan', '║')}                                                  {color('cyan', '║')}")
print(f"{color('cyan', '║')}  {color('dim', 'Ctrl+C = stop | Close bridge = stop it')}      {color('cyan', '║')}")
print(f"{color('cyan', '╚══════════════════════════════════════════════════╝')}")
print()
print("  Scan this QR code with your phone to open the Web UI:")
print()
try:
    import qrcode
    qr = qrcode.QRCode()
    qr.add_data(f"http://{lan}:3000")
    qr.print_ascii(invert=True)
except ImportError:
    print("  (Install 'qrcode' to view the scan link as a QR code)")
print()

# Start Vite (blocks)
run(["npm", "run", "dev"], check=False)
