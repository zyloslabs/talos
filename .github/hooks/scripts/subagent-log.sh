#!/usr/bin/env bash
# Hook: SubagentStart / SubagentStop — Logs subagent lifecycle to .github/hooks/logs/subagent.log.
# Non-blocking: always exits 0, never denies.
set -euo pipefail

INPUT=$(cat)
LOG_DIR="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")/.github/hooks/logs"
mkdir -p "$LOG_DIR"

EVENT=$(echo "$INPUT" | grep -o '"hookEventName"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"hookEventName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
AGENT=$(echo "$INPUT" | grep -o '"agentName"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"agentName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "${TIMESTAMP} | ${EVENT:-unknown} | agent=${AGENT:-unknown}" >> "$LOG_DIR/subagent.log"

cat <<EOF
{
  "continue": true
}
EOF
