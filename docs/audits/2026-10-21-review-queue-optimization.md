# Review queue optimization — 21 October 2026

## Live diagnosis

The initial cached queue summary contained 7,998 decisions and 313,345 machine findings. The largest findings populations report missing business fields and event media; clearing counters alone would not repair those records.

Repeated noise came from country-level rights citations offered as city friendliness evidence, uncited city hooks/timing advice, obsolete image observations, and closure prompts supported only by a dead HTTP URL.

## Implemented automation

- Reject unsupported city proposals at intake, retaining their values and machine-labelled reasons. The producer also skips those proposals and requests source-grounded output.
- Complete absent organization website/email/phone fields only from its sole, explicitly linked, canonical primary venue, with matching name and compatible country. Preserve existing values and stamp per-field inheritance provenance. Do not infer ownership or reuse imagery.
- Remove only the exact event image URL supported by a recent HTTP 404/410 result; preserve the event and its other images.
- Retire URL-specific image findings once the URL no longer belongs to the event; do not certify replacement media.
- Resolve missing-country findings only when the live venue already has a country.
- Stop treating HTTP failures as strong closure evidence in the existence engine. Retire HTTP-only closure prompts without generating an admin/alive signal.

The service-only repair function runs every five minutes, uses advisory locking and SKIP LOCKED, and bounds data repairs to 400 records per family per pass. It respects the automation’s enabled state and records actual repair counts in admin_automation_runs.

## Verified production outcomes

- 1,877 organization contact records enriched, verified from per-field primary-venue provenance.
- 2,873 obsolete image findings resolved, including findings retired after broken URLs were removed.
- 390 HTTP-only closure prompts retired; zero cleanup-generated alive signals.
- 15 unsupported city proposals rejected.
- The final dry run returned zero remaining candidates in all six repair categories.
- The cron is active. Anonymous and authenticated users cannot execute the repair RPC.
- Transactional regression checks confirmed rejection at intake, preservation of properly cited timing proposals and unrelated venue fields, and rollback of the test fixture.

These are repair-category counts, not a claim that the entire queue is empty. Ambiguous geography, identity, publication and source interpretation remain decisions; missing content with no reliable source remains enrichment work.

## Decision workspace

Special review workflows now show the decision question, model confidence and queue timestamp, supplied source quotations and links, current record and contact/location facts, current/proposed field values, detector evidence, geography verification checks, and recent existence signals. Selected business details are fetched for business-link comparisons. Technical metadata is available in an expandable section. Live-read failures and missing evidence are explicit; records can be reloaded. Action consequences, inline edits and existing confirmation gates remain available.

A compact status band reports active, paused, stale or unavailable automatic cleanup. Review decisions invalidate the live context and shared summary caches.

## Validation

Scoped component and intake tests, existing city producer contract tests, ESLint, the typecheck ratchet and a production build were run. Desktop and mobile fixtures use the actual review page and components with illustrative data; no overflow or browser exceptions were observed. Database migrations and the city enrichment producer are deployed. Frontend changes are delivered through the associated pull request.
