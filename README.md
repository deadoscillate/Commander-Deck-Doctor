# Commander Deck Doctor

Commander deck analysis app built with Next.js and TypeScript.

It analyzes pasted or imported Commander lists, loads synced stock precons, compares upgrades against stock lists, and produces a player-facing report with legality, mana curve, role coverage, archetypes, combos, Rule 0 signals, pricing, and on-demand simulations.

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

- Paste free-form Commander decklists, including `Commander:` and `Companion:` sections.
- Import public Archidekt decks as print-aware decklists.
- Load stock Commander precons from a synced local library with full-list browse and search.
- Compare an upgraded deck against matching stock precons for the same commander.
- Analyze:
  - mana curve and summary stats
  - role composition
  - legality checks
  - archetypes and combo detection
  - Rule 0 / table-talk signals
  - deck pricing, pricing confidence, and print selection
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
The precon browser now loads the full synced library, keeps search visible while scrolling, and uses the same dark/glass styling as the rest of the app.

## Product Notes

- `oracle-default` is the fast name-based pricing path.
- `[SET]` tags enable set-aware pricing and print selection.
- Explicit print tags are now honored first even in `oracle-default`, so tagged lists price against the intended print before falling back to default-name pricing.
- Pre-analyze commander selection now uses commander-eligible candidates only, resolves them from local card data first, and only shows a second selector when the chosen commander has legal pair options.
- Companion declarations are parsed separately from the 100-card deck and validated deterministically in Commander rules checks.
- Singleton validation now respects card-text exceptions such as unlimited-copy cards and capped exceptions like Seven Dwarves.
- URL import is Archidekt-only for now. Successful imports switch the analyzer to `decklist-set` automatically so pricing and print selection stay aligned with the imported list.
- Archidekt companion imports are preserved as companion sections instead of being folded into the main deck.
- Simulations do not block initial analyze.
- Improvement suggestions load after the initial report from `POST /api/improvement-suggestions`.
- Card previews, seller links, pricing confidence, and print pickers are available in the report UI.
- Matching stock precons load in the report for side-by-side comparison without replacing the current analysis.

## Ethics and Trust

- Analysis outputs are heuristics, not official rulings or tournament policy.
- Deck pricing is informational and now surfaces confidence based on exact-print, set, name, and fallback matches.
- Seller links are supplementary and do not affect legality, suggestions, archetypes, or rankings.
- Raw decklists are not stored in telemetry.
- Shared reports are explicit user actions and persist server-side only when a user chooses to create a share link.
- If affiliate links are enabled later, they must be disclosed in-product where those links appear and must remain separate from analysis logic.

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

`/api/commander-options` also records its own telemetry so the pre-analyze commander-selection path can be optimized separately from `/api/analyze`.

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
- Precon browsing is built in, scrollable, and print-aware.
- Stock-precon comparison is built in for commander-matched decks.
- Commander pairing flows now support legal pre-analyze pair selection instead of exposing the whole deck as possible pair choices.
- Companion legality now covers deterministic validation for the ten official companions, including color identity, deck-building restriction checks, and banlist handling.
- Category-based Commander deck-construction bans now surface explicitly for ante cards and Conspiracy cards.
- Failing legality checks now include remediation guidance in the report UI.
- Legality, archetypes, combos, Rule 0, pricing, and simulations are all present.
- Pricing now distinguishes exact-print, set-match, name-match, and fallback resolution so users can judge how trustworthy a deck total is.
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
- Completed: pre-analyze commander selection now uses commander-eligible candidates instead of scanning the whole list after analyze
- Completed: separate telemetry and local-only lookup path for `/api/commander-options`
- Completed: Archidekt import now emits print-aware decklists and switches imported decks into `decklist-set`
- Completed: pricing now preserves print-level match quality and exact seller links through the local Scryfall pipeline
- Ongoing: reduce the remaining `oracle-default` cold-miss lookup cost in `/api/analyze`

### Phase 2: Analyzer Quality

- Completed: broader weighted archetype detection
- Completed: refreshed Commander Spellbook combo dataset with better combo ranking
- Completed: smarter add/cut recommendation ranking with short rationales
- Completed: tabbed `Adds` / `Cuts` suggestion UI
- Completed: synced Commander precon library with print-aware auto-analysis and full-library browse/search
- Completed: stock-precon comparison for commander-matched decks
- Completed: commander-options telemetry and local-only lookup path for the pre-analyze commander picker
- Completed: stronger commander-aware suggestion ranking with real commander fixtures

### Phase 3: Commander Rules Completeness

- Completed: stricter commander validation for commander presence in the decklist and commander eligibility
- Completed: legal paired commander flows for Partner, Partner With, Friends forever, Doctor's companion, and Choose a Background in the pre-analyze picker and rules engine
- Completed: deterministic companion validation for the ten official companions, including deck-construction checks, color identity checks, and banlist coverage
- Completed: broader pair-specific messaging for invalid commander pair configurations
- Completed: deterministic regression coverage for pair rules, companions, parser behavior, import behavior, and plaintext export
- Completed: singleton exception handling for cards whose Oracle text overrides normal Commander copy limits
- Completed: category-based legality coverage for Conspiracy and ante cards plus remediation guidance in legality output
- Keep rules datasets synced and verified

### Phase 4: Productization

- Expand telemetry dashboards and release gates
- Keep privacy and ethics disclosures aligned with telemetry and sharing behavior
- Maintain automated dataset refresh workflows
- Next: add centralized affiliate-link decoration for seller URLs without changing analyzer logic
- Next: add visible in-product affiliate disclosure once seller-link monetization is enabled
- Next: add richer stock-vs-current comparison views and release-quality telemetry dashboards
