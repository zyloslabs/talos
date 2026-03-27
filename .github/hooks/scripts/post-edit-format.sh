#!/usr/bin/env bash
# Hook: PostToolUse (edit/create file) — Auto-formats edited files with project linter.
# Non-blocking: formatting failures are warnings, never blocks the agent.
set -euo pipefail

INPUT=$(cat)

# Extract the file path from the tool output
FILE_PATH=$(echo "$INPUT" | grep -o '"filePath"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"filePath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

if [[ -z "$FILE_PATH" ]]; then
  echo '{"continue": true}'
  exit 0
fi

# Only format TypeScript/JavaScript/CSS files
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.css|*.json)
    # Try project-local prettier first, fallback silently
    REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
    if [[ -f "$REPO_ROOT/node_modules/.bin/prettier" ]]; then
      "$REPO_ROOT/node_modules/.bin/prettier" --write "$FILE_PATH" 2>/dev/null || true
    fi
    ;;
esac

echo '{"continue": true}'
