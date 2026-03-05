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
  - bracket heuristics, archetype signals, combo signals, Rule 0 snapshot
  - deterministic simulation summaries
- Supports set-aware pricing and printing-aware preview art selection.

## Quick Start

```bash
npm install
npm run scryfall:update
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

## Pricing And Printing Selection

- `Oracle default lookup`: name-based pricing.
- `Use [SET] tags in decklist`: set-aware pricing.
- Decklist tag example: `1 Sol Ring [CMM]`.
- In decklist preview mode, each card can load printings and select a specific printing.
  - Preview art uses the selected Scryfall printing.
  - Analyzer receives printing/set overrides for set-aware pricing lookup.
  - Includes special printings (for example Secret Lair and Judge promo printings) when available from Scryfall.

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
- `GET /api/card-printings`

## Current Scope

- Analyzer-first product focus.
- Rules engine foundation exists but full judge-level gameplay correctness is still in progress.
- Rules Sandbox route exists but is intentionally hidden from the main landing UI.

## Near-Term Roadmap

1. Continue analyzer role/category accuracy hardening with more fixtures and overrides.
1. Expand deterministic engine behavior coverage for cards driving analysis signals.
1. Improve smoke checks and release reliability for preview -> prod flow.
1. Keep Scryfall compiled data and classifier artifacts refreshed.
