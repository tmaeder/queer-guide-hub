# Recover explicit publisher venue relationships

The remaining venue queue contains events whose first-party source already identifies their venue. The HAZ and Milchjugend adapters emit `normalized.metadata.venue_source_id`, and `venue_sources` maps that exact publisher key to a canonical venue. The name/distance matcher ignores that relationship. For HAZ, a low-confidence city-centroid fallback sits 1,022 metres from the actual Regenbogenhaus, so otherwise clear links remain in review.

## Matching and ownership

Only the two audited adapter contracts participate. Event and venue source keys, source names, entity types, capture hashes, exact event time, street/house number, postcode, city and country must agree. The canonical venue must be open, unique and correctly located inside its country polygon. Canonical venue references are resolved before physical checks, so a conflicting mapping cannot be silently selected by filtering out the inconvenient candidate. Duplicate event collisions are refused.

The repair refuses existing venue ownership, manual holds, human venue/geography edits and reviewed linkage findings. Row and source fingerprints are rechecked under locks; a human reviewing a finding wins rather than waiting behind an automatic overwrite. Both the review-cleanup and venue-linker pause controls are honored.

Explicit coordinates are preserved and must agree within 100 metres. A pin can be copied from the venue only when both coordinates are missing and unowned, or when both retain unchanged `derived:city_centroid` values. Human coordinate edits are never replaced. A centroid correction is bounded to 20 km, and the venue must pass its own country-boundary check.

## Application and recurrence

The private migration function defaults to dry run, caps each call at 200 events and joins the existing venue-linker cadence and run journal. It stores full source bindings and hashes in field provenance and complete event/finding before/after audit records. Native venue geography and review-closing triggers remain authoritative. Only the obsolete native `NAMED_VENUE_UNLINKED` finding is reconciled; unrelated issues remain intact. Dates, titles, descriptions, relationships outside the venue link and publication columns stay unchanged. Existing native venue safety derivation is honored.

`run-source-venue-recovery.mjs` provides bounded dry, rehearsal and apply modes using the exact migration function in `pg_temp`. It drops that transaction-local helper before commit and installs no permanent schema objects. Rehearsal rolls back all writes. Receipts record actual affected event IDs and distinguish simulated from committed changes. Normal recurring installation remains a protected migration release; the coordinated release window is not bypassed.

## Verification

The native PostgreSQL fixture covers 53 source, ownership, geography and address cases: centroid/explicit/missing pins, corrupt bindings, address-number collisions, duplicate references/events, source-date conflicts, manual holds, human provenance and explicit human pins. It exercises both pause controls, zero/dry runs, browser denial, native hook compilation, preserved unrelated findings, audit completeness and idempotence.

A production-shaped rehearsal of 20 events linked all 20, corrected their derived pins and resolved both native review sources, then rolled back. A 200-event native rehearsal then linked 200, corrected 199 derived pins, and reconciled 183 general-review plus 200 quality findings, all rolled back. The read-only eligibility probe found 251 matching events, 249 carrying city-centroid pins; claims of live reduction must come from the repair journal and refreshed worklist after application.
