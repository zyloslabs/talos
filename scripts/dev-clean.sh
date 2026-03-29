#!/bin/bash
set -e

# Resolve the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$DIR")"

# Port helpers
port_pid() {
  lsof -ti:"$1" 2>/dev/null | head -1 || true
}

is_own_pid() {
  local pid="$1"
  [ -z "$pid" ] && return 1
  ps -p "$pid" -o command= 2>/dev/null | grep -q "$PROJECT_ROOT"
}

find_free_port() {
  local port="$1"
  while lsof -ti:"$port" >/dev/null 2>&1; do
    port=$((port + 1))
  done
  echo "$port"
}

resolve_port() {
  local default_port="$1"
  local service_name="$2"
  local pid
  pid=$(port_pid "$default_port")

  if [ -z "$pid" ]; then
    echo "$default_port"
    return
  fi

  if is_own_pid "$pid"; then
    echo "[clean-start] Talos $service_name detected on port $default_port - will restart" >&2
    echo "$default_port"
  else
    local free_port
    free_port=$(find_free_port $((default_port + 1)))
    echo "[clean-start] Port $default_port is in use by another app (PID $pid); $service_name will use port $free_port" >&2
    echo "$free_port"
  fi
}

BACKEND_PORT=$(resolve_port 3000 "backend")
UI_PORT=$(resolve_port 3001 "UI")

if [ "$UI_PORT" -eq "$BACKEND_PORT" ]; then
  UI_PORT=$(find_free_port $((BACKEND_PORT + 1)))
  echo "[clean-start] UI port adjusted to $UI_PORT to avoid collision with backend"
fi

echo "[clean-start] Killing existing Talos processes..."
pkill -f "$PROJECT_ROOT.*src/index.ts" || true
pkill -f "$PROJECT_ROOT.*dist/index.js" || true
pkill -f "$PROJECT_ROOT.*tsx" || true
pkill -f "$PROJECT_ROOT.*pnpm.*dev" || true
pkill -f "$PROJECT_ROOT/ui.*next.*dev" || true

for PID in $(pgrep -f "$PROJECT_ROOT" 2>/dev/null || true); do
  [ "$PID" = "$$" ] && continue
  CMD=$(ps -p "$PID" -o command= 2>/dev/null || true)
  if echo "$CMD" | grep -Eq "(node|tsx|pnpm|next)"; then
    kill -9 "$PID" 2>/dev/null || true
  fi
done

for _port in "$BACKEND_PORT" "$UI_PORT"; do
  STALE_PID=$(port_pid "$_port")
  if [ -n "$STALE_PID" ] && is_own_pid "$STALE_PID"; then
    echo "[clean-start] Killing stale Talos process on port $_port (PID $STALE_PID)"
    kill -9 "$STALE_PID" 2>/dev/null || true
  fi
done

echo "[clean-start] Starting Talos in dev mode (backend: $BACKEND_PORT, UI: $UI_PORT)..."

# ── Pre-flight: Playwright browsers ──────────────────────────────────────────
PW_CACHE="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/Library/Caches/ms-playwright}"
if [ ! -d "$PW_CACHE" ] || [ -z "$(ls -A "$PW_CACHE" 2>/dev/null)" ]; then
  echo "[clean-start] Playwright browsers not found — installing..."
  npx playwright install --with-deps 2>&1 | tail -5
else
  echo "[clean-start] Playwright browsers found at $PW_CACHE"
fi

# Auto-populate UI .env.local from environment or defaults
UI_ENV="$PROJECT_ROOT/ui/.env.local"
TALOS_API_BASE="${TALOS_API_BASE:-http://localhost:$BACKEND_PORT}"

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
PORT="$BACKEND_PORT" pnpm dev > "$DEV_LOG" 2>&1 &
BACKEND_PID=$!
echo "[clean-start] Backend logs: $DEV_LOG"

echo "[clean-start] Waiting for backend on port $BACKEND_PORT..."
for _ in {1..30}; do
  if lsof -ti:"$BACKEND_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! lsof -ti:"$BACKEND_PORT" >/dev/null 2>&1; then
  echo "[clean-start] WARNING: Backend did not come up on port $BACKEND_PORT. Check $DEV_LOG"
fi

start_health_probe "Backend (port $BACKEND_PORT)" "http://127.0.0.1:$BACKEND_PORT/health" 30 1

echo "[clean-start] Starting UI..."
(
  cd "$PROJECT_ROOT/ui"
  pnpm exec next dev -p "$UI_PORT" > "$UI_LOG" 2>&1
) &
UI_PID=$!
echo "[clean-start] UI logs: $UI_LOG"

echo "[clean-start] Waiting for UI on port $UI_PORT..."
for _ in {1..30}; do
  if lsof -ti:"$UI_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! lsof -ti:"$UI_PORT" >/dev/null 2>&1; then
  echo "[clean-start] WARNING: UI did not come up on port $UI_PORT. Check $UI_LOG"
fi

start_health_probe "UI (port $UI_PORT)" "http://127.0.0.1:$UI_PORT" 30 1

# Wait for background health probes to report
for probe_pid in "${PROBE_PIDS[@]}"; do
  wait "$probe_pid" 2>/dev/null || true
done

echo ""
echo "[clean-start] ─────────────────────────────────────────────────────"
echo "[clean-start]  Talos is running"
echo "[clean-start]  Backend → http://localhost:$BACKEND_PORT"
echo "[clean-start]  UI      → http://localhost:$UI_PORT/talos"
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
  pkill -f "$PROJECT_ROOT/ui" || true
  echo "[clean-start] Done."
}

trap cleanup EXIT

# Wait for the UI process; use || true so a UI crash doesn't trigger set -e
# and tear down the entire stack. The EXIT trap still fires on Ctrl+C.
wait "$UI_PID" || true
