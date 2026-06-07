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

### Phase 1 — Deterministic backfill (free, biggest win)
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

### Phase 2 — Enforce trust gate + honest score
- Re-run `marketplace-relevance` (Claude Haiku) on the 157 unscored + 1,074 below-0.5.
  Below 0.5 → `status='inactive'` (reversible, not deleted); excluded from search.
- Replace `quality_score` with a real composite (pure-SQL recompute, mirrors
  `run_event_trust_recompute`):
  `has_desc·0.30 + has_image·0.25 + has_price·0.15 + relevance·0.20 + link_ok·0.10`.

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
