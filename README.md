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
npm run commander-profiles:generate
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
- Build decks from a commander-first workflow with live deck stats, legality, grouped deck sections, card previews, and suggestions.
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

### Commander Profiles

Commander-specific builder packages live under `data/commander-profiles/`.

- `curated.json`: reviewed commander profiles used by the builder first
- `generated.json`: full generated commander-profile list for the legal commander pool, used as builder fallback after curated profiles

Generate or refresh candidates with:

```bash
npm run commander-profiles:generate
```

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
- Exact print hints (printing ID or set + collector number) are honored first even in `oracle-default`; plain `[SET]` tags remain best-effort unless `decklist-set` is selected.
- Pre-analyze commander selection now uses commander-eligible candidates only, resolves them from local card data first, and only shows a second selector when the chosen commander has legal pair options.
- Companion declarations are parsed separately from the 100-card deck and validated deterministically in Commander rules checks.
- Singleton validation now respects card-text exceptions such as unlimited-copy cards and capped exceptions like Seven Dwarves.
- URL import is Archidekt-only for now. Successful imports switch the analyzer to `decklist-set` automatically so pricing and print selection stay aligned with the imported list.
- Archidekt companion imports are preserved as companion sections instead of being folded into the main deck.
- Simulations do not block initial analyze.
- Improvement suggestions load after the initial report from `POST /api/improvement-suggestions`.
- Card previews, seller links, pricing confidence, and print pickers are available in the report UI.
- Matching stock precons load in the report for side-by-side comparison without replacing the current analysis.
- Stock-precon comparison now surfaces richer upgrade deltas, including interaction, consistency, combos, game changers, and a short upgrade snapshot.
- The `/builder` workflow starts from a compact commander-picker toolbar, keeps a live 99-card decklist, mirrors the commander hero/background treatment from the analyzer, uses art-backed commander search result cards with full-card previews, groups the main deck by card roles, surfaces hover previews across deck sections and suggestions, and saves local builder states separately from analyzer deck saves.
- Builder card browse/search now resolves against the full local Commander-legal print library, so set filters and suggestion card resolution are no longer limited to the default-print name index.
- Builder suggestions are split into commander staples, color staples, role/archetype suggestions, combo suggestions, game changer suggestions, and mana-base suggestions, with land suggestions including basics, fixing staples, duals, and triomes when the color identity supports them.
- Builder game changer suggestions are now color-safe and only surface game changers that are legal for the selected commander's color identity.
- Builder status is condensed into a tighter live snapshot row, the commander hero stays pinned while scrolling, and the hero now shows live deck price as cards are added and removed.
- Builder deck rows only show quantity badges when duplicates are actually legal, such as basics and explicit multi-copy exceptions.
- Builder commander guidance now prefers curated commander profiles first, then the full generated commander-profile list, and only then falls back to generic oracle-text heuristics.
- Commander profile expansion now uses JSON-backed curated data plus generated candidate files, rather than keeping the dataset embedded in TypeScript.
- Seller links now flow through a centralized outbound-decoration layer so future affiliate parameters can be added without changing analyzer logic.

## Ethics and Trust

- Analysis outputs are heuristics, not official rulings or tournament policy.
- Deck pricing is informational and now surfaces confidence based on exact-print, set, name, and fallback matches.
- Seller links are supplementary and do not affect legality, suggestions, archetypes, or rankings; any future affiliate parameters are applied outside the analyzer pipeline.
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
`/api/card-search` now records builder commander-search telemetry, so commander picker search latency and cold-start behavior can be tracked separately from generic card browsing.

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
- `GET /api/card-search`
- `GET /api/commander-profile`
- `POST /api/commander-options`
- `POST /api/import-url`
- `POST /api/improvement-suggestions`
- `GET /api/outbound`
- `POST /api/share-report`
- `POST /api/simulate`
- `GET /api/precons`
- `GET /api/warmup`

## Status

Current MVP state:

- Core analyze flow is live.
- Commander-first deck builder is live behind `/builder`.
- Builder main-deck presentation is now grouped by lands and key card roles instead of one flat list.
- Builder smart suggestions now surface metadata-backed commander staples, color staples, role/archetype upgrades, combo pieces, game changer suggestions, and mana-base suggestions with previews.
- Builder commander search now uses art-backed result cards with full-card previews and dedicated telemetry.
- Builder colorless commanders now resolve color-staple and mana-base suggestions correctly.
- Builder top-row controls and status cards have been condensed to reduce wasted space.
- Builder card search by set and suggestion card resolution now use the full local Commander-legal print library instead of the reduced default-print index.
- Builder game changer suggestions now filter to color-legal options instead of showing the global game changer pool.
- Builder commander suggestions now include a curated commander-profile dataset plus a generated full commander list as fallback before generic commander-text inference.
- Curated commander profiles have been expanded to 390 reviewed entries on top of the generated full-pool dataset.
- Precon browsing is built in, scrollable, and print-aware.
- Stock-precon comparison is built in for commander-matched decks.
- Stock-precon comparison now shows richer practical deltas instead of only card adds/cuts and price.
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
- Completed: oracle-default local print fallback now uses batched local lookups before remote fallback churn
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
- Completed: first curated promotion batch from the generated full commander-profile list
- Completed: second broader curated promotion batch covering more staple commanders, precon faces, and archetype anchors
- Completed: third larger curated promotion batch to push the reviewed commander-profile set past 100 entries
- Completed: fourth larger curated promotion batch to push the reviewed commander-profile set past 125 entries
- Completed: fifth larger curated promotion batch to push the reviewed commander-profile set past 150 entries
- Completed: sixth larger curated promotion batch to push the reviewed commander-profile set past 165 entries
- Completed: seventh larger curated promotion batch to push the reviewed commander-profile set past 190 entries
- Completed: eighth larger curated promotion batch to push the reviewed commander-profile set past 200 entries
- Completed: ninth larger curated promotion batch to push the reviewed commander-profile set past 230 entries
- Completed: tenth larger curated promotion batch to push the reviewed commander-profile set past 250 entries
- Completed: eleventh larger curated promotion batch to push the reviewed commander-profile set past 270 entries
- Completed: twelfth larger curated promotion batch to push the reviewed commander-profile set past 290 entries
- Completed: thirteenth larger curated promotion batch to push the reviewed commander-profile set past 310 entries
- Completed: fourteenth larger curated promotion batch to push the reviewed commander-profile set past 330 entries
- Completed: fifteenth larger curated promotion batch to push the reviewed commander-profile set past 350 entries
- Completed: sixteenth larger curated promotion batch to push the reviewed commander-profile set past 370 entries
- Completed: seventeenth larger curated promotion batch to push the reviewed commander-profile set past 390 entries
- In progress: continue promoting high-value commanders from the generated full commander-profile list into curated profiles
- Completed: add commander-profile candidate generation from local Oracle heuristics

### Phase 4: Productization

- Completed: commander-first builder workflow with live local search, legality, and saved local builds
- Completed: builder UI parity with commander hero/background treatment, grouped deck sections, preview-backed suggestions, condensed status cards, and color-aware mana-base recommendations
- Completed: dedicated builder commander-search telemetry for search latency and cold-start tracking
- Completed: compact top-row commander picker, sticky builder hero, live deck-price hero pill, and builder quantity cleanup for singleton cards
- Completed: builder card browse/search and suggestion resolution now use the full local Commander-legal print library
- Completed: builder game changer suggestions now filter to color-legal options
- Completed: richer stock-vs-current comparison views
- Next: add release-quality telemetry dashboards

### Phase 3: Commander Rules Completeness

- Completed: stricter commander validation for commander presence in the decklist and commander eligibility
- Completed: legal paired commander flows for Partner, Partner With, Friends forever, Doctor's companion, and Choose a Background in the pre-analyze picker and rules engine
- Completed: deterministic companion validation for the ten official companions, including deck-construction checks, color identity checks, and banlist coverage
- Completed: broader pair-specific messaging for invalid commander pair configurations
- Completed: deterministic regression coverage for pair rules, companions, parser behavior, import behavior, and plaintext export
- Completed: singleton exception handling for cards whose Oracle text overrides normal Commander copy limits
- Completed: category-based legality coverage for Conspiracy and ante cards plus remediation guidance in legality output
- Keep rules datasets synced and verified

- Expand telemetry dashboards and release gates
- Keep privacy and ethics disclosures aligned with telemetry and sharing behavior
- Maintain automated dataset refresh workflows
- Completed: centralized affiliate-link decoration for seller URLs without changing analyzer logic
- Next: add visible in-product affiliate disclosure once seller-link monetization is enabled
