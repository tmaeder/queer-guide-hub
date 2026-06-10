# Marketplace Tagging & Categorisation — Design

**Date:** 2026-06-08
**Status:** Approved (brainstorming → planning)
**Scope:** `/marketplace` — revive identity/values axis, richer browse facets, fix taxonomy hygiene, feed search/recommendations.

## Problem (grounded in production)

13,842 active products. Categorisation is **one-dimensional and coarse**, and three of four UI filter axes are **empty shells**.

| Finding | Number |
|---|---|
| Active products | 13,842 |
| `category='products'` | 99.98% (only 3 services) |
| Real axis = `subcategory_slug` | **16 flat buckets**, adult-skewed (sex_toys 2931, apparel 2005, underwear 1758, bdsm 1676, hygiene 1403, fetish_wear 1244, jewelry 988, anal_toys 757, cock_rings 502, books_art 295, long tail) |
| `category_id` FK populated | **8 of 17,372** → `marketplace_categories` taxonomy table is dead |
| `community_owned_tags` | **0 of 17,372** → headline identity filter 100% empty, non-functional |
| `unified_tag_assignments` for marketplace | **0** → "Value Tags" + "Product Tags" filters return nothing |
| Subcategory assignment | **source-level mapping, not per-product** (ohmyfantasy→13 subcats, tomboyx→2) → cross-source inconsistency + misbucketing |
| `lgbti_relevance_score` | **per-source flat defaults** (ohmyfantasy 0.60, others 0.80), not real per-item signal |
| Brands | 312 distinct, 13,834 with brand (strong, underused signal) |
| Thin descriptions | ~22% |

**Ownership grain (critical):** `ohmyfantasy` (214 brands) and `misterb` (80 brands) are **aggregators** reselling mainstream wholesalers (Orion 1664, Dreamlove 813, Pipedream, Oxballs — NOT queer-owned). Queer-owned indies are the **single-brand sources** (TomboyX, Automic Gold, Ash + Chess, Super Gay Underwear, WeGan, Nothosaur). Ownership varies *inside* a source → must be detected **per-brand (312), not per-source (23) or per-product (13.8k)**.

## Approach

Blend of three: multi-axis facet model as the spine, data-first backfill to fill it, A-lite self-maintenance wrapper. Maximum data + browse win, minimum new scaffolding. Mirrors the existing Amenity/City/Venue Truth Engine house pattern.

## §1 — Multi-axis taxonomy (the spine)

Replace one flat axis with orthogonal axes:

| Axis | Stored as | Values | Source |
|---|---|---|---|
| Type | `category` (keep) | products / services | exists |
| Department | `subcategory_slug` (keep, re-derive per-product) | apparel, underwear, swimwear, jewelry, books_art, hygiene, **intimacy** (umbrella: sex_toys/anal/rings), bdsm_fetish, accessories | reclassify |
| **Content rating** | NEW `content_rating` | sfw / suggestive / adult / explicit | derived |
| Ownership | `community_owned_tags` (revive) | queer/trans/bipoc/women/disabled-owned, nonprofit | per-brand detect |
| Attributes | `unified_tag_assignments` (revive) | material (leather/silicone/cotton), occasion (pride/drag/wedding/everyday), vibe, body-area, vegan, size-inclusive | free-extract + LLM |

Highest-leverage move: **`content_rating`**. ~55% of catalog is explicit/fetish; without a safe-browsing axis the marketplace is unapproachable for the apparel/books/jewelry audience.

**Decision:** `content_rating` default behaviour = **default-SFW + opt-in toggle**. Marketplace lands on SFW + suggestive; sticky "Show adult" toggle reveals explicit/fetish. Single config flag, reversible.

## §2 — Backfill engine

**Revised 2026-06-10 (design re-opened on "how tags are derived"):** production sampling showed the original deterministic-text-first plan was flawed — **53% of the catalog (ohmyfantasy, 7.3k products) is German**, and its `marketplace_listing_sources.raw->>'product_type'` carries exact per-product merchant categories ("Vibratoren", "Gleitgel", "Analplugs", "Kleid", ~550 distinct labels). English regexes would have no-oped on most of it, while the merchant's own type field is ground truth for free. misterb's per-product `category` is boilerplate (all `fetish_gear`). The engine is now an **evidence ladder** (mirrors venue-consensus trust weighting: source > extract > llm):

- **Tier 1 — merchant truth (free, conf 0.95):** `classifyMerchantType()` in `_shared/marketplace-normalize.ts` — ~60 German+English stem rules over the short merchant type label (not free text), collapsing the ~550 labels into the canonical fine vocab. Auto-applies; fixes `subcategory_slug` → `content_rating` + `department` generated cols for free.
- **Tier 2 — text extract (free):** `classifyDepartment()` keyword rules (German+English) over title/desc, only where Tier 1 has no signal; attribute mining (material/occasion/vibe, German+English aliases) runs for every product. Default-reject.
- **Tier 3 — LLM gap-fill** (circuit-broken `llm.marketplace-tag`, daily-capped) — only products Tiers 1–2 left thin. Constrained to vocab. Attributes auto-apply ≥0.8; **content_rating downgrades (adult→sfw re-bucketing) always review-gated** (wrong-SFW is the harmful direction).

Original three passes (P0 ownership detect unchanged):

1. **Brand ownership detect** — new `marketplace_brands` registry (312 rows). Web-grounded LLM classifies each brand → ownership labels + confidence + citation. Single-brand sources seed trivially; mainstream wholesalers → none. **Trust gate: every queer/trans/BIPOC-owned label routes to review queue before publish** (false claim or erasure of queer ownership is the trust-sensitive case). Approved labels fan out to `community_owned_tags` on all the brand's products.
2. **Free re-extract** (zero cost) — reclassify `subcategory_slug` per-product from title/desc/brand into the new department vocab (replaces source-mapping); derive `content_rating` from department + keyword signals; mine material/occasion/vibe attributes literally present in text → `unified_tag_assignments`. Auto-applies. Also re-scores `lgbti_relevance_score` per-item (kills the flat-default problem).
3. **LLM gap-fill** (circuit-broken `llm.marketplace-tag`, daily-capped) — only products the free pass left thin. Constrained to vocab. Attributes auto-apply ≥0.8; **content_rating downgrades (adult→sfw) always review-gated** (wrong-SFW is the harmful direction).

## §3 — Self-maintenance (A-lite)

- Daily `marketplace_tag_backfill` cron (batch ~150), empty-first selector `marketplace_due_for_tagging(limit)` — clone of `amenity_truth_backfill`. New ingested products tagged within a day.
- Reuse review-queue pattern: `marketplace_review_queue` + `approve_/reject_` RPCs cloned from venue/amenity shape.
- **No stored recompute score on `marketplace_listings`** — it fires a search-doc trigger; nightly 13.8k writes would storm the disk-constrained sync (the Amenity-engine gotcha). Selector ranks by `cardinality(tags)`; admin counts live.

## §4 — Frontend

- Revive the 3 dead filter axes (ownership, value-tags, attributes) — UI exists, returns nothing today.
- Add `content_rating` toggle (default-SFW) + occasion chips (Pride / Drag / Wedding / Everyday) in the `marketplace_collections` chip slot.
- Department facet → new umbrella vocab (intimacy groups the 3 adult buckets so SFW browse isn't adult-dominated).

## §5 — Sequencing

- **P0 — SHIPPED 2026-06-08** (migrations `20260608200000` + `20260608200001`). `marketplace_brands` registry (306 brands) + register/approve/reject RPCs (queer/trans/BIPOC require `p_confirm`) + storm-safe `run_marketplace_ownership_apply` cron. Seeded 7 well-documented queer-owned indies → 2,434 products tagged. Ownership filter verified live: "Queer-owned" = 2,434 (was 0). 299 brands remain `pending` for the admin review panel + later web-LLM detection.
- **P1a — SHIPPED 2026-06-08** (migration `20260608210000`). `content_rating` STORED generated column (sfw/suggestive/adult/explicit) from a pure derivation fn — fixes the broken `sensitivity_flags` adult signal (whole departments were unflagged). Default-SFW browse + persisted 18+ opt-in toggle wired into `useMarketplace` (both query branches) + `MarketplaceFilters`; `isAdultListing` now reads `content_rating`. Distribution sfw 27.5 / suggestive 14.1 / adult 11.4 / explicit 47.0; default browse = 5,759 products.
- **P1b — SHIPPED 2026-06-10** (migrations `20260609000000` + `20260610010000` + `20260610010001`). Evidence-ladder engine (§2 revision): `_shared/marketplace-normalize.ts` (Tier-1 `classifyMerchantType` German+English stems over `raw->>'product_type'`; Tier-2 `classifyDepartment` text rules + material/occasion/vibe alias mining, German-aware; per-item relevance) + `marketplace-tag-backfill` edge fn (X-Webhook-Secret `marketplace_tag_webhook_secret`) + namespaced attribute vocab in `unified_tags` (`mat-`/`occ-`/`vibe-`, 41 terms) + `department` STORED generated umbrella column + `tagged_at` resume marker (NOT `classified_at` — that belongs to classify-relevance-backfill) + German keyword hardening of `marketplace_content_rating` (rebuilt column). **Safety invariant: ANY re-categorisation that lowers content rating — even merchant-truth — routes to `marketplace_review_queue`** (a latex "Kleid" must not auto-downgrade to SFW apparel); upgrades/same-rank auto-apply. Backfill driver `scripts/data-quality/tag-marketplace.mjs`.
- **P2 — SHIPPED 2026-06-10.** Department facet (select + umbrella tiles + `/marketplace/category/<department>` routing), attribute chip facets (Material/Occasion/Vibe riding the tags pipeline), occasion chips (`?occ=` param) merged into `OccasionChips`, department label on cards, `ADULT_CATEGORY_SLUGS` fixed (was missing bdsm_and_bondage/fetish_wear/anal_toys… — those category pages were un-gated).
- **P3 — SHIPPED 2026-06-10.** Daily extract cron `marketplace_tag_backfill` (`45 4 * * *`, batch 150) + weekly LLM cron `marketplace_tag_llm` (`0 5 * * 0`, batch 20 — 40-item LLM batches blow the pg_net timeout, migration `20260610120000`) + weekly `marketplace_tag_coverage_summary` — all via `run_*` wrappers so the admin enabled-toggle pauses them. Admin at `/admin/content/marketplace-quality` (`MarketplaceTagQualityPanel` + `MarketplaceReviewQueue`).
- **Operations pass — 2026-06-10.** Initial backfill: 13,950 processed / 2,162 re-typed / 17,775 attribute assignments (0 → 9,401 products) / 4,501 relevance re-scores. Review queue (1,152) fully triaged with a deterministic policy: approve if post-change rating stays 18+-gated, or text clean of an extended residual-adult lexicon (incl. lacquer/pvc/vinyl/slave/pinwheel); reject extract-model Books/Jewelry false-positives and anything with residual markers → 570 approved, 582 rejected (rejection = keep current = over-gating, the safe direction). Brand queue: 35 certain mainstream wholesalers rejected (Orion/Dreamlove/Pipedream-class); 10 brands approved `queer_owned` after web-grounded research with first-party/major-press citations (Nasty Pig, Oxballs, Mister B ×5, Topped Toys, Cellblock 13, Sk8erboy) → "Queer-owned" filter 2,434 → **3,895 products**; inconclusive brands (Nothosaur, Mr. Hankey's) annotated and left pending; 254 small-tail brands remain pending for human review.

## Key files (from exploration)

- Schema: `supabase/migrations/00000000000000_baseline.sql` (marketplace tables 16574–16735; commit/category resolution 3185–3563)
- `supabase/migrations/20260524220000_marketplace_community_owned_tags.sql`
- `supabase/migrations/20260522163914_marketplace_facet_rpcs.sql` (subcategory_slug generated col + facet RPCs)
- `supabase/functions/pipeline-normalize/index.ts` (243–247 category normalize)
- `supabase/functions/pipeline-quality-score/index.ts` + `_shared/marketplace-pipeline-utils.ts`
- `supabase/functions/classify-relevance-backfill/index.ts`
- `src/pages/Marketplace.tsx`, `src/components/marketplace/MarketplaceFilters.tsx`, `src/hooks/useMarketplace.tsx`

## Reference patterns to clone

- Amenity Truth Engine (vocab + free-extract + LLM gate + review queue + daily cron + no-stored-score) — `_shared/amenity-normalize.ts`, `amenity-truth-backfill` edge fn.
- City/Venue review-queue + approve/reject RPC shape.
