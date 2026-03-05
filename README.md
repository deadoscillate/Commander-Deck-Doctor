# Commander Deck Doctor (Current MVP)

Commander deck analysis app built with Next.js + TypeScript.

## Current MVP features

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

## Run locally

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

## Testing

```bash
npm run test
```

Watch mode:

```bash
npm run test:watch
```

## Vercel Free-Tier Storage Setup

Shared report links (`/report/{hash}`) need persistent storage on Vercel.

1. In Vercel, open this project and add the Neon integration from Marketplace.
1. Select the free Neon plan and connect it to this project.
1. Confirm `POSTGRES_URL` (or `DATABASE_URL`) appears in project env vars.
1. Redeploy after linking storage.

Without those env vars, `/api/share-report` is disabled on Vercel by design.

## Security Baseline (Implemented)

- API boundaries validate JSON content type and enforce request body size limits.
- Public API routes (`/api/analyze`, `/api/import-url`, `/api/share-report`) have per-IP rate limits.
- API responses include `x-request-id` and no-store caching headers.
- Structured server logs include request IDs for API failures.
- Import URL flow enforces HTTPS-only provider URLs and provider fetch timeouts.
- Global response headers include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.

## Automation (Implemented)

- GitHub CI workflow runs on PRs and `main` pushes: lint, test, and build.
- Dependabot is configured for weekly npm and GitHub Actions updates.
- Vercel project is connected to GitHub repository `deadoscillate/Commander-Deck-Doctor` for push-based deployments.
- Post-deploy production smoke tests run in GitHub Actions after successful CI on `main` pushes.

## Observability and alerting (implemented)

- Sentry SDK is wired for Next.js server, edge, and client runtimes.
- App Router `error.tsx` and `global-error.tsx` capture render/runtime exceptions to Sentry.
- API 5xx responses are captured with route and `x-request-id` context for correlation in logs.
- `/api/import-url` distinguishes user input errors (400) from upstream provider failures (502).

Set up in production:

1. Create a Sentry project for this app.
1. Add `SENTRY_DSN` to Vercel environment variables (all environments).
1. Optionally add `NEXT_PUBLIC_SENTRY_DSN` if you want browser-side issue capture in addition to server-side capture.
1. In Sentry Alerts, create a production rule for high error rate or 5xx spikes and route notifications to email/Slack/PagerDuty.

## Production smoke checks (implemented)

- Workflow: `.github/workflows/smoke-prod.yml`
- Triggers:
  - automatic: after CI succeeds for a push to `main`
  - manual: `workflow_dispatch`
- Checks:
  - `GET /` returns `200`
  - security headers are present on `/`
  - `POST /api/analyze` guardrail response (empty payload -> `400`)
  - `POST /api/import-url` guardrail response (empty payload -> `400`)
  - `POST /api/share-report` guardrail response (empty decklist -> `400`)

Optional repo variable:

1. `PROD_BASE_URL` (for custom domain or alternate prod URL). Defaults to `https://commander-deck-doctor.vercel.app`.

## Shared report retention, backup, and restore (implemented)

- Retention policy: shared reports are retained for `180` days by default.
- Runtime pruning: expired reports are pruned periodically on API read/write paths.
- Override retention with `REPORT_RETENTION_DAYS` (clamped to `7`-`3650` days).

Backup and restore scripts:

```bash
# Export to backups/shared-reports-<timestamp>.json
npm run backup:reports

# Export to a custom file path
npm run backup:reports -- ./backups/my-snapshot.json

# Restore from backup file (upsert by hash)
npm run restore:reports -- ./backups/my-snapshot.json

# Full replace restore
npm run restore:reports -- ./backups/my-snapshot.json --truncate
```

Current regression coverage includes:

- decklist parsing edge cases (commander section + split cards/comments)
- `/api/analyze` guardrails (empty input 400 + controlled 500 on dependency failure)
- deck price total calculations in analysis responses

## Project structure (key files)

- `app/page.tsx`: main UI and analysis flow orchestration on client.
- `app/api/analyze/route.ts`: parse -> fetch -> analyze -> response assembly.
- `app/api/import-url/route.ts`: Moxfield/Archidekt import endpoint.
- `app/api/share-report/route.ts`: stores shared report snapshots.
- `app/report/[hash]/page.tsx`: shared report page.
- `app/error.tsx`, `app/global-error.tsx`: runtime error boundaries wired to Sentry.
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
- `lib/api/monitoring.ts`: API error capture and Sentry context tagging.
- `lib/reportText.ts`: plaintext export formatter.
- `lib/reportStore.ts`: SQLite persistence for share links.
- `lib/contracts.ts`, `lib/types.ts`: shared contracts/domain types.
- `instrumentation.ts`, `instrumentation-client.ts`: Next.js instrumentation bootstrap.
- `sentry.server.config.ts`, `sentry.edge.config.ts`: Sentry runtime init.
- `.github/workflows/ci.yml`, `.github/workflows/smoke-prod.yml`: quality and production smoke workflows.
- `scripts/export-shared-reports.mjs`, `scripts/import-shared-reports.mjs`: backup/restore runbook scripts.

## Known gaps (post-MVP backlog)

- Full Commander legality engine is not complete yet:
  - partner/friends forever/doctor/background pair-rule validation
  - companion-specific full deckbuilding rule map
  - versioned Commander banlist dataset enforcement panel
- Heuristics are intentionally approximate (Rule 0, archetype, bracket).
- Test coverage is focused on high-risk analysis paths; UI interaction coverage is still limited.

## Development roadmap (proposed)

1. Stability and correctness (next sprint)

   - Expand analyzer test coverage for legality, archetypes, combo detection, and preview behaviors.
   - Add integration tests for `/api/analyze` and `/api/import-url` with representative real decklists.
   - Add stricter runtime validation for API payloads and responses.
   - Harden error surfaces in UI (clear user-facing error messages, retry actions, no silent failures).

1. Full Commander legality engine

   - Complete commander pair rules: Partner, Partner With, Friends Forever, Doctor's Companion, Background.
   - Add companion deckbuilding rule validators with deterministic outputs.
   - Introduce versioned banlist dataset and legality panel with explicit source/date.
   - Return machine-readable legality issues/warnings for UI and export.

1. Analysis quality upgrades

   - Expand archetype taxonomy and weighting beyond keyword-only matching.
   - Grow combo dataset with tags (infinite/combat/drain/lock) and confidence/evidence.
   - Add matchup/table-profile summary (what this deck pressures, what it folds to).
   - Improve suggestion quality using role deficits + color identity + curve context.

1. Product features (post-core)

   - User accounts and cloud deck history (replace local-only storage option).
   - Saved report diffing (compare two deck versions).
   - Import/export improvements (more deck sites, CSV/clipboard quality-of-life).
   - Team sharing and immutable report snapshots.

1. Performance and scale

   - Add optional response caching for repeated analyzes of same deck hash.
   - Add background warm-cache jobs for frequent card lookups.
   - Profile and reduce server response latency for large decklists.
   - Add benchmark suite with baseline latency thresholds.

## Live product standards (production bar)

1. Reliability and operations

   - Define SLOs (API success rate and p95 latency) and monitor continuously.
   - Structured logs with request IDs on all API routes.
   - Error tracking with alerting for 5xx spikes and failed external calls.
   - Runbooks for common incidents (Scryfall outage, DB issues, deploy rollback).

1. Testing and release gates

   - Required CI checks: `npm run test`, `npm run lint`, `npm run build`.
   - Block merge on failing checks.
   - Add smoke tests against deployed environment before promoting release.
   - Maintain changelog/release notes per deploy.

1. Security and compliance

   - Validate and sanitize all inputs at API boundaries.
   - Rate limit public endpoints and share/report creation.
   - Secrets only via environment variables, never committed.
   - Dependency vulnerability scanning with scheduled updates.

1. Data and storage

   - Backup and restore plan for report storage.
   - Versioned datasets (banlist/game changers) with source attribution and update date.
   - Data retention policy for shared reports.
   - Migration strategy for schema changes.

1. UX and accessibility standards

   - Keyboard-accessible interactions for all core flows.
   - Basic WCAG color/contrast checks on critical report UI.
   - Clear loading/empty/error states across all analysis panels.
   - No blocking runtime errors in client; graceful fallback for unsupported browser APIs.

1. Performance standards

   - Target p95 analyze latency budget and track regression over time.
   - Budget client bundle size and monitor with build reports.
   - Cache strategy documented for card previews and analysis routes.
   - Prevent hydration mismatches and extension-related hydration noise in production logs.

## Notes

- Bracket and Rule 0 outputs are conversation aids, not tournament legality rulings.
- If dev mode throws chunk/module errors on Windows (e.g. missing `.next` chunk), clear `.next` and restart `npm run dev`.
