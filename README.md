# Commander Deck Doctor

Commander deck analysis app built with Next.js + TypeScript.

## What It Does

- Parses free-form Commander decklists (Commander section supported).
- Imports public decks from Moxfield and Archidekt.
- Resolves card metadata from Scryfall.
- Runs analyzer output for:
  - deck summary and mana curve
  - role composition (ramp/draw/removal/wipes/tutors/protection/finishers)
  - commander/deck checks (size, singleton, color identity, unknown cards, banlist surfacing)
  - bracket heuristics, archetype signals, combo signals, Rule 0 snapshot (including true tutor cards in table-talk flags)
  - on-demand deterministic simulations
- Supports set-aware pricing, per-card seller links, and per-card printing selection.
- Shows card preview tiles across key report sections (detected cards, core composition tagged cards, combo detection, and suggestion cards).

## Quick Start

```bash
npm install
npm run scryfall:update
npm run spellbook:update
npm run dev
```

Open `http://localhost:3000`.

## Build And Test

```bash
npm run lint
npm run test
npm run test:a11y
npm run test:coverage
npm run build
npm run bench:analyze -- --file tests/fixtures/kentaro-benchmark.decklist.txt --mode decklist-set --repeat-hits 2
```

Notes:

- `test:a11y` runs automated accessibility smoke checks (axe-core) on core UI surfaces.
- `test:coverage` enforces minimum thresholds for critical API/runtime modules.

## Scryfall Data (Offline-First)

The app/engine read from the local compiled Oracle file:

- `data/scryfall/oracle-cards.compiled.json`
- `data/scryfall/default-cards.compiled.json.gz`
- `data/scryfall/prints.compiled.sqlite`
- `data/scryfall/print-index/manifest.compiled.json.gz`
- `data/scryfall/print-index/shards/*.json.gz`

Update pipeline:

```bash
npm run scryfall:update
```

This runs download + compile. Build also verifies compiled data exists.

Notes:

- Raw Oracle downloads are ignored by git.
- `oracle-default` analysis now uses local default-print card data first, which includes prices and image metadata without blocking on live Scryfall for common miss-path requests.
- `decklist-set` print-aware lookup now prefers a lean print-only SQLite store for exact `id`, `set+collector`, and `name+set` resolution, then falls back to the bucketed local print index if SQLite is unavailable.
- Engine/tests do not require Scryfall network access at runtime.

## Combo Data (Commander Spellbook Snapshot)

The analyzer reads combos from a local snapshot file:

- `lib/combos.json`

Update pipeline:

```bash
npm run spellbook:update
```

This runs download + compile from Commander Spellbook backend API into a local offline snapshot.
Runtime/tests do not call Commander Spellbook.

## Official Rules Data (Wizards + Commander RC)

The rules engine consumes synced official data snapshots:

- `lib/rules/datasets/officialRules.json`
- `lib/rules/datasets/banlist.json`

Refresh these datasets from official websites:

```bash
npm run rules:update
```

Current sync includes:

- latest Magic Comprehensive Rules document links + revision/effective-date metadata from `https://magic.wizards.com/en/rules`
- Commander Rules page metadata from `https://mtgcommander.net/index.php/rules/`
- Commander RC banned card names from `https://mtgcommander.net/index.php/banned-list/`

## Pricing And Printing Selection

- `Oracle default lookup`: name-based pricing.
- `Use [SET] tags in decklist`: set-aware pricing.
- Decklist tag example: `1 Sol Ring [CMM]`.
- Deck entry uses a plain textarea (no preview-mode toggle).
- In the `Cards` tab, each detected card supports:
  - TCGplayer price display (from Scryfall price fields)
  - seller links (`TCGplayer`, `Card Kingdom`)
  - `Select Printing` picker (includes special printings, including Secret Lair and Judge promo printings when available)
- Selected printings update card art and set-aware pricing lookup via analyzer overrides.

## Simulations UI

- The `Simulations` tab uses a single interactive simulation panel.
- Run counts: `100`, `1000`, `5000`.
- Optional seed toggle for reproducible runs.
- Simulations are fetched on demand from `/api/simulate`; they no longer block the initial `/api/analyze` response.
- Rule 0 speed/consistency heuristics currently use deck composition features during initial analyze and can be compared against the on-demand simulation panel afterward.

## Suggestions And Combo Views

- Deck Improvement Suggestions include `Suggested Adds` for `LOW` role statuses.
- Deck Improvement Suggestions include `Suggested Cuts` for `HIGH` role statuses (based on role-tagged cards in your list).
- Improvement suggestions are now grouped into `Adds` and `Cuts` tabs for faster scanability.
- Improvement suggestions now load after the initial report from `POST /api/improvement-suggestions` so first analysis returns faster.
- Combo Detection includes internal tabs: `Live Combos`, `Conditional`, and `Potential`.
- Combo lists and suggestions use card preview tiles for faster review.

## Legality UI

- The report includes a dedicated `Banlist` legality card when Commander RC banned cards are detected.
- Banlist failures surface the actual banned card names from the rules engine findings instead of only a generic fail state.

## Deployment Notes

- Vercel hosts the app.
- Shared report persistence uses Neon Postgres (`POSTGRES_URL` or `DATABASE_URL`).
- Sampled analyzer performance telemetry can be stored in Postgres for production `/api/analyze` requests.
- `/api/analyze` runs on Node runtime and loads local compiled Scryfall data.
- `/api/warmup` can pre-initialize the analyze runtime on a fresh instance before user traffic hits it.
- Security headers are configured at the framework level (XFO, XCTO, Referrer-Policy, Permissions-Policy, CSP, HSTS).
- All public API routes use scoped rate limiting.

### Analyze Telemetry

- Purpose: capture real production timing data for `/api/analyze` so lookup/computation bottlenecks can be optimized with live evidence.
- Stored fields are operational only: cache hit/miss, cold-start flag, timing stages, response size, deck size, known/unknown counts, pricing mode, commander-selection metadata, and related request-shape flags.
- Raw decklists are intentionally excluded from this telemetry dataset.
- Environment controls:
  - `ANALYZE_TELEMETRY_ENABLED=1` to force-enable telemetry outside production, `0` to disable.
  - `ANALYZE_TELEMETRY_SAMPLE_RATE` to adjust capture rate (default `1`).
  - `ANALYZE_TELEMETRY_RETENTION_DAYS` to tune retention (default `30`).
- `npm run telemetry:summary -- --days 7` prints a markdown telemetry summary from Postgres.
- `npm run telemetry:summary -- --since 2026-03-08T21:42:39Z --last 10` isolates the most recent post-deploy requests.
- GitHub Action: `.github/workflows/telemetry-summary.yml`
  - scheduled daily via cron
  - manual `workflow_dispatch`
  - manual runs now support `days`, `since`, and `last` inputs so post-deploy reports can be sliced precisely
  - publishes `latest.md` and `latest.json` to the `telemetry-reports` branch
  - also uploads a workflow artifact for backup
- Warmup Action: `.github/workflows/warm-prod.yml`
  - scheduled every 15 minutes
  - also runs after successful `main` CI completion and on manual dispatch
  - hits `GET /api/warmup` to keep the analyzer runtime hot
- Codex review flow:
  - trigger the workflow
  - for a new deploy, prefer `since=<deploy timestamp>` and optionally `last=<N>`
  - then ask: `fetch telemetry-reports and read latest.md`
- GitHub configuration for the workflow:
  - secret: `PROD_DATABASE_URL` (recommended) or `DATABASE_URL`
  - optional repo variable: `TELEMETRY_REPORT_DAYS`
  - optional repo variable: `TELEMETRY_REPORT_BRANCH`
- Warmup configuration:
  - optional app env: `ANALYZE_WARMUP_TOKEN`
  - optional repo secret: `PROD_WARMUP_TOKEN`
  - if a token is configured in the app, the workflow should send the same value as a bearer token

## Branch Flow

- `staging`: preview/test deployments.
- `main`: production deployments.

Recommended flow:

1. Push to `staging` and validate preview.
1. Promote to `main` for production.

## API Routes

- `POST /api/analyze`
- `POST /api/import-url`
- `POST /api/improvement-suggestions`
- `POST /api/share-report`
- `POST /api/simulate`
- `GET /api/warmup`
- `GET /api/card-printings`

## Current Scope

- Analyzer-first product focus.
- Rules engine foundation exists but full judge-level gameplay correctness is still in progress.
- Rules Sandbox route exists but is intentionally hidden from the main landing UI.

## MVP Status (March 2026)

- Core workflow is live: import/paste decklist -> analyze -> review report sections.
- Key analysis outputs are present: legality checks, role coverage, archetypes, combos, Rule 0 snapshot, deck price, and simulations.
- UX is significantly improved, including commander hero/header, full-page commander art treatment, stronger desktop/mobile layout parity, tabbed add/cut suggestions, and explicit banned-card surfacing.
- Regression safety is materially improved (CI + smoke + accessibility + coverage gates).
- Primary remaining gap before broader live rollout: cold-miss lookup latency, especially for `oracle-default` analyses on larger real-world lists.

## Live Product Standards

Minimum standards to treat the app as production-ready for regular player usage:

1. Stability
   - No uncaught runtime errors in normal flows (analyze, commander select, tab switching, share/export).
   - No hydration mismatch warnings caused by app code.
2. Correctness
   - Legality checks remain deterministic and explain failures clearly.
   - Price/preview/combo/archetype outputs degrade gracefully when card data is missing.
3. Performance
   - Initial analyze should feel responsive for typical 100-card lists, with a practical target of about `<=1s` for the first meaningful report and non-blocking enrichment after.
   - Client interactions (tab switch, hover previews, commander changes) should not block the UI.
4. Test coverage
   - API contract and rules-engine tests green in CI.
   - Accessibility smoke tests and coverage threshold checks green in CI.
   - Regression tests for critical user actions (analyze button, commander dropdown refresh, mobile rendering).
5. Operability
   - Data refresh scripts (`scryfall:update`, `spellbook:update`, `rules:update`) documented and reproducible.
   - Deploy flow remains `staging` -> validate -> `main`.
   - Preview/prod smoke checks confirm API baseline behavior and required security headers.

## Ethics Checklist

Current product standards for ethical operation:

1. Data minimization
   - Keep saved decks local by default.
   - Do not store raw decklists in telemetry datasets.
2. Transparency
   - Clearly disclose what is local-only, what is processed server-side, and what is persisted for share links or telemetry.
3. User control
   - Shared reports should be intentionally created, not automatic.
   - Retention and deletion behavior should be documented.
4. Honest outputs
   - Legality is deterministic where possible.
   - Archetype, combo, speed, and Rule 0 outputs are heuristics and should be framed that way.
5. Accessibility and inclusion
   - Desktop/mobile parity, keyboard support, readable contrast, and non-hover-only critical information remain required.
6. Operational responsibility
   - Production performance telemetry exists to improve reliability, not to profile users.

## Development Roadmap

### Phase 1: Reliability + Speed (Highest Priority)

1. Completed: `/api/analyze` now publishes stage-level metrics headers (`parse`, `lookup`, `compute`, `serialize`, `total`) plus cache and response-size metrics.
2. Completed: Scryfall lookup path now batch-resolves by card name before per-card fallback (in both `oracle-default` and `decklist-set` modes), reducing repeated named lookups.
3. Completed: cache-hit/miss and response-size instrumentation is regression-tested.
4. Completed: UI interaction smoke coverage now includes analyze flow, commander re-selection, report tabs, and printing modal UX (desktop/mobile viewport test included).
5. Completed: miss-path card resolution now uses a two-pass strategy (`precise identifiers` -> unresolved `name batch`) plus a persistent resolved-card cache to reduce repeated live Scryfall work.
6. Completed: `oracle-default` resolution now uses a local default-print Scryfall snapshot first, with live Scryfall only as fallback for missing or set-specific print lookups.
7. Completed: `decklist-set` print-aware resolution now uses a lean print-only SQLite store first, with the bucketed local print index retained as fallback.
8. Completed: improvement suggestions were moved off the initial analyze path into `POST /api/improvement-suggestions`, removing the largest compute-phase hotspot from first-report latency.
9. Completed: mobile layout hardening added overflow guards, stacked export actions, and more reliable tab scrolling for narrow screens.
10. Ongoing: continue lowering `lookup` stage time, with focus now narrowed to the remaining `oracle-default` cold-miss path.
11. Started: explicit cold-start telemetry and scheduled runtime warmup now exist so cold-instance latency can be separated from normal miss-path latency in prod.

### Phase 1 Benchmark Snapshot (March 8, 2026)

Deck used: `tests/fixtures/kentaro-benchmark.decklist.txt` (74 non-empty lines, includes set codes).

- Prior baseline:
  - `decklist-set` miss: ~3593ms total (`lookup 2833.9ms`, `compute 747ms`)
  - `oracle-default` miss: ~3060.6ms total (`lookup 2518.3ms`, `compute 533.1ms`)
- Current cold miss with persistent card cache disabled:
  - `decklist-set` miss: ~1895.4ms total (`parse 2.1ms`, `lookup 1360.2ms`, `compute 524.2ms`, `serialize 0.3ms`)
  - `oracle-default` miss: ~2379.5ms total (`parse 1.9ms`, `lookup 1805.8ms`, `compute 564.4ms`, `serialize 0.3ms`)
- Current warmed miss with persistent card cache available:
  - `decklist-set` miss: ~1384.1ms total (`parse 2.1ms`, `lookup 869.5ms`, `compute 505.3ms`, `serialize 0.2ms`)
  - `oracle-default` miss: ~1291.6ms total (`parse 2.0ms`, `lookup 782.0ms`, `compute 501.3ms`, `serialize 0.2ms`)
- Current cold miss after local default-print enrichment:
  - `oracle-default` miss: ~1922.3ms total (`parse 1.8ms`, `lookup 1390.0ms`, `compute 523.6ms`, `serialize 0.4ms`)
  - `decklist-set` miss: ~2266.4ms total (`parse 1.8ms`, `lookup 1707.3ms`, `compute 550.5ms`, `serialize 0.3ms`)
- Current cold miss after trimmed local data payloads + bucketed print index:
  - `oracle-default` miss: ~1748.3ms total (`parse 3.9ms`, `lookup 1236.5ms`, `compute 501.3ms`, `serialize 0.3ms`)
  - `decklist-set` miss: ~2212.3ms total (`parse 1.9ms`, `lookup 1690.8ms`, `compute 511.3ms`, `serialize 0.3ms`)
- Current cold miss after lean print-only SQLite:
  - `oracle-default` miss: ~1754.1ms total (`parse 1.8ms`, `lookup 1221.1ms`, `compute 524.5ms`, `serialize 0.3ms`)
  - `decklist-set` miss: ~2007.0ms total (`parse 1.8ms`, `lookup 1471.4ms`, `compute 526.6ms`, `serialize 0.2ms`)
- Current cold miss after deferred improvement suggestions:
  - `oracle-default` miss: ~1518.2ms total (`parse 1.8ms`, `lookup 1458.8ms`, `compute 50.4ms`, `serialize 0.2ms`)
  - `decklist-set` miss: ~1657.0ms total (`parse 1.8ms`, `lookup 1586.1ms`, `compute 62.5ms`, `serialize 0.3ms`)
- Current cold miss after normalized print SQLite + cache SQLite tuning:
  - `oracle-default` miss: ~1393.1ms total (`parse 1.7ms`, `lookup 1327.6ms`, `compute 56.8ms`, `serialize 0.4ms`)
  - `decklist-set` miss: ~1123.0ms total (`parse 2.3ms`, `lookup 1051.6ms`, `compute 58.7ms`, `serialize 0.3ms`)
- Cache hits for repeated identical requests remain ~1-2ms total.

Reproduce:

```bash
npm run bench:analyze -- --file tests/fixtures/kentaro-benchmark.decklist.txt --mode decklist-set --repeat-hits 2
npm run bench:analyze -- --file tests/fixtures/kentaro-benchmark.decklist.txt --mode oracle-default --repeat-hits 1
```

### Phase 2: Analyzer Quality

1. Started: archetype detection now uses weighted signals, per-archetype thresholds, and broader taxonomy coverage (`Cascade`, `Topdeck Matters`, `Clues/Food/Blood`, `Spells From Exile`, `Legends Matter`) plus a type-line tribal heuristic so kindred decks can still classify even when oracle text lacks explicit "choose a creature type" support cards.
2. Started: combo data refreshed from Commander Spellbook (`27,124` variants downloaded on March 9, 2026 -> `26,393` normalized Commander-legal combos) with regression coverage for staple exact lines such as `Oracle Consultation`, `Heliod + Ballista`, `Dramatic Scepter`, `Underworld Breach`, `Food Chain + Squee`, `Kiki + Conscripts`, and `Niv-Mizzet + Curiosity`; detected/potential combo ranking now prioritizes short, readable staple lines ahead of noisier Spellbook variants.
3. Started: cut/add recommendation ranking now considers curve pressure, archetype lock-ins, and lower-flexibility trims; the deferred suggestions API also returns a short rationale per role so users can see why those adds/cuts were prioritized.
4. Completed: improvement suggestions are now grouped into `Adds` and `Cuts` tabs so recommendation review is faster on both desktop and mobile.
5. Tighten commander auto-detection and no-commander fallback behavior, since prod telemetry showed slower request shapes there earlier.

### Phase 3: Commander Rules Completeness

1. Continue official-rules sync hardening and dataset verification.
2. Completed: legality UI now exposes a dedicated `Banlist` card and explicit banned-card list from rules-engine findings.
3. Increase deterministic coverage for commander pair rules, companion edge cases, and banlist updates.
4. Add targeted fixture suites for known tricky rules interactions that affect legality output.

### Phase 4: Productization

1. Started: `/api/analyze` timing telemetry is now persisted for production profiling without storing raw decklists.
2. Add persistent dashboards/queries on top of telemetry and error tracking for real-world usage patterns.
3. Define release gates (tests, lint, build, smoke checks) before production deploy.
4. Improve user-facing guidance text for Rule 0 interpretation and recommendation confidence.
5. Add a release checklist with explicit go/no-go thresholds (latency, error rate, test pass, accessibility pass).
6. Keep the privacy/ethics disclosure aligned with telemetry automation and any future debug-capture tooling.
