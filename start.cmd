@echo off
title Quant Research Lab launcher
cd /d "%~dp0"
echo ============================================================
echo   Quant Research Lab - starting the engine and the app...
echo ============================================================
echo.

REM First run only: install dependencies
if not exist node_modules (
  echo Installing dependencies ^(first run only, this can take a few minutes^)...
  call npm install
)

REM Start the ENGINE (bridge). Uses your Alpaca paper keys file on the Desktop if present.
set "KEYFILE=%USERPROFILE%\Desktop\API_Trading.txt"
if exist "%KEYFILE%" (
  echo Using paper keys: %KEYFILE%
  start "QRL Engine (bridge)" cmd /k "set QRL_ALPACA_KEY_FILE=%KEYFILE% && npm run dialogue-bridge"
) else (
  echo No keys file found on Desktop ^(API_Trading.txt^) - the race will run without live trading until you add keys in Settings.
  start "QRL Engine (bridge)" cmd /k "npm run dialogue-bridge"
)

REM Start the APP (web UI)
start "QRL App" cmd /k "npm run dev"

REM Give them a moment, then open the browser
timeout /t 6 >nul
start "" http://127.0.0.1:5173

echo.
echo Two windows opened: "QRL Engine (bridge)" and "QRL App". Keep BOTH open.
echo The browser should have opened to the app. On the main screen, click
echo "Start investing" - the AI will research, backtest, and paper-invest for you.
echo.
echo To stop everything: close those two windows.
echo (You can close this window.)
