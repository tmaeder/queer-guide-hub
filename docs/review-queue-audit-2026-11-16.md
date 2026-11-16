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

## Full source-row backlog and further repairs

The screenshot's roughly 111,000 source rows are not 111,000 blocked automation cases. At 19:50 UTC the source cache contained 110,853 rows: 107,371 findings and 3,482 decisions, with 105,015 overdue and 22,951 marked high risk. About 65,000 rows came from business completeness, chiefly missing contact information, descriptions and media. An event-finding snapshot contained 27,822 findings on completed events, explaining much of the historical backlog. Scheduled changes affect these totals independently of this pass.

Further individual research applied ten venue links and four address corrections within those links, restored the incomplete Queer Cinema Club programme summary, and replaced the unavailable Heimat domain with its exact official event page. The Blond links use the current Motzstraße 28 venue; the owner's June 2023 move announcement rules out the stale Eisenacher Straße profile. That former physical location was archived through the native machine-assignable `presumed_closed` path. The operating Motzstraße venue remains open; no human-only relocated designation was assigned.

A separate producer defect stranded 13 findings on four draft brands with neither stored nor actual active products. `20261116195200_brand_quality_scope_reconciliation` retires only unwaived failures/pending findings outside the producer's scope, records full prior evidence in the native quality audit and preserves ownership/publication decisions. Existing quality refresh runs the bounded reconciliation. Actual active products now qualify a brand even if its cached counter lags. The remaining eligible stale-finding count is zero.

Research inspected 850 exact gay.ch occurrence pages and their image assets. There were 650 recoverable original candidates, 647 guarded direct replacements and three changed/protected rows skipped. An additional historical occurrence was repaired through the native worker, for **648 image replacements** at this checkpoint. The original assets pass unchanged dimension/byte thresholds, full decoding, exact structured title/day identity, page-owned original-URL checks and thumbnail visual-content comparison. Source pages and asset SHA-256 hashes are recorded. No image was upscaled. Invalid, damaged, undersized or conflicting assets remain held. Direct update assertions preserve every event column except images, image provenance and update time.

## Image recovery pipeline restored

Both `event_image_backfill` and `event_agentic_enrich` had automatically paused on November 7 after three HTTP 500 failures. Their currently deployed version is newer than those failures. Authenticated current requests now return HTTP 200: an image dry run, a real current image request, a historical original-artwork replacement, and a content request with its AI cap lowered to zero for that request. These checks establish present behavior, not a retrospective diagnosis of the old generic HTTP 500 responses.

`20261116200600_historical_event_artwork_recovery` lets the existing source-owned artwork extractor reach completed gay.ch thumbnails. Eligibility is deliberately limited to untouched machine-imported, single-image rows whose source registry owns that thumbnail. Upcoming work remains first; historical content, other publishers, human image provenance, merged and archived records remain outside the added scope. Finish revalidates eligibility and a subsequent NULL guard fails closed if a source/status becomes unknown after the claim. Source identity and image quality gates remain intact.

`20261116201200_resume_repaired_event_gap_workers` restores only the two recorded automatic pauses; it does not reactivate manual or terminal pauses. Image recovery now claims at most 12 every five minutes, below the existing image auditor's 25 per five minutes. Content keeps its established cadence and 60/day AI ledger. Retry backoff, leases, automatic failure pausing and source-supported extraction remain active. This enables continued bounded recovery; it does not promise all historical source images are usable.

The new brand-scope rollback regression passed bounds, NULL dry run, scope exclusions, evidence/waiver and profile preservation, machine audit and reentry checks. The historical-artwork regression passed eligibility, upcoming priority, content/human/source exclusions, read-only dry run, real claim/finish, unrelated-field preservation, and a source becoming NULL after claim. Native image audits independently recheck the real replacements. The source manifest for this pass is `review-queue-source-research-2026-11-16-pass3.json`.

Final native image readback: all **648 replacements pass with known dimensions**, and this cohort has **zero open image findings**. Visual inspection and publisher context established eight exact shared programme/venue asset hashes; 194 resulting reuse warnings were accepted through the native decision function with machine audit. These decisions do not certify occurrence-specific photography or any pictured person's identity.

One JPEG exposed another runtime defect: its frame header starts at byte 36,033, beyond the image probe's 32 KiB read. The probe now reads at most 64 KiB and cancels the response stream when a publisher ignores Range. Eighteen image source/probe tests pass, including the late JPEG header and ignored-Range bounds/cancellation. `event-image-quality` version 114 is deployed; readback matches all eight intended bundle files, with the other seven dependencies unchanged. The real JPEG now reports 1280 × 1280 and its unknown-dimension finding is resolved by the auditor.

The restored 20:13 UTC scheduled image run completed successfully: HTTP 200, 12 examined, zero updates, zero failures and zero AI attempts. Those current-event sources had no usable replacement; no update is claimed for that run. Database health advisors report no findings. The queue remains open for further source-backed work, including unavailable assets, missing business information and protected editorial/publication decisions.

After refreshing the native caches at 20:21 UTC, there are 3,101 active review cases. The wider source-row cache contains 110,164 rows (106,741 findings and 3,423 decisions), 104,308 overdue and 22,304 high risk. These are separate views of the backlog. Scheduled ingestion and review also change them; only the explicit repair/audit records are attributed to this work.

Subsequent scheduled readback confirms the normal content path also works: the 20:22 UTC content request returned HTTP 200 for eight records, eight AI attempts within the unchanged ledger, and zero failures. The 20:18 and 20:23 UTC image requests each returned HTTP 200 for 12 records with zero failures and zero AI attempts. The automation reporter may show the newest completed HTTP requests as running until its next reconciliation; the HTTP results above are already persisted.
