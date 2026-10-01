# Marketplace overview quality gate

**Date:** 2026-10-01  
**Status:** Approved

## Goal

Marketplace vouchers and listings without a presentation-quality product image must never appear on public overview or front-page discovery surfaces. They may remain addressable on detail pages and in user-selected private/personal lists.

## Scope

The gate applies to:

- the homepage marketplace spotlight and rail;
- `/marketplace`, filtered browse, categories, brands, makers, and collections;
- editorial hero/curated rows and contextual marketplace rails;
- marketplace counts and facets shown beside those results;
- marketplace search documents/results and maker cover selection.

Wishlists and explicit shared lists preserve the user's selected records. Marketplace detail pages remain accessible.

## Central contract

`marketplace_listings` receives cached overview-publication state:

- `overview_eligible boolean`;
- `overview_image_asset_id uuid` identifying the exact image approved for cards;
- `overview_exclusion_reasons text[]` for operations and auditability.

A single database refresh function computes these fields. Listing mutations, image-link mutations, and relevant image-asset mutations refresh affected listings. A batch refresh backfills existing rows.

An overview-eligible listing must:

1. be active and not a duplicate;
2. not be a voucher, gift card, store-credit product, coupon code, or equivalent non-product offer;
3. have a linked overview image that is active, unflagged, publicly accessible, successfully optimized, and not failing health checks;
4. have known dimensions of at least 600 px on both axes;
5. use a product-suitable role/category rather than a logo, colour chip, typography sample, template, or guideline asset.

The selected asset is deterministic: prefer a qualifying `cover`, then the lowest link sort order and stable asset id. Cards on governed surfaces use this exact asset for optimized, thumbnail, and original fallbacks, so an approved listing cannot fall back to an unapproved `images[0]` URL.

Voucher detection is deterministic and conservative. It normalizes title/category/subcategory fields and matches product-denoting phrases such as gift card, e-gift card, voucher, gift certificate, store credit, coupon code, and Gutschein. Word boundaries prevent unrelated products such as voucher holders from being excluded. Exclusion reasons remain visible for review and future manual correction.

## Enforcement

All discovery queries include `overview_eligible = true`. SQL browse/count/facet/brand-cover functions use the same predicate. The marketplace search indexer deletes or omits documents that fail it. Client-side filtering is only defensive; the database contract is authoritative.

Personal surfaces deliberately opt out rather than inheriting discovery behavior accidentally.

## Verification

- SQL postconditions prove no eligible listing is a voucher and every eligible listing has the selected qualifying asset.
- SQL postconditions prove representative bad assets fail for each reason: missing dimensions, undersized, flagged, failed optimization, unhealthy, or non-product category.
- Hook tests assert every public discovery query sends the eligibility predicate.
- Contract tests inspect all marketplace overview hooks/RPC definitions and fail when a new public surface omits the gate.
- Card tests prove governed cards use only the selected approved asset and never fall back to `images[0]`.
- Existing detail, wishlist, and shared-list tests prove explicitly exempt surfaces still resolve selected listings.

## Rollout and rollback

The migration adds columns and helpers, backfills in-place, updates public functions, and verifies invariants before completing. The frontend can deploy before the migration only after generated types include the nullable/defaulted columns; production rollout should apply the migration first so discovery queries do not reference absent fields.

Rollback removes the query predicates and restores the previous SQL function definitions. Cached eligibility columns can remain harmlessly in place for diagnosis; no listing or image is deleted or archived.
