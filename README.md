# Commander Deck Doctor

Commander deck analysis app built with Next.js + TypeScript.

## What It Does

- Parses free-form Commander decklists (Commander section supported).
- Imports public decks from Moxfield and Archidekt.
- Resolves card metadata from Scryfall.
- Runs analyzer output for:
  - deck summary and mana curve
  - role composition (ramp/draw/removal/wipes/tutors/protection/finishers)
  - commander/deck checks (size, singleton, color identity, unknown cards)
  - bracket heuristics, archetype signals, combo signals, Rule 0 snapshot (including true tutor cards in table-talk flags)
  - deterministic simulation summaries
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

Update pipeline:

```bash
npm run scryfall:update
```

This runs download + compile. Build also verifies compiled data exists.

Notes:

- Raw Oracle downloads are ignored by git.
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
- Rule 0 speed/consistency heuristics consume simulation outputs (opening-hand and goldfish signals) plus deck composition features.

## Suggestions And Combo Views

- Deck Improvement Suggestions include `Suggested Adds` for `LOW` role statuses.
- Deck Improvement Suggestions include `Suggested Cuts` for `HIGH` role statuses (based on role-tagged cards in your list).
- Combo Detection includes internal tabs: `Live Combos`, `Conditional`, and `Potential`.
- Combo lists and suggestions use card preview tiles for faster review.

## Deployment Notes

- Vercel hosts the app.
- Shared report persistence uses Neon Postgres (`POSTGRES_URL` or `DATABASE_URL`).
- `/api/analyze` runs on Node runtime and loads local compiled Scryfall data.
- Security headers are configured at the framework level (XFO, XCTO, Referrer-Policy, Permissions-Policy, CSP, HSTS).
- All public API routes use scoped rate limiting.

## Branch Flow

- `staging`: preview/test deployments.
- `main`: production deployments.

Recommended flow:

1. Push to `staging` and validate preview.
1. Promote to `main` for production.

## API Routes

- `POST /api/analyze`
- `POST /api/import-url`
- `POST /api/share-report`
- `POST /api/simulate`
- `GET /api/card-printings`

## Current Scope

- Analyzer-first product focus.
- Rules engine foundation exists but full judge-level gameplay correctness is still in progress.
- Rules Sandbox route exists but is intentionally hidden from the main landing UI.

## MVP Status (March 2026)

- Core workflow is live: import/paste decklist -> analyze -> review report sections.
- Key analysis outputs are present: legality checks, role coverage, archetypes, combos, Rule 0 snapshot, deck price, and simulations.
- UX is significantly improved, including commander hero/header and desktop/mobile layout parity.
- Regression safety is materially improved (CI + smoke + accessibility + coverage gates).
- Primary remaining gap before broader live rollout: end-to-end analysis speed for larger, print-aware decklists.

## Live Product Standards

Minimum standards to treat the app as production-ready for regular player usage:

1. Stability
   - No uncaught runtime errors in normal flows (analyze, commander select, tab switching, share/export).
   - No hydration mismatch warnings caused by app code.
2. Correctness
   - Legality checks remain deterministic and explain failures clearly.
   - Price/preview/combo/archetype outputs degrade gracefully when card data is missing.
3. Performance
   - Analyze requests should feel responsive for typical 100-card lists (including set-aware pricing mode).
   - Client interactions (tab switch, hover previews, commander changes) should not block the UI.
4. Test coverage
   - API contract and rules-engine tests green in CI.
   - Accessibility smoke tests and coverage threshold checks green in CI.
   - Regression tests for critical user actions (analyze button, commander dropdown refresh, mobile rendering).
5. Operability
   - Data refresh scripts (`scryfall:update`, `spellbook:update`, `rules:update`) documented and reproducible.
   - Deploy flow remains `staging` -> validate -> `main`.
   - Preview/prod smoke checks confirm API baseline behavior and required security headers.

## Development Roadmap

### Phase 1: Reliability + Speed (Highest Priority)

1. Completed: `/api/analyze` now publishes stage-level metrics headers (`parse`, `lookup`, `compute`, `serialize`, `total`) plus cache and response-size metrics.
2. Completed: Scryfall lookup path now batch-resolves by card name before per-card fallback (in both `oracle-default` and `decklist-set` modes), reducing repeated named lookups.
3. Completed: cache-hit/miss and response-size instrumentation is regression-tested.
4. Completed: UI interaction smoke coverage now includes analyze flow, commander re-selection, report tabs, and printing modal UX (desktop/mobile viewport test included).
5. Ongoing: continue lowering `lookup` stage time for slow external conditions using additional fallback/caching strategies.

### Phase 1 Benchmark Snapshot (March 7, 2026)

Deck used: `tests/fixtures/kentaro-benchmark.decklist.txt` (74 non-empty lines, includes set codes).

- `decklist-set` miss: ~3593ms total (`parse 2.9ms`, `lookup 2833.9ms`, `compute 747ms`, `serialize 0.4ms`)
- `oracle-default` miss: ~3060.6ms total (`parse 1.9ms`, `lookup 2518.3ms`, `compute 533.1ms`, `serialize 0.3ms`)
- cache hits for repeated identical requests: ~1.4-2.0ms total

Reproduce:

```bash
npm run bench:analyze -- --file tests/fixtures/kentaro-benchmark.decklist.txt --mode decklist-set --repeat-hits 2
npm run bench:analyze -- --file tests/fixtures/kentaro-benchmark.decklist.txt --mode oracle-default --repeat-hits 1
```

### Phase 2: Analyzer Quality

1. Expand archetype detection taxonomy and weighting to reduce false positives.
2. Grow combo database breadth, including more common infinite lines and commander-specific packages.
3. Improve cut/add recommendation ranking (curve pressure, redundancy, protection density, strategy lock-ins).

### Phase 3: Commander Rules Completeness

1. Continue official-rules sync hardening and dataset verification.
2. Increase deterministic coverage for commander pair rules, companion edge cases, and banlist updates.
3. Add targeted fixture suites for known tricky rules interactions that affect legality output.

### Phase 4: Productization

1. Add persistent telemetry/error tracking dashboards for real-world usage patterns.
2. Define release gates (tests, lint, build, smoke checks) before production deploy.
3. Improve user-facing guidance text for Rule 0 interpretation and recommendation confidence.
4. Add a release checklist with explicit go/no-go thresholds (latency, error rate, test pass, accessibility pass).
