# Matching decision follow-up — 21 October 2026

## Observed problems

The live cached summary contained 7,484 decision rows: 2,653 general reviews, 2,102 event quality decisions, 1,869 geography conflicts, 548 business quality decisions, 274 staging rows, 19 business links, 16 tag enrichments and 3 duplicate pairs. These are distinct from 313,282 machine findings. Counts change as scheduled scans run.

The venue matcher limited the newest input events before checking for a catalogue candidate. Unmatched names could consume the batch indefinitely. Its automatic distance guard had also drifted to 100,000 metres. Candidate uniqueness was checked after distance filtering, allowing an ambiguous exact-name set to appear unambiguous.

A general venue review only marked its finding resolved. It did not link the event. Event quality reported the same missing link independently. Many reviews had empty historical candidate lists.

## Shipped backend changes

- Select batches from actual catalogue candidates; normalize source names once before joining.
- Prefer unique exact names, retain all exact candidates when assessing ambiguity, exclude closed/merged venues, require the same city and compatible country, and restrict known coordinate separation to under 500 metres. Missing coordinates remain explicitly unknown, consistent with the established exact-name rule.
- Preserve event occurrence collision checks and machine provenance.
- Run the existing enabled/paused matcher every five minutes instead of hourly. Prevent overlapping runs and tolerate concurrent review inserts through the pending-review unique index.
- Reconcile obsolete venue-link quality findings against the live detector after linking, without asserting human verification.
- Add an administrator-only live comparison RPC and transactional link action, with event-first locking, live timestamp checking, location and venue state checks, occurrence collision checks, both review dispositions and a human decision audit.

## Verified production effects

Two successful runs applied 265 and 156 links: **421 total**, confirmed independently from event field provenance after deployment. Those runs reconciled 64 and 46 venue quality findings: **110 total**. These figures are actual writes, not a projection from dry runs. Remaining similarity matches and ambiguous names retain review.

The optimized candidate scan returned 381 rows in 4.69 seconds on the measured production pass. Its purpose is to drain actionable matches without repeatedly scanning an empty newest-input batch; this is not a claim about total page load time.

## Human decision surface

The event’s source venue name, location and source link appear before a searchable list of live same-city candidates. Each candidate shows its address, official website, exact/similar name basis and coordinate separation or explicit unknown state. An explicit selection enables “Link selected venue”; the transaction applies the relationship and reconciles both representations. Empty results, missing city, already-linked events, read failures, retry, loading and disabled/busy states are explicit. Existing record editing, source evidence and keyboard navigation remain available.

## Validation

- 30 focused component/decision-adapter tests pass.
- Transactional production-schema regression tests pass and roll back: live candidate retrieval, stale timestamp refusal, cross-city refusal, closed venue refusal, successful linkage, both queue dispositions, audit creation, repeated decision refusal and privilege checks.
- ESLint and the design detector pass on changed UI; the detector reports no findings.
- The clean dependency install passes the repository typecheck ratchet (698 existing errors; none new) and production build.
- Desktop and mobile previews use labelled illustrative fixtures rather than production claims.
- Supabase security advisor reports no findings after deployment.

The frontend is delivered in the associated pull request; database matching and cleanup are already deployed. These changes address venue-matching decisions. Ambiguous geography, ownership, publication and unsupported content still require their own evidence workflows.
