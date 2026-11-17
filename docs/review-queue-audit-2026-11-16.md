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

A separate producer defect stranded 13 findings on four draft brands with neither stored nor actual active products. `20261116195006_brand_quality_scope_reconciliation` retires only unwaived failures/pending findings outside the producer's scope, records full prior evidence in the native quality audit and preserves ownership/publication decisions. Existing quality refresh runs the bounded reconciliation. Actual active products now qualify a brand even if its cached counter lags. The remaining eligible stale-finding count is zero.

Research inspected 850 exact gay.ch occurrence pages and their image assets. There were 650 recoverable original candidates, 647 guarded direct replacements and three changed/protected rows skipped. An additional historical occurrence was repaired through the native worker, for **648 image replacements** at this checkpoint. The original assets pass unchanged dimension/byte thresholds, full decoding, exact structured title/day identity, page-owned original-URL checks and thumbnail visual-content comparison. Source pages and asset SHA-256 hashes are recorded. No image was upscaled. Invalid, damaged, undersized or conflicting assets remain held. Direct update assertions preserve every event column except images, image provenance and update time.

## Image recovery pipeline restored

Both `event_image_backfill` and `event_agentic_enrich` had automatically paused on November 7 after three HTTP 500 failures. Their currently deployed version is newer than those failures. Authenticated current requests now return HTTP 200: an image dry run, a real current image request, a historical original-artwork replacement, and a content request with its AI cap lowered to zero for that request. These checks establish present behavior, not a retrospective diagnosis of the old generic HTTP 500 responses.

`20261116200633_historical_event_artwork_recovery` lets the existing source-owned artwork extractor reach completed gay.ch thumbnails. Eligibility is deliberately limited to untouched machine-imported, single-image rows whose source registry owns that thumbnail. Upcoming work remains first; historical content, other publishers, human image provenance, merged and archived records remain outside the added scope. Finish revalidates eligibility and a subsequent NULL guard fails closed if a source/status becomes unknown after the claim. Source identity and image quality gates remain intact.

`20261116200920_resume_repaired_event_gap_workers` restores only the two recorded automatic pauses; it does not reactivate manual or terminal pauses. Image recovery now claims at most 12 every five minutes, below the existing image auditor's 25 per five minutes. Content keeps its established cadence and 60/day AI ledger. Retry backoff, leases, automatic failure pausing and source-supported extraction remain active. This enables continued bounded recovery; it does not promise all historical source images are usable.

The new brand-scope rollback regression passed bounds, NULL dry run, scope exclusions, evidence/waiver and profile preservation, machine audit and reentry checks. The historical-artwork regression passed eligibility, upcoming priority, content/human/source exclusions, read-only dry run, real claim/finish, unrelated-field preservation, and a source becoming NULL after claim. Native image audits independently recheck the real replacements. The source manifest for this pass is `review-queue-source-research-2026-11-16-pass3.json`.

Final native image readback: all **648 replacements pass with known dimensions**, and this cohort has **zero open image findings**. Visual inspection and publisher context established eight exact shared programme/venue asset hashes; 194 resulting reuse warnings were accepted through the native decision function with machine audit. These decisions do not certify occurrence-specific photography or any pictured person's identity.

One JPEG exposed another runtime defect: its frame header starts at byte 36,033, beyond the image probe's 32 KiB read. The probe now reads at most 64 KiB and cancels the response stream when a publisher ignores Range. Eighteen image source/probe tests pass, including the late JPEG header and ignored-Range bounds/cancellation. `event-image-quality` version 114 is deployed; readback matches all eight intended bundle files, with the other seven dependencies unchanged. The real JPEG now reports 1280 × 1280 and its unknown-dimension finding is resolved by the auditor.

The restored 20:13 UTC scheduled image run completed successfully: HTTP 200, 12 examined, zero updates, zero failures and zero AI attempts. Those current-event sources had no usable replacement; no update is claimed for that run. Database health advisors report no findings. The queue remains open for further source-backed work, including unavailable assets, missing business information and protected editorial/publication decisions.

After refreshing the native caches at 20:21 UTC, there are 3,101 active review cases. The wider source-row cache contains 110,164 rows (106,741 findings and 3,423 decisions), 104,308 overdue and 22,304 high risk. These are separate views of the backlog. Scheduled ingestion and review also change them; only the explicit repair/audit records are attributed to this work.

Subsequent scheduled readback confirms the normal content path also works: the 20:22 UTC content request returned HTTP 200 for eight records, eight AI attempts within the unchanged ledger, and zero failures. The 20:18 and 20:23 UTC image requests each returned HTTP 200 for 12 records with zero failures and zero AI attempts. The automation reporter may show the newest completed HTTP requests as running until its next reconciliation; the HTTP results above are already persisted.

## Remaining-case investigation and source repairs

The next pass found a reproducible cause of recurring image-worker HTTP 500s: function logs explicitly report a statement timeout in `claim_event_gaps`. Each small request was enrolling and rehashing all eligible events. `20261116210200_bounded_event_gap_claim_enrollment` enrolls only the bounded batch of absent or changed inputs, preserves active leases and cooldowns, and inlines the identical fingerprint expression inside this function. Read-only plans measured about 8.7 seconds with the opaque helper versus 1.3 seconds with the bounded inline expression; 500 real image-lane fingerprints matched. The rollback regression passes bounded/zero batches, dry run, subsequent enrollment, lease protection, cooldown preservation, changed-input reopening, event preservation and both-lane fingerprint compatibility. The historical-artwork regression also passes after this change. Seven scheduled image requests from 21:03 through 21:33 UTC each processed 12 with HTTP 200, zero failures and zero AI attempts. The 21:28 run recovered one additional image; unchanged requests are not counted as repairs.

Official Dutch BAG forward records and reverse containment at the saved coordinates resolve Langeveen and Sittard. Both saved points are in the matching official Dutch settlement; the coarse Natural Earth polygon reports Germany. Native geography evidence now records the positive BAG containment and retains the contradictory polygon observation. Both city rows remain byte-for-byte unchanged; their pins were not shifted to satisfy a coarse border model.

Three unclaimed venue-only business duplicates were merged through the native entity merge: Company Club Milano, Crazy Circle and Bambusa. Exact official identity/address evidence and already-merged venue relationships support each decision. Company Club gains only its published Milan email; the other canonical profiles are unchanged by their merges. Native reconciliation retires six superseded findings. Separately, Bofetada's São Paulo canonical venue was linked to an unrelated Madrid business. Its exact promoter location page and existing merged-venue relationship support reconnecting the existing Bofetada profile and primary venue. The native linkage trigger inherits previously NULL location fields from that canonical venue; the Madrid profile remains unchanged. This does not assert legal ownership.

The Florida licensing authority's historical report places Bambusa Bar & Grill at 600 Goodlette Road in Naples, Florida. Two venue rows and two business profiles incorrectly referenced Naples, Italy. Their city, country and state links now identify Naples, Florida, with full before/after audit and unchanged NULL coordinates. The 2022 report establishes physical identity/geography only; no current licence or opening status is certified.

The two pending country-cover replacements were caused by reachable Pexels originals exceeding the checker's 20 MiB budget, rather than unavailable images. The checker now records these as deferred probes, cancels the stream, preserves existing dimensions/hash, and avoids a broken-cover proposal. The same handling covers oversized streams without Content-Length. The byte limit remains unchanged, and genuine HTTP failures still produce findings. Explicit authenticated rechecks accept at most 20 country UUIDs and remain limited to active country covers. Seven actual-handler tests pass with synthetic HTTP and the real pinned SDK, including write failure, bounded stream cancellation, missing images and scoped rechecks. Deployed version 18 matches all seven intended files.

The native two-country request returned HTTP 200, checked two, deferred two, failed zero. Both public rendered covers were independently fully decoded at 1880 × 1253 with HTTP 200, and their exact URL/hash observations are in the pass-four manifest. Raw originals were not fully decoded. The two stale replacement suggestions were rejected with guarded before/after audits, preserving countries, cover URLs and reviewer identity. No human review or geographic image-content certification was claimed.

Research also evaluated 205 existing Wikidata identities without finding a proof that met the current settlement/coordinate gates. They remain held. Discovery for another 250 selected missing identities stopped at HTTP 429 and is incomplete; no identity repairs are claimed. Cafe Montmartre retains conflicting address evidence and an unavailable first-party response. These holds are documented instead of forcing a match.

At the 21:35 UTC refreshed snapshot, **2,985 active cases remain**, compared with the user's 3,101 checkpoint. Scheduled processing contributes to this movement; this pass has exactly 13 repair-audit rows, including related records within the same business correction. The largest blockers are missing source (1,156), missing source URL (653), missing actionable candidate (570), conflicting identity (257), unavailable source (165), source authorization (106) and insufficient confidence (72). Two queued cases and four retries remain. These categories explain why a count reduction cannot be equated to individually verified repairs. Source captures, entity IDs, exact audit reasons and worker results are in `review-queue-source-research-2026-11-16-pass4.json`.
