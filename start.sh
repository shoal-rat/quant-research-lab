#!/usr/bin/env bash
# One-click launcher (macOS / Linux): installs what's missing, builds the UI,
# starts the engine on http://127.0.0.1:8765 and opens the browser.
set -euo pipefail
cd "$(dirname "$0")"
command -v uv >/dev/null || { echo "Please install uv: https://docs.astral.sh/uv/  (brew install uv)"; exit 1; }
command -v npm >/dev/null || { echo "Please install Node.js 20+: https://nodejs.org"; exit 1; }
(cd engine && uv sync -q)
if [ ! -d app/node_modules ]; then (cd app && npm install --no-fund --no-audit); fi
if [ ! -f app/dist/index.html ] || [ -n "$(find app/src -newer app/dist/index.html -print -quit)" ]; then
  (cd app && npm run build)
fi
URL="http://127.0.0.1:8765"
( sleep 2; command -v open >/dev/null && open "$URL" || xdg-open "$URL" >/dev/null 2>&1 || true ) &
cd engine && exec uv run qrl serve --port 8765
