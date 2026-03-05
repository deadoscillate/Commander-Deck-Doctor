## Commander Deck Doctor (MVP + Commander Brackets)

Next.js + TypeScript app that:

- parses Commander decklists
- fetches card data from Scryfall (`exact` then `fuzzy`)
- reports deck summary, mana curve, card type counts, and role counts
- provides Deck Health diagnostics + recommended count comparisons
- runs legality/sanity checks (deck size, singleton, unknown names)
- detects commander (section-first, manual fallback) and validates color identity
- estimates Commander Bracket using Game Changers + heuristics
- supports plaintext copy + JSON export of analysis reports
- saves shareable reports and serves them at `/report/{hash}`
- provides color-aware card suggestions for LOW roles (excluding cards already in deck)
- imports decklists directly from Moxfield and Archidekt URLs

### Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Project structure

- `app/page.tsx`: single-page UI with deck input/options and report rendering
- `app/api/analyze/route.ts`: orchestration endpoint for parse -> fetch -> analyze -> bracket report
- `app/api/import-url/route.ts`: URL import endpoint for supported deck providers
- `app/api/share-report/route.ts`: saves analysis snapshots and returns share links
- `app/report/[hash]/page.tsx`: shared report page renderer
- `components/DeckHealth.tsx`: warning/okay diagnostics panel
- `components/RecommendedCounts.tsx`: role-vs-threshold comparison table
- `components/Checks.tsx`: deck size/singleton/unknown sanity checks
- `components/ExportButtons.tsx`: clipboard and JSON export actions
- `components/AnalysisReport.tsx`: reusable report renderer used by main and shared pages
- `components/ImprovementSuggestions.tsx`: LOW-role card suggestions panel
- `lib/decklist.ts`: deck text parser and duplicate merge logic
- `lib/scryfall.ts`: Scryfall named lookup client with exact/fuzzy fallback, cache, and concurrency control
- `lib/analysis.ts`: summary metrics, mana curve, type counts, role heuristics
- `lib/gameChangers.ts`: pinned Game Changers list and source version
- `lib/brackets.ts`: Game Changers detection, red-flag detection, bracket estimate + explanations
- `lib/thresholds.ts`: centralized recommended ranges/limits
- `lib/status.ts`: LOW/OK/HIGH status helper
- `lib/deckHealth.ts`: deck-health diagnosis builder
- `lib/checks.ts`: legality/sanity check helper
- `lib/suggestions.ts`: color-aware suggestion pools and filtering logic
- `lib/reportText.ts`: plaintext report formatter for sharing
- `lib/deckUrlImport.ts`: provider URL parsing + decklist extraction
- `lib/reportStore.ts`: local SQLite-backed storage and hash helpers for shared reports
- `lib/contracts.ts`: request/response contracts shared between API and UI
- `lib/types.ts`: domain model types for analysis internals

### Request flow

1. Parse input decklist into normalized rows.
2. Resolve card data from Scryfall (`exact`, then `fuzzy`).
3. Compute summary and role counts from known cards.
4. Compute Game Changers/extra-turns/mass-land-denial signals.
5. Build bracket estimate, explanation, notes, and warnings.
6. Return JSON consumed directly by the UI.

### Notes

- Game Changers list is hardcoded from the 2026-02-09 update image.
- Bracket estimation is intentionally heuristic and conversation-oriented.
- Tutor counts are reported as a role only, not used for bracket estimation.
