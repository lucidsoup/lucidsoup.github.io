#!/usr/bin/env bash
# LucidSoup agent harness v1 — Stop hook.
# When this session changed project files, the agent must log the work
# before it stops. Exit code 2 sends the message on stderr back to the
# agent and makes it continue. The hook blocks one time only: when Claude
# Code reports stop_hook_active, the hook lets the agent stop.

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$root" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
input="$(cat 2>/dev/null || true)"
case "$input" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;; esac
[ "${HARNESS_SKIP:-0}" = "1" ] && exit 0

mem="docs/agent/MEMORY.md"
arch="docs/agent/ARCHITECTURE.md"
base="$(cat .claude/state/session-base 2>/dev/null)"
git cat-file -e "${base:-none}^{commit}" 2>/dev/null || base="HEAD"

# Files changed since the session base: commits, staged, unstaged, untracked.
changed="$( { git diff --name-only "$base" 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | sort -u)"
work="$(printf '%s\n' "$changed" | grep -vE '^(docs/agent/|\.claude/|CLAUDE\.md$|AGENTS\.md$)' | sed '/^$/d')"
[ -z "$work" ] && exit 0

problems=""
if ! printf '%s\n' "$changed" | grep -qx "$mem"; then
  problems="${problems}- Add a memory entry to $mem: what you did, what you learned, what is next, what you tested.
  Command: scripts/agent/log.sh memory \"<one-line summary>\", then fill in the lines.
"
fi

# Structural change: files added, deleted or renamed, or a build/deploy manifest changed.
struct="$( { git diff --name-status "$base" 2>/dev/null | awk '$1 ~ /^[ADR]/ {print $NF}'; git ls-files --others --exclude-standard 2>/dev/null; } \
  | grep -vE '^(docs/agent/|\.claude/)' | sed '/^$/d')"
manifest="$(printf '%s\n' "$work" | grep -E '(^|/)(CMakeLists\.txt|package\.json|Cargo\.toml|pyproject\.toml|requirements[^/]*\.txt|[^/]*\.uproject|project\.godot|wrangler\.jsonc?|fly\.toml|render\.yaml|Dockerfile|setup\.sh|[^/]*\.cmake)$|^\.github/workflows/|^supabase/migrations/')"
if [ -n "$struct$manifest" ] && ! printf '%s\n' "$changed" | grep -qx "$arch"; then
  if ! git diff "$base" -- "$mem" 2>/dev/null | grep -qiE '^\+.*Architecture: *no change'; then
    files="$(printf '%s\n%s\n' "$struct" "$manifest" | sed '/^$/d' | sort -u | head -8 | sed 's/^/    /')"
    problems="${problems}- Files were added, removed or a manifest changed:
$files
  Update 'Current map' in $arch and add a decision (scripts/agent/log.sh decision \"<title>\").
  If the structure did not change, write 'Architecture: no change' in your memory entry.
"
  fi
fi

[ -z "$problems" ] && exit 0
{
  echo "Agent harness: log this session before you stop."
  printf '%s' "$problems"
  echo "Then run: scripts/agent/log.sh check"
} >&2
exit 2
