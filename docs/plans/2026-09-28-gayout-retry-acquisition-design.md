# GayOut rejected-venue recovery

## Goal

Recover as many of the 14,069 GayOut venue candidates rejected for missing
address and coordinates as can be supported by factual, auditable evidence,
without publishing ambiguous or fabricated venue data.

## Acquisition order

1. Use a real browser to visit GayOut city and category pages and capture
   embedded venue collections plus relevant XHR/API responses. Prefer this
   city-level path because it covers many venues per request.
2. Open individual GayOut detail pages only for unresolved candidates, with a
   resumable cache, bounded concurrency, retries, and immediate backoff on
   Cloudflare challenges or rate limits.
3. For records still unresolved, corroborate identity and location against an
   official venue website and OpenStreetMap. Accept only high-confidence
   combinations of venue name, city, category, and location.

## Data boundary

- Import factual identity, controlled category, address, city, country,
  coordinates, phone, website, and source provenance.
- Do not copy GayOut or third-party reviews, ratings, photographs, or editorial
  descriptions.
- Retain evidence URLs and an acquisition method in metadata.
- Leave ambiguous candidates rejected with an explicit reason.

## Pipeline and verification

Recovered candidates re-enter the existing source-scoped validation,
deduplication, commit, and search-index pipeline. Reconcile the full 18,435-row
inventory to terminal dispositions, verify source links and data constraints,
then run focused tests, a production build, and production E2E checks across
representative recovered venues.

