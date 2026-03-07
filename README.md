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
npm run test
npm run lint
npm run build
```

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
- Primary remaining gap to harden before broader live rollout: speed + regression safety under frequent feature changes.

## Live Product Standards

Minimum standards to treat the app as production-ready for regular player usage:

1. Stability
   - No uncaught runtime errors in normal flows (analyze, commander select, tab switching, share/export).
   - No hydration mismatch warnings caused by app code.
2. Correctness
   - Legality checks remain deterministic and explain failures clearly.
   - Price/preview/combo/archetype outputs degrade gracefully when card data is missing.
3. Performance
   - Analyze requests should feel responsive for typical 100-card lists.
   - Client interactions (tab switch, hover previews, commander changes) should not block the UI.
4. Test coverage
   - API contract and rules-engine tests green in CI.
   - Regression tests for critical user actions (analyze button, commander dropdown refresh, mobile rendering).
5. Operability
   - Data refresh scripts (`scryfall:update`, `spellbook:update`, `rules:update`) documented and reproducible.
   - Deploy flow remains `staging` -> validate -> `main`.

## Development Roadmap

### Phase 1: Reliability + Speed (Highest Priority)

1. Add integration tests for core flows (analyze, commander reselection, report tab rendering, share/export).
2. Add browser-level smoke coverage for mobile and desktop breakpoints.
3. Profile analyzer latency and remove repeat work in the `/api/analyze` path.
4. Expand caching strategy for expensive card lookups and preview fetches.

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
