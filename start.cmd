@echo off
rem One-click launcher (Windows): installs what's missing, builds the UI, starts the engine.
cd /d "%~dp0"
where uv >nul 2>nul || (echo Please install uv: https://docs.astral.sh/uv/ & pause & exit /b 1)
where npm >nul 2>nul || (echo Please install Node.js 20+: https://nodejs.org & pause & exit /b 1)
pushd engine & uv sync -q & popd
if not exist app\node_modules (pushd app & call npm install --no-fund --no-audit & popd)
if not exist app\dist\index.html (pushd app & call npm run build & popd)
start "" http://127.0.0.1:8765
pushd engine & uv run qrl serve --port 8765
