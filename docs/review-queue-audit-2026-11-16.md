# Review queue repair and blocker audit — 2026-11-16

## Applied production repairs

- Corrected 55 event activity categories with individual explanations.
- Accepted 2,169 artwork findings across 64 cases after visual inspection established legitimate shared venue, campaign, or recurring-programme artwork. These decisions do not certify a photograph of each occurrence.
- Corrected the Prometheus event location and archived the Ferndale city record incorrectly presented as a venue.
- Rejected seven unsupported milestone category proposals, preserving the underlying historical records.
- Closed 285 relationship proposals with no canonical candidate ID and three description proposals flagging only uncertainty language without a replacement. `admin_review_repairs` records each closure as a machine action. Source mentions, historical prose, and verification timestamps remain intact.

The new private integrity repair runs inside the existing five-minute mechanical cleanup. It uses bounded batches, source locks, source revalidation, and active-lease exclusions. It does not verify entity relationships or historical assertions.

## Runtime failure repaired

Four podcast cases repeatedly failed with `Review public text exceeds bounds`. Nested public source captures could exceed the projector's limit even though top-level source fields were already bounded. Public state v3 excerpts only source-text fields inside approved capture containers, retains the beginning and end, labels omitted content, and instructs the evaluator to abstain when omitted context is necessary. Proposed replacement values remain exact and fail closed if oversized.

Migration `20261116190130_review_blocker_integrity_and_state_repairs` is applied. Review automation version 38 is deployed. Deployment preserved all other live function dependencies. All four affected cases subsequently completed with HTTP 200, state v3 and no retry; their remaining blocker is insufficient source support (`missing_source`).

## Why cases remain blocked

Snapshot after repairs: 3,485 active cases. Reasons are current automation job outcomes joined to matching case fingerprints, not the worklist's preliminary readiness stage.

| Reason | Cases | Meaning |
| --- | ---: | --- |
| missing_source | 1,280 | Available evidence does not support the proposed decision |
| missing_source_url | 726 | No usable public source URL |
| missing_action_candidate | 579 | No eligible canonical venue candidate |
| conflicting_identity | 321 | Source and record identity conflict |
| source_unavailable | 196 | Retrieval failed or source is unreadable |
| source_not_authorized | 109 | Staged source is outside the publication allowlist |
| insufficient_confidence | 108 | Evidence does not meet the unchanged confidence gates |
| visual_evidence_requires_human_review | 55 | Remaining artwork needs individual inspection |
| protected_review | 21 | Protected editorial decision |
| mandatory_human_publication_review | 1 | Required human publication gate |
| queued / running / unprocessed | 89 | Awaiting processing |

Most missing venue actions have no canonical venue in the same city/country. Exact-name, same-location checks found no safe bulk-link shortcut. Another 219 business-link cases refer through merged venues, but canonical venue ownership conflicts prevent the existing protected reconciliation functions from applying changes. These require individual source and ownership repair.

The queue is **not cleared**. Source allowlists, publication gates, confidence thresholds, location boundaries, and ownership protections were not relaxed.

## Verification

- 24 focused state, policy, and source-recovery tests passed.
- 19 actual-handler tests passed with synthetic database/network boundaries.
- Eight validation-handler tests passed; no live validation experiment was run.
- Database rollback checks verified dry-run behavior, bounded batches, preservation of source fields, and byte-for-byte preservation of milestone records.
- Integrity cleanup dry-run now reports zero eligible malformed proposals.
- Deployment readback matched the intended source files; four targeted production cases completed without the original error.
- The broader direct Node test command cannot load four existing Deno/JSR-dependent suites (`ERR_UNSUPPORTED_ESM_URL_SCHEME`); these are not counted as passing.
- One scheduled run reported a database statement timeout in `finish_jev_review_job`, separate from the repaired text overflow. Targeted production runs succeeded afterward, and the next scheduled run (19:09 UTC, run 939268) successfully processed eight cases with zero retries. Recurrence monitoring remains appropriate.

Counts change as scheduled ingestion and review continue. The 288 deterministic closures and 2,169 artwork findings are supported by exact audit records; unrelated count changes are not attributed to this repair.

## Continued source research

Applied 14 researched event-to-venue links, nine street-address corrections (five within link repairs and four standalone), two replacements of unavailable aggregator URLs with exact official occurrence pages, and one DoubleSide business-profile identity merge. The native business merge retained the canonical profile byte-for-byte and reconciled two superseded findings. An additional 13 venue-quality findings now carry explicit, source-supported name-only dispositions because the catalogue contains no matching venue. Those dispositions do not create venue records or certify unrelated event details.

The research uncovered a database bug: the event uniqueness index included already-merged rows. A merged Jungschwuppen donor reserved its surviving event's venue slot. Migration `20261116192118_canonical_event_occurrence_uniqueness` excludes merged rows from the unique active set and aligns the admin venue-link collision check. Its integration regression passed in a rolled-back transaction: a retained merged donor no longer blocks its survivor, a second canonical occurrence remains forbidden, and a conflicting unmerge remains forbidden. The real surviving event now links successfully; no donor status or source relationship was erased.

Primary sources prevented a misleading Toulouse correction: Qcal gave Cabaret Le 9 an incorrect Rue des Lois address, while the venue's own reservation page confirmed the existing Rue Lejeune address and the exact anniversary event. The correct catalogue venue was linked. Remaining holds include the Dunes Resort's inconsistent city references, the mixed Provincetown/Las Vegas Qya listing, and unconfirmed future-edition venues. These were not bulk-approved.

The refreshed worklist reported 3,262 cases. Other scheduled changes contributed to the count movement; only the explicit audit rows above are attributed to this pass. Individual decisions and source URLs are in `review-queue-source-research-2026-11-16.json`.
