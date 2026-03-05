## Commander Deck Doctor (Current MVP)

Commander deck analysis app built with Next.js + TypeScript.

### Current MVP features

- Parse free-form Commander decklists (including Commander section detection).
- Resolve card data from Scryfall (`exact` then `fuzzy` fallback).
- Show summary metrics:
  - deck size, unique cards, average mana value
  - mana curve and card-type counts
  - role counts (ramp/draw/removal/wipes/tutors/protection/finishers)
- Run core deck checks:
  - deck size
  - singleton (basic-land exceptions)
  - unknown card names
  - commander color identity validation
- Commander UI:
  - commander hero header with art background (`art_crop` fallback logic)
  - commander name hover image preview
  - color identity shown as mana icons
  - manual commander selector in the right report panel (auto re-analyzes on change)
- Card hover previews:
  - image preview from Scryfall
  - Scryfall prices in preview (USD/Foil/Etched/TIX when available)
  - local cache for hover metadata
- Archetype detection (keyword heuristic).
- Combo detection from local combo database.
- Rule 0 snapshot (player-facing heuristic layer):
  - win style
  - speed band
  - consistency score
  - table-impact flags
- Commander Bracket heuristic report:
  - Game Changer detection
  - extra-turn and mass-land-denial flags
  - explanation + notes + warnings
- Deck improvement suggestions for low role buckets.
- Deck import from Moxfield and Archidekt URLs.
- Local saved deck history (`localStorage`).
- Report sharing/export:
  - copy plaintext report
  - download JSON
  - shared report URLs at `/report/{hash}` via local SQLite store

### Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Production build:

```bash
npm run build
npm run start
```

### Testing

```bash
npm run test
```

Watch mode:

```bash
npm run test:watch
```

Current regression coverage includes:
- decklist parsing edge cases (commander section + split cards/comments)
- `/api/analyze` guardrails (empty input 400 + controlled 500 on dependency failure)
- deck price total calculations in analysis responses

### Project structure (key files)

- `app/page.tsx`: main UI and analysis flow orchestration on client.
- `app/api/analyze/route.ts`: parse -> fetch -> analyze -> response assembly.
- `app/api/import-url/route.ts`: Moxfield/Archidekt import endpoint.
- `app/api/share-report/route.ts`: stores shared report snapshots.
- `app/report/[hash]/page.tsx`: shared report page.
- `components/AnalysisReport.tsx`: report renderer (player snapshot + technical details).
- `components/CommanderHeroHeader.tsx`: commander hero art header.
- `components/CardNameHover.tsx`: hover image + prices preview.
- `components/ManaIcon.tsx`, `components/ManaCost.tsx`, `components/ColorIdentityIcons.tsx`: mana/icon UI.
- `components/Checks.tsx`: legality/sanity checks panel.
- `components/DeckHealth.tsx`, `components/RecommendedCounts.tsx`: deck-health diagnostics.
- `components/ImprovementSuggestions.tsx`: low-role suggestions panel.
- `lib/decklist.ts`: deck parsing and commander section extraction.
- `lib/scryfall.ts`: Scryfall client + cache/concurrency handling.
- `lib/analysis.ts`: summary/curve/types/roles calculations.
- `lib/archetypes.ts`: archetype heuristics.
- `lib/combos.ts`, `lib/combos.json`: combo detection and data.
- `lib/playerHeuristics.ts`: Rule 0 summary logic.
- `lib/brackets.ts`, `lib/gameChangers.ts`: bracket heuristics and dataset.
- `lib/checks.ts`: deck checks and color-identity validation.
- `lib/reportText.ts`: plaintext export formatter.
- `lib/reportStore.ts`: SQLite persistence for share links.
- `lib/contracts.ts`, `lib/types.ts`: shared contracts/domain types.

### Known gaps (post-MVP backlog)

- Full Commander legality engine is not complete yet:
  - partner/friends forever/doctor/background pair-rule validation
  - companion-specific full deckbuilding rule map
  - versioned Commander banlist dataset enforcement panel
- Heuristics are intentionally approximate (Rule 0, archetype, bracket).
- Test coverage is focused on high-risk analysis paths; UI interaction coverage is still limited.

### Notes

- Bracket and Rule 0 outputs are conversation aids, not tournament legality rulings.
- If dev mode throws chunk/module errors on Windows (e.g. missing `.next` chunk), clear `.next` and restart `npm run dev`.
