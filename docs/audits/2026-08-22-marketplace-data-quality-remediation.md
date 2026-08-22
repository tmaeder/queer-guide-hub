# Marketplace Data-Quality Remediation (2026-08-22)

Follow-up to the read-only [2026-08-21 audit](./2026-08-21-marketplace-data-quality.md), plus an independent measurement pass over categorisation, descriptions, images, relevance, relations and link health. All numbers measured live against prod (61,627 active listings, ~41 sources).

## What was found (delta vs. the 08-21 audit)

| Dimension | Measured | Action shipped |
|---|---|---|
| `department='other'` | 14,849 (24.1%) — classifier reads only `subcategory`, never learned ~30 newer sources' vocabulary (DE/ES/IT categories, cami/skirt/bra/binder, maker home goods); 6,303 NULL subcategories can never classify | Classifier v2: extended vocabulary + **title fallback** via 2-arg `marketplace_subcategory_group(subcategory, title)`; new `home` department (`home_goods` group). Simulated on prod: other → **2,507 (4.1%)** |
| `content_rating` false negatives | 188+ German toys rated `sfw` (audit: "Vibrationskugel", "Penisextender", "Fingerstimulator") — a live Safe Mode hole | Rating vocabulary extended (`vibrat`, klitoris/clitoris, stimulator, love egg, g-spot/g-punkt, …); STORED column regenerated; flipped rows **deleted from search_documents** in the same migration (the indexer never deletes newly-ineligible rows on its own) |
| Descriptions | 12,560 rows share 422 boilerplate spec-sheet templates; 2,145 thin; 1,650 empty (591 = salzgeber-buch) | `marketplace_enhance_queue` + claim RPC (boilerplate → thin → backlog); the */5 enhance cron un-pinned from `ohmyfantasy.com` |
| Images | 91% of listings serve from R2 via `image_asset_links` (the 08-21 audit's 94.7% figure measured the *other*, starved `marketplace-image-mirror` path — user-facing delivery is healthy); **alt text 0/73,826** | Deterministic alt-text backfill (title — brand) for all marketplace assets, `alt_provenance='derived:listing_title'`; fill-if-empty |
| Relevance | 10,834 rows frozen at the 0.6 trust-stamp default; prune hardcoded to `ohmyfantasy.com` (0 of the 770 sub-gate rows are on it); part of the sub-gate cohort carries scores from the pre-06/2026 miscalibrated model | Rescore cron weekly→nightly (600/night); prune generalized to all domains **but gated on a fresh verdict** (`classified_at` within 45d) so stale miscalibrated scores can't archive real queer shops |
| Relations | `merchant_id` NULL on 100% (domains resolve once `www.` is stripped; salzgeber disambiguated via `source_type=slug`); 4,322 pending brands are mostly **book authors**; 12 marketplace guide picks total | merchant_id backfilled; brand queue triaged (3,874 authors rejected with note, 102 real merch brands approved page-only, ~350 left for humans); 7 department shortlist guides seeded at `status='review'` (nothing self-publishes) |
| Link health | 46,551 (75%) never checked at 200 serial probes/day; meanwhile feed-synced rows (Shopify `products.json`) are re-proven live hourly | Feed presence credited as liveness (7,879 rows stamped from `last_seen_at`); checker excludes feed-fresh rows, probes with bounded concurrency, batch 200→400 |
| Search | 42,049 indexed; the 19,578 "missing" are all explicit/adult — **by design**, not a bug | none needed |
| Governance | none — every regression above accumulated silently | Nightly `run_marketplace_quality_snapshot()` → `marketplace_quality_snapshots`; admin panel (Quality Hub → Marketplace) shows latest + delta |

## Shipped artifacts

- Migrations `20260916120000`–`20260916120500` (classifier v2 + regen, merchant_id, alt text, quality ops, snapshot governance)
- Edge fns: `marketplace-description-enhance` (queue-driven), `marketplace-relevance-rescore` (600/night), `marketplace-link-checker` (feed-aware + concurrent)
- Frontend: `src/lib/marketplaceTaxonomy.ts` (home department, film/calendars groups surfaced), `MarketplaceQualityStatsPanel` on `/admin/quality`

## Shortlist guides: reviewed and published (2026-08-22, later same day)

The seeded picks were ranked by `boutique_score` alone, and that is **not an editorial
shortlist** — it ranks by merchant. Measured on the seeded rows: jewelry was **100% one
brand** (Automic Gold), books/art and underwear **92% one brand**. Re-picked with three
rules, applied as data (no schema change):

1. **Max 2 picks per brand**, where brand identity is normalized
   (`lower(regexp_replace(split_part(brand,'|',1),'[^a-zA-Z0-9]','','g'))`) — without that,
   `TomboyX`/`tomboyx` and `WEGAN`/`WeGan` each defeat the cap as separate brands.
2. **Queer-owned brands first**, then `boutique_score`.
3. **The title must positively match the department's own vocabulary.** A blocklist was
   tried first and leaked: socks in *Swimwear*, a mesh crop top in *Jewelry*, nipple clamps
   in *Hygiene & Care*, and a bicycle mudguard in *Books & art* (it matched "comic").
   Requiring positive evidence is what removes them. `department` stays as-is for browsing —
   the stricter bar applies only to curated picks, which is an editorial artifact and can
   demand more.

Also excluded: gift cards/vouchers/samples, out-of-stock, imageless, and anything not
`sfw`/`suggestive`.

**Published (5):** apparel, underwear, swimwear, jewelry, books_art — each 12 picks,
6–8 distinct brands, max 2 per brand, 8–12 of 12 queer-owned, 0 gated/out-of-stock/imageless.
Verified live: published slugs return 200, held slugs 404, JSON-LD `Article` carries the dek.

**Held in `status='review'` (2):** `hygiene` and `home`, each with a `meta.hold_reason`.
Hygiene's eligible pool is dominated by intimate/anal-care products with **zero** queer-owned
brands clearing the bar — that is a legitimate retail category but a different editorial
frame, and the tone call belongs to a human. Home is thin (373 listings, 29 brands, only 3
queer-owned) and mostly generic dropship beach towels.

## Deliberately NOT done

- No venue/city relations on listings (Business Spine: address/geo stay per-location; products inherit through org).
- No auto-approval of `ownership_tags` (queer-owned claims stay human-gated). Guide publishing
  was a reviewed human-triggered action, not automated — nothing in the pipeline self-publishes.
- `marketplace-image-mirror`'s `image_hashes` starvation left as-is for now — the `image_asset_links` path serves 91% of listings; consolidating the two mirror pipelines is follow-up work.
- `category_id`/`marketplace_categories` (11/69,738 populated) left untouched — retire-or-wire decision deferred.
- `marketplace_price_history.price_usd` backfill deferred (analytics-only impact).

## Verification queries

```sql
-- department distribution (expect other ≈ 4%)
select department, count(*) from marketplace_listings where status='active' group by 1 order by 2 desc;
-- Safe Mode: flipped rows out of search
select count(*) from search_documents sd join marketplace_listings m on m.id=sd.entity_id
 where sd.entity_type='marketplace' and coalesce(m.content_rating,'sfw') not in ('sfw','suggestive');  -- 0
-- merchant link
select count(*) from marketplace_listings where status='active' and merchant_id is null;  -- ~0
-- alt text
select count(*) from image_assets where source='marketplace_pipeline' and (alt_text is null or alt_text='');  -- ~0
-- snapshot exists
select taken_at, stats->>'dept_other' from marketplace_quality_snapshots order by taken_at desc limit 1;
```
