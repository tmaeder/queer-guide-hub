# Queer Guide

LGBTQ+ travel & community platform at queer.guide

## Commands

| Task | Command |
|------|---------|
| Install | `npm install` |
| Dev | `npm run dev` (port 8080) |
| Build | `npm run build` |
| Test | `npm test` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Format | `npm run format` |

The scraper has its own `package.json` under `scraper/` — `cd scraper && npm install`, then `npm test` etc. there. Workers each from their own directory: `wrangler dev` / `wrangler deploy`.

## Architecture

```
queer-guide-hub/
├── src/                  # React 19 + Vite + TS + Tailwind + shadcn/ui (frontend)
├── scraper/              # Node.js scraping pipeline (Cheerio + Playwright) — own package.json,
│                         # has its own src/, tests/, docs/, scripts/ inside
├── supabase/
│   ├── functions/        # Deno edge functions
│   └── migrations/       # PostgreSQL migrations
├── workers/
│   ├── ingest/           # CF Worker: search-intelligence ingest pipeline
│   ├── search-proxy/     # CF Worker: search proxy (Meili|pg|shadow backend), Postgres-driven synonyms
│   ├── snapshot-archiver/ # CF Worker: archives admin/editorial snapshots
│   └── submit/           # CF Worker: extension submissions → ingestion_staging
├── docs/                 # Project-wide docs (a11y-audit, architecture, search-intelligence, …)
├── scripts/              # One-shot operator scripts (configure-meili.sh, …)
└── e2e/                  # Playwright e2e specs
```

**Frontend stack:** React 19, Vite 6, TypeScript 5.8, Tailwind, shadcn/ui, TanStack Query/Router/Table, MapLibre GL, Tiptap editor, i18next (11 langs), Recharts, react-force-graph-2d

**Backend:** Supabase (PostgreSQL 17.4, Auth, Storage, Edge Functions), Cloudflare Pages + Workers, GitHub Actions (scraper cron)

**Workflow orchestration:** pgmq v1.4.4 + `workflow-dispatcher` edge function. Tables: `workflow_definitions` (24 workflows), `workflow_runs`. Queues: scheduled_jobs, import_jobs, content_processing, dead_letter. Exponential backoff retry, concurrency limits, idempotency keys.

**Ingestion pipeline:** `source-*` edge functions (data fetchers) feed into `pipeline-*` functions (normalize, validate, deduplicate, quality-score, review-gate). Each source maps to a workflow definition.

**News pipeline (cut over, 2026-04-30):** Canonical path is cron `0 * * * *` (`wf-news-pipeline`) → `pipeline-executor` → `news-ingestion` DAG (10 nodes: `source-rss-news` → `pipeline-normalize` → `pipeline-sanitize-news` → `pipeline-enrich-news` (LLM tags + summary + geo, circuit-broken) → `pipeline-quality-enhance` → `pipeline-validate` → `pipeline-deduplicate` → `pipeline-quality-score` → `pipeline-review-gate` → `pipeline-commit`). Idempotent commit via `news_commit_staging_batch` RPC, UNIQUE on `news_articles.fingerprint` (SHA-256 of normalized_title + published_day + source_id, URL fallback). Source health auto-managed: exp backoff (5min × 2ⁿ, cap 24h), auto-pause at 8 consecutive failures, eligibility via `news_sources_eligible()` RPC. Full audit in `news_dedup_audit`. Visible / editable / observable at `/admin/pipelines?pipeline=news-ingestion` (Builder) and `/admin/pipelines?tab=news` (Sources / Staging / Dedup audit). Manual admin triggers from NewsSourcesManager now also enqueue this canonical pipeline. Migration `20260429310000` disabled the legacy cron + workflow-dispatcher trigger.

**Marketplace pipeline (hardened, 2026-04-15):** Cron `0 4 * * *` → `marketplace-ingestion` DAG (13 nodes, multi-source fan-in): `source-awin` + `source-shopify` + `source-etsy` → `fan-in` → `pipeline-normalize` → `pipeline-validate` (marketplace branch: title/price/URL/image/currency/availability) → `marketplace-relevance` (Claude Haiku LGBTQ+ gate, rejects < 0.5 confidence) → `pipeline-deduplicate` (marketplace branch: source_entity_id → external_url → domain+title → brand+title → title trigram) → `pipeline-quality-score` → `pipeline-review-gate` → `pipeline-commit` (marketplace branch) → parallel `marketplace-image-mirror` (→ `marketplace-images` R2/Storage bucket, SHA-256 dedup) + `embedding-generator`. Atomic commit via `commit_marketplace_staging_batch` RPC with advisory lock + price-history delta + source-junction upsert. UNIQUE on `(source_type, source_entity_id)`. `price_usd` auto-computed from `fx_rates` (23 currencies, refreshed daily via `marketplace-fx-sync`). Affiliate links resolved to `affiliate_partners` via `merchant_domain`. Link-rot sweeper `marketplace-link-checker` (weekly) updates `link_health`, demotes broken listings to `status='inactive'`. Multi-merchant registry `marketplace_merchants` (provider, shop_domain/shop_id, api_key_env, last_sync_*). Visible at `/admin/pipelines?pipeline=marketplace-ingestion` (Builder).

**Event Truth Loop (continuous quality, 2026-05-30):** Layered on top of the events ingest DAG — turns each event into a living record that re-verifies itself. `events` gains `trust_score` (composite 0-100, distinct from `quality_score`=completeness), `last_verified_at`, `liveness_status` (live/sold_out/cancelled/postponed/moved_online/dead_link/unknown), `field_provenance` jsonb. Append-only `event_quality_signals` ledger (corroboration/liveness/freshness/engagement/admin_feedback/enrichment/relevance/safety) feeds a nightly **pure-SQL** `run_event_trust_recompute()` (decaying composite: completeness·0.25 + corroboration·0.20 + freshness·0.15 + engagement·0.15 + relevance·0.15 + admin_feedback·0.10, hard-cap 10 on dead/cancelled). Weekly pure-SQL `run_event_coverage_radar()` flags thin major cities → `event_coverage_gaps` with suggested source queries. Three edge functions (gated by Vault secret `event_quality_webhook_secret` / `EVENT_QUALITY_WEBHOOK_SECRET` env, hybrid-by-confidence: certain→auto-apply, ambiguous→`needs_attention`): `event-liveness-checker` (daily; HEAD/GET ticket_url+website, JSON-LD `eventStatus`/`availability`), `event-corroboration` (daily; multi-source field fusion across `event_sources.payload.normalized` → `field_provenance`, flags only title conflicts), `event-agentic-enrich` (hourly, circuit-broken `llm.openai.agentic-enrich` + daily cap; grounds Claude/OpenAI extraction in the event's own source page → accessibility/target_groups/age/safety moat fields via `researchEnrichEventFromPage`). Both SQL jobs registered in `admin_automations`; all five crons active. Admin surface: trust + liveness columns and an `EventQualityPanel` (coverage gaps + counts) on `/admin/events`.

**Venue Truth Engine (consensus enrichment, 2026-05-30):** The `venue-ingestion-unified` DAG (daily cron `pipeline-venue-ingestion`, `0 3 * * *`, 7 sources) gained a `pipeline-consensus-merge` node between `dedupe` and `quality`. It groups staging rows that dedup linked to the same existing venue (`dedup_match_id`), votes each field across sources + the venue's current value (`source='existing'`), and writes per-field provenance + confidence. Logic is pure + unit-tested in `_shared/venue-consensus.ts` (source trust weights, noisy-OR confidence, comparator per field kind: identity/url/phone/email/coords/text/number/array). Agreement ≥2 sources → high confidence → auto-commit; conflict on a HIGH-RISK field (name/lat/lng/category) → `review_status='pending_review'` → existing triage. Per-(venue,field,source) candidates in `venue_field_provenance` (`is_winning` flag); merge decisions audited in `venue_consensus_audit`. Closure is a voted signal (Google `business_status`, `url_status` 404/410, `permanently_closed`): ≥2 signals auto-set `venues.closed_at`, 1 signal sets `needs_attention`. Every consensus pass stamps `venues.last_refreshed_at`; selector RPC `venues_due_for_refresh(limit)` ranks never-refreshed > broken-url > low-quality > stale. Admin sees sources + per-field confidence + closure flags in the triage detail panel (`src/components/admin/triage/TriageDetailPanel.tsx`). Follow-ups (deferred): free `source-wikidata-venue` to add a cheap voter; per-venue targeted detail re-fetch driven by `venues_due_for_refresh`.

**Payments:** Stripe via `create-checkout-session` + `stripe-webhook` edge functions.

**User submissions (Chrome extension):** `extension/` (MV3, React 19) extracts venues/events/hotels/marketplace/news from any webpage via JSON-LD/microdata/OpenGraph/DOM heuristics. `workers/submit/` (CF Worker) verifies user Supabase JWTs and stages into the same `ingestion_staging` table the scraper uses, with `source_type='user_submission'` — submissions flow through the existing normalize → dedupe → quality-score → review-gate → commit pipeline. Submitter columns + RLS added via migration `002_user_submissions`.

**Note:** `supabase/functions/` and `supabase/migrations/` at the repo root are the canonical locations.

## Repo stats

- **Edge functions:** 190
- **Migrations:** 456
- **Migrations:** 438
- **Migrations:** 434
- **Edge functions:** 196
- **Migrations:** 420
- **Migrations:** 418
- **Migrations:** 419
- **Edge functions:** 192
- **Edge functions:** 189
- **Migrations:** 413
- **Edge functions:** 189
- **Migrations:** 401
- **Edge functions:** 185
- **Migrations:** 398
- **Migrations:** 396
- **Migrations:** 394
- **Edge functions:** 185
- **Migrations:** 390
- **Migrations:** 388
- **Edge functions:** 185
- **Migrations:** 382
- **Edge functions:** 185
- **Migrations:** 381
- **Edge functions:** 182
- **Migrations:** 370
- **Migrations:** 363
- **Migrations:** 372
- **Migrations:** 367
- **Migrations:** 371

## Infrastructure

- **Supabase:** project `xqeacpakadqfxjxjcewc` (eu-central-2)
- **Cloudflare Pages:** project `queer-guide` at `queer-guide.pages.dev`
- **CF Account:** `7aa3765cc5f50f2b681b782eb4a8d296`
- **Search:** **migrating Meilisearch → Postgres + Cloudflare** (plan: `docs/search-intelligence/meili-to-postgres-migration-plan.md`). Meilisearch (self-hosted, Infomaniak) still serves production by default; the Postgres engine is live and shadow-tested for cutover.
  - **Postgres engine (live):** denormalized `search_documents` table (weighted tsvector + `vector(1024)` HNSW embedding + PostGIS `geog` + facets/trust/liveness/price/temporal). RPCs: `search_hybrid` (RRF keyword+vector fusion in SQL, with target_groups filter + news-recency decay + vnn top-200 admission), `search_facets`, `search_autocomplete` (prefix + trigram), plus discovery RPCs (`get_recommendations`, `related_entities`, `find_duplicate_clusters`, `events_in_window`, `personalities_on_this_day`). Excludes `duplicate_of_id IS NOT NULL`.
  - **CF Worker:** `search-proxy` — `SEARCH_BACKEND` flag (`meili` default | `pg` | `shadow`). `pg` serves `/search` + `/autocomplete` from the Postgres RPCs; `shadow` serves Meili but logs a `search_shadow` comparison for cutover validation (analyze with `scripts/search-eval/shadow-analyze.mjs`). Rollout runbook: `docs/deploy/search-rollout.md`.
  - **Sync:** `meilisearch-sync` edge function (Meili); Postgres `search_documents` stays fresh via entity + `content_embeddings` triggers.
  - **Indexes (Meili):** venues, events, cities, countries, news, marketplace, personalities, tags, queer_villages
  - **Config:** `meilisearch/` directory (Docker Compose, Caddy, index config scripts)
  - **Legacy:** PostgreSQL FTS `universal_search()` and `algolia-sync` are deprecated
- **Dedup:** `find_duplicate_clusters(content_type)` groups near-duplicate live entities (date-aware for events/festivals). Admins review + merge venues at `/admin/duplicates` — a soft, reversible merge via `merge_venues`/`unmerge_venues` (sets `duplicate_of_id`, reparents children, slug redirect via `venue_slug_redirects`, audited in `venue_merge_audit`).

## Environment

- Frontend (root): see `.env.example` — Supabase URL + anon key, Mapbox token, feature flags
- Scraper (`scraper/`): `DATABASE_URL`, source-specific API keys (see `scraper/.env.example`)
- Workers: each has `.dev.vars` for local dev

## Deployment

- **Frontend:** push to `main` → Cloudflare Pages auto-deploys
- **Edge functions:** `supabase functions deploy <function-name>`
- **Workers:** `wrangler deploy` from each worker directory
- **Scraper:** GitHub Actions — daily full refresh (03:15 UTC) + hourly events
- **DB migrations:** applied via Supabase CLI or dashboard

## Testing

- **Always verify on production** (https://queer.guide) after deploy, not just localhost. The deploy target is Cloudflare Pages, not Vercel — Vercel is preview-only.
- **Frontend unit (root):** `npm test` — vitest + jsdom, `src/**/*.{test,spec}.{ts,tsx}`
- **Scraper:** `cd scraper && npm test` — vitest, `tests/**/*.test.ts`, 30s timeout, v8 coverage
- **E2E:** Playwright config at `playwright.config.ts`; specs in `e2e/`. Run via `npm run test:e2e` (or `test:e2e:ui` for the Playwright UI). Full suite runs nightly at 03:00 UTC via `.github/workflows/e2e-nightly.yml`; an `e2e-i18n.yml` smoke job runs on PRs touching i18n / trip-planner code.

## Gotchas

### iCloud & Git
The repo lives in an iCloud-synced folder. `.git` objects get evicted. If git commands hang or fail, run `brctl download .git` first.

### DB Column Names (common traps)
- All entity tables use `is_featured` (boolean). The legacy `featured` column on `venues` and `events` was dropped in PR #312; codebase migrated to `is_featured` end-to-end.
- `personalities.birth_date` / `death_date` (date type, NOT `birth_year` / `death_year` int)
- `news_sources.source_type` (NOT `type`), `.last_fetched_at` (NOT `last_fetch_at`)
- `countries.code` (NOT `iso_code`)
- `events.title` (NOT `name`)
- Table is `unified_tags` (NOT `tags`), has NO `is_active` column
- `personalities` has NO `known_for` column — use `profession` + `lgbti_connection`

### Migrations
- Cannot use `CONCURRENTLY` (migrations run inside transactions)
- `supabase/migrations/` is large — check for conflicts before adding new ones (see Repo stats for current count)

### Frontend
- Path alias: `@/*` → `src/*`
- Vite manual chunks configured for: vendor, router, utils, graph, exceljs, maplibre, tiptap, HLS, PDF, mammoth, sentry, i18n

## Design

LGBTQ+ travelers, locals, activists, researchers, allies. Safety-first, inclusive by default, content is the hero.

- **Color:** strictly monochrome. Black `--foreground: 0 0% 4%`, white `--background: 0 0% 100%`, plus grayscale steps (`--muted`, `--accent`, `--border`). No brand magenta in public UI. ESLint (`no-restricted-syntax`) errors on hex/rgb/hsl literals outside allowlisted files.
- **Typography:** Inter only. Plus Jakarta Sans removed. Self-hosted woff2 in `public/fonts/inter/`. Editorial size scale extended with semantic tokens in `@theme` — `--text-hero-xl` (88px), `--text-hero` (64px), `--text-display` (40px), `--text-headline-lg` (32px), `--text-headline` (28px), `--text-title` (22px), `--text-body-lg` (17px), `--text-15` (15px), `--text-13` (13px), `--text-xs2` (11px), `--text-2xs` (10px), `--text-3xs` (9px). Always use a token; ESLint guards block arbitrary `text-[NNrem]` / `font-extrabold` in admin tree, warns in public.
- **Spacing rhythm:** strict 8 pt grid. Use even-step Tailwind utilities only — `p-{0,2,4,6,8,10,12,16,20,24}`, same for `m-`, `gap-`, `space-{x,y}-`. Odd-step utilities (`p-3`, `gap-3`, `p-5`, `space-y-7`, …) were removed 2026-05-21 (UI audit P8); ESLint-warn them in new code. `.5` increments (e.g. `p-1.5`, `gap-2.5`) remain allowed as the only sub-8pt micro-spacing — useful for icon-level offsets. Arbitrary `[NNpx]` values are only acceptable for genuine element-sizing constraints (icon dimensions, dropdown widths, card max-widths); never for spacing that could use the scale.
- **Shape:** semantic 3-tier radius defined in the Tailwind v4 `@theme` block in `src/index.css` — `--radius-container: 1rem` (16px, cards/sheets/dialogs/hero blocks), `--radius-element: 0.5rem` (8px, buttons/inputs/list rows/nested cards), `--radius-badge: 0.25rem` (4px, tags/chips/status pills). ESLint warns on raw `rounded-(sm|md|lg|xl|2xl|3xl)` literals in new code — pick from the semantic trio. `rounded-full` allowed for avatars/dots only. `rounded-none` allowed for explicit flat override.
- **Shadows:** disabled. ESLint warns on `shadow-(md|lg|xl|2xl)`. Use `border` or `bg-muted` for depth.
- **Gradients:** not allowed in public UI. ESLint warns on `bg-gradient-to-*`. Exception: black readability scrims over images (`from-black/15 to-black/65`).
- **Icons:** lucide-react only, inherit color from parent.
- **Motion:** functional only (skeleton pulse, dialog/sheet transitions, accordion). No decorative animation (Aurora removed, ScrollReveal on hero removed).
- **Copy:** direct factual voice. No "discover/explore/unlock/curated/journey/amazing/tailored/personalized for you". Empty states: "No X yet." not metaphors.
- Full light + dark mode (system preference + header toggle).
- Components: shadcn/ui primitives in `src/components/ui/`.

### Documented exceptions
- **`--destructive`** token for hard-error semantics (payment declined, pipeline failed, irreversible confirms). Reserved muted red — the ONLY chromatic color in the entire product. User-locked 2026-05-19.
- **Trip safety briefing traffic-light.** `src/components/trips/TripSafetyBriefing.tsx` retains low/moderate/high/critical risk colors. Safety > consistency for LGBTQ+ travelers in high-risk destinations. User-locked 2026-05-19.
- **Functional categorical scales** still allowlisted in `eslint.config.js`: map vector tiles, equality scores, news taxonomy, avatar gradients, submission scan flyers, trip cover gradients, content warnings, password strength meter, OAuth brand SVGs. Each is functional, not decorative.
- **Inline links underlined.** `p a, li a, td a, span a, label a` get `text-decoration: underline` in `src/index.css`. Without color difference from body text, the underline is the only cue that distinguishes a link (WCAG 1.4.1, axe `link-in-text-block`). Standalone links — nav, buttons, cards — stay un-underlined.
- **Crisis & safety pages are animation-free.** `src/pages/HelpHotlines.tsx` and any future route under `/help`, `/safety`, `/report-*` must not consume Aceternity components, scroll-reveal effects, or decorative motion. Functional motion only (focus rings, dialog transitions, accordions). Protects users in crisis from cognitive overload and respects `prefers-reduced-motion` (WCAG 2.3.3). The Aceternity Showcase (`/aceternity` → §A11y exemption) documents the canonical static pattern.
- **Semantic radius tokens.** Always pick from the trio `rounded-container` (16px — cards, sheets, dialogs, hero blocks), `rounded-element` (8px — buttons, inputs, list rows, nested cards, image frames), `rounded-badge` (4px — chips, pills, status tags) over raw `rounded-(sm|md|lg|xl|2xl|3xl)` literals. The trio is a single point of change for the entire visual rhythm. `rounded-full` permitted for avatars/dots only; `rounded-none` for explicit flat overrides.

### Design System Files
- Tokens: `src/index.css` (Tailwind v4 `@theme` block — CSS variables; no `tailwind.config.ts`)
- Animation: `src/lib/animation.ts` (durations, easings, distances)
- Charts: `src/lib/chartPalette.ts` (monochrome recharts palette + stroke patterns; added Phase 3a)
- Components: shadcn/ui primitives in `src/components/ui/`. For monochrome status semantics use the `Badge` variants (the unused `StatusBadge` primitive was removed in the 2026-05-31 declutter; see `DECLUTTER_CANDIDATES.md`).
- Enforcement: `eslint.config.js` (color literals: error in public, warn in admin → error after Phase 3g; semantic radius warn; admin motion ban error)
