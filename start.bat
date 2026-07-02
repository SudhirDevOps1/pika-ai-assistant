@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title Pika AI Assistant - Launcher

:: Generate ANSI escape character for professional color terminal output
for /F "tokens=*" %%a in ('echo prompt $E ^| cmd') do set "ESC=%%a"

set "G=%ESC%[32m"
set "R=%ESC%[31m"
set "B=%ESC%[34m"
set "C=%ESC%[36m"
set "Y=%ESC%[33m"
set "M=%ESC%[35m"
set "W=%ESC%[37m"
set "N=%ESC%[0m"

set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

cls
echo.
echo %M%   ==========================================================%N%
echo %M%    P I K A   A I   D E S K T O P   A S S I S T A N T%N%
echo %M%    [ Version 4.0.0 — Production Build ]%N%
echo %M%   ==========================================================%N%
echo.

:: --- [1/5] Checking Python ---
echo %C%[1/5] Checking Python environment...%N%
set "PY_CMD="

where py >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    set "PY_CMD=py -3"
    goto :py_found
)

where python >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    set "PY_CMD=python"
    goto :py_found
)

where python3 >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    set "PY_CMD=python3"
    goto :py_found
)

:: Python Error Box
echo %R%  [========================================================]%N%
echo %R%  [ ❌ ERROR: Python not found!                            ]%N%
echo %R%  [========================================================]%N%
echo %R%  [ 1. Download Python 3.10+ from: https://python.org      ]%N%
echo %R%  [ 2. Check the box \"Add Python to PATH\" during install   ]%N%
echo %R%  [ 3. Restart your terminal and run start.bat again.      ]%N%
echo %R%  [========================================================]%N%
pause
exit /b 1

:py_found
for /f "tokens=*" %%i in ('%PY_CMD% --version 2^>^&1') do set PY_VER=%%i
echo   [ %G%✓%N% ] Python detected: %Y%!PY_VER!%N%

:: --- [2/5] Checking Node.js ---
where node >nul 2>&1
if !ERRORLEVEL! EQU 0 goto :node_found

:: Node Error Box
echo %R%  [========================================================]%N%
echo %R%  [ ❌ ERROR: Node.js not found!                           ]%N%
echo %R%  [========================================================]%N%
echo %R%  [ 1. Download Node.js (LTS version) from:                ]%N%
echo %R%  [    https://nodejs.org                                  ]%N%
echo %R%  [ 2. Install it and run start.bat again.                 ]%N%
echo %R%  [========================================================]%N%
pause
exit /b 1

:node_found
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   [ %G%✓%N% ] Node.js detected: %Y%!NODE_VER!%N%
echo.

:: --- [3/5] Setting up Virtual Environment (venv) ---
echo %C%[3/5] Setting up isolated Python environment (venv)...%N%
if exist "venv\Scripts\python.exe" (
    echo   [ %G%✓%N% ] Virtual environment already exists.
    goto :venv_done
)

echo   [ %Y%i%N% ] Creating new virtual environment (venv) [first time: ~30 sec]...
%PY_CMD% -m venv venv
if !ERRORLEVEL! EQU 0 (
    echo   [ %G%✓%N% ] Virtual environment created successfully.
    goto :venv_done
)

:: venv Error Box
echo %R%  [========================================================]%N%
echo %R%  [ ❌ ERROR: Virtual environment creation failed!          ]%N%
echo %R%  [========================================================]%N%
echo %R%  [ Python installation is broken or permissions are       ]%N%
echo %R%  [ missing. Try running CMD as Administrator.             ]%N%
echo %R%  [========================================================]%N%
pause
exit /b 1

:venv_done
set "VENV_PY=venv\Scripts\python.exe"

:: --- [4/5] Install/Update Python Packages ---
echo.
echo %C%[4/5] Checking and updating Python dependencies...%N%
if not exist "requirements.txt" (
    echo   [ %R%✗%N% ] requirements.txt not found! Skipping installation.
    goto :pip_done
)

echo   [ %Y%i%N% ] Running pip install [installing/updating dependencies]...
"%VENV_PY%" -m pip install --upgrade pip --quiet --disable-pip-version-check >nul 2>&1
"%VENV_PY%" -m pip install -r requirements.txt --disable-pip-version-check --no-warn-script-location
if !ERRORLEVEL! EQU 0 (
    echo   [ %G%✓%N% ] Python dependencies are fully updated.
) else (
    echo   [ %Y%WARN%N% ] Some packages failed to install. Pika will run with limited features.
)

:pip_done

:: --- [5/5] Install/Update Node Packages ---
echo.
echo %C%[5/5] Checking and updating Node.js packages...%N%
if exist "node_modules" (
    echo   [ %Y%i%N% ] node_modules folder exists. Running quick check for updates...
) else (
    echo   [ %Y%i%N% ] node_modules not found. Performing full install [first time: 1-3 min]...
)

call npm install --no-audit --no-fund --quiet --loglevel=error
if !ERRORLEVEL! EQU 0 (
    echo   [ %G%✓%N% ] Node.js packages are fully updated.
) else (
    echo %R%  [========================================================]%N%
    echo %R%  [ ❌ ERROR: npm install failed!                          ]%N%
    echo %R%  [========================================================]%N%
    echo %R%  [ Please check your internet connection and try running  ]%N%
    echo %R%  [ \"npm install\" manually in this directory.               ]%N%
    echo %R%  [========================================================]%N%
    pause
    exit /b 1
)

:: --- [Launch] Starting PC Bridge + Web UI ---
echo.
echo %C%==========================================================%N%
echo %C%  LAUNCHING SYSTEMS%N%
echo %C%==========================================================%N%
echo.
echo   [ %Y%i%N% ] Starting PC Bridge (Vosk STT + Edge TTS)...

if exist "pc_bridge.py" (
    start "Pika AI - PC Bridge" /min cmd /c "title Pika PC Bridge [ws://localhost:8765] && color 0A && chcp 65001 >nul && venv\Scripts\python.exe -X utf8 pc_bridge.py & pause"
    echo   [ %G%✓%N% ] PC Bridge launched successfully on %Y%ws://localhost:8765%N% [minimized]
) else (
    echo   [ %R%✗%N% ] pc_bridge.py not found! PC control features will be disabled.
)

:: LAN IP detection for mobile access
set "LAN_IP=127.0.0.1"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "LAN_IP=%%a"
    set "LAN_IP=!LAN_IP: =!"
    goto :gotip
)
:gotip

echo   [ %Y%i%N% ] Launching Web browser...
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:3000"

echo.
echo %G%  [========================================================]%N%
echo %G%  [ 🚀 ALL SYSTEMS GO! Pika AI Assistant is running!      ]%N%
echo %G%  [========================================================]%N%
echo %G%  [  Web UI:     %Y%http://localhost:3000%N%                       %G% ]%N%
echo %G%  [  PC Bridge:  %Y%ws://localhost:8765%N%                         %G% ]%N%
echo %G%  [                                                        ]%N%
echo %G%  [  MOBILE SYNC (Same WiFi):                              ]%N%
echo %G%  [  Url:        %C%http://!LAN_IP!:3000%N%                        %G% ]%N%
echo %G%  [========================================================]%N%
echo.
echo   %C%Scan this QR Code with your phone to sync instantly:%N%
echo.

"%VENV_PY%" -X utf8 -c "import qrcode; qr=qrcode.QRCode(); qr.add_data('http://!LAN_IP!:3000'); qr.print_ascii(invert=True)"
echo.
echo   %Y%Note: Keep this window open. Press Ctrl+C in this terminal to stop Web UI.%N%
echo.

npm run dev
