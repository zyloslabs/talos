#!/usr/bin/env bash
# Hook: PreToolUse (run_in_terminal) — Logs terminal commands for audit trail.
# Non-blocking: always allows, just logs the command.
set -euo pipefail

INPUT=$(cat)
LOG_DIR="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")/.github/hooks/logs"
mkdir -p "$LOG_DIR"

COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [[ -n "$COMMAND" ]]; then
  echo "${TIMESTAMP} | terminal | ${COMMAND}" >> "$LOG_DIR/terminal.log"
fi

# Always allow — no blocking
cat <<EOF
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
EOF
