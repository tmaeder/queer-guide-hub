# Gays-Cruising one-time import design

**Approved:** 2026-10-05

## Goal

Import the complete approved-spot directory from `gays-cruising.com` into the
venue ingestion pipeline as safety-gated `cruising` venues.

## Rights boundary

The import relies on written consent recorded in
`docs/licences/gays-cruising-consent.md`. It is a one-time crawl and does not
enable or schedule `source-gays-cruising`.

Only factual fields are imported: source ID, name, coordinates, locality,
region, country, and backlink. User-authored descriptions remain excluded.

## Retrieval

1. Read the site's approved-zone sitemap index.
2. Use the Spanish sitemap set as the canonical ID inventory; the language
   sitemaps duplicate the same numeric spot IDs.
3. Fetch the public zone-info endpoint for each numeric ID with bounded
   concurrency, request timeouts, retries with exponential backoff, and a
   descriptive user agent.
4. Append one JSON object per ID to a gitignored JSONL checkpoint. A restart
   skips IDs already recorded, including terminal per-ID errors.
5. Write a crawl report containing counts and a SHA-256 checksum.

## Validation and import

- Require unique positive numeric source IDs.
- Report missing names, coordinates, locality, region, and country.
- Run the existing importer in report mode.
- Keep generic placeholder records out of staging.
- Quarantine records that name third-party businesses for editorial review.
- Keep descriptions off.
- Run a limited dry-run before staging the full eligible corpus.
- Drain validation, deduplication, and commit serially through the existing
  pipeline. Stop on the importer's validation, deduplication, or safety-gate
  checks.

## Alternatives considered

- Crawling HTML spot pages uses the existing parser but loses region data and
  has weaker country coverage.
- Enabling the edge source would require many batches, produce lower-quality
  records, and blur the boundary between this one-time import and a recurring
  crawler.

