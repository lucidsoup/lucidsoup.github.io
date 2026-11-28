#!/usr/bin/env bash
# LucidSoup agent harness v1 — SessionStart hook.
# Claude Code adds everything this script prints to the session context.
# It runs on startup, resume, clear and after a context compaction.
# It also records the commit the session started from, so the Stop hook
# can see which files this session changed.

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$root" 2>/dev/null || exit 0
mem="docs/agent/MEMORY.md"
arch="docs/agent/ARCHITECTURE.md"
input="$(cat 2>/dev/null || true)"

# Record the session base once per session (not again after compaction).
if git rev-parse --git-dir >/dev/null 2>&1; then
  mkdir -p .claude/state
  case "$input" in
    *'"source":"compact"'*|*'"source": "compact"'*) : ;;
    *) git rev-parse HEAD > .claude/state/session-base 2>/dev/null || rm -f .claude/state/session-base ;;
  esac
fi

echo "== LucidSoup agent harness =="
echo "Logs: $mem (memory) and $arch (architecture). Rules: CLAUDE.md, section 'Agent harness'."
echo "Before you stop after you change files: add a memory entry (scripts/agent/log.sh memory \"<summary>\")."
echo "If the structure changed: update 'Current map' in $arch and add a decision (scripts/agent/log.sh decision \"<title>\")."
echo

if [ -f "$mem" ]; then
  echo "== Memory: standing facts =="
  awk '/^## Standing facts/{f=1;next} /^## /{f=0} f' "$mem" | sed '/^[[:space:]]*$/d' | head -40
  echo
  echo "== Memory: last 3 entries =="
  start="$(grep -n '^### ' "$mem" | tail -3 | head -1 | cut -d: -f1)"
  [ -n "$start" ] && tail -n "+$start" "$mem" | head -60
  echo
fi

if [ -f "$arch" ]; then
  echo "== Architecture: current map =="
  awk '/^## Current map/{f=1;next} /^## /{f=0} f' "$arch" | sed '/^[[:space:]]*$/d' | head -50
  echo
  echo "== Architecture: decisions (titles) =="
  grep -E '^### ADR-' "$arch" | tail -12
fi
exit 0
