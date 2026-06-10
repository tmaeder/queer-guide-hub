# Test Coverage Analysis

**Status:** living document — last updated 2026-05-21
**Scope:** frontend, scraper, workers, edge functions, migrations, CI

## Why this document exists

Test coverage in this repo is uneven by layer. The frontend has roughly equal counts of test and source files; the backend ingestion pipeline — the code that writes to production tables on a cron — is almost entirely untested. This document inventories what's covered today, calls out the highest-blast-radius gaps, and proposes a priority order for closing them.

It pairs with a companion PR that wires the *existing* scraper / worker / edge-function tests into CI so they actually run on every PR. See "CI wiring" below.

---

## Current state at a glance

| Layer | Test files | Source files (approx) | Notes |
|---|---|---|---|
| Frontend `src/` | ~1,200 test files | ~1,100 source files | Vitest + v8. Thresholds ratcheted to lines 38% / branches 27%. Components & hooks reasonably covered. |
| E2E `e2e/` | 54 specs | n/a | Playwright. Nightly + i18n-on-PR. |
| Scraper `scraper/` | 11 unit tests | ~33 src files | `sources/` (8 connectors) and `jobs/` (3 files) have **0** tests. |
| Workers (8 total) | Tests in 2 of 8 | ~32 src files | `search-proxy`, `ingest`, `snapshot-archiver`, `geo`, `image-cdn`, `image-ingest` are entirely untested. |
| Edge functions `supabase/functions/` | 17 deno tests | 182 functions | ~9% have any test. Most pipeline DAG nodes have **0** tests. |
| Migrations / RPCs | 3 ad-hoc SQL scripts | 315 migrations | No pgTAP. RPCs like `news_commit_staging_batch`, `commit_marketplace_staging_batch` are untested. |
| CI | Frontend-only | — | `.github/workflows/ci.yml` runs frontend vitest + typecheck + lint. **No** scraper / worker / edge-function tests in CI. `deploy-supabase-functions.yml` has no test step. |

The shape of the gap: tests cluster around what's easy to test (pure functions, presentational components) and avoid what's hard to test (cron-driven orchestration, RPCs with `SECURITY DEFINER`, third-party integrations, large stateful UI). That's where the highest-blast-radius bugs hide.

---

## Prioritized gap areas

### P0 — Pipeline DAG nodes & commit RPCs (data-integrity blast radius)

The news and marketplace ingestion pipelines run on cron and write directly to production tables. Bugs here cause silent data loss, duplicates, or stale content with no user-visible error.

**Untested today:**
- `supabase/functions/pipeline-normalize/index.ts` (508 LOC) — normalization, idempotency keys, geocoding
- `supabase/functions/pipeline-validate/index.ts` (385 LOC) — quality gate before commit
- `supabase/functions/pipeline-deduplicate/index.ts` (384 LOC) — silent data loss if broken
- `supabase/functions/pipeline-quality-score/index.ts` (196 LOC) — feeds review-gate decision
- `supabase/functions/pipeline-review-gate/index.ts` (236 LOC) — `requires_manual_review` flag
- `supabase/functions/pipeline-commit/index.ts` (330 LOC) — final write to live tables
- RPCs `news_commit_staging_batch` and `commit_marketplace_staging_batch` (in `supabase/migrations/20260415180100_*` and `20260427220000_*`)

The single existing test (`_tests/pipeline-commit-build-record.test.ts`) only covers record construction, not the RPC call or the transaction semantics.

**Recommended tests:**
- Deno unit tests for each pipeline node's pure logic (normalization rules, validation predicates, dedup ranking, scoring formula, review-gate threshold) using fixture rows as input.
- Integration tests against a local Supabase instance for the two commit RPCs covering: happy path, duplicate-fingerprint conflict resolution, advisory-lock contention, price-history delta, and the source-junction upsert.
- Reuse the deno test harness already set up in `supabase/functions/_tests/deno.json`.

### P0 — Workflow orchestration (silent cron-failure blast radius)

If `workflow-dispatcher` or `pipeline-executor` breaks, the entire news/marketplace ingestion stalls with no user error. Today this is only exercised through the admin UI e2e (`e2e/admin-workflow-dispatcher.spec.ts`).

**Untested today:**
- `supabase/functions/workflow-dispatcher/index.ts` (634 LOC) — cron triggers, retries, DLQ enqueueing
- `supabase/functions/pipeline-executor/index.ts` (612 LOC) — DAG state machine

**Recommended tests:**
- Unit tests for the retry-with-backoff state machine (input: failure count → output: next-retry timestamp).
- Unit tests for the DAG executor: fan-in completion, node-state transitions, idempotency-key dedup of replays.
- Integration tests that enqueue a synthetic job and assert the pgmq queue + `workflow_runs` table reach the expected end state.

### P1 — Stripe payment flow (financial blast radius)

Only helpers are tested (`_tests/stripe-webhook-helpers.test.ts`). The endpoints themselves — which talk to Stripe and update donation state — are not.

**Untested today:**
- `supabase/functions/create-checkout-session/index.ts` — rate limiting, currency validation, Stripe session creation
- `supabase/functions/stripe-webhook/index.ts` — event dispatch, idempotency, status updates

**Recommended tests:**
- Mock the Stripe SDK at the boundary and exercise: invalid currency rejection, rate-limit trip, successful session creation.
- For the webhook: signature verification, event dispatch matrix (`checkout.session.completed` / `invoice.paid` / `charge.refunded`), and idempotency-key replay protection.

### P1 — User-submission entry points (untrusted-input blast radius)

The Chrome-extension → `workers/submit` → `ingestion_staging` path is the only place untrusted user input enters the data plane.

**Tested today:** `workers/submit/tests/schema.test.ts`, `supabase.test.ts`, `render-core.test.ts`, `registry-drift.test.ts` — good schema/extraction coverage.

**Untested:**
- `workers/submit/src/auth.ts` — JWT validation, the actual auth boundary
- `workers/submit/src/rate-limit.ts` — abuse prevention
- Image URL sanitization in `workers/submit/src/supabase.ts` (XSS via crafted submissions)
- Extension client-side validation beyond the four extractor tests already in `extension/tests/`

**Recommended tests:**
- Unit tests for `auth.ts`: missing header, malformed JWT, expired token, valid token paths.
- Unit tests for `rate-limit.ts`: window boundaries, per-user vs per-IP counters.
- Property-style tests for image URL sanitizer with adversarial inputs (`javascript:`, `data:`, redirector chains).

### P1 — Untested workers

Six of eight workers ship with zero tests. The ones in critical paths:

- `workers/search-proxy/` (11 src files) — fronts Meilisearch with the API key; bugs here either leak the key or break search globally. Only shell scripts (`contract.sh`, `cities.sh`) exist; no vitest setup.
- `workers/ingest/` — search-intelligence ingest pipeline
- `workers/snapshot-archiver/` — admin/editorial snapshot archival
- `workers/image-cdn/`, `workers/image-ingest/` — lower blast radius but still production paths

**Recommended:** start with `search-proxy` — add vitest config, then tests for synonym lookup, API-key gating, and query-shape validation. The shell `contract.sh` tests can be ported into vitest `it.each(...)` blocks for reproducibility.

### P1 — Meilisearch sync (availability blast radius)

`supabase/functions/meilisearch-sync/index.ts` (1,055 LOC) is the largest single edge function in the repo and has **0** tests. If sync breaks, the search index goes stale silently.

**Recommended tests:**
- Field-mapping tests per index (venues, events, cities, countries, news, marketplace, personalities, queer_villages) — fixture row in, expected Meili doc out.
- Incremental sync from `pg_net` triggers: insert / update / delete → expected index op.
- Retry behavior on Meili 5xx.

### P2 — Frontend hotspots (single-file giants with no tests)

A handful of large components carry a lot of logic and have no tests:

- `src/components/map/ExploreMap.tsx` (983 LOC) — core explore UX
- `src/components/personalities/AddPersonalityDialog.tsx` (913 LOC)
- `src/components/analytics/UmamiAnalyticsDashboard.tsx` (864 LOC)
- `src/components/messaging/MessagingInterface.tsx` (793 LOC)
- `src/components/layout/Header.tsx` (748 LOC)
- `src/components/feedback/FeedbackButton.tsx` (384 LOC) + `FeedbackCard.tsx` (134 LOC) — 0 tests in entire `feedback/` dir
- `src/components/cms/UniversalContentEditor.tsx` — Tiptap orchestration, untested

**Recommended:** use the existing `renderWithProviders` test util (`src/test/` already provides QueryClient + MemoryRouter wrappers and a Supabase mock). Start with `feedback/` (smallest, highest ratio of value-to-effort), then `ExploreMap` (highest user impact).

### P2 — Scraper source connectors

`scraper/src/sources/` has 8 connector files (Airbnb, Eventbrite, OSM, Wikidata, etc.) and zero tests. A failing connector produces zero rows silently. The existing `wikipedia-parser.test.ts` is a good template — apply it to the other seven.

`scraper/src/jobs/` (3 files) and `scraper/src/db/` (5 files) are also untested.

### P3 — RLS policies & DB constraints

No automated tests verify RLS policies. Today we trust migration review. A small pgTAP suite (or a `supabase/tests/rls.test.sql` runner invoked from CI) would catch privilege regressions before they ship. Concrete targets: anonymous read-only on public tables, authenticated insert on `ingestion_staging`, admin-only write on `workflow_definitions`.

### P3 — Coverage thresholds

Frontend thresholds (`vite.config.ts`) are currently lines 38% / branches 27% / functions 28%. Once new tests land, ratchet these up rather than leaving the floor at the low-water mark — otherwise the new coverage doesn't actually prevent future regressions.

---

## Areas that are already in good shape (do not over-invest)

- News pipeline UI (`src/components/news/`)
- Trip planner (`src/pages/Trip*`, `src/components/trips/*`) including safety briefing
- Auth pages and hooks (`src/hooks/useAuth.tsx`, `src/pages/Auth*.tsx`)
- Search UI (`src/lib/searchClient.ts` family, `src/components/search/`)
- Crisis page (`HelpHotlines.test.tsx`) and trip safety (`TripSafetyBriefing.test.tsx`, `PerLegSafety.test.tsx`)
- Extension extractors (`extension/tests/microdata.test.ts`, `jsonld.test.ts`, `opengraph.test.ts`, `dom-heuristics.test.ts`)
- Scraper utilities (`scraper/tests/unit/dates.test.ts`, `text.test.ts`, `dedupe.test.ts`, `normalize.test.ts`, `schemas.test.ts`)

---

## CI wiring (companion PR)

Before writing any new tests, the existing ~30 backend test files need to run on every PR. The companion change in this PR adds three jobs to `.github/workflows/ci.yml`:

- **`scraper-tests`** — `cd scraper && npm ci && npm test`
- **`worker-tests`** — iterates `workers/*` and runs `npm test` for every worker that has a `test` script (auto-picks up new workers as they gain test setup)
- **`edge-fn-tests`** — `denoland/setup-deno@v2` (Deno 2.x) running `source-adapter.test.ts` + `pipeline-nodes.test.ts` in `supabase/functions/_tests/`. Mirrors `pipeline-health.yml`'s known-working invocation. The other 6 test files in that directory (`entity-classifier`, `entity-type-classifier`, `ingestion-rules`, `pipeline-commit-build-record`, `safety-relevance`, `stripe-webhook-helpers`) fail fast in CI and need per-file triage — likely Deno 1.x → 2.x transitive-import issues. Each will be wired in via follow-up PRs.

It also adds a test step to `.github/workflows/deploy-supabase-functions.yml` so deploys are gated on the deno tests passing — closing a gap where production deploys ran with zero test verification.

`extension-ci.yml` already covers `workers/submit` and `extension/` on path-filtered triggers and is left alone.

---

## Suggested follow-up PR order

Each row is its own PR so coverage ratchets up visibly:

1. **P0 pipeline nodes** — deno tests for each of the six untested pipeline DAG nodes, using fixture rows.
2. **P0 commit RPCs + workflow orchestration** — integration tests against local Supabase for `news_commit_staging_batch`, `commit_marketplace_staging_batch`, and the dispatcher/executor state machine.
3. **P1 Stripe webhook + meilisearch-sync** — both are large, production-critical, single-file edge functions.
4. **P1 `workers/submit/src/auth.ts` + `rate-limit.ts`**; then bootstrap `workers/search-proxy/` vitest setup.
5. **P2 frontend hotspots** — `feedback/`, then `ExploreMap`, then the other giants.
6. **P2 scraper sources** — replicate the `wikipedia-parser.test.ts` pattern across the remaining 7 connectors.
7. **P3 RLS pgTAP + ratchet vitest thresholds** — raise the 38%/27%/28% floors so they actually catch regressions.

---

## How to re-run this analysis

The numbers above will drift as code changes. Quick re-survey commands:

```bash
# Frontend coverage
npm run test:coverage

# Backend test file count
find scraper workers supabase/functions -name "*.test.ts" -o -name "*_test.ts" | wc -l

# Workers with a test script
for d in workers/*/package.json; do
  node -e "const p=require('./$d'); if(p.scripts?.test) console.log('$d:', p.scripts.test)"
done

# Untested edge functions (rough)
comm -23 \
  <(ls supabase/functions | grep -v '^_' | sort) \
  <(ls supabase/functions/_tests/*.test.ts | xargs -n1 basename -s .test.ts | sort -u)
```
