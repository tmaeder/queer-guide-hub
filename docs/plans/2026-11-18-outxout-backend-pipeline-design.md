# Out x Out backend pipeline proposal

Status: approved by the user on 18 November 2026; implementation and deployment authorized.

## Outcome

Run the weekly Out x Out catalogue synchronization on queer.guide's backend, independent of Codex desktop availability. Include new and changed events, venues, professional practices and sports organisations. Preserve the existing import identities, review holds and verified corrections.

## Existing architecture verified

- Supabase has live `pipeline_definitions`, `pipeline_runs`, registered node types, staging, source mappings and downstream validation/review/commit services.
- `admin_automations` is the schedule registry of record, synchronized to pg_cron. The pipeline definition's schedule field is informational and cannot alone schedule a job.
- No existing Out x Out pipeline definition or source adapter was found.
- `writeToStaging` refresh mode compares normalized payloads but preserves validation state; its default terminal refresh list only includes `committed`. The original Out x Out import also uses `inserted` and `updated`. Blindly enabling refresh would therefore neither safely revalidate changed records nor consistently reprocess the baseline.
- A complete catalogue exceeds a single Edge Function request budget. Existing sources use bounded work slices, but the source must persist continuation state rather than count a partial response as a completed weekly scan.

## Options

1. **Recommended: native backend pipeline.** Add an Out x Out source adapter with durable checkpoints and bounded work units, register a pipeline and its weekly schedule, and use existing backend processing/review services. This provides run history and operator controls in the existing backend. It requires explicit incremental refresh and continuation support.
2. **Separate scheduled worker.** Run the collector elsewhere and send staging records into Supabase. This accommodates long crawls, but creates another scheduler/runtime and a second operational surface. It is unnecessary unless backend execution limits prove unsuitable after bounded testing.

## Recommended design

### Scheduling and execution

Register one weekly backend automation for Wednesdays at 08:00 Europe/Zurich. Inspect the deployed scheduler's timezone capabilities; if cron is UTC-only, preserve the Zurich wall-clock schedule with an explicit timezone-aware due check rather than silently shifting by an hour in summer. Permit one active catalogue scan. A lease and durable checkpoint allow continuation/retry after timeout, with bounded network and write batches.

Register the source and stages with the existing pipeline system so run status, pending work, counts and failures are visible in the backend. The weekly trigger starts discovery; server-side continuation drains the scan without waiting until the following week. A run becomes complete only when all discovery pages, source work and actionable processing batches have terminal outcomes. Needs-review outcomes are recorded separately from failures.

### Discovery and parsing

Discover the current sitemap, public catalogue pages, all public city-event pages and the public sports export. Retain the public-source coverage of the initial import; do not replace it with a truncated generic seed crawl. Use the existing collected fixtures to port the parsing and factual normalization into tested backend modules. Enforce bounded fetches, allowed public origins, explicit pagination progress checks and recoverable error states.

### Incremental identity and changes

Reconcile with the existing `outxout` source namespace and baseline canonical IDs. Store native source identifiers and URL aliases; a slug or encoded URL change must not create another entity. Compare stable factual hashes, excluding retrieval timestamps. Skip unchanged facts. Resolve mapped records before attempting cross-source deduplication, and check identity again at write time. Hold ambiguous businesses/branches/occurrences for review.

New or materially changed source facts enter validation, deduplication, review gates and supported commit/update services in source-scoped batches. An existing staging row with an old approval must not bypass validation after a material date/location change. Preserve raw source history and guarded before/after audit evidence. Do not mark a partial run's checkpoint as a complete successful baseline.

### Update policy

Apply supported changes to source-owned fields and fill eligible gaps. A conflicting manual or independently verified value stays protected unless fresh primary evidence resolves that precise conflict. Existing commit functions that only fill gaps are insufficient for all updates; inspect their deployed contracts and use or extend a guarded source-specific update path where necessary.

Preserve approved official date corrections, pending date holds, retracted coordinate markers, historical event locations, translations, ownership and safety/publication guards. Do not infer child-event dates from a parent's announcement. A listing's disappearance is not evidence of cancellation or closure. Treat source pages as provenance, not ticket/homepage URLs. Map professionals to their published practices rather than personal profiles.

### Testing and rollout

- Parser fixtures for all entity kinds, sitemap/API pagination and malformed/empty response failures.
- Idempotency checks for repeated runs, URL aliases, changed dates on the same source occurrence, cross-source matches and concurrent writes.
- Regression checks protecting official date corrections, review holds, reviewed blank coordinates and existing editorial fields.
- A read-only production preview with counts and a small guarded canary before enabling the weekly schedule.
- Verify canonical records, source links, review outcomes, run completion and the actual registered schedule independently.
- Disable the desktop automation `sync-out-x-out-catalogue-weekly` only after backend verification. Preserve the separate `verify-pending-out-x-out-event-dates` automation; moving that official-source research to the backend is outside this specific migration.

## Acceptance criteria

The backend owns and executes the weekly schedule, resumes interrupted scans, imports changed/new records with stable identities, skips unchanged records, does not duplicate existing entities, preserves review/provenance protections, and exposes verified run results. The desktop catalogue-sync automation is then paused to avoid duplicate scheduling.
