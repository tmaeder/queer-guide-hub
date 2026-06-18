# Venue Category Cleanup — Plan

## Context

The venue data-quality audit (2026-06-18) surfaced a bigger problem than missing
descriptions: **84.3% of live venues (20,150 of 23,913) sit at `category='other'`.**
The category field is free-text (no CHECK constraint) and effectively dead, which
breaks the things that depend on it — the `VenueFilters` category facet, map layer
grouping, and search facets all collapse into one meaningless bucket.

The `other` bucket is a mix of three things:
1. **Real venues mislabeled** — bars, saunas, clubs, cafés scraped (mostly Spartacus /
   unknown / TripAdvisor) and dumped as `other`. The dominant case.
2. **Naturist places** — 1,373 have a `venue_subtype` (Nude Beach 451, Naturist Resort
   392, bnb 311, Hot Spring 29) from the nude-places import; the real type is in the subtype.
3. **Events misfiled as venues** — ~1,023 names match pride/festival/parade/party/gala.
   These are the wrong entity type entirely.

This is higher-leverage than the description backfill: it restores filtering/browse for
every venue surface, and it's mostly deterministic (no LLM, no cost).

## Recoverable signal (measured on the 20,150 `other` venues)

| Source | Count | Reliability |
|---|---|---|
| Name keyword: bar/pub/tavern/lounge | 2,070 | high |
| Name keyword: club/disco/nightclub | 1,097 | high |
| Name keyword: cafe/café/coffee/bistro | 617 | high |
| Name keyword: sauna/spa/bath | 362 | high |
| Name keyword: shop/store/boutique/sex-shop | 154 | high |
| Name keyword: beach/park/cruising/forest/lake | 528 | med (→ outdoor/cruising) |
| Name keyword: hotel/hostel/guesthouse/b&b | 14 | high |
| Name keyword: pride/festival/parade/party/gala | 1,023 | med (→ event split, needs care) |
| `venue_subtype` set (naturist/bnb) | 1,373 | high |
| `tags` present (venue-type tags) | 1,738 | med |
| Source payload (`foursquare_data`/`tomtom_data`) | many | high where present |

Name keywords alone resolve ~5,900 (with overlap); + subtype + tags + source payload
realistically reclassifies **~8–10k** of the 20k deterministically. The long tail of
bare-name `other` (Spartacus stubs with no keyword) stays `other` honestly.

## Target category vocabulary

Reuse the existing live values as the controlled set (free-text today; this pass also
adds a soft guard): `bar, club, sauna, restaurant, cafe, hotel, shop, community_center,
theater, gallery, gym, organization, event-venue, outdoor, cruising, other`. (Adds
`outdoor` + `cruising` for the beach/park/naturist + cruising-spot reality; everything
else already exists.) Final vocab to confirm with one quick review before running.

## Plan

### Phase A — Deterministic reclassifier (no cost, reversible)
1. `scripts/data-quality/reclassify-venue-category.mjs` + a pure helper
   `_shared/venue-category-infer.ts` (unit-tested, default-keep) that resolves a category
   in priority order: **source-payload category → venue_subtype map → controlled
   venue-type tag → name-keyword map → keep `other`**. Mirrors the `clean-venue-tags.mjs`
   /`normalize_venue_tags` recipe already proven on `venues.tags` (see
   [[queerguide_venue_tags_vocabulary]]).
2. Write via batched UPDATEs **≤300/batch** (the `trg_search_documents_venue` storm on a
   disk-constrained DB — same constraint the description engine respects). Snapshot the
   old value into `enrichment_status.category_backfill` so the whole pass is reversible.
3. Run highest-confidence rules first (subtype, exact source category, unambiguous keywords
   like "sauna"); leave ambiguous multi-keyword names (`bar` AND `club` in the name) for a
   second, lower-confidence batch flagged `needs_attention` rather than auto-applied.

### Phase B — Event de-misfiling (careful, reversible)
4. The ~1,023 event-named rows are a different entity type. Classify with the existing
   `entity-type-classifier.ts`; for confident events, **reversibly soft-archive** them out
   of the venue surfaces (the Phase-1 `visibility→draft` + `review_status='archived'`
   convention, same as [[queerguide_personhood_disposition]]) and queue for migration into
   `events` — do NOT hard-delete. Ambiguous → `needs_attention`. This is opt-in: gate
   behind a confirm before it runs, since it removes rows from the venue list.

### Phase C — Backfill the new category facet
5. After reclassify, run `run_venue_quality_recompute` (already shipped) — category is a
   completeness input, so scores refresh. Verify the `/map` layer grouping and
   `VenueFilters` facet now show real distribution, not 84% other.

## Verification
- Before/after `category` distribution query (this plan's table) — target `other` from
  84% → ~55–60%.
- Spot-check 20 reclassified venues on prod: category matches the venue, no false bar→sauna.
- Confirm reversibility: `enrichment_status.category_backfill` holds the prior value;
  a single `UPDATE … SET category = enrichment_status->>'...'` restores.
- Watch `search_documents` sync lag + DB size during the batched writes.

## Open decisions (confirm before executing)
- Final category vocab (add `outdoor`/`cruising`? keep naturist under `outdoor`?).
- Whether Phase B (event de-misfiling) runs now or is deferred — it changes what's visible
  in the venue list, so it's the riskier half.
