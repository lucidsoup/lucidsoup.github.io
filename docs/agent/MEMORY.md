# Memory log: lucidsoup.github.io

This file is the memory of the agents that work in this repo. The start hook loads the standing facts and the last 3 entries into each session. Rules: `CLAUDE.md`, section "Agent harness".

## Standing facts

Facts that every session must know. Keep this section short and true. Remove a fact when it stops being true.

- The site deploys from `main` through GitHub Pages. A merge to `main` is a deploy.
- The ripper deploys to the Fly app named `vst-library` (not `ripper`), from `.github/workflows/deploy-ripper.yml`.
- The 2026-11-19 security review reported that the ripper can be used through yt-dlp to reach Fly's internal network. Check if this is fixed before you change `ripper/`.
- Web masters made by `scripts/transcode-masters.mjs` are in `.gitignore`. Do not commit them.

## Entries

One entry for each work session, oldest first. Add an entry with `scripts/agent/log.sh memory "<summary>"`. Do not rewrite old entries.

### 2026-11-27 — Installed the agent harness v1 (`claude/agent-harness`)
- Did: Added this memory log, `docs/agent/ARCHITECTURE.md`, the SessionStart and Stop hooks in `.claude/`, `scripts/agent/log.sh`, `AGENTS.md`, and the "Agent harness" section of `CLAUDE.md`. Wrote the current map and the standing facts from the code, the READMEs and the commit history of `main`.
- Learned: The standing facts above record what was known on 2026-11-27. Facts marked as reported by the 2026-11-19 security review were not checked again for this change.
- Tested: `scripts/agent/log.sh check` passed. The start hook printed the logs. The Stop hook returned 0 on a clean tree and 2 after a code change with no memory entry. The project's own build and tests were not run for this change, because it adds only documentation and agent scripts.
- Next: Each agent session that changes files adds an entry here.
- Architecture: ADR-005
