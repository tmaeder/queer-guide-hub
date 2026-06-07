# Marketplace Truth Loop — Design

**Date:** 2026-06-07
**Status:** Approved (brainstorm), not yet implemented
**Owner:** tmaeder

Systematically improve marketplace content quality and fill missing data. Applies the
"Truth Loop" pattern already shipped for events and venues to `marketplace_listings`.

## Problem (production baseline, 2026-06-07)

6,454 active listings. `quality_score` averages **95.6** — but the score is decorative
and ignores the real gaps:

| Gap | Count | % |
|---|---|---|
| No / short description (<50 chars) | 3,767 | 58% |
| No image | 1,946 | 30% |
| LGBTQ+ relevance < 0.5 (served anyway) | 1,074 | 17% |
| Broken links | 75 | 1% |

### Source breakdown

| source_type | n | short_desc | no_image | avg_rel | note |
|---|---|---|---|---|---|
| ohmyfantasy | 3,211 | 3,211 | 0 | 0.60 | every listing short desc |
| misterb | 2,693 | 14 | 1,860 | 0.69 | 69% no image |
| forttroff | 329 | 329 | 0 | 0.12 | gate not enforced |
| supergayunderwear | 291 | 213 | 78 | 0.99 | clean |
| manual | 8 | 0 | 8 | 1.00 | hand-entered |

### Root causes

1. **Orphaned one-time dump.** The four real sources have **no live scraper or edge
   function** in the codebase — bulk-loaded once ~2026-04-26, never refreshed
   (`last_seen_at` maxes at 2026-04-26). The wired pipeline
   (`source-awin`/`source-shopify`/`source-etsy`) produces **zero rows**.
2. **Scrapers only captured title/price/image/url** — descriptions never grabbed.
3. **Relevance gate documented at 0.5 but not enforced** for these sources → 1,074
   low-relevance items live.
4. **`quality_score` is decorative** — doesn't reflect completeness (cf. the
   `lgbtq_score` default issue in earlier audits).
5. **Catalog monoculture:** 99% is `sex_toys` (3,138) + `fetish_gear` (3,019) +
   `underwear` (289). Books, apparel, pride, art, services: 1 listing each. Each source
   hardcodes one category — no real categorization.

### Key enabler

**100% of listings have an `external_url`** → every gap (description, image, liveness)
is re-fetchable from the source page. Most fills cost $0.

## Chosen approach

**Marketplace Truth Loop (hybrid pipeline rebuild)**, phased. Re-fetch from source
deterministically; use LLM only as a fallback; enforce the relevance gate on commit;
replace the decorative score with a real completeness composite; add diverse sources;
classify into a real taxonomy. Reuses proven event/venue Truth Loop infra.

Rejected alternatives:
- **A — deterministic re-fetch only:** great Phase 1, but doesn't fix trust,
  measurement, monoculture, or categorization.
- **B — LLM generation from existing fields only:** hallucinates product specifics,
  costs per row, can't fix the 1,946 missing images.

## Phases

### Phase 1 — Deterministic backfill + dead-source quarantine (free, biggest win)

**Execution finding (2026-06-07, live sampling 20/source):** the catalog is not
mostly "missing data" — **~54% is dead at the source**:

| source | live | dead at source | backfillable |
|---|---|---|---|
| ohmyfantasy | 3,211 | **100% hard 404** (store gone) | none |
| forttroff | 329 | **~85% soft-404** (site rebuilt) | none |
| misterb | 2,693 | 0 | ~60% images via JSON-LD |
| supergayunderwear | 291 | 0 | ~85% descriptions + ~40% images |

So `marketplace-enrich` does two jobs: **backfill survivors** (misterb images,
supergayunderwear desc+images from JSON-LD `Product`) and **quarantine the dead**
(hard 404 + soft-404 → `status='inactive'`, reversible). Live marketplace drops
6,454 → ~2,960 honest listings. Hard precision rules learned from live pages:
- description **only** from JSON-LD `Product.description` — og/meta on these stores
  is the store tagline ("Mister B is your one stop store…") or a soft-404 message;
  filling it would clone identical junk across thousands of rows.
- images filled only when a `Product` JSON-LD node proves a live product page
  (guards against soft-404 logo/placeholder images).
- soft-404 detection: HTTP 200 + "page does not exist" copy + no `Product` schema.

Implementation: `supabase/functions/marketplace-enrich/index.ts` +
`_shared/marketplace-extract.ts` (pure, unit-tested). Staleness-gated on
`link_checked_at` so reruns sweep forward and terminate.

#### Phase 1 RESULTS (executed 2026-06-07)

| metric | before | after |
|---|---|---|
| active listings | 6,454 | **3,510** |
| dead links quarantined | 0 | **3,022** (reversible `status='inactive'`) |
| active with description ≥50 | 42% | **84%** |
| active with image | 70% | **86%** |
| fully complete (desc+image) | — | **70%** |

What filled: **1,389 misterb images** + ~155 supergayunderwear desc/images +
supergayunderwear descriptions. What was quarantined: 2,685 ohmyfantasy + 271
forttroff + 26 supergay dead-URL listings.

**Operational findings (carry into Phase 4):**
- **misterb blocks Supabase edge egress (IP-based).** The edge function gets
  fetch failures; a residential IP gets HTTP 200. misterb backfill was run locally
  (Deno, concurrency 8, 0 failures) and written via the Management API query
  endpoint in 200-row chunks. Any future misterb refresh must NOT run from the edge.
- **misterb serves a `no-picture` placeholder as og:image** for imageless products
  — filtered out (`/placeholder|no-picture/`) so we never store fake images.
- **ohmyfantasy is NOT dead** — it had ~84% link-rot (handles changed) but ~526
  live products remain, and the store exposes a Shopify **`/products.json` feed with
  ~17,498 items** (full `body_html` descriptions, images, prices, current handles).
  supergayunderwear is also Shopify with `products.json`. forttroff has no feed but
  a `sitemap.xml`. → **Phase 4 should re-sync these from `products.json` rather than
  page-scrape**: it recovers fresh descriptions/images/URLs AND massively expands
  coverage. (Caveat: 17k more adult products worsens the monoculture — must run the
  relevance gate + categorization, Phases 2–3, on the feed.)
- **`images` is stored as empty array `'{}'`, not NULL** — selection filters must
  match both.

Remaining Phase 1 gaps (small, deferred): 464 misterb variant/bundle pages with no
JSON-LD image; 526 live-but-description-less ohmyfantasy (best fixed via products.json);
8 manual listings without images.

#### Original plan (mechanics, retained)
New `marketplace-enrich` worker. Selects listings where `description<50` OR
`images IS NULL`, re-fetches `external_url`, extracts:
- **description** ← JSON-LD `Product.description` → `og:description` → meta description
- **images** ← JSON-LD `image` → `og:image` → first product `<img>`, then mirror to R2
  via existing `marketplace-image-mirror` (SHA-256 dedup)
- **liveness** ← HTTP status → `link_health` via `_shared/link-health.ts` (`probeLink`,
  `isDeadLink`); only 404/410 = dead (avoid bot-wall false positives)

Batched ~300/run (search-trigger write load), idempotent on `payload_hash`.
Per-merchant extractor map for the 4 site shapes.
**Fixes:** 3,767 descriptions + 1,946 images + stale link-health. **Cost:** $0.

### Phase 2 — Honest score + calibrated relevance (DONE 2026-06-07)

**Honest quality_score (completeness, NOT relevance):**
`marketplace_completeness_score(desc≥50·30 + image·30 + price·20 + brand·10 + link_ok·10)`
— pure SQL (migration `20260607120000`), recomputed all rows (active avg **90.9**,
inactive 59.9), nightly cron `marketplace_quality_recompute`, registered in
`admin_automations`. The old score read a decorative 95.6 while 58% had no description.

**Relevance — re-scored, NOT gate-purged as originally planned.** The existing
`lgbti_relevance_score` was badly miscalibrated: it scored gay kink/fetish gear
("Pig Snout", "COLT Wristband", jockstraps, hanky-code laces) at 0.00 for not being
explicit pride themes. Enforcing the documented 0.5 gate would have deleted ~1,074
legitimate items. Instead built `marketplace-relevance-rescore` (edge fn, batch-25
LLM via `llmChatCompletion`, kink/brand-aware prompt in
`_shared/prompts/marketplace-relevance.ts`) and re-scored all 3,510 active.

Calibrated distribution: **2,477 high (≥0.8), 1,024 medium, only 9 below 0.4.** The
real off-topic set was 9 items (Safety Scissors, Carabiners, Football Socks, a USB
adapter), not 1,074 — those 9 were deactivated (`review_status='rejected_relevance'`).
Validated: "Topped Toys Deep Space" 0.00→0.80.

Deferred: the ingest-time relevance scorer still uses the old miscalibration; fix when
sources resume (Phase 4). No cron on the re-score yet (catalog static; no new items).

### Phase 3 — Real categorization
LLM classify (Haiku, batched) `title`+`description` → proper taxonomy (apparel, pride,
books, art, wellness, accessories, sex_toys, fetish_gear, services, …) + subcategory +
tags. Replaces hardcoded per-source category. Enables faceted browse/filter on frontend.

### Phase 4 — Break the monoculture (recurring sources)
Wire diverse **queer-owned** sources into the live pipeline:
- Revive dead `source-shopify`/`source-etsy`/`source-awin` with real queer-brand
  merchant lists (apparel, pride goods, books, art, jewelry)
- Re-home the 4 working scrapers into the recurring cron so they refresh, not rot
- Register all under the `marketplace-ingestion` DAG + daily cron (`0 4 * * *`)

### Phase 5 — Self-maintaining
- `marketplace_listings_due_for_refresh(limit)` selector
  (never-refreshed > broken > stale > low-quality), mirrors `venues_due_for_refresh`
- Nightly recompute cron + existing weekly `marketplace-link-checker`
- Catalog re-verifies itself — no more 6-week rot

## Sequencing rationale

P1 is free and fills the largest gaps immediately — shippable alone for instant value.
P2 makes the numbers honest. P3 unlocks browsing. P4 is the only ongoing-effort piece
(sourcing merchants). P5 prevents regression.

## Admin surface

Completeness + relevance + link-health columns and an enrich/refresh panel on the
marketplace admin view, mirroring `EventQualityPanel` on `/admin/events`.

## Reused infra

- `marketplace-image-mirror` (R2 + SHA-256 dedup)
- `marketplace-relevance` (Claude Haiku gate)
- `_shared/link-health.ts` (`probeLink` / `isDeadLink`)
- `marketplace-link-checker` (weekly link-rot sweep)
- Event/venue Truth Loop SQL recompute + `*_due_for_refresh` selector patterns
- `commit_marketplace_staging_batch` RPC, `fx_rates` / `price_usd`, `affiliate_partners`
