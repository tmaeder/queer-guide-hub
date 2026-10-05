# Planet Randy spots production import

Date: 2026-10-05

## Decision

Import every spot returned by Planet Randy's filtered English directory for
categories 46, 29, 30, and 28 into the production venue pipeline. The user
explicitly approved proceeding even though the site's current `robots.txt`
contains `Disallow: /`.

The implementation must make that exception visible and deliberate: crawling
requires an explicit `--acknowledge-robots-disallow` flag. Cached responses,
source identifiers, audit output, and pipeline provenance make the run
resumable and traceable.

## Source inventory

The filtered directory currently contains 143 result pages with ten entries
per full page. Listing cards expose a stable WordPress post ID, name, category,
address, coordinates, detail URL, phone, and thumbnail. Detail pages expose
schema.org `LocalBusiness` data, including postal address, coordinates, phone,
and sometimes the venue's official website.

The import copies factual venue data only. It does not import ratings, reviews,
or Planet Randy's editorial descriptions. Source images may be retained in
provenance metadata but are not published as venue images by this import.

## Implementation

Add a one-off, resumable importer under `scripts/data-quality/` and a pure parser
module with unit tests. The command has four phases:

1. `crawl`: fetch all filtered result pages, extract and deduplicate listing
   seeds by WordPress post ID, then fetch detail pages serially with delay,
   retries, and disk caching.
2. `stage`: validate and normalize records, print and save a quality audit, and
   insert idempotently into `public.ingestion_staging`. `--dry-run` performs all
   validation without database writes.
3. `drain`: invoke the existing production pipeline nodes until this source has
   no actionable staging work left.
4. `report`: query staging, provenance, and canonical venues to reconcile the
   source inventory with committed, merged, rejected, pending, and failed rows.

Use `planet-randy` as `source_name`, `source_type`, and provenance source. Use
the bare numeric WordPress post ID as `source_entity_id` and `sourceId`.

## Category mapping

| Planet Randy category | Canonical venue category |
| --- | --- |
| Gay bar | `bar` |
| Gay sauna | `sauna` |
| Gay Cruising | `cruising` |
| Gay cinema | `cruising` |

Planet Randy's cinema category describes adult cruising cinemas, matching the
existing Patroc treatment rather than the general-purpose `theater` category.

## Normalized fields

Each candidate contains:

- name and canonical category;
- address, locality, region, postal code, ISO-2 country, latitude, longitude;
- phone and official venue website when present;
- `queer-friendly` plus source-derived category tags;
- metadata with source URL, WordPress post ID, original category, cached source
  image URL, and detail parsing status.

Country must be ISO-2 before staging. Required names, source IDs, categories,
and finite coordinate pairs are validated locally. Partial records may stage
when they have a name plus a usable address or coordinates; records with
neither location form fail the quality gate.

## Quality and production gates

Before staging:

- every result page through the discovered last page was fetched;
- source IDs are unique after deterministic merge;
- every row uses an allowed venue category;
- latitude and longitude are both present or both absent and remain in range;
- detail-page failures and missing location/contact fields are reported;
- the source count and category distribution are saved to an audit artifact.

Before draining, run the stage phase with `--dry-run` and inspect the preview.
After draining, query production to reconcile all source IDs and confirm there
are no unexplained losses, category constraint failures, or duplicate source
mappings. Preserve the source-specific staging cohort so rejected or committed
rows can be identified and rolled back or reprocessed without touching other
sources.

## Verification

Unit tests cover listing pagination, card parsing, detail JSON-LD parsing,
category mapping, normalization, duplicates, and malformed coordinates. Then
run the focused tests, lint the new files, perform the dry-run audit, execute
the production stage/drain, and finish with live database reconciliation.
