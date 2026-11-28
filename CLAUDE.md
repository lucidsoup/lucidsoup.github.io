# lucidsoup.github.io: notes for agents

The system map, the commands and the known problems are in `docs/agent/ARCHITECTURE.md` and `docs/agent/MEMORY.md`. Read them before you change files. The user-facing description is in `README.md`.

## Agent harness

This repo uses the LucidSoup agent harness v1. It gives each agent session the same start, the same memory and the same finish.

| Part | Path | What it does |
|---|---|---|
| Memory log | `docs/agent/MEMORY.md` | Standing facts (commands, gotchas, environment) and one dated entry for each work session. |
| Architecture log | `docs/agent/ARCHITECTURE.md` | The current map of the system and an append-only decision log (ADRs). |
| Start hook | `.claude/hooks/session-start.sh` | Loads the standing facts, the last 3 memory entries, the current map and the decision titles into the session. Records the start commit. |
| Stop hook | `.claude/hooks/stop-check.sh` | Stops the agent one time if it changed files and did not log the work. |
| Log tool | `scripts/agent/log.sh` | `memory "<summary>"`, `decision "<title>"`, `tail [N]`, `check`. |

### Procedure

1. At the start, read the context that the start hook loaded. If the hook did not run (another agent, or hooks are off), read `docs/agent/MEMORY.md` and `docs/agent/ARCHITECTURE.md` before you change files.
2. Before you change a module, read its part of the current map. Do not go against an accepted ADR. To change a decision, add a new ADR that supersedes it, and change the status of the old ADR to `Superseded by ADR-NNN`.
3. When you find a fact that the next session must know (a command, a gotcha, a hardware limit), add it to `## Standing facts`. Keep that section short and true. Remove facts that are no longer true.
4. Before you stop after you changed files:
   1. Run `scripts/agent/log.sh memory "<one-line summary>"`. Fill in `Did`, `Learned`, `Tested` and `Next`. Write `none` if a line has no content.
   2. If you added, removed or moved files, or changed a build, deploy or schema file: update `## Current map` and run `scripts/agent/log.sh decision "<title>"`. Put the ADR number on the `Architecture:` line of the memory entry. If the structure did not change, keep `Architecture: no change`.
   3. Run `scripts/agent/log.sh check`. Correct all problems that it shows.
5. Commit the logs with the work that they describe.

### Rules for the logs

- Write in ASD-STE100 Simplified Technical English: short sentences, active voice, one instruction in each sentence.
- Record facts, not plans that you did not do. In `Tested`, write the command that you ran and its result. If you did not test on the real hardware or host, say so.
- Do not write secrets, tokens, passwords, keys or customer data in the logs.
- Do not rewrite old entries. Correct an error with a new entry.

### Standing preferences (all LucidSoup repos)

- Give complete, working deliverables. Find the root cause before you fix a symptom.
- Audio, synths and plugins: tune to A4 = 432 Hz. Do not use 440 Hz.
- UI: psychedelic dark theme. Plugin windows: cut-out (shaped) window designs, neat and organized.
- Documentation: ASD-STE100 Simplified Technical English.
