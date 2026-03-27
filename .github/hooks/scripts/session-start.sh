#!/usr/bin/env bash
# Hook: SessionStart — Injects git context into every new agent session.
# Non-blocking: always exits 0, outputs systemMessage only.
set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DIRTY=$(git diff --quiet 2>/dev/null && echo "clean" || echo "dirty")
LAST_COMMIT=$(git log -1 --format="%s" 2>/dev/null || echo "no commits")

cat <<EOF
{
  "continue": true,
  "systemMessage": "Session context — branch: ${BRANCH}, commit: ${SHORT_SHA} (${DIRTY}), last: ${LAST_COMMIT}"
}
EOF
