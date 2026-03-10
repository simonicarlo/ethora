#!/usr/bin/env bash
# guard-main.sh — PreToolUse hook: blocks file edits on main/master branch
set -euo pipefail

INPUT=$(cat)

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
  # Only block file-modifying tools
  case "$TOOL" in
    Edit|Write|NotebookEdit)
      printf '{"decision":"block","reason":"You are on the %s branch. Create a feature branch first (e.g. git checkout -b feature/my-task) before making changes."}' "$BRANCH"
      exit 2
      ;;
  esac
fi

exit 0
