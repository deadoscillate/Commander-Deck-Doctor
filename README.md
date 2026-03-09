# Commander Deck Doctor

Commander deck analysis app built with Next.js and TypeScript.

It analyzes pasted or imported Commander lists, loads synced stock precons, and produces a player-facing report with legality, mana curve, role coverage, archetypes, combos, Rule 0 signals, pricing, and on-demand simulations.

## Quick Start

```bash
npm install
npm run scryfall:update
npm run spellbook:update
npm run rules:update
npm run precons:update
npm run dev
```

Open `http://localhost:3000`.

## Common Commands

```bash
npm run lint
npm run test
npm run test:a11y
npm run test:coverage
npm run build
npm run bench:analyze -- --file tests/fixtures/kentaro-benchmark.decklist.txt --mode decklist-set --repeat-hits 2
npm run telemetry:summary -- --days 7
```

## Core Features

- Paste free-form Commander decklists, including `Commander:` sections.
- Import public decks from Moxfield and Archidekt.
- Load stock Commander precons from a synced local library.
- Analyze:
  - mana curve and summary stats
  - role composition
  - legality checks
  - archetypes and combo detection
  - Rule 0 / table-talk signals
  - deck pricing and print selection
- Run simulations on demand from the `Simulations` tab.
- Review improvement suggestions in `Adds` and `Cuts` tabs.
- Inspect banned cards directly in the legality panel.

## Data Sources

### Scryfall

Offline-first card data lives under `data/scryfall/`:

- compiled Oracle card data
- default-card snapshot
- print-aware SQLite store
- print-index fallback data

Refresh with:

```bash
npm run scryfall:update
```

`oracle-default` prefers local default-card data first. `decklist-set` prefers the local print SQLite store first. Live Scryfall is fallback, not the primary path.

### Commander Spellbook

Combo data is stored in `lib/combos.json`.

Refresh with:

```bash
npm run spellbook:update
```

### Official Rules

Rules datasets live in `lib/rules/datasets/` and include synced official rules metadata plus the Commander banlist.

Refresh with:

```bash
npm run rules:update
```

### Commander Precons

Stock precons are synced from MTGJSON into `data/precons/commander-precons.json`.

Refresh with:

```bash
npm run precons:update
```

The current sync includes Commander Deck and MTGO Commander Deck products, with duplicate collector-edition variants filtered out.
Synced precon decklists now include set and collector metadata, so loading a stock precon automatically runs set-aware analysis and pricing.

## Product Notes

- `oracle-default` is the fast name-based pricing path.
- `[SET]` tags enable set-aware pricing and print selection.
- Simulations do not block initial analyze.
- Improvement suggestions load after the initial report from `POST /api/improvement-suggestions`.
- Card previews, seller links, and print pickers are available in the report UI.

## Deployment And Operations

- Hosting: Vercel
- Persistence: Neon Postgres for shared reports and analyzer telemetry
- Runtime: `/api/analyze` uses Node and local compiled card data
- Warmup: `/api/warmup` pre-initializes the analyze runtime
- Security: framework-level security headers and scoped rate limiting on public APIs

### Telemetry

Analyzer telemetry exists to optimize real production performance without storing raw decklists.

Captured fields include:

- cache hit/miss
- cold-start flag
- parse / lookup / compute / serialize / total timings
- response size
- deck size
- known / unknown card counts
- pricing mode
- commander-selection metadata

Useful commands:

```bash
npm run telemetry:summary -- --days 7
npm run telemetry:summary -- --since 2026-03-08T21:42:39Z --last 10
```

GitHub workflows:

- `.github/workflows/telemetry-summary.yml`
- `.github/workflows/warm-prod.yml`
- `.github/workflows/precon-library-sync.yml`

Important GitHub configuration:

- secret: `PROD_DATABASE_URL` or `DATABASE_URL`
- optional variable: `TELEMETRY_REPORT_DAYS`
- optional variable: `TELEMETRY_REPORT_BRANCH`
- optional warmup secret: `PROD_WARMUP_TOKEN`

## Branch Flow

- `staging`: preview
- `main`: production

Recommended deploy flow:

1. Push to `staging`.
2. Validate preview.
3. Promote to `main`.

## API Routes

- `POST /api/analyze`
- `POST /api/card-printings`
- `POST /api/commander-options`
- `POST /api/import-url`
- `POST /api/improvement-suggestions`
- `POST /api/share-report`
- `POST /api/simulate`
- `GET /api/precons`
- `GET /api/warmup`

## Status

Current MVP state:

- Core analyze flow is live.
- Precon browsing is built in.
- Legality, archetypes, combos, Rule 0, pricing, and simulations are all present.
- Regression safety is materially better than earlier iterations: CI, smoke coverage, accessibility checks, and telemetry are in place.

Primary remaining gap:

- cold-miss latency, especially `oracle-default` on larger real-world lists

Practical target:

- first meaningful report should feel like `<= 1s`
- enrichment can load after the initial report

## Operating Standards

- No uncaught runtime errors in normal flows.
- Legality remains deterministic and explainable.
- Missing card data should degrade gracefully.
- Desktop and mobile parity matter.
- Saved decks stay local by default.
- Raw decklists are not stored in telemetry.
- Shared reports are explicit user actions, not automatic.

## Roadmap

### Phase 1: Reliability + Speed

- Completed: stage-level analyze telemetry, cache metrics, and regression coverage
- Completed: offline-first Scryfall lookup path for both `oracle-default` and `decklist-set`
- Completed: persistent resolved-card caching
- Completed: deferred improvement suggestions and on-demand simulations
- Completed: cold-start telemetry plus scheduled warmup
- Ongoing: reduce the remaining `oracle-default` cold-miss lookup cost

### Phase 2: Analyzer Quality

- Started: broader weighted archetype detection
- Started: refreshed Commander Spellbook combo dataset with better combo ranking
- Started: smarter add/cut recommendation ranking with short rationales
- Completed: tabbed `Adds` / `Cuts` suggestion UI
- Completed: synced Commander precon library

### Phase 3: Commander Rules Completeness

- Continue tightening commander legality edge cases
- Expand deterministic test coverage for pair rules, companions, and banlist handling
- Keep rules datasets synced and verified

### Phase 4: Productization

- Expand telemetry dashboards and release gates
- Keep privacy and ethics disclosures aligned with telemetry and sharing behavior
- Maintain automated dataset refresh workflows
