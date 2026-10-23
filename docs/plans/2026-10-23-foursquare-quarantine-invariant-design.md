# Foursquare quarantine invariant design

Date: 2026-10-23
Status: Approved under the existing Foursquare production-closeout operator authority

## Problem

The October 1 closeout correctly archived provider-only Foursquare discoveries,
but the legacy `auto_approve_on_city_link` trigger later promoted 17 of those
venues back to `approved` when geography automation linked a city. The review
queue rows were also removed by generic staging lifecycle automation, causing
the health metric to report zero pending reviews while unsafe records were live.

## Considered approaches

1. Re-run the one-shot quarantine periodically. This repairs symptoms but leaves
   a publication window and depends on scheduling.
2. Change the generic city-link trigger. This addresses the observed writer but
   does not protect against another automated writer setting `review_status`.
3. Enforce a provider-only publication invariant on the venue row, restore a
   venue-scoped editorial queue, and derive health directly from durable source
   metadata. This is selected because it is fail-closed and writer-independent.

## Design

- A final `BEFORE INSERT OR UPDATE` venue trigger checks whether the venue is
  linked to Foursquare staging marked `requires_editorial_review`.
- Such a venue cannot remain `approved` unless it carries explicit independent
  corroboration: `verified = true`, a human `verified_by`, a non-Foursquare
  `verification_source`, and non-empty `verification_evidence`.
- Failed approval attempts are converted back to `archived` and remain marked
  `needs_attention`, allowing unrelated geography updates to succeed safely.
- The existing unsafe cohort is re-archived without deleting provenance.
- Review work is recreated against the venue rather than transient staging so
  generic staging cleanup cannot erase it.
- Health counts unresolved editorial work from the durable staging-to-venue
  relationship and corroboration contract, not from queue lifecycle state.
- Exact-match enrichment and already independently verified venues remain
  unaffected.

## Acceptance

Production must show zero unsafe published discoveries, 37 unresolved linked
discoveries in the editorial metric, all 37 hidden from public venue pages, and
the known approved control venue still visible. A forced city-link update must
leave a quarantined venue archived.
