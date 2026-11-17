# Review queue continuation — 17 November 2026

The user's checkpoint was 2,985 cases. The first read in this pass found 2,833; the 03:29:48 UTC snapshot found **2,807 active cases**. Scheduled ingestion/review contributes to this movement. This pass has exactly **13 repair-audit rows**, including multiple records within one business correction; it does not claim 178 individually verified closures.

## Applied source corrections

Eight unclaimed venue-only business profiles were merged through the native entity merge: Alexander Sauna, XL Sauna, Aqualis, Centre LGBTQIA+ Marseille, Prinz Eisenherz, Hotel Calipolis, Elvira and Sauna La Détente. Exact current first-party identity/address evidence, same-city/country checks and already-merged venue relationships support these decisions. Every donor's associated venues had to refer to the same retained physical venue. Canonical profiles remain byte-for-byte unchanged by the merges. Native reconciliation retired **14 superseded findings**.

Before merging Hotel Calipolis and Elvira, two separate audited updates filled missing contacts from their current sites. Calipolis publishes `calipolis@hotelcalipolis.com` and its shared hotel telephone; Elvira publishes `hola@believegroup.cat`. The donor values differed from the current published emails. The merge's automatic gap fill would otherwise have copied those older contacts. Only missing, unprotected fields were filled, with source URL/hash provenance. No named employee's direct contact was used.

Sauna La Détente's official site identifies 5 rue Alfred Mézières, 54000 Nancy. Its donor venue and business profile instead referenced Metz with a Metz coordinate. Both city links now point to Nancy, and both known-wrong pins are withdrawn to NULL. The official site's embedded map supports the Nancy vicinity but does not establish a replacement exact pin, so none was inferred. The existing canonical Nancy venue/profile, including their coordinates, are unchanged. The corrected duplicate business profile was then merged into the existing Nancy profile.

The Florence Queer Festival event was dated 18–22 November 2026 but still titled “Florence Queer Festival 2025.” Its organiser's current programme and visually inspected official poster explicitly identify the 2026 edition, those dates and Cinema La Compagnia. The title now says 2026, and the unreachable generic aggregator cover is replaced with that publisher-owned poster. Full JPEG decoding found 1200 × 675 and 582,561 bytes; the source hash is recorded. No image was upscaled. The native production image auditor independently passed the replacement, and the event now has **zero open image findings**. The only event-field changes are title, its trigger-derived normalised title, images, provenance and update time. The existing slug, dates, venue link, description and publication state remain unchanged.

All repairs were rollback-tested before committing. They preserve human/ownership/publication gates and record machine review, without a human verification stamp or legal ownership assertion. Exact entity IDs, sources, hashes, allowed changes and audit reasons are in [the source manifest](review-queue-source-research-2026-11-17.json).

## Recurring image-claim timeout

The image worker had further HTTP 500s at 02:58, 03:08 and 03:18 UTC. Function and PostgreSQL logs identify the enrollment INSERT inside `claim_event_gaps`, reached through PostgREST's `authenticator` connection with an inherited eight-second statement timeout.

One read-only generic enrollment plan took 8.814 seconds, versus 0.828 seconds with parameters specialised for the image lane. These are individual observations with different cache warmth, not a controlled benchmark. A rolled-back full 12-item claim with custom planning took 3.005 seconds. Migration `20261117030759_specialize_event_gap_claim_plans` scopes custom planning to this function and restores the caller's setting. Custom planning alone did not eliminate the REST failures: the 03:18 request still timed out.

Migration `20261117032448_bound_event_gap_claim_timeout` gives this existing **service-role-only RPC** a finite 20-second statement timeout and reloads the PostgREST schema. [Supabase documents function-level REST timeouts](https://supabase.com/docs/guides/database/postgres/timeouts); [PostgREST hoists that setting before executing the request](https://docs.postgrest.org/en/v12/references/transactions.html#function-settings). Global and role limits are unchanged. The worker still requests 12, the SQL function caps batches at 40, and the HTTP request budget remains 120 seconds. Eligibility, priority, leases, cooldowns and source checks are unchanged.

Two authenticated manual requests returned HTTP 200 for 12 processed and zero failures/AI attempts. The 03:13 scheduled run recovered one additional image. The 03:28 scheduled run, after the timeout change, returned HTTP 200 for 12 processed and zero failures/AI attempts. This establishes current successful behavior; continued monitoring is appropriate, and the earlier failures remain in the manifest.

## Verification and reviewability

The bounded-claim SQL regression passes after the final settings, including service-role-only access, finite function timeout, caller setting restoration, caller generic-plan preference, dry/zero batches, lease protection, cooldowns, changed-input reopening, both-lane hash compatibility and event preservation. The historical-artwork SQL regression also passes again. Both roll back their test data.

CI exposed a type error in the earlier JPEG fixture: Deno's `BodyInit` rejects a generic `Uint8Array<ArrayBufferLike>`. Passing a copied `ArrayBuffer` fixes it without changing the bytes. All **17 affected tests pass under native Deno 2.9.6**, including seven actual country-image-health handler tests and ten image source/probe tests. CI pins 2.9.8, which the local npm registry did not offer; the local version is stated explicitly rather than represented as identical to CI. No live Jev validation experiment was run.

Five earlier migration filenames differed from their already-applied production history. They now use the exact recorded versions, with unchanged SQL, so the version gate recognises them as applied rather than attempting an out-of-order replay. The two new migrations likewise match their production versions. Existing unrelated history collisions are outside this change.

## Remaining evidence holds

Several researched identity matches remain open because native merging would also transfer insufficiently corroborated contact or description fields: Amphibi, Eagle Amsterdam, Eagle Manchester and Carré Rouge. Kobalt exceeds the bounded capture size; Crystal and Dallas Eagle have certificate-invalid sources; Buddy and Le Cavern were unavailable. No TLS checks were bypassed. Steamworks Chicago and Axis involve another branch or differently named business profile, so shared branding is insufficient to certify a profile merge or ownership.

Official sources confirm the named locations of Pitti Uomo, Nuremberg Christkindlesmarkt and Florence Queer Festival, but the catalogue comparison found no matching canonical venue records. Those venue-link cases remain held. No unrelated venue was substituted and no recurring source-valid name-only finding was hidden by a temporary queue-status change.

The final snapshot's largest blockers are missing source (1,012), missing source URL (636), no actionable candidate (569), conflicting identity (249), unavailable source (135), source authorization (106) and insufficient confidence (58). The queue also contains 30 queued cases, four retries, six visual reviews and two protected reviews. The queue remains open; no reduction of confidence or source-authorization requirements was used to clear it.
