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

## Near-Term Roadmap

1. Continue role/category accuracy hardening with broader fixture coverage and edge-case card overrides.
1. Add richer cut-ranking heuristics (curve pressure, redundancy, and protected staples by archetype/strategy).
1. Expand deterministic engine behavior coverage for cards most used in analyzer signals and simulations.
1. Improve smoke checks and release reliability for preview -> prod flow.
1. Keep Scryfall compiled data and Spellbook combo snapshots refreshed.
