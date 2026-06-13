# Venue Tag Controlled Vocabulary — 2026-06-13

Applied the Amenity Truth Engine treatment to `venues.tags` (the amenity cleanup
of 2026-06-08 fixed `venues.amenities` but never touched `tags`).

## Problem

`venues.tags` (text[]) rendered as clickable `/resources/{tag}` chips on the venue
detail page. It held uncontrolled TripAdvisor scraper noise:

- **2,144 distinct values** across 4,370 venues, max **117 tags** on one venue.
- Food ingredients (`bacon`, `cauliflower`, `corn-dogs`, `eggs`, `salads`),
  atmosphere adjectives (`casual`, `trendy`, `crowded`, `spacious`), source names
  (`misterbandb` ×312), geography (`park`, `river`, `town`, `city`), and
  `good-for-*` / `*-food` boilerplate — all producing low-value resource pages.

Example: `hi-tops` had 52 tags including `bacon`, `cauliflower`, `corn-dogs`,
`casual`, `trendy`, `crowded`.

## Fix (migration `20260613120000_venue_tag_controlled_vocabulary.sql`)

1. **Vocabulary** — extended the single controlled vocab `public.amenities` with a
   new `kind='venue_type'` (30 venue categories: gay-bar, sauna, brewery, …) that
   only live in tags because `venues.category` is 30k rows of `'other'`. Reuses
   the existing `kind='queer'` markers.
2. **Normalizer** — `normalize_venue_tags(text[])`: slugify → alias → keep iff the
   canonical slug is in the queer ∪ venue_type vocabulary, **default-reject**
   everything else. Mirrors `_shared/amenity-normalize.ts` alias maps.
3. **Backfill** — `run_venue_tag_cleanup(batch)`: reversible (raw snapshot into
   `enrichment_status.tags_cleanup`), idempotent (only touches rows differing from
   the normalized fixed point), batched ≤300 (`trg_search_documents_venue` fires
   per UPDATE; the DB is disk-constrained). Driver: `scripts/data-quality/clean-venue-tags.mjs`.
4. **Perpetual guard** — wired `normalize_venue_tags()` into
   `commit_venue_staging_item` (the single ingest write-gate) so scraper noise can
   never re-enter on insert or update. Admin edits stay free-form (trusted).

The TS engine's `QUEER_ALIASES` gained the bare-handle forms (`lgbtq`, `lgbt`,
`lgbtqia`, `queer`, `gay` → `queer-friendly`) to stay in sync with the SQL vocab.

## Result

| metric | before | after |
|---|---|---|
| distinct tag values | 2,144 | **37** |
| max tags on one venue | 117 | **9** |
| venues with >16 tags | 360 | **0** |
| venues cleaned | — | 3,590 |
| dropped terms | — | ~15,000 |

All 37 remaining values are controlled vocabulary (queer markers + venue types);
zero noise. `hi-tops`: 52 → 5 (`bar`, `gay-bar`, `gym`, `sports-bar`, `queer-friendly`).
