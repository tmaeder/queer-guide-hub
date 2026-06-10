# World Bank / open-data dataset disposition (venues)

**Date:** 2026-06-08
**Scope:** `public.venues` (Supabase `xqeacpakadqfxjxjcewc`)
**Migration:** `archive_worldbank_dataset_nonvenues`

## Problem

137 rows in `venues` were not physical venues — they were **World Bank Open Data
catalog dataset names** mis-ingested as venues (e.g. *World Development Indicators*,
*Global Financial Development*, *IBRD Statement of Loans*, *Millennium Development
Goals*, *MIGA Project Portfolio*). Each carried a long encyclopedic description, so
they ranked high in description-length / keyword search queries and surfaced in the
public venue directory. 44 of them even carried bogus coordinates that placed them on
the map.

## Identification (precise filter)

All 137 share `data_source='unknown'`, `category='other'`, `sync_status='manual'`,
no phone, no tags, `address` = the dataset title, and were created in a single
ingestion minute (`2026-04-26 07:58 UTC`) — but that minute also holds ~11,855
legitimate venues, so timing was **not** used as the discriminator. The reliable
signal is the data-portal provenance:

```sql
data_source = 'unknown'
AND (
     website ILIKE '%worldbank.org%'   -- 128 (databank/finances/go/data/... subdomains)
  OR description ILIKE '%world bank%'   -- +1 (MIGA, miga.org) +6 (null-website datasets)
  OR website ILIKE '%haitidata.org%'   -- World Bank / GFDRR open-data portal
  OR website ILIKE '%agidata.org%'     -- World Bank Actionable Governance Indicators
)
```

Breakdown of the 137: 128 `*.worldbank.org`, 2 World Bank-family portals
(haitidata.org, agidata.org), 1 miga.org, 6 null-website datasets identified by
"World Bank" in the description. A sweep for other open-data portal domains
(imf/oecd/un/who/opendata/catalog/stats) found **no** further siblings. Every name was
manually confirmed to be a dataset, not a place — **0 legitimate venues caught**.

## Disposition (reversible, mirrors Personhood Disposition)

Soft-removed, never hard-deleted:

- `review_status = 'archived'`
- `seo_indexable = false`
- `needs_attention = false`
- Restore snapshot written to `enrichment_status.disposition` (prior `review_status`,
  `seo_indexable`, `needs_attention` + reason + `batch='worldbank-open-data-2026-06-08'`).

The migration also taught `search_documents_index_venues()` to exclude
`review_status='archived'` (additive — 0 venues were archived before this pass), so
archiving a venue now evicts it from `search_documents` and keeps it out
(self-maintaining). The public venue read hooks (`useVenues` directory + count,
`useVenuesV2Data` featured/editors, `useViewportPoints` map, `useTripSuggestions`,
`useTripBookingAssistant`, `useResourceTopic`, venue detail in `usePageFetchers`) now
filter out archived rows; admin hooks intentionally still show them for restore.
(`useRecentVenues` already excluded `category='other'`; `useCitiesDirectory` already
filtered `review_status='approved'`; `useTags` reads only `tags`, of which these have
none.)

## Before / after

| Metric | Before | After |
|---|---|---|
| Dataset rows in `venues` | 137 | 137 (archived) |
| …with `review_status='archived'` | 0 | 137 |
| …with `seo_indexable=false` | 0 | 137 |
| …present in `search_documents` | 137 | 0 |
| Global archived venues | 0 | 137 |
| Legitimate venues affected | — | 0 |

## Restore

```sql
-- Restore one or all from the snapshot (search re-indexes via the venue UPDATE trigger):
UPDATE venues v
SET review_status  = COALESCE(v.enrichment_status->'disposition'->'restore'->>'review_status','approved'),
    seo_indexable  = COALESCE((v.enrichment_status->'disposition'->'restore'->>'seo_indexable')::boolean, true),
    needs_attention= COALESCE((v.enrichment_status->'disposition'->'restore'->>'needs_attention')::boolean, false),
    enrichment_status = v.enrichment_status - 'disposition',
    updated_at = now()
WHERE v.enrichment_status->'disposition'->>'batch' = 'worldbank-open-data-2026-06-08';
```
