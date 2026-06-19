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
├── scripts/              # One-shot operator scripts (search-eval/, …)
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

**City Truth Engine (content quality, 2026-06-07):** Cities gained the same self-maintaining quality layer as events/venues (they had none; ~90% had no description, ~0% had queer-specific fields). `cities` gains `trust_score`, `completeness_score` (queer-weighted: queer_content 0.30 + description 0.20 + travel 0.15 + geo 0.15 + image 0.10 + basics 0.07 + trivia 0.03), `shell_status` (real/placeholder/ghost/merged), `needs_attention`, `field_provenance`, `enrichment_status`, `safety_notes`, `last_verified_at`. Pure-SQL nightly jobs `run_city_completeness_recompute` + `run_city_trust_recompute` (caps: placeholder ≤5, ghost ≤15; freshness decays over 90d; `IS DISTINCT FROM` guard) and weekly `run_city_coverage_radar` (scans EVERY non-dup city → `city_coverage_gaps` with missing_fields + content_counts + resolution enrich/merge/review) — all registered+enabled in `admin_automations` + pg_cron. `city_quality_signals` ledger (daily-pruned), `cities_due_for_refresh(limit)` work-list selector. Three cron edge functions gated by Vault secret `city_quality_webhook_secret` / env `CITY_QUALITY_WEBHOOK_SECRET`: `city-factual-backfill` (Wikipedia full-text extract + Wikidata claims + OSM, fills EMPTY columns only, records per-source candidates), `city-corroboration` (fuses candidates → `field_provenance`, flags coord conflicts), `city-agentic-enrich` (grounded queer LLM moat via `researchEnrichCityFromSources` in `_shared/ai-enrichment.ts` — note `chatCompletion` defaults to CF Workers AI llama-70b whose `response`/`content` can be an OBJECT, so coerce before parsing; uses the full-text Wikipedia `extracts` API, not the summary). **Safety gate (load-bearing):** narrative fields (description/best_time/local_customs) auto-fill empty columns at confidence ≥0.8; `lgbt_friendly_rating` (integer 1-5) + `editorial_hook` ALWAYS route to `city_review_queue` with citations and NEVER reach `cities` until an admin approves via `approve_city_review`/`reject_city_review` RPC (atomic, audited in `city_consensus_audit`, source stamped `llm+human`). Rating is only proposed when citation-backed, else null (no fake defaults). `safety_notes` is no longer LLM-generated — see the Safety Notes composer below. Admin surface: `/admin/cities` dashboard (`CityQualityPanel` + review queue with citations + approve/reject); CRUD stays at `/admin/content/cities`.

**Safety Notes composer (deterministic, tiered, 2026-06-08):** `safety_notes` is composed by one pure-SQL `compose_safety_note(jsonb)` (IMMUTABLE; migration `20260608000001`), not the LLM (the old path produced circular "Spain has a high equality score so Barcelona is no exception" blobs; 0/3830 cities were ever live because the human gate was never cleared). Derives every note from structured facts — country legal status (`lgbti_criminalization` legal/penalty/death_penalty + `lgbti_same_sex_unions`) + city LGBTQ+ density (venue/event/queer-village counts) — returning `{note, risk_tier, confidence, auto_publishable, components}`. Risk tier mirrors `useTripSafety.ts` (death→critical, criminalizing→high, eq<40→moderate, else low). **Tiered publishing:** `risk_tier='low' AND equality_score≥75 AND not-criminalizing AND not-death-penalty AND confidence≥0.8` → auto-publish to `cities.safety_notes` (`field_provenance.source='derived'`); else → `city_review_queue`. **Outing-safety invariant (load-bearing): a criminalizing/death-penalty destination can NEVER auto-publish** — enforced inside the composer (forces `auto_publishable=false`) AND at `approve_city_review(p_id,p_note,p_confirm)` (criminalizing safety_notes approval needs `p_confirm=true`; UI shows a `Lock` + confirm dialog). Backfills `run_city_safety_backfill(p_batch≤300,p_force)` (city updates fire `trg_search_documents_city` → hard cap 300/batch) + `run_hotel_safety_backfill(p_batch,p_hotel_id)` (regenerates `hotels.queer_safety_notes` from `amenities[]` signals — gay-district/host-tips/venues-nearby/clothing-optional — replacing the 18-distinct misterb&b boilerplate; no search trigger, unbounded). `triage_stuck_city_safety_reviews()` + `batch_approve_safe_city_reviews()` recompose stuck queue rows. Admin: batch-approve button + tier/`Lock` badges in `CityReviewQueue.tsx`, "Regenerate from signals" in `AdminHotels.tsx`; public render in `CityRightsTab.tsx`. Both backfills registered+enabled in `admin_automations` + pg_cron (`city_safety_backfill` `30 4 * * *`, `hotel_safety_backfill` `50 4 * * 0`). First pass (2026-06-08): cities 0→3273 live (557 gated), hotels deduped, 0 circular phrasing, invariant verified 0.
**Country Completeness Engine (data quality, 2026-06-07):** Per-country `content_completeness_score` (0-100, distinct from `equality_score` which is legal status) + `enrichment_status` jsonb (per-field state map; `data_unavailable` is terminal → credited by the scorer, skipped by the selector, so uninhabited territories aren't flagged forever). Pure-SQL `run_country_completeness_recompute()` (nightly `30 3 * * *`, registered in `admin_automations`) scores a uniform bar across editorial 25 / core facts 25 / stats 20 / legal coverage 20 / media+geo 10. Selector RPC `countries_due_for_enrichment(limit, phase)` ranks never-scored > low-score > stale. Three fillers: **`pipeline-enrich-country-editorial`** (LLM hook+paragraph grounded in facts + LGBTI legal context; hybrid-by-confidence via `_shared/editorial-confidence.ts` — high-conf safe → auto-publish to `description`/`editorial_hook`/`editorial_long`, criminalizing destinations + low-confidence → `editorial_drafts` review at `/admin/places-editorial`); **`enrich-wolfram`** (fills `gdp_usd`/`gdp_per_capita_usd`/`human_development_index`/`life_expectancy`/`literacy_rate` from Wolfram, terminal `data_unavailable` after 3 misses; needs `WOLFRAM_APP_ID`); equality_score reconciled to one shared formula in `_shared/equality-score.ts` (re-applied nightly by the existing `wf-import-ilga-data` cron). Weekly fill crons `wf-enrich-wolfram-countries` (`0 5 * * 0`) + `wf-enrich-country-editorial` (`0 6 * * 0`) via `enqueue_workflow`. Admin completeness column on `/admin/countries`; `editorial_hook` rendered on the country About card.

**Personhood Disposition (data quality, 2026-06-07):** Detects organizations / venues / teams misfiled in `personalities` (the bare-name residue the Wikidata resolver refuses because of its `P31=Q5` human filter — e.g. *Sisters of Perpetual Indulgence*, *SF Tsunami Water Polo*, *La Montaña*) and **reversibly soft-archives** confirmed non-persons (`visibility→draft` + `review_status='archived'` + `seo_indexable=false`, the Phase-1 adult-cohort convention; never hard-deletes, never reclassifies — no org table exists). Classifier `_shared/personhood-classifier.ts` fuses name/bio heuristics (reusing `entity-type-classifier.ts`) + Wikidata `P31` (`classifyWikidataPersonhood` in `_shared/wikidata-resolve.ts`) + LLM grounded in the bio, hybrid-by-confidence: a confident Wikidata-human match **vetoes** archiving; only `non_person` ≥0.8 archives, `uncertain` → `needs_attention`, `person` recorded + excluded from future runs. RPCs (migration `20260607400000`): `archive_personality_as_nonperson(id,reason,signals)`, `unarchive_personality(id)` (existing admin restore, extended to also restore visibility/seo from `enrichment_status.personhood.archived` snapshot), `set_personhood_verdict(id,verdict,payload)`, `personalities_nonperson_candidates(limit)`. Edge fn `pipeline-classify-personhood` (circuit-broken, daily-capped, internal-secret gated) on weekly cron `wf-classify-personhood` (`30 6 * * 1`). New critical `person_nonperson_public` gate in `release_gate_checks()`. Backfill driver `scripts/data-quality/classify-personhood.mjs`. First pass (2026-06-07): 12 archived, 6 flagged for triage, 62 confirmed persons, 0 public non-persons. Audit: `docs/audits/2026-06-07-personhood-disposition.md`.

**Amenity Truth Engine (data quality, 2026-06-08):** Venue amenities were garbage — only 2.9% of venues had any, and the 945 that did held **2,020 distinct uncontrolled values** (TripAdvisor scrape noise: adjectives `casual`/`trendy`, food `eggs`/`bacon`/`salads`, meal types, location words) because `normalizeAmenities` only ran for hotels. `accessibility_attributes` was 100% empty. The fix is a controlled vocabulary + cleanup + self-maintaining engine. **Vocabulary:** `public.amenities` is now the single category-aware vocabulary (was a dead 0-row catalog) — `slug`/`icon_name` (lucide)/`kind` (`amenity`|`accessibility`|`queer`)/`category_scope[]`; 61 seeded terms (migration `20260608100000`). `venue_amenities`/`attributes` deprecated. **Normalizer** `_shared/amenity-normalize.ts` (DB-backed, category-aware, default-reject) classifies each raw term → amenity (`amenities[]`) / accessibility (`accessibility_attributes[]`) / queer (`tags[]`) / noise (dropped); anything not in the vocab/aliases is dropped. `detectLgbtqMarkers` reused for queer markers. **Engine** (`amenity-truth-backfill` edge fn, `verify_jwt=false`, X-Webhook-Secret `amenity_quality_webhook_secret`): three sources per venue — `extract` (free re-classify of existing data, auto-applies), `places` (Google structured booleans → slugs, auto-applies; **deferred — 0 venues have a `platform_ids.google` id**, real fetch is Phase 7 ~$500 to resolve place_ids), `llm` (`extractVenueAmenitiesFromText` in `_shared/ai-enrichment.ts`, constrained to vocab, circuit-broken `llm.openai.amenity-extract`; amenities auto-apply ≥0.8, **accessibility ALWAYS review-gated** — never auto-published, a wrong access claim is real-world harm). Schema (migration `20260608110000`): `venue_quality_signals` ledger, `venue_review_queue` + `approve_venue_review`/`reject_venue_review` RPCs (array-union into the column on approve), `venues_due_for_amenity_backfill(limit)` selector (empty-first); reuses `venue_field_provenance`/`venue_consensus_audit`. Deliberately stores **no** recomputed score on venues — `trg_search_documents_venue` fires on every UPDATE, so a 32k-row nightly write would storm the search sync (disk-constrained DB); the selector ranks by `cardinality(amenities)` and the admin panel counts live. Daily extract+LLM sweep cron `amenity_truth_backfill` (`15 4 * * *`, batch 60) cleans (free) and mines descriptions for amenities (auto ≥0.8) + queues accessibility for review (LLM daily-cap 80 bounds spend); weekly read-only `run_amenity_coverage_summary` health pulse. Consensus: `amenities`/`accessibility_attributes` added to `VENUE_FIELDS` (`_shared/venue-consensus.ts`, array union). Admin at `/admin/content/venue-quality` (`AmenityQualityPanel` + `VenueReviewQueue`). Frontend: `AmenityDisplay` (vocab-driven lucide icons via `src/lib/amenityIcons.ts` + i18n, accessibility in its own prominent block) on venue + hotel detail; `VenueFilters` amenity facet now vocab-driven. **First cleanup pass (2026-06-08): 945 venues, 2,020 → 33 distinct values, 0 non-canonical, 201 pure-noise venues correctly emptied.**

**Profile settings (redesigned, 2026-06-11):** `/profile/settings` is a hub-and-sheets page (no tabs): live `IdentityPreviewCard` (tap-to-edit + public/community/private lens) + ONE gap-driven prompt card (username claim > default avatar > pronouns) + summary cards opening bottom `Sheet` editors + review-only `PreferencesMirrorCard` (prefs are CAPTURED in context — `TravelPrefsPrompt` sheet on /trips, vibes in `/onboarding/search`; settings only clears). Design doc: `docs/plans/2026-06-11-profile-settings-redesign-design.md`. **Username v2** (migration `20260612160000`): mandatory rollout, 3-20 lowercase `a-z 0-9 . _`, `username_key` (separators stripped) blocks lookalike-handle impersonation, `reserved_usernames` (routes/brand/impersonation only — deliberately NO reclaimed-identity terms), `change_username` RPC (claim free; once/12mo + 90-day `username_redirects`; auto-assigned handles get one free change), `admin_change_username(.., p_with_redirect=false)` safety fast-track gives NO redirect (deadname linkability is the threat), `auto_assign_usernames` registered DISABLED in `admin_automations` — enable at T+60. **Avatar mandatory-without-walls**: deterministic neutral builder-config backfill (`20260612160200`, `avatar_auto_assigned` flag → settings nudge), 3-path `AvatarChooser`: upload (react-easy-crop → 512px webp client-side), unavatar import via `workers/image-cdn` `POST /avatar/resolve` (JWT-gated proxy → R2 `avatars/unavatar/`, client NEVER talks to unavatar.io; gravatar/email source behind explicit consent checkbox), simplified 4-choice builder (full 16-control `AvatarBuilder` UI no longer reachable from settings; `AvatarSettings` deleted). **Pronouns**: ordered `pronoun_tags text[]` is the source of truth; `pronouns` text stays the derived display string so render sites are untouched (display rule: join first segments → "she/they"); per-field visibility `privacy_settings.pronouns_visibility`. **Occupation**: `profession-autocomplete` against the shared `professions` vocab; free text stored AS-IS, never auto-normalized (`occupation_freetext_candidates` view, service_role-only, manual promotion only). **Personal documents deprecated**: settings shows removal notice (T+30 = 2026-07-11), `DocumentsList readOnly` blocks new personal uploads; final deletion `scripts/data-quality/delete-personal-documents.mjs` (storage objects FIRST, then rows, verified, supports --dry-run); trip-attached docs unaffected. **Accessibility payoff**: `AmenityDisplay` shows "✓ matches your needs" badges (`travel_preferences.accessibility_needs` ∩ venue `accessibility_attributes`, mapping in `src/lib/accessibilityNeeds.ts`); unlisted needs render as honest absence-of-data; needs are never public.

**Payments:** Stripe via `create-checkout-session` + `stripe-webhook` edge functions.

**User submissions (Chrome extension):** `extension/` (MV3, React 19) extracts venues/events/hotels/marketplace/news from any webpage via JSON-LD/microdata/OpenGraph/DOM heuristics. `workers/submit/` (CF Worker) verifies user Supabase JWTs and stages into the same `ingestion_staging` table the scraper uses, with `source_type='user_submission'` — submissions flow through the existing normalize → dedupe → quality-score → review-gate → commit pipeline. Submitter columns + RLS added via migration `002_user_submissions`.

**Note:** `supabase/functions/` and `supabase/migrations/` at the repo root are the canonical locations.

## Repo stats

- **Edge functions:** 217
- **Edge functions:** 201
- **Migrations:** 624
- **Migrations:** 617
- **Migrations:** 610
- **Migrations:** 611
- **Migrations:** 602
- **Migrations:** 609
- **Migrations:** 603
- **Migrations:** 609
- **Migrations:** 600
- **Migrations:** 596
- **Migrations:** 601
- **Migrations:** 599
- **Migrations:** 581
- **Migrations:** 574
- **Migrations:** 575
- **Migrations:** 576
- **Migrations:** 572
- **Migrations:** 568
- **Migrations:** 564
- **Migrations:** 562
- **Migrations:** 555
- **Edge functions:** 204
- **Migrations:** 553
- **Edge functions:** 203
- **Migrations:** 548
- **Migrations:** 541
- **Migrations:** 547

## Infrastructure

- **Supabase:** project `xqeacpakadqfxjxjcewc` (eu-central-2)
- **Cloudflare Pages:** project `queer-guide` at `queer-guide.pages.dev`
- **CF Account:** `7aa3765cc5f50f2b681b782eb4a8d296`
- **Search:** **migrating Meilisearch → Postgres + Cloudflare** (plan: `docs/search-intelligence/meili-to-postgres-migration-plan.md`). Meilisearch (self-hosted, Infomaniak) still serves production by default; the Postgres engine is live and shadow-tested for cutover.
  - **Postgres engine (live):** denormalized `search_documents` table (weighted tsvector + `vector(1024)` HNSW embedding + PostGIS `geog` + facets/trust/liveness/price/temporal). RPCs: `search_hybrid` (RRF keyword+vector fusion in SQL, with target_groups filter + news-recency decay + vnn top-200 admission), `search_facets`, `search_autocomplete` (prefix + trigram), plus discovery RPCs (`get_recommendations`, `related_entities`, `find_duplicate_clusters`, `events_in_window`, `personalities_on_this_day`). Excludes `duplicate_of_id IS NOT NULL`.
  - **CF Worker:** `search-proxy` — `SEARCH_BACKEND` flag (`meili` default | `pg` | `shadow`). `pg` serves `/search` + `/autocomplete` from the Postgres RPCs; `shadow` serves Meili but logs a `search_shadow` comparison for cutover validation (analyze with `scripts/search-eval/shadow-analyze.mjs`). Rollout runbook: `docs/deploy/search-rollout.md`.
  - **Sync:** `meilisearch-sync` edge function (Meili); Postgres `search_documents` stays fresh via entity + `content_embeddings` triggers.
  - **Indexes (Meili):** venues, events, cities, countries, news, marketplace, personalities, tags, queer_villages
  - **Decommission (code-side complete, 2026-06-07):** the worker serves Postgres directly; the DB sync triggers/crons and the `meilisearch-sync` edge function are gone; `workers/search-proxy/src/meili.ts`, the `meilisearch/` ops dir, and `configure-meili.sh`/`meili-direct-resync.sh` are removed; the admin search-intelligence UI is Meili-free (dead `Index*`/`Consistency*` types dropped). `INDEX_MAP`/`ALL_INDEXES` live in `workers/search-proxy/src/entityIndex.ts` and are **active Postgres-side** entity-type→pg-type normalization (not Meili code, despite the name) — keep. Verified no live Meili cron/trigger/function/env ref remains; residual `meili` strings are only a shared `x-webhook-secret` default (`meilisearch-sync-webhook-2026`) in geocode/backfill functions — cosmetic, leave. **Only remaining task: the Infomaniak Meili node shutdown (external infra).**
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
- **DB migrations:** merged to `main` auto-apply via CI `db push` (history drift repaired 2026-06-10; remote `schema_migrations` == repo files). If applying early via MCP `apply_migration` (records history), commit the file with the SAME version — CI then skips it. Raw Management-API SQL does NOT record history → drift returns.

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
- NEVER reuse a 14-digit version across two files — duplicate versions break `db push` file↔history matching (34 dups renamed 2026-06-10, PR #1553)
- History repair: `supabase migration repair --status applied|reverted <versions>` from a checkout with all files + `supabase/.temp` link state. Pre-repair backup: `supabase_migrations.schema_migrations_backup_20260610`

### Frontend
- Path alias: `@/*` → `src/*`
- Vite manual chunks configured for: vendor, router, utils, graph, exceljs, maplibre, tiptap, HLS, PDF, mammoth, sentry, i18n

## Design

LGBTQ+ travelers, locals, activists, researchers, allies. Safety-first, inclusive by default, content is the hero.

- **Color:** monochrome base + one restrained brand accent. Black `--foreground: 0 0% 4%`, white `--background: 0 0% 100%`, plus grayscale steps (`--muted`, `--accent`, `--border`). **Brand accent (2026-06-17):** a single low-saturation berry `--accent-brand` (`330 45% 38%` light / `330 55% 62%` dark; `--accent-brand-foreground` flips per mode for AA) — used **only** for the active-nav indicator (Header dropdown, MobileBottomNav top-bar, Footer current page) and the `accent` Button variant (the one primary CTA per surface, e.g. homepage Join / Add-venue). It is the second permitted hue alongside `--destructive`. Do NOT spray it: default CTAs stay monochrome, `--primary` is unchanged, the legacy `brand` Button variant still renders black. (Supersedes the former "no brand magenta" rule.) ESLint (`no-restricted-syntax`) errors on hex/rgb/hsl literals outside allowlisted files; `accent-brand` utilities are token-based and pass.
- **Typography:** Inter for body/UI + **Space Grotesk** display face for large headings (2026-06-17). Both self-hosted woff2 (`public/fonts/inter/`, `public/fonts/space-grotesk/`); Plus Jakarta Sans removed. `--font-display` = Space Grotesk, applied to `h1`/`h2` + `.text-hero(-xl)` + the `.font-display` utility; `h3`/card titles and all body text stay Inter. Editorial size scale in `@theme` — `--text-hero-xl` (88px), `--text-hero` (64px), `--text-display` (40px), `--text-headline-lg` (32px), `--text-headline` (28px), `--text-title` (22px), `--text-body-lg` (17px), `--text-15` (15px), `--text-13` (13px), `--text-xs2` (11px), `--text-2xs` (10px), `--text-3xs` (9px). Always use a token; ESLint guards block arbitrary `text-[NNrem]` / `font-extrabold` in admin tree, warns in public.
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
- **Pride map canvas.** The `/map` MapShell renders a deliberate pride-spectrum palette **on the map canvas only** — `PRIDE_LAYER_COLORS` (`src/hooks/useExploreMapData.ts`) for markers + area circles, and a rainbow density-heat ramp in `src/components/map/ExploreMap.tsx` (gated by the `pridePalette` prop, passed by MapShell). Chrome (command bar, filter sheet, chips, popovers) stays strictly monochrome; legacy/embedded `ExploreMap` instances keep the neutral `LAYER_COLORS`. This is the one place the product expresses queer identity through color, on the same functional map-color exception already allowlisted for vector tiles. Markers are dots with a white halo (no text-on-color), so the WCAG pill-contrast rule doesn't apply; the layer-toggle pills (which would) are not rendered in MapShell. User-locked 2026-06-04 — live in production. Tune colors in `PRIDE_LAYER_COLORS` + the `pridePalette` heat ramp; do not bleed canvas color into chrome.

### Design System Files
- Tokens: `src/index.css` (Tailwind v4 `@theme` block — CSS variables; no `tailwind.config.ts`)
- Animation: `src/lib/animation.ts` (durations, easings, distances)
- Charts: `src/lib/chartPalette.ts` (monochrome recharts palette + stroke patterns; added Phase 3a)
- Components: shadcn/ui primitives in `src/components/ui/`. For monochrome status semantics use the `Badge` variants (the unused `StatusBadge` primitive was removed in the 2026-05-31 declutter; see `DECLUTTER_CANDIDATES.md`).
- Enforcement: `eslint.config.js` (color literals: error in public, warn in admin → error after Phase 3g; semantic radius warn; admin motion ban error)
