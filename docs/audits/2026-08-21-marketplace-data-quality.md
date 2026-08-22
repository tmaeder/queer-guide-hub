# Marketplace Data-Quality Audit (2026-08-21)

Live, read-only audit against prod (`xqeacpakadqfxjxjcewc`). All counts below are measured via direct SQL against `marketplace_listings` (69,738 rows: 61,627 active / 8,111 inactive) and related tables, not estimated. No writes were made in this pass.

For scale context: the last marketplace pass (`2026-06-05-data-quality-audit.md`) measured 6,532 rows at 58% thin-description / 30% no-images. The catalog has grown **10.7×** since then, and core field completeness has improved dramatically (see Healthy baseline) — the pipeline hardening described in CLAUDE.md's marketplace section clearly worked for intake quality. This pass focuses on what that hardening did *not* reach: post-commit lifecycle, image delivery, and content-safety classification.

## Severity key
🔴 critical · 🟠 high · 🟡 medium · 🟢 healthy (reported for baseline)

## Findings

### 🔴 Image mirroring is silently starved — 94.7% of active listings never mirrored

**58,375 of 61,627 active listings (94.7%)** still point at external merchant CDNs (Shopify/WooCommerce/etc.) rather than the `marketplace-images` R2 bucket. Only 2,760 (4.5%) show a mirrored URL; 492 have no images at all.

**Root cause, confirmed by reading both sides of the interaction:**
- `marketplace-image-mirror`'s row selector (`supabase/functions/marketplace-image-mirror/index.ts:43`) is `images IS NOT NULL AND (image_hashes = '[]' OR image_hashes IS NULL)` — it treats "image_hashes already populated" as "already processed."
- Migration `20260429300000_marketplace_image_hashes_sync.sql` added a `BEFORE INSERT OR UPDATE OF images` trigger (`marketplace_listings_image_hashes_sync`) for an *unrelated* purpose (hash-based JOINs against `image_assets`) that unconditionally fills `image_hashes` with `{url, url_hash, sort_order}` entries on every write that touches `images` — which is every commit.
- Net effect: the moment a row is committed with its original (unmirrored) image URLs, the hash-sync trigger already marks `image_hashes` non-empty, so the mirror function's "needs mirroring" filter never matches it.

This isn't a 100%-airtight kill switch — 2,760 rows did get mirrored, and 2,740 of those were created *after* the trigger shipped (2026-04-29), which means some path around the guard exists (likely rows whose image URLs fail `canonicalize_image_url()` and leave `image_hashes` at `[]`). But the aggregate is a near-total, ~4-month-old failure of a pipeline stage that exists specifically to take marketplace imagery off third-party CDNs.

**Impact:** hotlinking risk to merchant sites, no format/CDN control (perf), and the stage's entire purpose (documented in CLAUDE.md as "parallel `marketplace-image-mirror` → R2/Storage bucket, SHA-256 dedup") is not happening for 19 out of 20 live products.

### 🔴 `content_rating` false negatives undermine Safe Mode

`content_rating` (STORED generated column, the canonical Safe Mode signal) rates products as `sfw/suggestive/adult/explicit`. Spot-checking `sfw`-rated rows from adult-leaning sources surfaced clear misses — sampled titles rated `sfw` include:

- *"Spirit - Vibrationskugel Premium"* (vibrating ball)
- *"MaleEdge - Penisextender Basic"* (penis extender)
- *"Intense - Damiano Wiederaufladbarer Fingerstimulator"* (finger stimulator)
- *"Baile - Love Eggs Butterfly Clitoris Stimulator"*

A conservative keyword regex (`vibrat|dildo|penisextender|clitoris|fingerstimulator|buttplug|masturbat|orgasm|love egg|cock ring|stimulator|...`) over active `sfw`-rated listings alone found **188 confirmed false negatives** — a floor, not a ceiling, since it only catches keywords already in the regex and misses paraphrases. The generated-column migration comments (`20260608210000_marketplace_content_rating.sql`) flag this exact risk ("German keywords, adult publications") — it's a known, still-live gap.

**Impact:** these render to users who have Safe Mode / adult-content filtering on, as ordinary safe-for-work products — the one thing `content_rating` exists to prevent.

### 🟠 Relevance gate protects intake, not the standing catalog

**770 active listings** carry `lgbti_relevance_score < 0.6` (the aggregator-tier reject threshold), spanning **28 distinct source domains** with an average score of ~0.09-0.17 in the worst cohorts (`nothosaur` avg 0.000, `teamm8` avg 0.040, `mrsleather` avg 0.020). None of these — **0 of 770** — sit on `ohmyfantasy.com`.

That last number matters: the one automated remediation for exactly this problem, `marketplace_prune_candidates()` (migration `20260702140000`), is hardcoded to `p_domains DEFAULT ARRAY['ohmyfantasy.com']`. It fully solved the problem for the one domain it was built for (0 of the 770 low-score rows are on it) but has no coverage for the 28 others that have since developed the identical issue.

Root cause of *how* these rows got low scores while committed as active: for the sub-0.5 cohort, **78% (592/761)** were classified *after* their `created_at` (median gap well over an hour) — i.e., a later relevance re-scoring pass (the prune migration's own comment references a "`marketplace-relevance-rescore`" step as a prerequisite) dropped their scores post-commit. The remaining 22% (169 rows) were classified at/near commit time yet still made it to `active` — a smaller, more direct gate concern. Either way, nothing downstream acts on a post-commit score drop for non-ohmyfantasy sources.

**Impact:** boutique/curated shop sources (which get a `0.75` trust-stamp by default — 7,335 active rows, 11.9%, sit exactly at that default) can still carry individual SKUs that are generic/non-LGBTQ-specific merchandise, and once trust-stamped or committed there's no mechanism to catch and remove them later except the one domain-specific prune job.

### 🟠 Link-checker backlog: 76% of the active catalog has never been checked

**46,713 of 61,627 active listings (75.8%)** have `link_checked_at IS NULL` — never probed by `marketplace-link-checker`. Of the checked minority, the oldest completed check is from **2026-06-06**, meaning roughly 2.5 months of a weekly, 200-row-batch sweeper has only reached ~15,000 of 61,627 active rows. At that cadence the backlog is not shrinking relative to catalog growth (69,738 rows now vs. 6,532 in June).

**Positive control check:** the demotion rule (`link_health='broken'` → `status='inactive'`) is holding correctly — 0 active rows carry `link_health='broken'`, so nothing is falling through that specific gap; the issue is purely throughput/coverage.

### 🟡 `category_id` is dead — 0.02% populated against a 267-row taxonomy

Only **11 of 69,738** rows have `category_id` set, despite `marketplace_categories` holding 267 defined categories. The resolution step inside `commit_marketplace_staging_batch` essentially never matches. This is lower-severity than it looks: the real, healthy browse taxonomy is the generated `department` (10 values) / `subcategory_group` (40 values) columns, and `completeness_score`'s "category" component reads the always-populated `category` text field (`products`/`services`), not `category_id` — confirmed by reading `run_content_completeness_recompute()` live, which is why `completeness_score` stays high (94.5% of active rows at 100/100) despite this gap. Net: `marketplace_categories`/`category_id` is dead weight — either wire up the resolver against the real taxonomy or retire the column/table.

### 🟡 `department='other'` overflow bucket is the single largest department

24.1% of active listings (**14,848 / 61,627**) land in `department='other'` — larger than any real department (`apparel` 14,377, `books_art` 9,686, `intimacy` 9,225, `bdsm_fetish` 5,302, `underwear` 4,983, `jewelry` 1,366, `hygiene` 1,357, `swimwear` 482, `services` 1). A quarter of the catalog isn't mapped into a meaningful browse department.

### 🟡 `marketplace_price_history.price_usd` is 100% null

All **109,410 rows** in `marketplace_price_history` have `price_usd IS NULL`. This is a documented-but-never-executed gap (the original migration only bulk-filled existing rows once; nothing backfills new inserts). Any USD-normalized price-trend analysis on this table is currently impossible — it only holds `price` in each row's original (mixed) currency.

### 🟡 Inactive-listing bookkeeping: 1,648 rows (20% of inactive) have no recorded cause

Of 8,111 `status='inactive'` rows: 3,570 are explained by `link_health='broken'`, 2,885 by `duplicate_of_id` (dedup merges), and only 8 by `archived_reason` (the prune job). That leaves **1,648 rows (20.3%)** inactive with none of those three markers set — no recorded reason they left the active catalog.

### 🟡 3,177 listings (4.6%) missing their source-provenance junction row

`marketplace_listing_sources` (the multi-source provenance table populated by `commit_marketplace_staging_batch`) has no row for 3,177 committed listings — a partial gap in the commit path's provenance-writing, though referential integrity is otherwise clean (0 orphaned junction rows).

## 🟢 Healthy baseline (confirmed clean, worth stating explicitly)

- **Pricing/FX integrity: fully clean.** 0 unrecognized currencies (all active-listing currencies resolve against `fx_rates`), 0 non-positive prices outside `price_type='free'`, 0 suspiciously large (>$1M) prices, 0 rows with `price` set but `price_usd` null.
- **Dedup integrity: fully clean.** 0 dangling `duplicate_of_id` references, 0 self-referencing rows, 0 rows marked as a duplicate that are still `active`, 0 duplicate `(source_type, source_entity_id)` pairs (the unique constraint is holding live).
- **Review queues: fully drained.** `entity_review_queue` (marketplace) has 0 open items (604 approved / 782 rejected historically). `dedup_review_queue` (marketplace) has 0 open pairs (397 superseded, 182 rejected).
- **Core field completeness is strong:** among active listings, only 2.7% lack a description, 0.8% lack images, 3.1% lack a brand, 0.1% lack a price — all a large improvement over the 2026-06-05 baseline.
- **`quality_score` distribution is healthy:** avg 87/100, floor of 40 enforced (0 rows below it), 0 nulls.
- **Merchant sync health is good:** 78 of 84 enabled merchants (93%) synced `ok` on their most recent run; only 5 in error, 1 never synced.
- **Schema drift confirmed:** the `content_warnings jsonb` column added by migration `20260330300000` does **not** exist on the live table — a real, harmless-but-real repo↔DB drift, noted for the record.

## Recommendations (not implemented this pass)

1. **Fix the image-mirror starvation first — it's the highest-impact, most clearly root-caused issue.** Either give `marketplace-image-mirror` its own status column/marker independent of `image_hashes` (e.g. a `images_mirrored_at` timestamp, or a distinct jsonb key the hash-sync trigger never touches), or have the mirror function compare against `image_assets`/R2 directly instead of relying on `image_hashes` emptiness as a proxy.
2. **Extend `content_rating`'s keyword coverage**, particularly German-language product terms (`Vibrationskugel`, `Penisextender`, `Fingerstimulator`, `Penisvergrößerung`) and common English toy-name patterns (`love egg`, `clitoris stimulator`) that the current classifier misses. Consider a periodic re-sweep of `sfw`-rated rows from historically-adult source domains rather than only classifying at ingest.
3. **Generalize `marketplace_prune_candidates()` beyond `ohmyfantasy.com`**, or replace the domain allowlist with a threshold-based sweep (`lgbti_relevance_score < 0.6 AND NOT featured AND NOT wishlisted AND brand not approved-owned`) so the 28 other affected domains get the same treatment. At minimum, re-run relevance scoring's downstream action (archive or re-review) whenever a post-commit rescore drops a row below threshold, not just at initial classification.
4. **Increase `marketplace-link-checker` throughput** (larger batch and/or more frequent cadence) — at the current weekly/200-row pace the checker cannot keep up with a 61k+ and growing active catalog; 76% coverage-never-checked is a real freshness gap for a marketplace where merchants routinely discontinue products.
5. **Either wire up `category_id` resolution in `commit_marketplace_staging_batch` against `marketplace_categories`, or drop the column/table** — right now it's a fully dead code path (11/69,738 populated) sitting alongside a healthy, actually-used taxonomy (`department`/`subcategory_group`).
6. **Investigate the `department='other'` bucket** (14,848 rows, 24.1%) — likely needs additional `marketplace_department()` mapping rules for whatever `subcategory` strings are falling through.
7. **Backfill `marketplace_price_history.price_usd`** the same way the original one-shot backfill did, then make future price-history inserts populate it directly (the commit RPC already computes `price_usd` for the parent row in the same transaction).
8. **Give the 1,648 unexplained-inactive rows a recorded reason** (or reactivate them if they're a bookkeeping accident) — an inactive row with no `link_health`, `archived_reason`, or `duplicate_of_id` is currently unauditable.
9. **Investigate the 3,177 listings missing `marketplace_listing_sources` rows** — likely an edge case in the commit RPC's upsert path worth a quick code read.

## Method notes

- All queries run live via direct SQL against prod; several were cross-checked with a second, differently-shaped query before being reported (notably the image-mirror root cause, which was confirmed by reading both the trigger migration and the edge function's selector, then verified against `created_at` timing; and the relevance-gate coverage gap, confirmed by joining against the prune function's actual domain allowlist).
- The session hit an intermittent tooling outage partway through (an external safety-classification service backing the DB-query tool was temporarily unavailable); all findings above were still fully measured after retrying — nothing here is estimated or inferred without a query behind it. Two originally-planned lower-priority checks (brand-level vs. listing-level `community_owned_tags` drift) were dropped from scope rather than guessed at.
