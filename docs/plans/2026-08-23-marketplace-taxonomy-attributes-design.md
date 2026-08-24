# Marketplace: finer categorisation, attributes, variants, /tags strategy

Validated design (brainstorming 2026-08-23); implemented on
`claude/marketplace-categories-filters-4ea956`. Working notes and measured
evidence for each decision — the migrations carry the operational detail.

## Problem

The marketplace (~62k active listings) browsed on two tiers (10 `department`
→ ~40 `subcategory_group` generated columns). Product attributes — size,
colour, material, genre, fit, condition — existed nowhere as structured data,
though the raw source payloads retaining them were stored losslessly in
`marketplace_listing_sources.raw` (Shopify `options`/`variants` on ~44k rows).
Tags integration was partial: three attribute namespaces (`mat-`/`occ-`/`vibe-`),
a bespoke `ProductTags` chip, four hardcoded occasion chips, a plain-card Shop
rail on `/tags/:slug`.

## Approved direction

1. **Deepen the generated-column classifier** (v3) — no revival of the dead
   267-row `marketplace_categories` tree (frozen via COMMENT; drop is a
   separate coordinated PR).
2. **Attributes stored both ways** — `attributes` jsonb + GENERATED
   `sizes`/`colors` text[] on listings, mirrored as namespaced `unified_tags`
   (`color-*`, `size-*` alpha ladder only, `genre-*`, `fit-*`).
3. **Full variant model** — `marketplace_listing_variants`, per-variant
   size/colour/price/stock, fed by a batched runner from retained raw.
4. **All four /tags goals** — concept auto-tagging (products → tag pages),
   chip unification on `TagChipRow`, a real Shop rail, browse ↔ tags round-trip.

## Key decisions and their evidence

- **Fine tier = new nullable `subcategory_fine`**, never an in-place split of
  `subcategory_group` — existing URLs/facets keep working; NULL means "no
  finer evidence" and the UI falls back to the group tile. Dry-run yields:
  tops 90%, outerwear 97%, bottoms 75%, fetish_gear 59%, accessories 41%,
  books 6% (genre lives in descriptions → genre-* tags cover books).
- **`other` was already 4.0%** post-v2 (the 24% figure was pre-v2); v3 adds
  residual German/adult-niche vocabulary only. Sample diff: 19/4,000
  recovered, 0 regressions, 3 lateral moves — all corrections.
- **Attribute kind = slug prefix, never `unified_tags.category`.** The
  tag-category consolidation (20260919100000) rewrote `category` to glossary
  text; every category-keyed read matched ZERO rows on prod — the facet RPC,
  the tag-backfill vocab load, `marketplace_due_for_tagging`'s ordering
  signal and the browse Attributes accordion were all silently dead. All
  re-keyed. Known collision: `size-queen` (deprecated glossary tag), excluded
  by status filters everywhere.
- **Size vocabulary is two-layer**: `size-*` tags carry only the alpha ladder
  (xxs…5xl, one-size); numeric sizes (eu-38, w32) live in `attributes` /
  `sizes[]` and reach facets from the columns.
- **Variant RLS = plain public SELECT** — the 18+ gate is a client age
  opt-in, not auth; parent-gating on `content_rating` would break adult PDPs
  for opted-in anon users. Matches `marketplace_listing_sources.raw`.
- **Extraction is free and deterministic** (no LLM in the runner). Option
  axes resolve by NAME per position (measured names: Size 22,022 / Color
  13,724 / Größe / Farbe / Taglia / Colore / metal; "Title" is Shopify's
  single-variant placeholder and never an axis). Fixture fields validated
  against a real cherrykitten products.json payload (`available` exists,
  `inventory_quantity` does not on public endpoints).
- **Concept auto-tagging is exact-match only**: merchant tag strings vs
  active tag names/slugs + APPROVED aliases; never title substrings
  (alias-collision discipline), never sensitive tags.
- **Tag-filter semantics**: OR within an axis, AND across axes.
  `marketplace_browse_page` RPC does the AND-of-OR + full filter matrix +
  sort + pagination server-side (the client 5,000-id `.in()` path breaks on
  URL length at concept-tag scale — occ-everyday already has 2,644
  assignments).
- **Shop-rail SFW gate**: `get_tag_linked_content` had NO `content_rating`
  filter (confirmed live) — tag pages are un-gated, so this was a real leak
  path; fixed before auto-tagging multiplies rail content.
- **Colour swatches** are mode-independent literals (`--color-swatch-*` in
  `src/index.css`, the `--color-logo-plate` precedent) — a swatch depicts the
  MERCHANDISE and must not invert in dark mode; WCAG 1.4.1 satisfied by
  label + chip fill, the swatch is decoration; rainbow/multicolor label-only.
- **Attribute chips are filter-scoped, concept chips glossary-scoped**:
  "cotton" on a product → `/marketplace?tags=mat-cotton&dept=…`; "Leather"
  → `/tags/leather` with the glossary hover.
- **URL grammar**: `dept` → `grp` (subcategory_group) → `f` (fine), never
  overloading legacy `cat` (raw-merchant subcategory_slug links depend on it).
  Attribute selections ride `?tags=` as namespaced tokens; a numeric size
  token (`size-eu-38`) needs no tag row — the codec strips the prefix and the
  bare value hits the sizes[] column.

## Shipped pieces (migrations 20260926100000–100700)

A classifier v3 · B regen + attribute columns + fine-counts RPC ·
C variants table · D vocabulary + hygiene-regex extension + facet-RPC re-key ·
E runner cron (`*/5`, batch 300 — search-trigger cap) + selector +
due-for-tagging re-key · F attribute facets + `marketplace_browse_page` ·
G search facets + queue-based reindex · shop-rail RPC hardening.
Edge: `_shared/marketplace-attributes.ts` (+13 Deno tests),
`marketplace-variant-backfill`, `source-etsy` includes=Inventory.
Frontend: taxonomy mirror (GROUP_FINE/FINE_LABELS/ATTRIBUTE_FACETS_BY_DEPARTMENT/
SIZE_ORDER), tag-filter split lib, size/color grids, sheet sections,
contextual band chip, facet-driven band chips, FromTheGlossary teaser,
TagChip `to` override, ProductTags on TagChipRow, TagShopRail,
MarketplaceCategory fine row + URL-backed tags, VariantAvailability
(module 09's owner, finally renderable).

## Deferred

- Variant-price "From X–Y" range in the BuyBox (listing price stays
  canonical; divergence is rare and purchase completes on the merchant site).
- `marketplace_categories` drop (coordinated commit-RPC + client change).
- Stock-aware size filtering (`sizes_in_stock[]`) — offered-set semantics
  shipped first.
- Full i18n of colour/fit labels (tag names render untranslated today,
  consistent with every other tag surface).

## Verification targets

`department='other'` ≤ 8% · ≥95% shopify-sourced listings with ≥1 variant ·
≥60% garment departments with non-empty sizes · facet counts == filtered
query counts under the same adult gate · runner idempotent · anon
search_documents + tag rails carry zero adult marketplace rows · deep link
`/marketplace?dept=apparel&grp=tops` works.
