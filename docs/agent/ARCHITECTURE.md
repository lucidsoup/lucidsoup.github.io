# Architecture log: lucidsoup.github.io

This file has two parts. "Current map" describes the system as it is now; edit it in place when the system changes. "Decision log" records each architectural decision; it is append-only. Rules: `CLAUDE.md`, section "Agent harness".

## Current map

Last checked: 2026-11-27, against `main` at `5e2273c`.

**Purpose.** The LucidSoup website (GitHub Pages, custom domain in `CNAME`) and the small services and tools that the site uses.

**Stack.** Static HTML, CSS and JavaScript at the root. Node scripts for media and shader checks. Small C/C++ helper programs. A Node service (`ripper/`) on Fly.io.

| Path | What it is |
|---|---|
| `index.html`, `lucid.*`, `soup.*`, `stack.*` | Home page and shared styles and scripts. |
| `playground.html`, `gallery.html`, `watch.html`, `plugins.html`, `sp404.html`, `drumseek.html`, `admin.html` | Site pages (playground, gallery, watchlist, plugins, SP-404 converter, DrumSeek, admin). Data in `items.json`, `media.json`, `rooms.json`, `watch.json`. |
| `store/` | The Soup Lab store front end at `/store` (the back end is in the DropShift repo). |
| `synthsoup/` | The SynthSoup site: `webapp/`, `firmware/`, `assets/`, `sounds/`, `research/`. |
| `blackboxfx/` | BlackboxFX Control at `/blackboxfx/`. |
| `shaders/` | Shader library and fractal formulas. `scripts/shader-validate.mjs` checks them. |
| `pluginhost/` | Local program that runs the user's CLAP and VST3 plug-ins and plays them in the browser (`make`, then `./pluginhost`). |
| `soupsend/` | Local program that puts the playground output on NDI or Spout (`make`, `make ndi`, `make windows`). |
| `ripper/` | Service: takes a URL and returns its audio with CORS headers, for the SP-404 converter. Token and origin checks. Deployed by `.github/workflows/deploy-ripper.yml` to the Fly app `vst-library`. |
| `scripts/` | `make-previews.mjs`, `transcode-masters.mjs`, `shader-validate.mjs`. |
| `videos/`, `icons/`, `vendor/`, `tools/` | Media, icons, vendored libraries, small tools. |

**Boundaries.** The site is static. Anything that needs a secret runs in `ripper/` or in DropShift, never in page code.

## Decision log

Add a decision with `scripts/agent/log.sh decision "<title>"`. To change a decision, add a new ADR and set the old status to `Superseded by ADR-NNN`. ADRs dated before 2026-11-27 were recorded on 2026-11-27 from the commit history.

### ADR-001 — 2026-08-29 — Shader library with live WebGL previews
- Status: Accepted
- Context: The site shows shaders as a main feature.
- Decision: Keep the shaders in `shaders/` and preview them live with WebGL.
- Consequences: Shaders must compile in WebGL. 2026-10-28: the daily shader drop was removed.
- Recorded: 2026-11-27, from the commit history and the README.

### ADR-002 — 2026-10-13 — SP-404 converter in the browser, helped by a ripper service
- Status: Accepted
- Context: A browser cannot read audio from most links because of CORS.
- Decision: Convert in the page. Fetch links that the page cannot read through `ripper/`, which needs a token and an allowed origin.
- Consequences: The ripper is a public network service and must stay locked down.
- Recorded: 2026-11-27, from the commit history and the README.

### ADR-003 — 2026-10-29 — Deploy the ripper to Fly.io from the repository
- Status: Accepted
- Context: Manual deploys of the ripper were not repeatable.
- Decision: Deploy with `deploy-ripper.yml` to the existing Fly app `vst-library`.
- Consequences: The app name does not match the service name. Do not rename it without a migration.
- Recorded: 2026-11-27, from the commit history and the README.

### ADR-004 — 2026-11-23 — Host the Soup Lab store at lucidsoup.com/store
- Status: Accepted
- Context: The store front end was on a separate host.
- Decision: Serve the store front end from `store/` on this site.
- Consequences: The back end (Supabase, Stripe) stays in DropShift.
- Recorded: 2026-11-27, from the commit history and the README.

### ADR-005 — 2026-11-27 — Adopt the LucidSoup agent harness v1
- Status: Accepted
- Context: Agent sessions started cold. Each session read the repo again and lost what earlier sessions learned.
- Decision: Add `docs/agent/MEMORY.md`, `docs/agent/ARCHITECTURE.md`, a SessionStart hook that loads them, a Stop hook that makes the agent log changed work, and `scripts/agent/log.sh`.
- Consequences: Each session that changes files adds a memory entry. Structural changes update the current map and add an ADR. `.claude/state/` is local and ignored by git.
