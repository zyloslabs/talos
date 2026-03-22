#!/bin/bash
set -e

# Resolve the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$DIR")"

echo "[clean-start] Killing existing Talos processes..."

# Kill common Talos dev/watch processes by full command path
pkill -f "$PROJECT_ROOT.*src/index.ts" || true
pkill -f "$PROJECT_ROOT.*dist/index.js" || true
pkill -f "$PROJECT_ROOT.*tsx" || true
pkill -f "$PROJECT_ROOT.*pnpm.*dev" || true
pkill -f "$PROJECT_ROOT/ui.*next.*dev" || true

# Final deterministic sweep: kill any Talos-rooted node/tsx/pnpm/next process
# that may have escaped the explicit patterns above.
for PID in $(pgrep -f "$PROJECT_ROOT" 2>/dev/null || true); do
  [ "$PID" = "$$" ] && continue
  CMD=$(ps -p "$PID" -o command= 2>/dev/null || true)
  if echo "$CMD" | grep -Eq "(node|tsx|pnpm|next)"; then
    kill -9 "$PID" 2>/dev/null || true
  fi
done

# Kill processes on port 3000 (Talos backend)
PID=$(lsof -ti:3000 2>/dev/null || true)
if [ -n "$PID" ]; then
  echo "[clean-start] Killing process on port 3000 (PID $PID)"
  kill -9 $PID || true
fi

# Kill processes on port 3001 (Next.js UI)
PID=$(lsof -ti:3001 2>/dev/null || true)
if [ -n "$PID" ]; then
  echo "[clean-start] Killing process on port 3001 (PID $PID)"
  kill -9 $PID || true
fi

echo "[clean-start] Starting Talos in dev mode (backend + UI)..."

# Auto-populate UI .env.local from environment or defaults
UI_ENV="$PROJECT_ROOT/ui/.env.local"
TALOS_API_BASE="${TALOS_API_BASE:-http://localhost:3000}"

# next.config.js rewrites read TALOS_API_BASE (server-side, no NEXT_PUBLIC_ prefix)
echo "TALOS_API_BASE=$TALOS_API_BASE" > "$UI_ENV"
echo "[clean-start] Wrote API base to ui/.env.local (TALOS_API_BASE=$TALOS_API_BASE)"

cd "$PROJECT_ROOT"
DEV_LOG="$PROJECT_ROOT/.talos-dev.log"
UI_LOG="$PROJECT_ROOT/.talos-ui.log"
PROBE_PIDS=()

start_health_probe() {
  local name="$1"
  local url="$2"
  local attempts="$3"
  local interval="$4"

  (
    local ready=0
    for _ in $(seq 1 "$attempts"); do
      if curl -fsS "$url" >/dev/null 2>&1; then
        ready=1
        break
      fi
      sleep "$interval"
    done

    if [ "$ready" -eq 1 ]; then
      echo "[clean-start] ${name} is healthy"
    else
      echo "[clean-start] WARNING: ${name} health check timed out. Check logs."
    fi
  ) &

  PROBE_PIDS+=("$!")
}

echo "[clean-start] Starting backend first..."
pnpm dev > "$DEV_LOG" 2>&1 &
BACKEND_PID=$!
echo "[clean-start] Backend logs: $DEV_LOG"

echo "[clean-start] Waiting for backend on port 3000..."
for _ in {1..30}; do
  if lsof -ti:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! lsof -ti:3000 >/dev/null 2>&1; then
  echo "[clean-start] WARNING: Backend did not come up on port 3000. Check $DEV_LOG"
fi

start_health_probe "Backend (port 3000)" "http://127.0.0.1:3000/health" 30 1

echo "[clean-start] Starting UI..."
(
  cd "$PROJECT_ROOT/ui"
  PORT=3001 pnpm dev > "$UI_LOG" 2>&1
) &
UI_PID=$!
echo "[clean-start] UI logs: $UI_LOG"

echo "[clean-start] Waiting for UI on port 3001..."
for _ in {1..30}; do
  if lsof -ti:3001 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! lsof -ti:3001 >/dev/null 2>&1; then
  echo "[clean-start] WARNING: UI did not come up on port 3001. Check $UI_LOG"
fi

start_health_probe "UI (port 3001)" "http://127.0.0.1:3001" 30 1

# Wait for background health probes to report
for probe_pid in "${PROBE_PIDS[@]}"; do
  wait "$probe_pid" 2>/dev/null || true
done

echo ""
echo "[clean-start] ─────────────────────────────────────────────────────"
echo "[clean-start]  Talos is running"
echo "[clean-start]  Backend → http://localhost:3000"
echo "[clean-start]  UI      → http://localhost:3001/talos"
echo "[clean-start] ─────────────────────────────────────────────────────"
echo "[clean-start]  Tailing logs (Ctrl+C to stop all processes)"
echo ""

tail -f "$DEV_LOG" "$UI_LOG" &
TAIL_PID=$!

cleanup() {
  echo ""
  echo "[clean-start] Stopping Talos dev servers..."
  kill -9 "$BACKEND_PID" 2>/dev/null || true
  if [ -n "${UI_PID:-}" ]; then
    kill -9 "$UI_PID" 2>/dev/null || true
  fi
  if [ -n "${TAIL_PID:-}" ]; then
    kill -9 "$TAIL_PID" 2>/dev/null || true
  fi
  if [ "${#PROBE_PIDS[@]}" -gt 0 ]; then
    for probe_pid in "${PROBE_PIDS[@]}"; do
      kill -9 "$probe_pid" 2>/dev/null || true
    done
  fi
  pkill -f "next.*dev" || true
  echo "[clean-start] Done."
}

trap cleanup EXIT

# Wait for the UI process; use || true so a UI crash doesn't trigger set -e
# and tear down the entire stack. The EXIT trap still fires on Ctrl+C.
wait "$UI_PID" || true
