#!/usr/bin/env python3
"""
============================================================================
 PIKA AI — PC Bridge (WebSocket Backend)
----------------------------------------------------------------------------
 Run this on your PC to control it from the Pika web UI.

 Features:
   • Offline Hindi/English STT via Vosk (auto-downloads model on first run)
   • Wake word detection: "hey assistant" / "hey pika" / "पिका"
   • Natural TTS via Microsoft Edge TTS (hi-IN-SwaraNeural)
     — automatic pyttsx3 offline fallback when internet is down
   • Full PC automation: system power, apps, volume, media, files,
     clipboard, screenshots, windows, processes, network, reminders
   • Multi-provider free LLM router with streaming + auto-fallback
   • Mobile access: connect from your phone on the same WiFi

 Usage:
     pip install -r requirements.txt
     python pc_bridge.py

 Then open the web UI (npm run dev) and it auto-connects to ws://localhost:8765
 From your PHONE (same WiFi): http://YOUR_PC_IP:3000
============================================================================
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import platform
import re
import secrets as pysecrets
import shutil
import socket
import string
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import uuid
import webbrowser
from datetime import datetime, timezone

def get_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
from pathlib import Path

# Force UTF-8 encoding on standard streams to prevent Windows CP1252 charmap encoding errors
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass


# ─── Required dependency ────────────────────────────────────────────────────
try:
    import websockets
    try:
        from websockets.asyncio.server import serve
    except ImportError:
        from websockets import serve  # older versions
except ImportError:
    print("FATAL: 'websockets' not installed. Run: pip install websockets")
    sys.exit(1)

# ─── Optional dependencies (graceful degradation) ───────────────────────────
def _opt(name):
    try:
        return __import__(name)
    except Exception:
        print(f"[warn] optional '{name}' not available — related features limited")
        return None

psutil = _opt("psutil")
pyautogui = _opt("pyautogui")
pyperclip = _opt("pyperclip")
requests = _opt("requests")

try:
    import pygetwindow as gw
except Exception:
    gw = None

try:
    from vosk import Model, KaldiRecognizer
    HAS_VOSK = True
except Exception:
    Model = KaldiRecognizer = None
    HAS_VOSK = False
    print("[warn] 'vosk' not installed — offline STT disabled (pip install vosk)")

try:
    import edge_tts
    HAS_EDGE_TTS = True
except Exception:
    edge_tts = None
    HAS_EDGE_TTS = False
    print("[warn] 'edge-tts' not installed — TTS will use pyttsx3 fallback")

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# ─── Constants ───────────────────────────────────────────────────────────────
HOST = "0.0.0.0"
PORT = 8765
SERVER_VERSION = "2.0.0"
IS_WIN = platform.system() == "Windows"
IS_MAC = platform.system() == "Darwin"

WAKE_WORDS = ["hey assistant", "hey pika", "पिका", "pika", "हे असिस्टेंट"]
VOSK_MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-hi-0.22.zip"
VOSK_MODEL_DIR = Path(__file__).parent / "models" / "hi"
DEFAULT_TTS_VOICE = "hi-IN-SwaraNeural"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(Path(__file__).parent / "pc_bridge.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("PIKA-Bridge")

APP_MAP = {
    "chrome": "chrome", "google chrome": "chrome", "firefox": "firefox",
    "brave": "brave", "edge": "msedge", "vs code": "code", "vscode": "code",
    "code": "code", "notepad": "notepad", "terminal": "wt", "cmd": "cmd",
    "powershell": "powershell", "explorer": "explorer",
    "file explorer": "explorer", "फाइल एक्सप्लोरर": "explorer",
    "calculator": "calc", "calc": "calc", "कैलकुलेटर": "calc",
    "spotify": "spotify", "vlc": "vlc", "telegram": "telegram",
    "discord": "discord", "whatsapp": "WhatsApp", "zoom": "zoom",
    "word": "winword", "excel": "excel", "powerpoint": "powerpnt",
    "paint": "mspaint", "task manager": "taskmgr", "control panel": "control",
    "settings": "ms-settings:", "camera": "microsoft.windows.camera:",
    "snipping tool": "SnippingTool",
}

URL_MAP = {
    "youtube": "https://youtube.com", "यूट्यूब": "https://youtube.com",
    "google": "https://google.com", "गूगल": "https://google.com",
    "github": "https://github.com", "gmail": "https://mail.google.com",
    "twitter": "https://x.com", "x": "https://x.com",
    "facebook": "https://facebook.com", "instagram": "https://instagram.com",
    "whatsapp": "https://web.whatsapp.com",
    "stackoverflow": "https://stackoverflow.com", "wikipedia": "https://wikipedia.org",
    "reddit": "https://reddit.com", "linkedin": "https://linkedin.com",
    "amazon": "https://amazon.in", "flipkart": "https://flipkart.com",
    "netflix": "https://netflix.com", "hotstar": "https://hotstar.com",
    "chatgpt": "https://chat.openai.com", "claude": "https://claude.ai",
}


def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def resolve_path(path_str: str) -> Path:
    """Resolve natural-language / relative paths against the home directory."""
    home = Path.home()
    if not path_str:
        return home / "Desktop"
    path_str = os.path.expandvars(path_str)
    low = path_str.lower().strip()
    folders = {
        "desktop": "Desktop", "documents": "Documents", "downloads": "Downloads",
        "pictures": "Pictures", "music": "Music", "videos": "Videos",
    }
    for k, v in folders.items():
        if low == k or low.startswith(k + "/") or low.startswith(k + "\\"):
            rest = path_str[len(k):].strip("/\\")
            return (home / v / rest) if rest else (home / v)
    p = Path(path_str).expanduser()
    return p if p.is_absolute() else home / p


BLOCKED_PATTERNS = [
    r"^[a-zA-Z]:\\$", r"^[a-zA-Z]:\\Windows", r"^[a-zA-Z]:\\Program Files",
    r"^/System", r"^/usr", r"^/etc", r"^/bin",
]


def is_path_safe(p: Path) -> bool:
    try:
        resolved_path = str(p.resolve())
    except Exception:
        resolved_path = str(p.absolute())
    if IS_WIN:
        resolved_path = resolved_path.replace("/", "\\")
    return not any(re.search(pat, resolved_path, re.IGNORECASE) for pat in BLOCKED_PATTERNS)


def ok(msg: str, data=None):
    return {"success": True, "message": msg, "data": data}


def err(msg: str):
    return {"success": False, "message": msg, "data": None}


def run(cmd, shell=False, timeout=15):
    return subprocess.run(cmd, shell=shell, capture_output=True, text=True, timeout=timeout)


# ═══════════════════════════════════════════════════════════════════════════
#  COMMAND HANDLERS
# ═══════════════════════════════════════════════════════════════════════════

def cmd_system(action, params):
    try:
        if action == "shutdown":
            run(["shutdown", "/s", "/t", str(params.get("delay", 10))]) if IS_WIN else run(["shutdown", "-h", "now"])
            return ok("कंप्यूटर बंद हो रहा है।")
        if action == "restart":
            run(["shutdown", "/r", "/t", str(params.get("delay", 10))]) if IS_WIN else run(["reboot"])
            return ok("कंप्यूटर रीस्टार्ट हो रहा है।")
        if action == "sleep":
            run("rundll32.exe powrprof.dll,SetSuspendState 0,1,0", shell=True) if IS_WIN else run(["systemctl", "suspend"])
            return ok("स्लीप मोड में जा रहे हैं।")
        if action == "lock":
            run("rundll32.exe user32.dll,LockWorkStation", shell=True) if IS_WIN else run(["loginctl", "lock-session"])
            return ok("स्क्रीन लॉक कर दी।")
        if action == "logoff":
            run(["shutdown", "/l"]) if IS_WIN else run(["logout"], shell=True)
            return ok("लॉग आउट हो रहे हैं।")
        if action == "hibernate":
            run(["shutdown", "/h"]) if IS_WIN else run(["systemctl", "hibernate"])
            return ok("हाइबरनेट हो रहे हैं।")
        return err(f"अज्ञात system action: {action}")
    except Exception as e:
        return err(str(e))


def cmd_volume(action, params):
    if not pyautogui:
        return err("pyautogui ज़रूरी है (pip install pyautogui)")
    try:
        if action == "up":
            for _ in range(max(1, params.get("amount", 10) // 2)):
                pyautogui.press("volumeup")
            return ok("आवाज़ बढ़ा दी।")
        if action == "down":
            for _ in range(max(1, params.get("amount", 10) // 2)):
                pyautogui.press("volumedown")
            return ok("आवाज़ कम कर दी।")
        if action in ("mute", "unmute"):
            pyautogui.press("volumemute")
            return ok("म्यूट टॉगल किया।")
        if action == "set":
            level = max(0, min(100, int(params.get("percent", params.get("level", 50)))))
            for _ in range(50):
                pyautogui.press("volumedown")
            for _ in range(level // 2):
                pyautogui.press("volumeup")
            return ok(f"आवाज़ ~{level}% पर सेट।")
        return err(f"अज्ञात volume action: {action}")
    except Exception as e:
        return err(str(e))


def cmd_media(action, params):
    if not pyautogui:
        return err("pyautogui ज़रूरी है")
    try:
        keymap = {"play_pause": "playpause", "next": "nexttrack", "previous": "prevtrack", "prev": "prevtrack"}
        pyautogui.press(keymap.get(action, "playpause"))
        return ok("मीडिया कंट्रोल भेजा।")
    except Exception as e:
        return err(str(e))


def cmd_apps(action, params):
    name = str(params.get("name", "")).lower().strip()
    try:
        if action == "open":
            exe = APP_MAP.get(name)
            if exe:
                if IS_WIN:
                    os.startfile(exe)
                else:
                    subprocess.Popen([exe])
                return ok(f"{name} खोल दिया।")
            for key, url in URL_MAP.items():
                if key in name:
                    webbrowser.open(url)
                    return ok(f"{key} खोल रहा हूँ।")
            if any(t in name for t in (".com", ".org", ".net", "http")):
                webbrowser.open(name if name.startswith("http") else f"https://{name}")
                return ok(f"{name} खोल रहा हूँ।")
            webbrowser.open(f"https://www.google.com/search?q={urllib.parse.quote(name)}")
            return ok(f'"{name}" Google पर सर्च कर रहा हूँ।')
        if action == "close":
            exe = APP_MAP.get(name, name)
            if IS_WIN:
                run(["taskkill", "/IM", f"{exe}.exe", "/F"])
            else:
                run(["pkill", "-f", exe])
            return ok(f"{name} बंद कर दिया।")
        return err(f"अज्ञात apps action: {action}")
    except Exception as e:
        return err(str(e))


def cmd_window(action, params):
    if not pyautogui:
        return err("pyautogui ज़रूरी है")
    try:
        if action == "minimize":
            pyautogui.hotkey("win", "down")
            return ok("विंडो मिनिमाइज़।")
        if action == "maximize":
            pyautogui.hotkey("win", "up")
            return ok("विंडो मैक्सिमाइज़।")
        if action == "close":
            pyautogui.hotkey("alt", "f4")
            return ok("विंडो बंद।")
        if action == "switch":
            pyautogui.hotkey("alt", "tab")
            return ok("विंडो स्विच।")
        if action == "show_desktop":
            pyautogui.hotkey("win", "d")
            return ok("डेस्कटॉप दिखाया।")
        if action == "focus" and gw:
            title = params.get("title", "").lower()
            for w in gw.getAllWindows():
                if title in w.title.lower():
                    w.activate()
                    return ok(f"फोकस: {w.title}")
            return err("विंडो नहीं मिली।")
        return err(f"अज्ञात window action: {action}")
    except Exception as e:
        return err(str(e))


def cmd_info(action, params):
    if not psutil:
        return err("psutil ज़रूरी है")
    try:
        if action == "battery":
            b = psutil.sensors_battery()
            if b:
                return ok(f"बैटरी {int(b.percent)}%", {"percent": int(b.percent), "plugged": b.power_plugged})
            return ok("बैटरी नहीं मिली (डेस्कटॉप?)", {"percent": None})
        if action == "cpu":
            pct = psutil.cpu_percent(interval=0.4)
            return ok(f"CPU {pct}%", {"percent": pct, "cores": psutil.cpu_count()})
        if action == "ram":
            m = psutil.virtual_memory()
            return ok(f"RAM {m.percent}%", {"percent": m.percent, "used_gb": round(m.used / 2**30, 1), "total_gb": round(m.total / 2**30, 1)})
        if action == "disk":
            d = psutil.disk_usage("C:\\" if IS_WIN else "/")
            return ok(f"डिस्क {d.percent}%", {"percent": d.percent, "free_gb": round(d.free / 2**30, 1)})
        if action == "ip":
            return ok(f"IP: {get_lan_ip()}", {"local": get_lan_ip(), "hostname": socket.gethostname()})
        if action == "time":
            return ok(datetime.now().strftime("%I:%M %p"))
        if action == "date":
            return ok(datetime.now().strftime("%A, %d %B %Y"))
        if action == "full_report":
            b = psutil.sensors_battery()
            m = psutil.virtual_memory()
            d = psutil.disk_usage("C:\\" if IS_WIN else "/")
            return ok("सिस्टम रिपोर्ट", {
                "cpu": psutil.cpu_percent(interval=0.4), "ram": m.percent,
                "disk": d.percent, "battery": int(b.percent) if b else None,
                "ip": get_lan_ip(), "hostname": socket.gethostname(),
                "os": f"{platform.system()} {platform.release()}",
                "uptime_hours": round((time.time() - psutil.boot_time()) / 3600, 1),
            })
        return err(f"अज्ञात info: {action}")
    except Exception as e:
        return err(str(e))


def cmd_processes(action, params):
    if not psutil:
        return err("psutil ज़रूरी है")
    try:
        if action == "list":
            procs = []
            for p in psutil.process_iter(["pid", "name", "memory_percent", "cpu_percent"]):
                try:
                    procs.append({"pid": p.info["pid"], "name": p.info["name"],
                                  "ram": round(p.info["memory_percent"] or 0, 1),
                                  "cpu": round(p.info["cpu_percent"] or 0, 1)})
                except Exception:
                    continue
            procs.sort(key=lambda x: x["ram"], reverse=True)
            return ok("प्रोसेस सूची", {"items": procs[:30]})
        if action == "kill":
            target = str(params.get("name_or_pid", "")).lower()
            killed = 0
            for p in psutil.process_iter(["pid", "name"]):
                try:
                    if str(p.info["pid"]) == target or target in (p.info["name"] or "").lower():
                        p.kill()
                        killed += 1
                except Exception:
                    continue
            return ok(f"{killed} प्रोसेस बंद किए।") if killed else err("प्रोसेस नहीं मिला।")
        return err(f"अज्ञात processes action: {action}")
    except Exception as e:
        return err(str(e))


def cmd_files(action, params):
    try:
        if action == "create_file":
            p = resolve_path(params.get("path", "untitled.txt"))
            if not is_path_safe(p):
                return err("सुरक्षा: यह पथ प्रतिबंधित है।")
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(params.get("content", ""), encoding="utf-8")
            return ok(f"फाइल बनी: {p}")
        if action == "create_folder":
            p = resolve_path(params.get("path", "New Folder"))
            if not is_path_safe(p):
                return err("सुरक्षा: यह पथ प्रतिबंधित है।")
            p.mkdir(parents=True, exist_ok=True)
            return ok(f"फोल्डर बना: {p}")
        if action == "delete":
            p = resolve_path(params.get("path", ""))
            if not is_path_safe(p) or not p.exists():
                return err("फाइल नहीं मिली या सुरक्षित नहीं।")
            shutil.rmtree(p) if p.is_dir() else p.unlink()
            return ok(f"डिलीट: {p}")
        if action == "list":
            p = resolve_path(params.get("path", ""))
            if not is_path_safe(p):
                return err("सुरक्षा: यह पथ प्रतिबंधित है।")
            if not p.exists():
                return err("पथ नहीं मिला।")
            items = [{"name": x.name, "is_dir": x.is_dir()} for x in list(p.iterdir())[:50]]
            return ok(f"{len(items)} आइटम", {"path": str(p), "items": items})
        if action == "open_explorer":
            p = resolve_path(params.get("path", ""))
            if not is_path_safe(p):
                return err("सुरक्षा: यह पथ प्रतिबंधित है।")
            os.startfile(str(p)) if IS_WIN else run(["xdg-open", str(p)])
            return ok(f"एक्सप्लोरर: {p}")
        if action == "read":
            p = resolve_path(params.get("path", ""))
            if not is_path_safe(p) or not p.exists():
                return err("फाइल नहीं मिली।")
            return ok(f"पढ़ा गया: {p.name}", {"content": p.read_text(encoding="utf-8", errors="replace")[:20000]})
        if action == "write":
            p = resolve_path(params.get("path", ""))
            if not is_path_safe(p):
                return err("सुरक्षा: यह पथ प्रतिबंधित है।")
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(params.get("content", ""), encoding="utf-8")
            return ok(f"सेव हुआ: {p}")
        if action == "rename":
            src = resolve_path(params.get("path", ""))
            dst = resolve_path(params.get("new_path", ""))
            if not is_path_safe(src) or not is_path_safe(dst):
                return err("सुरक्षा: पथ प्रतिबंधित है।")
            if not src.exists():
                return err("सोर्स फाइल नहीं मिली।")
            src.rename(dst)
            return ok(f"रीनेम: {src.name} → {dst.name}")
        return err(f"अज्ञात files action: {action}")
    except Exception as e:
        return err(str(e))


def cmd_disk(action, params):
    """List drives + disk usage."""
    try:
        if action == "list_drives":
            drives = []
            if IS_WIN:
                import ctypes
                bitmask = ctypes.windll.kernel32.GetLogicalDrives()
                for letter in string.ascii_uppercase:
                    if bitmask & 1:
                        drive = f"{letter}:\\"
                        try:
                            u = shutil.disk_usage(drive)
                            drives.append({"name": drive, "total": u.total, "free": u.free,
                                           "used": u.used, "percent": round(u.used / u.total * 100, 1)})
                        except Exception:
                            pass
                    bitmask >>= 1
            else:
                u = shutil.disk_usage("/")
                drives.append({"name": "/", "total": u.total, "free": u.free, "used": u.used,
                               "percent": round(u.used / u.total * 100, 1)})
            return ok(f"{len(drives)} ड्राइव मिले।", {"drives": drives})
        if action == "cleanup_temp":
            temp = tempfile.gettempdir()
            deleted = 0
            for item in os.listdir(temp):
                fp = os.path.join(temp, item)
                try:
                    if os.path.isfile(fp) or os.path.islink(fp):
                        os.unlink(fp); deleted += 1
                    elif os.path.isdir(fp):
                        shutil.rmtree(fp); deleted += 1
                except Exception:
                    pass
            return ok(f"क्लीनअप: {deleted} आइटम हटाए।")
        u = shutil.disk_usage("C:\\" if IS_WIN else "/")
        return ok("डिस्क उपयोग", {"total": u.total, "free": u.free, "percent": round(u.used / u.total * 100, 1)})
    except Exception as e:
        return err(str(e))


def cmd_clipboard(action, params):
    if not pyperclip:
        return err("pyperclip ज़रूरी है")
    try:
        if action in ("save", "get"):
            return ok("क्लिपबोर्ड", {"content": pyperclip.paste()})
        if action == "set":
            pyperclip.copy(params.get("text", ""))
            return ok("क्लिपबोर्ड सेट।")
        if action == "clear":
            pyperclip.copy("")
            return ok("क्लिपबोर्ड क्लियर।")
        if action == "history":
            return ok("हिस्ट्री", {"items": []})
        return err(f"अज्ञात clipboard action: {action}")
    except Exception as e:
        return err(str(e))


def cmd_screen(action, params):
    try:
        if action == "screenshot":
            if not pyautogui:
                return err("pyautogui ज़रूरी है")
            shots = Path(__file__).parent / "screenshots"
            shots.mkdir(exist_ok=True)
            fp = shots / f"screenshot_{datetime.now():%Y%m%d_%H%M%S}.png"
            img = pyautogui.screenshot()
            img.save(str(fp))
            # small base64 thumbnail for the UI
            import io
            thumb = img.resize((320, 180))
            buf = io.BytesIO()
            thumb.save(buf, format="PNG")
            b64 = base64.b64encode(buf.getvalue()).decode()
            return ok(f"स्क्रीनशॉट सेव: {fp.name}", {"path": str(fp), "thumbnail": f"data:image/png;base64,{b64}"})
        return err(f"अज्ञात screen action: {action}")
    except Exception as e:
        return err(str(e))


def cmd_keyboard(action, params):
    if not pyautogui:
        return err("pyautogui ज़रूरी है")
    try:
        if action == "type":
            pyautogui.typewrite(params.get("text", ""), interval=0.03)
            return ok("टेक्स्ट टाइप किया।")
        if action == "hotkey":
            keys = [k.strip() for k in params.get("keys", "").split("+") if k.strip()]
            if keys:
                pyautogui.hotkey(*keys)
                return ok(f"हॉटकी: {'+'.join(keys)}")
            return err("कोई keys नहीं।")
        return err(f"अज्ञात keyboard action: {action}")
    except Exception as e:
        return err(str(e))


def cmd_web(action, params):
    try:
        if action == "open_site":
            name = str(params.get("name", "")).lower()
            url = URL_MAP.get(name, name if name.startswith("http") else f"https://{name}")
            webbrowser.open(url)
            return ok(f"{name} खोल रहा हूँ।")
        if action == "search":
            q = params.get("query", "")
            webbrowser.open(f"https://www.google.com/search?q={urllib.parse.quote(q)}")
            return ok(f'"{q}" सर्च कर रहा हूँ।')
        return err(f"अज्ञात web action: {action}")
    except Exception as e:
        return err(str(e))


def cmd_calculator(action, params):
    import ast
    import operator as opr
    ops = {ast.Add: opr.add, ast.Sub: opr.sub, ast.Mult: opr.mul,
           ast.Div: opr.truediv, ast.Pow: opr.pow, ast.USub: opr.neg, ast.Mod: opr.mod}

    def ev(node):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.BinOp):
            return ops[type(node.op)](ev(node.left), ev(node.right))
        if isinstance(node, ast.UnaryOp):
            return ops[type(node.op)](ev(node.operand))
        raise ValueError("unsupported")

    try:
        expr = params.get("expression", "")
        result = ev(ast.parse(expr, mode="eval").body)
        if abs(result) > 1e15:
            return err("संख्या बहुत बड़ी है।")
        return ok(f"{expr} = {result}", {"result": result})
    except Exception:
        return err("अमान्य एक्सप्रेशन।")


def cmd_password(action, params):
    length = max(8, int(params.get("length", 16)))
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_=+"
    pw = "".join(pysecrets.choice(alphabet) for _ in range(length))
    if pyperclip:
        pyperclip.copy(pw)
    return ok("पासवर्ड जनरेट (क्लिपबोर्ड पर कॉपी)।", {"password": pw})


def cmd_translator(action, params):
    text = params.get("text", "")
    codes = {"hindi": "hi", "english": "en", "french": "fr", "german": "de",
             "spanish": "es", "japanese": "ja", "chinese": "zh", "arabic": "ar"}
    tgt = codes.get(str(params.get("target_lang", "hi")).lower(), params.get("target_lang", "hi"))
    src = "en" if tgt != "en" else "hi"
    try:
        url = f"https://api.mymemory.translated.net/get?q={urllib.parse.quote(text)}&langpair={src}|{tgt}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
        out = data["responseData"]["translatedText"]
        return ok(out, {"translation": out})
    except Exception as e:
        return err(f"अनुवाद विफल: {e}")


def cmd_weather(action, params):
    loc = params.get("location") or "Delhi"
    try:
        url = f"https://wttr.in/{urllib.parse.quote(loc)}?format=j1"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
        cur = data["current_condition"][0]
        return ok(f"{loc}: {cur['temp_C']}°C, {cur['weatherDesc'][0]['value']}, नमी {cur['humidity']}%",
                  {"temp": cur["temp_C"], "desc": cur["weatherDesc"][0]["value"], "humidity": cur["humidity"]})
    except Exception as e:
        return err(f"मौसम नहीं मिला: {e}")


# ─── Reminders ───────────────────────────────────────────────────────────────
_reminders: list = []
_reminders_lock = threading.Lock()
_main_loop = None


def cmd_reminders(action, params):
    global _reminders
    if action in ("create", "timer", "add"):
        text = params.get("text", "टाइमर पूरा!")
        seconds = float(params.get("seconds", 60))
        rid = str(uuid.uuid4())
        with _reminders_lock:
            _reminders.append({"id": rid, "text": text, "trigger_at": time.time() + seconds})

        def fire():
            global _reminders
            with _reminders_lock:
                _reminders = [r for r in _reminders if r["id"] != rid]
            if _main_loop and _main_loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    broadcast(json.dumps({
                        "type": "event", "event": "reminder_triggered",
                        "data": {"id": rid, "text": text},
                        "timestamp": get_utc_iso(),
                    })), _main_loop)
            logger.info(f"Reminder fired: {text}")

        t = threading.Timer(seconds, fire)
        t.daemon = True
        t.start()
        return ok(f"रिमाइंडर सेट ({seconds/60:.1f} min): {text}", {"id": rid})
    if action == "list":
        with _reminders_lock:
            return ok("रिमाइंडर्स", {"items": list(_reminders)})
    if action == "cancel":
        rid = params.get("id")
        with _reminders_lock:
            _reminders = [r for r in _reminders if r["id"] != rid]
        return ok("रिमाइंडर रद्द।")
    return err(f"अज्ञात reminders action: {action}")


# ─── Command Router ──────────────────────────────────────────────────────────
ROUTES = {
    "system": cmd_system, "volume": cmd_volume, "media": cmd_media,
    "apps": cmd_apps, "app": cmd_apps, "window": cmd_window,
    "info": cmd_info, "processes": cmd_processes, "files": cmd_files,
    "file": cmd_files, "clipboard": cmd_clipboard, "screen": cmd_screen,
    "keyboard": cmd_keyboard, "web": cmd_web, "calculator": cmd_calculator,
    "password": cmd_password, "translator": cmd_translator,
    "weather": cmd_weather, "reminders": cmd_reminders, "reminder": cmd_reminders,
    "disk": cmd_disk,
    "network": lambda a, p: cmd_info("ip", p) if a == "ip" else err("अज्ञात network action"),
}

CONFIRM_REQUIRED = {("system", "shutdown"), ("system", "restart"), ("system", "hibernate"),
                    ("files", "delete"), ("processes", "kill")}
PENDING_CONFIRM: dict = {}


def route_command(data: dict) -> dict:
    category = data.get("category", "")
    action = data.get("action", "")
    params = data.get("params", {}) or {}
    handler = ROUTES.get(category)
    if not handler:
        return err(f"अज्ञात category: {category}")
    try:
        return handler(action, params)
    except Exception as e:
        logger.error(f"route error: {e}")
        return err(str(e))


# ═══════════════════════════════════════════════════════════════════════════
#  LLM ROUTER (streaming, multi-provider fallback)
# ═══════════════════════════════════════════════════════════════════════════
LLM_PROVIDERS = {
    "groq": ("https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile", "GROQ_API_KEY"),
    "cerebras": ("https://api.cerebras.ai/v1/chat/completions", "llama-3.3-70b", "CEREBRAS_API_KEY"),
    "mistral": ("https://api.mistral.ai/v1/chat/completions", "mistral-small-latest", "MISTRAL_API_KEY"),
    "deepseek": ("https://api.deepseek.com/chat/completions", "deepseek-chat", "DEEPSEEK_API_KEY"),
    "openrouter": ("https://openrouter.ai/api/v1/chat/completions", "meta-llama/llama-3.3-70b-instruct:free", "OPENROUTER_API_KEY"),
}
LLM_ORDER = ["groq", "cerebras", "mistral", "deepseek", "openrouter"]
SYSTEM_PROMPT = (
    "You are Pika, a friendly personal AI assistant on the user's PC.\n"
    "Default language Hindi (Devanagari). Match the user's language. Keep replies short.\n"
    "If the user asks you to perform a PC task (like volume, screen brightness, screenshot, recording, shutdown, restart, open/close apps/websites, clipboard, file/folder operations, speed test), you MUST append a JSON command block at the end of your response like this: `[COMMAND: {\"category\": \"...\", \"action\": \"...\", \"params\": {...}}]`.\n"
    "Available commands:\n"
    "- volume: set (percent), up (amount), down (amount), mute, unmute\n"
    "- screen: screenshot, start_recording, stop_recording, brightness_set (percent), brightness_up, brightness_down\n"
    "- system: shutdown, restart, sleep, lock, logoff, hibernate\n"
    "- apps: open (name), close (name)\n"
    "- web: open_site (name) -> opens a site, search (query)\n"
    "- files: create_file (path), create_folder (path), delete (path), rename (path, new_path), list (path)\n"
    "- disk: cleanup_temp, list_drives\n"
    "- processes: list, kill (name_or_pid)\n"
    "- reminders: create (text, seconds)\n"
    "- network: speed_test, list_wifi\n"
    "Do not explain the command itself, just add it at the end of your message."
)
HISTORY: list = []
CURRENT_PROVIDER = next((p for p in LLM_ORDER if os.getenv(LLM_PROVIDERS[p][2])), "groq")


async def llm_stream(text: str, params: dict = None):
    """Yield (chunk, provider, done, [usage])."""
    if params is None:
        params = {}
    global HISTORY
    HISTORY.append({"role": "user", "content": text})
    HISTORY = HISTORY[-20:]
    prompt_tokens = len(text) // 3

    def get_api_key(pname):
        browser_keys = params.get("apiKeys") or {}
        key = browser_keys.get(pname)
        if key:
            return key
        env_var = LLM_PROVIDERS[pname][2]
        return os.getenv(env_var)

    req_provider = params.get("provider")
    req_model = params.get("model")

    providers = [CURRENT_PROVIDER] + [p for p in LLM_ORDER if p != CURRENT_PROVIDER]
    providers = [p for p in providers if get_api_key(p)]

    if req_provider and get_api_key(req_provider):
        providers = [req_provider] + [p for p in providers if p != req_provider]

    if not requests or not providers:
        # Local fallback conversation responses
        t = text.lower().strip()
        if any(w in t for w in ("hi", "hello", "hey", "नमस्ते", "hii")):
            msg = "नमस्ते! ⚡ मैं पिका हूँ। अभी .env या सेटिंग्स में कोई API Key नहीं मिली है, इसलिए मैं लिमिटेड मोड में हूँ। लेकिन आप मुझसे पीसी कमांड्स (जैसे: `screenshot`, `open chrome`, `volume 50%`) रन करवा सकते हैं!"
        elif any(w in t for w in ("kaun ho", "who are you", "कौन हो")):
            msg = "मैं **पिका** हूँ ⚡ — आपका लोकल AI असिस्टेंट। बिना API Key के भी मैं आपके कंप्यूटर के कई काम कर सकता हूँ।"
        elif any(w in t for w in ("help", "मदद", "madad")):
            msg = "मैं ये सब कर सकता हूँ:\n\n- 🖥️ **सिस्टम**: shutdown, restart, lock\n- 🚀 **ऐप्स**: `open chrome`, `open notepad`\n- 🔊 **वॉल्यूम**: `volume 50%`, `mute`\n- 📸 **स्क्रीन**: `screenshot`, `record`\n\nबिना API Key के केवल कमांड्स चलेंगी। AI चैट के लिए सेटिंग्स में API Key डालें।"
        else:
            msg = "अभी AI उपलब्ध नहीं — कृपया सेटिंग्स या .env में API key डालें (जैसे GROQ_API_KEY)।\n\nआप मुझसे पीसी कमांड्स (जैसे: `screenshot`, `open chrome`, `volume 50%`) भी चला सकते हैं!"
        
        yield (msg, "local_fallback", False)
        yield ("", "local_fallback", True, {"prompt_tokens": prompt_tokens, "completion_tokens": len(msg) // 3, "total_tokens": prompt_tokens + len(msg) // 3})
        return

    for provider in providers:
        url, default_model, key_env = LLM_PROVIDERS[provider]
        model = req_model if (req_provider == provider and req_model) else default_model
        headers = {"Authorization": f"Bearer {get_api_key(provider)}", "Content-Type": "application/json"}
        payload = {"model": model, "stream": True, "temperature": 0.7, "max_tokens": 2048,
                   "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + HISTORY}
        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()

        def worker():
            try:
                resp = requests.post(url, headers=headers, json=payload, stream=True, timeout=60)
                if resp.status_code != 200:
                    loop.call_soon_threadsafe(q.put_nowait, ("__ERROR__", f"HTTP {resp.status_code}"))
                    return
                for line in resp.iter_lines():
                    if not line:
                        continue
                    t = line.decode().strip()
                    if t.startswith("data: "):
                        t = t[6:]
                    if t == "[DONE]":
                        break
                    try:
                        delta = json.loads(t)["choices"][0]["delta"].get("content", "")
                        if delta:
                            loop.call_soon_threadsafe(q.put_nowait, ("__CHUNK__", delta))
                    except Exception:
                        continue
            except Exception as e:
                loop.call_soon_threadsafe(q.put_nowait, ("__ERROR__", str(e)))
            finally:
                loop.call_soon_threadsafe(q.put_nowait, ("__DONE__", ""))

        loop.run_in_executor(None, worker)
        full, failed = "", False
        while True:
            kind, val = await q.get()
            if kind == "__CHUNK__":
                full += val
                yield (val, provider, False)
            elif kind == "__ERROR__":
                logger.warning(f"LLM {provider} failed: {val}")
                failed = True
            elif kind == "__DONE__":
                break
        if not failed and full:
            HISTORY.append({"role": "assistant", "content": full})
            completion_tokens = len(full) // 3
            yield ("", provider, True, {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": prompt_tokens + completion_tokens})
            return
    completion_tokens = 30
    yield ("माफ़ करो, अभी सभी AI providers विफल रहे। बाद में फिर पूछो।", "local_fallback", False)
    yield ("", "local_fallback", True, {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": prompt_tokens + completion_tokens})


# ═══════════════════════════════════════════════════════════════════════════
#  TTS — Edge TTS primary, pyttsx3 offline fallback
# ═══════════════════════════════════════════════════════════════════════════
async def generate_tts(text: str, voice: str = DEFAULT_TTS_VOICE) -> dict:
    clean = re.sub(r"\*[^*]+\*", "", text).strip() or text
    # quick reachability check so offline users don't wait on timeouts
    online = False
    try:
        await asyncio.wait_for(asyncio.to_thread(socket.gethostbyname, "speech.platform.bing.com"), timeout=0.7)
        online = True
    except Exception:
        pass

    if HAS_EDGE_TTS and online:
        try:
            communicate = edge_tts.Communicate(clean, voice)
            audio_bytes = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_bytes += chunk["data"]
            if audio_bytes:
                audio = base64.b64encode(audio_bytes).decode()
                return {"success": True, "audio": audio, "format": "mp3"}
        except Exception as e:
            logger.warning(f"Edge-TTS failed, trying pyttsx3: {e}")

    # offline fallback
    def offline():
        import pyttsx3
        if IS_WIN:
            import pythoncom
            pythoncom.CoInitialize()
        engine = pyttsx3.init()
        engine.setProperty("rate", 210)
        for v in engine.getProperty("voices"):
            if "hindi" in v.name.lower() or "india" in v.name.lower():
                engine.setProperty("voice", v.id)
                break
        fd, tmp_file = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        engine.save_to_file(clean, tmp_file)
        engine.runAndWait()
        del engine
        return tmp_file

    try:
        tmp_name = await asyncio.to_thread(offline)
        with open(tmp_name, "rb") as f:
            audio = base64.b64encode(f.read()).decode()
        os.unlink(tmp_name)
        return {"success": True, "audio": audio, "format": "wav"}
    except Exception as e:
        logger.error(f"pyttsx3 fallback failed: {e}")
        return {"success": False, "message": f"TTS विफल: {e}"}


# ═══════════════════════════════════════════════════════════════════════════
#  VOSK — offline Hindi/English STT with wake-word detection
# ═══════════════════════════════════════════════════════════════════════════
_vosk_model = None


def ensure_vosk_model() -> bool:
    """Download & extract the small Hindi Vosk model on first run."""
    if VOSK_MODEL_DIR.exists():
        return True
    if not HAS_VOSK:
        return False
    logger.info("Vosk Hindi model not found — downloading (~45MB, one-time)...")
    try:
        model_root = VOSK_MODEL_DIR.parent
        model_root.mkdir(parents=True, exist_ok=True)
        zip_path = model_root / "vosk-hi.zip"
        last_pct = [0]

        def hook(blocknum, blocksize, totalsize):
            if totalsize > 0:
                pct = int(blocknum * blocksize * 100 / totalsize)
                if pct >= last_pct[0] + 10:
                    last_pct[0] = pct
                    logger.info(f"  model download: {pct}%")

        urllib.request.urlretrieve(VOSK_MODEL_URL, zip_path, hook)
        import zipfile
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(model_root)
        extracted = model_root / "vosk-model-small-hi-0.22"
        if extracted.exists():
            extracted.rename(VOSK_MODEL_DIR)
        zip_path.unlink(missing_ok=True)
        logger.info("Vosk model ready ✓")
        return True
    except Exception as e:
        logger.error(f"Vosk model download failed: {e}")
        return False


def get_vosk_recognizer(sample_rate: int = 16000):
    """Lazily load the Vosk model and return a fresh recognizer."""
    global _vosk_model
    if not HAS_VOSK or not VOSK_MODEL_DIR.exists():
        return None
    if _vosk_model is None:
        logger.info("Loading Vosk model (few seconds)...")
        _vosk_model = Model(str(VOSK_MODEL_DIR))
        logger.info("Vosk model loaded ✓")
    return KaldiRecognizer(_vosk_model, sample_rate)


def detect_wake_word(text: str) -> bool:
    low = text.lower()
    return any(w in low for w in WAKE_WORDS)


# Voice shortcut commands executed instantly on final STT results
def try_voice_shortcut(text: str):
    low = text.lower()
    if any(k in low for k in ("screenshot", "screen shot", "tasveer", "स्क्रीनशॉट")):
        return cmd_screen("screenshot", {}), "स्क्रीनशॉट ले लिया।"
    if any(k in low for k in ("lock", "लॉक")):
        return cmd_system("lock", {}), "स्क्रीन लॉक कर दी।"
    if any(k in low for k in ("volume up", "badhao", "आवाज़ बढ़ाओ")):
        return cmd_volume("up", {"amount": 10}), "आवाज़ बढ़ा दी।"
    if any(k in low for k in ("volume down", "kam karo", "आवाज़ कम")):
        return cmd_volume("down", {"amount": 10}), "आवाज़ कम कर दी।"
    if any(k in low for k in ("mute", "म्यूट")):
        return cmd_volume("mute", {}), "म्यूट टॉगल।"
    if any(k in low for k in ("show desktop", "desktop dikhao")):
        return cmd_window("show_desktop", {}), "डेस्कटॉप दिखाया।"
    return None, None


# ═══════════════════════════════════════════════════════════════════════════
#  WEBSOCKET SERVER
# ═══════════════════════════════════════════════════════════════════════════
connected_clients: set = set()


async def broadcast(message: str):
    if connected_clients:
        await asyncio.gather(*[c.send(message) for c in connected_clients], return_exceptions=True)


def envelope(msg_id, status, message, data=None, confirmation_id=None):
    return json.dumps({
        "type": "response", "status": status, "data": data, "message": message,
        "confirmation_id": confirmation_id, "id": msg_id,
        "timestamp": get_utc_iso(),
    })


async def status_loop(ws):
    """Push system_status every 5 seconds."""
    try:
        while True:
            data = {"cpu": 0, "ram": 0, "battery": None, "lan_ip": get_lan_ip()}
            if psutil:
                data["cpu"] = psutil.cpu_percent()
                data["ram"] = psutil.virtual_memory().percent
                b = psutil.sensors_battery()
                if b:
                    data["battery"] = {"percent": int(b.percent), "plugged": b.power_plugged}
                    if b.percent < 20 and not b.power_plugged:
                        await ws.send(json.dumps({"type": "event", "event": "battery_alert",
                                                  "data": {"percent": int(b.percent)},
                                                  "timestamp": get_utc_iso()}))
            await ws.send(json.dumps({"type": "event", "event": "system_status", "data": data,
                                      "timestamp": get_utc_iso()}))
            await asyncio.sleep(5)
    except Exception:
        pass


async def handle_query(ws, msg):
    """Conversational text → stream LLM reply as llm_stream messages and execute embedded commands."""
    params = msg.get("params") or {}
    text = params.get("text", "")
    conv_id = msg.get("id")
    
    # Broadcast the user message so all connected screens render it in real-time
    await broadcast(json.dumps({
        "type": "event",
        "event": "user_message",
        "data": {"text": text, "id": conv_id, "provider": params.get("provider", "user")},
        "timestamp": get_utc_iso()
    }))
    
    full_response = ""
    async for item in llm_stream(text, params):
        chunk, provider, done = item[0], item[1], item[2]
        usage = item[3] if len(item) > 3 else None
        
        full_response += chunk
        await broadcast(json.dumps({
            "type": "llm_stream",
            "chunk": chunk,
            "provider": provider,
            "id": conv_id,
            "done": done,
            "usage": usage,
            "timestamp": get_utc_iso()
        }))
        if done:
            break

    # Look for [COMMAND: {"category": "...", "action": "...", "params": {...}}] in the LLM response
    import re
    match = re.search(r"\[COMMAND:\s*({.*?})\]", full_response, re.DOTALL)
    if match:
        try:
            cmd_data = json.loads(match.group(1))
            logger.info(f"Executing LLM extracted command: {cmd_data}")
            result = route_command(cmd_data)
            
            # Send execution toast event to frontend
            await broadcast(json.dumps({
                "type": "event",
                "event": "shortcut_executed",
                "data": {"message": result["message"]},
                "timestamp": get_utc_iso()
            }))
            
            # If screenshot command, send response envelope to render the thumbnail
            if cmd_data.get("category") == "screen" and cmd_data.get("action") == "screenshot" and result["success"]:
                await broadcast(envelope(conv_id, "success", result["message"], result.get("data")))
        except Exception as e:
            logger.error(f"Failed to execute LLM command: {e}")


async def handle_tts_speak(ws, data):
    try:
        params = data.get("params", {}) or {}
        await ws.send(json.dumps({"type": "event", "event": "tts_started", "data": {},
                                  "timestamp": get_utc_iso()}))
        result = await generate_tts(params.get("text", ""), params.get("voice", DEFAULT_TTS_VOICE))
        if result.get("success"):
            await ws.send(json.dumps({"type": "event", "event": "tts_audio",
                                      "data": {"audio": result["audio"], "format": result["format"]},
                                      "timestamp": get_utc_iso()}))
        await ws.send(json.dumps({"type": "event", "event": "tts_ended", "data": {},
                                  "timestamp": get_utc_iso()}))
    except asyncio.CancelledError:
        try:
            await ws.send(json.dumps({"type": "event", "event": "tts_ended", "data": {},
                                      "timestamp": get_utc_iso()}))
        except Exception:
            pass

async def handle_client(ws):
    client = f"{ws.remote_address[0]}:{ws.remote_address[1]}"
    connected_clients.add(ws)
    logger.info(f"Client connected: {client} (total {len(connected_clients)})")

    recognizer = get_vosk_recognizer()
    wake_active = False
    active_tasks = set()

    await ws.send(json.dumps({
        "type": "event", "event": "connection_ready",
        "data": {
            "server_version": SERVER_VERSION,
            "hostname": socket.gethostname(),
            "os": f"{platform.system()} {platform.release()}",
            "lan_ip": get_lan_ip(),
            "features": {
                "vosk_stt": recognizer is not None,
                "edge_tts": HAS_EDGE_TTS,
                "psutil": psutil is not None,
                "pyautogui": pyautogui is not None,
                "llm_providers": [p for p in LLM_ORDER if os.getenv(LLM_PROVIDERS[p][2])],
            },
            "env_keys": {
                "groq": os.getenv("GROQ_API_KEY", ""),
                "gemini": os.getenv("GEMINI_API_KEY", ""),
                "mistral": os.getenv("MISTRAL_API_KEY", ""),
                "cerebras": os.getenv("CEREBRAS_API_KEY", ""),
                "openrouter": os.getenv("OPENROUTER_API_KEY", ""),
                "zai": os.getenv("ZAI_API_KEY", ""),
                "deepseek": os.getenv("DEEPSEEK_API_KEY", ""),
            },
        },
        "timestamp": get_utc_iso(),
    }))

    status_task = asyncio.create_task(status_loop(ws))

    try:
        async for message in ws:
            # ── Binary frames = raw 16kHz mono PCM audio → Vosk STT ──
            if isinstance(message, bytes):
                if recognizer is None:
                    continue
                if recognizer.AcceptWaveform(message):
                    res = json.loads(recognizer.Result())
                    text = (res.get("text") or "").strip()
                    if not text:
                        continue
                    # wake word gate
                    if detect_wake_word(text):
                        wake_active = True
                        await ws.send(json.dumps({"type": "event", "event": "wake_word",
                                                  "data": {"text": text},
                                                  "timestamp": get_utc_iso()}))
                        continue
                    # instant voice shortcuts
                    result, reply = try_voice_shortcut(text)
                    if result:
                        await ws.send(json.dumps({"type": "event", "event": "shortcut_executed",
                                                  "data": {"text": text, "message": reply},
                                                  "timestamp": get_utc_iso()}))
                    await ws.send(json.dumps({"type": "event", "event": "voice_final",
                                              "data": {"text": text, "wake_active": wake_active},
                                              "timestamp": get_utc_iso()}))
                    wake_active = False
                else:
                    partial = json.loads(recognizer.PartialResult()).get("partial", "")
                    if partial:
                        await ws.send(json.dumps({"type": "event", "event": "voice_partial",
                                                  "data": {"text": partial},
                                                  "timestamp": get_utc_iso()}))
                continue

            # ── JSON frames ──
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                continue

            mtype = data.get("type")
            if mtype == "ping":
                await ws.send(json.dumps({"type": "pong", "timestamp": get_utc_iso()}))
                continue

            if mtype == "cancel":
                for t in list(active_tasks):
                    if not t.done():
                        t.cancel()
                active_tasks.clear()
                await ws.send(json.dumps({
                    "type": "event", "event": "tts_ended", "data": {},
                    "timestamp": get_utc_iso()
                }))
                continue

            if mtype == "tts_speak":
                for t in list(active_tasks):
                    if not t.done():
                        t.cancel()
                active_tasks.clear()
                task = asyncio.create_task(handle_tts_speak(ws, data))
                active_tasks.add(task)
                task.add_done_callback(active_tasks.discard)
                continue

            if mtype == "query":
                for t in list(active_tasks):
                    if not t.done():
                        t.cancel()
                active_tasks.clear()
                task = asyncio.create_task(handle_query(ws, data))
                active_tasks.add(task)
                task.add_done_callback(active_tasks.discard)
                continue

            if mtype == "command":
                cat, act = data.get("category"), data.get("action")
                logger.info(f"cmd {client}: {cat}/{act}")

                # confirmation flow
                if cat == "_confirm":
                    cid = (data.get("params") or {}).get("confirmation_id")
                    if act == "approve" and cid in PENDING_CONFIRM:
                        original = PENDING_CONFIRM.pop(cid)
                        result = route_command(original)
                        await ws.send(envelope(data.get("id"),
                                               "success" if result["success"] else "error",
                                               result["message"], result.get("data")))
                    else:
                        PENDING_CONFIRM.pop(cid, None)
                        await ws.send(envelope(data.get("id"), "success", "रद्द किया गया।"))
                    continue

                if (cat, act) in CONFIRM_REQUIRED and not (data.get("params") or {}).get("confirmed"):
                    cid = str(uuid.uuid4())
                    PENDING_CONFIRM[cid] = data
                    await ws.send(envelope(data.get("id"), "confirmation_required",
                                           f"क्या आप वाकई {cat}/{act} करना चाहते हैं?",
                                           confirmation_id=cid))
                    continue

                result = route_command(data)
                await ws.send(envelope(data.get("id"),
                                       "success" if result["success"] else "error",
                                       result["message"], result.get("data")))
                continue

    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        logger.error(f"handler error: {e}")
    finally:
        status_task.cancel()
        for t in list(active_tasks):
            if not t.done():
                t.cancel()
        connected_clients.discard(ws)
        logger.info(f"Client disconnected: {client} (total {len(connected_clients)})")


# ═══════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════
def print_banner():
    C, P, G, W, D, R = "\033[96m", "\033[95m", "\033[92m", "\033[97m", "\033[90m", "\033[0m"
    lan = get_lan_ip()
    print(f"""
  {P}██████╗ ██╗██╗  ██╗ █████╗      █████╗ ██╗{R}
  {P}██╔══██╗██║██║ ██╔╝██╔══██╗    ██╔══██╗██║{R}
  {C}██████╔╝██║█████╔╝ ███████║    ███████║██║{R}
  {C}██╔═══╝ ██║██╔═██╗ ██╔══██║    ██╔══██║██║{R}
  {C}██║     ██║██║  ██╗██║  ██║    ██║  ██║██║{R}
  {C}╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝{R}

  {D}══════════════════════════════════════════════════{R}
  {W}   PC BRIDGE v{SERVER_VERSION} — WebSocket Backend{R}
  {D}══════════════════════════════════════════════════{R}
  {G}  ✓ Local:     ws://localhost:{PORT}{R}
  {G}  ✓ LAN:       ws://{lan}:{PORT}{R}
  {W}  • Platform:  {platform.system()} {platform.release()}{R}
  {W}  • Vosk STT:  {"✓ ready" if HAS_VOSK else "✗ pip install vosk"}{R}
  {W}  • Edge TTS:  {"✓ ready" if HAS_EDGE_TTS else "✗ pip install edge-tts"}{R}
  {W}  • LLM keys:  {", ".join(p for p in LLM_ORDER if os.getenv(LLM_PROVIDERS[p][2])) or "none (demo)"}{R}
  {D}──────────────────────────────────────────────────{R}
  {C}  📱 PHONE ACCESS (same WiFi):{R}
  {W}     Web UI  →  http://{lan}:3000{R}
  {D}──────────────────────────────────────────────────{R}
  {D}  Press Ctrl+C to stop.{R}
""")


async def main():
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    threading.Thread(target=ensure_vosk_model, daemon=True).start()
    print_banner()
    async with serve(handle_client, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⚡ Pika PC Bridge stopped. फिर मिलेंगे!")