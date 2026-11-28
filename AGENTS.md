# lucidsoup.github.io: agents

All agents (Claude Code, Codex and others) follow `CLAUDE.md`. Read it first.

Agents with no hook support must do the hook steps by hand:

1. At the start, read `docs/agent/MEMORY.md` and `docs/agent/ARCHITECTURE.md`.
2. Before you stop after you changed files, run `scripts/agent/log.sh memory "<summary>"` and fill in the entry. If the structure changed, update the current map and run `scripts/agent/log.sh decision "<title>"`.
3. Run `scripts/agent/log.sh check`.
