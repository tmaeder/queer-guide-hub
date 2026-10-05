# AgendaQ venue and event import

Date: 2026-10-05
Status: approved

## Objective

Import the complete AgendaQ venue directory and every unique AgendaQ event definition from the public AgendaQ data service into Queer Guide's existing ingestion staging pipeline, preserving source provenance and recurrence information without directly publishing unreviewed records.

## Verified source inventory

- `https://data.agendaq.fr/api/v1/businesses` is a public JSON endpoint.
- Pagination uses `offset` with a fixed page size of 36.
- The endpoint currently reports 3,877 venues and returns 3,877 unique venue slugs.
- Venue payloads contain structured locations, coordinates, contacts, opening hours, assets, taxonomy identifiers, social links, descriptions, and embedded events.
- A full source sweep contains 17,193 venue-to-event references and 16,433 unique event slugs.
- Of those event definitions, 3,742 contain recurrence rules and 12,691 are one-off definitions.
- Some source records are incomplete: 13 venues have no location, 96 events have no location, and 9 events have no top-level start timestamp. These records must still be staged with explicit quality warnings rather than silently dropped.

## Chosen approach

Build a resumable API-first importer in the existing `scraper` package. The importer fetches every API page, normalizes venues and events, and publishes pre-normalized records to `public.ingestion_staging` through the existing staging publisher.

The HTML listing and detail pages are not the primary source because the JSON endpoint is structured, faster, and less fragile. They remain useful as provenance URLs and a future fallback if the API omits a field.

## Source identity and deduplication

- Source name: `agendaq`
- Source type: `api`
- Venue source ID: the AgendaQ venue slug
- Event source ID: the AgendaQ event slug
- Event definitions embedded under more than one venue are deduplicated by slug.
- Conflicting payloads for the same slug are treated as import errors and reported; the importer never chooses one silently.
- Re-runs rely on the staging publisher's stable payload hashing and database uniqueness constraints.

## Event temporal model

AgendaQ models both one-off dates and recurring schedules. Importing every generated daily occurrence would create hundreds of thousands of synthetic event rows and lose the distinction between a source-authored event definition and a derived occurrence.

Each unique AgendaQ event is therefore staged once. Its full `dates` collection is retained in metadata, and recurring rules are mapped to the project's structured event schedule shape when possible. Explicit authored dates remain source evidence. The source start/end timestamps remain the event's bounding timestamps.

## Normalization

Venue normalized payloads include name, description, address components, coordinates, country code, website, phone, email, images, opening hours, social links, source taxonomy IDs, source URL, and source update time.

Event normalized payloads include title, description, event type, target groups, venue name, address components, coordinates, timezone-aware start/end values, images, ticket or information URL, source taxonomy IDs, recurrence schedule, all authored date definitions, source URL, and source update time.

AgendaQ taxonomy IDs are mapped through explicit lookup tables. Unknown IDs remain in metadata and map to safe generic values rather than being discarded.

## Execution and recovery

- `--dry-run` fetches and validates the complete source without database writes.
- `--venues-only` and `--events-only` allow targeted recovery.
- `--offset` and `--limit` support bounded retries and diagnostics.
- Fetching uses bounded concurrency, retries, exponential backoff, and a descriptive user agent.
- Publishing happens in batches and reports inserted, duplicate, failed, and rejected counts.
- No record is published directly to public venue/event tables.

## Verification

The implementation is complete only when:

1. Parser and normalizer tests cover venues, one-off events, recurring events, incomplete records, taxonomy mapping, stable source IDs, and duplicate event references.
2. A full dry run reconciles exactly 3,877 source venues and 16,433 unique source event slugs, subject to an explicitly reported upstream count change at execution time.
3. A staging run completes without unreported fetch or publish failures.
4. Database verification reconciles AgendaQ staging/source IDs against the fetched source inventory and reports every rejected or incomplete record.

