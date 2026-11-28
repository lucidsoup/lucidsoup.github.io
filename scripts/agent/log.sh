#!/usr/bin/env bash
# LucidSoup agent harness v1 — log tool for docs/agent/MEMORY.md and docs/agent/ARCHITECTURE.md.
#
#   scripts/agent/log.sh memory   "<summary>"   add a dated memory entry (fill in its lines after)
#   scripts/agent/log.sh decision "<title>"     add the next ADR to the architecture decision log
#   scripts/agent/log.sh check                  validate the two logs (exit 1 on a problem)
#   scripts/agent/log.sh tail [N]               show the last N memory entries (default 3)
set -euo pipefail
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
mem="$root/docs/agent/MEMORY.md"
arch="$root/docs/agent/ARCHITECTURE.md"
today="$(date +%Y-%m-%d)"
branch="$(git -C "$root" branch --show-current 2>/dev/null || true)"
branch="${branch:-detached}"

die() { echo "log.sh: $*" >&2; exit 1; }

case "${1:-}" in
  memory)
    [ -n "${2:-}" ] || die 'usage: log.sh memory "<summary>"'
    [ -f "$mem" ] || die "$mem not found"
    printf '\n### %s — %s (`%s`)\n- Did: \n- Learned: \n- Tested: \n- Next: \n- Architecture: no change\n' \
      "$today" "$2" "$branch" >> "$mem"
    echo "Added a memory entry to docs/agent/MEMORY.md. Fill in Did, Learned, Tested and Next."
    echo "Change 'Architecture: no change' to the ADR number if you made a decision."
    ;;
  decision)
    [ -n "${2:-}" ] || die 'usage: log.sh decision "<title>"'
    [ -f "$arch" ] || die "$arch not found"
    last="$(grep -oE '^### ADR-[0-9]{3}' "$arch" | tail -1 | grep -oE '[0-9]{3}' || echo 000)"
    next="$(printf '%03d' $((10#$last + 1)))"
    printf '\n### ADR-%s — %s — %s\n- Status: Accepted\n- Context: \n- Decision: \n- Consequences: \n' \
      "$next" "$today" "$2" >> "$arch"
    echo "Added ADR-$next to docs/agent/ARCHITECTURE.md. Fill in Context, Decision and Consequences."
    echo "If the decision changes the layout, also update 'Current map'."
    ;;
  tail)
    n="${2:-3}"
    start="$(grep -n '^### ' "$mem" | tail -"$n" | head -1 | cut -d: -f1)"
    [ -n "$start" ] && tail -n "+$start" "$mem"
    ;;
  check)
    rc=0
    for f in "$mem" "$arch"; do [ -f "$f" ] || { echo "missing: ${f#$root/}"; rc=1; }; done
    [ $rc -eq 0 ] || exit 1
    grep -q '^## Standing facts' "$mem" || { echo "MEMORY.md: no '## Standing facts' section"; rc=1; }
    grep -q '^## Entries' "$mem"        || { echo "MEMORY.md: no '## Entries' section"; rc=1; }
    grep -q '^## Current map' "$arch"   || { echo "ARCHITECTURE.md: no '## Current map' section"; rc=1; }
    grep -q '^## Decision log' "$arch"  || { echo "ARCHITECTURE.md: no '## Decision log' section"; rc=1; }
    # Entry headings must carry a date. Empty template lines are not permitted.
    bad="$(grep -nE '^### ' "$mem" | grep -vE '^[0-9]+:### [0-9]{4}-[0-9]{2}-[0-9]{2} — ' || true)"
    [ -z "$bad" ] || { echo "MEMORY.md: entry heading without a date:"; echo "$bad"; rc=1; }
    empty="$(grep -nE '^- (Did|Learned|Tested|Next):[[:space:]]*$' "$mem" || true)"
    [ -z "$empty" ] || { echo "MEMORY.md: empty entry lines (fill them in or write 'none'):"; echo "$empty"; rc=1; }
    badadr="$(grep -nE '^### ADR' "$arch" | grep -vE '^[0-9]+:### ADR-[0-9]{3} — [0-9]{4}-[0-9]{2}-[0-9]{2} — ' || true)"
    [ -z "$badadr" ] || { echo "ARCHITECTURE.md: bad ADR heading:"; echo "$badadr"; rc=1; }
    dup="$(grep -oE '^### ADR-[0-9]{3}' "$arch" | sort | uniq -d)"
    [ -z "$dup" ] || { echo "ARCHITECTURE.md: duplicate ADR numbers: $dup"; rc=1; }
    emptyadr="$(grep -nE '^- (Context|Decision|Consequences):[[:space:]]*$' "$arch" || true)"
    [ -z "$emptyadr" ] || { echo "ARCHITECTURE.md: empty ADR lines:"; echo "$emptyadr"; rc=1; }
    # Secrets do not go in the logs.
    sec="$(grep -nE '(sk_live_|sk_test_|ghp_[A-Za-z0-9]{20}|github_pat_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|xox[abp]-)' "$mem" "$arch" || true)"
    [ -z "$sec" ] || { echo "Possible secret in a log:"; echo "$sec"; rc=1; }
    [ $rc -eq 0 ] && echo "logs OK: $(grep -c '^### ' "$mem") memory entries, $(grep -c '^### ADR-' "$arch") decisions"
    exit $rc
    ;;
  *)
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
