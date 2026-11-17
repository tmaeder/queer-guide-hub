# Review source recovery — 17 November 2026, pass 12

Applied **30 audited repair entries**: 24 profile/link corrections, three native business merges, one Arlington city-split bundle and two source-association corrections. The city bundle includes its recorded venue moves and source-adjudicated news joins; this is an audit-entry count, not 30 closed cases. At **20:14 UTC**, the live worklist contained **2,760 active cases**, versus the user's checkpoint of 2,775 and this pass's first read of 2,763. Scheduled processing and ingestion contribute to movement.

Triaged 24 duplicate-business candidates, attempted 47 publisher/official-source captures, and investigated the related city-merge history and eight news articles. This is not an individual review of every remaining case. The [source manifest](review-queue-source-research-2026-11-17-pass12.json) records identifiers, source hashes, decisions, holds and validation. Full snapshots remain in `admin_review_repairs`, native merge audits and content revisions.

## Separate Arlington, Texas and Virginia

The existing Texas city, **Q17943**, had been merged into the Virginia record. That explains why an Arlington, Texas venue carried a Virginia city, state, ZIP code and timezone. The complete schema-1 merge history identified three moved venues, one historical event and eight deleted duplicate article links.

Used native `unmerge_cities` without force, under exact snapshots and row locks. Restored the distinct Texas city while keeping **SEO disabled** and preserving the Virginia city. Restored the three historical Texas venue links: 1851 Club, Randol Mill Park and UT Arlington. The historical event already had a NULL city and remained unchanged.

A blind history replay would also have restored incorrect news links. Current publisher captures show that five articles concern Virginia/DMV subjects and three identify UT Arlington. Within the same transaction, retained the five Virginia articles only in Virginia, restored the three Texas associations and removed their false Virginia tags. All eight full article rows and every unrelated join row were preserved. The city audit records the native inverse plus this deliberate source disambiguation.

Corrected the two 1851 business records and two venue records to the Texas city and **76012 / America/Chicago**, including the donor's mistaken “1851 Division Street” address. The operator publishes **931 W Division Street** and the current shared phone. Withdrew the donor's unsupported former pin. Updated the Randol Mill Park and university business profiles to match their restored Texas venues.

## Correct Axis and obsolete websites

Axis's canonical venue at **775 North High Street** incorrectly pointed to the Union Station business profile at **630 North High Street**. Corrected that association, the matching merged Axis duplicate, and the Axis business's primary venue. The venue merges themselves are valid and remain intact. These are venue-profile associations, not legal ownership assertions.

The legacy `columbusnightlife.com` domain now serves unrelated casino marketing. Replaced Axis's reference with its current official site and withdrew the three Union Station references. The historical 630 North High Street profile remains distinct from today's Union Cafe at 782 North High Street; its current location/operating history requires further research.

## Repair remaining profiles and duplicates

Corrected Discus's business address and **10200 → 6010** postcode. The operator confirms Industriesstrasse 10, Kriens. An exact official Swiss building-address match, confirmed against directory feature **100215793**, places the existing canonical venue pin within **7.19 metres** of the address point. Reused that existing venue pin for its business profile, with building-address rather than entrance precision. Fuzzy neighboring-address results were excluded.

Aligned Herenhuis's business with its existing canonical venue at De Lescluzestraat 63, **2600 Berchem**, replacing its central-Antwerp postcode/pin. Corrected Carré Rouge's business website and house number, Eagle Manchester's **M1 3HZ** postcode, and Amphibi's missing official venue website and factual business description.

Firsthand reporting documents Boiler Room's move from East Fourth Street to **45 Second Avenue, New York**. Updated its canonical venue/business address and withdrew former-location pins. Its former `.com` domain now contains unrelated merchandise/culture articles; withdrew those references. The remaining `.net` destination was unusable during research and remains unverified.

Merged the duplicate business profiles for **1851 Club, Discus and Boiler Room** after the corrections. Every native gap patch was empty, and all three canonical business profiles were byte-preserved during merging. Independent reads find zero open non-waived donor findings. One observed reconciler call retired seven findings on two donors in 5.5 seconds including network overhead; scheduled processing may have handled the third.

## Separate the NYC bar from the Hove sauna

The final URL check found another NYC legacy duplicate pointing to the UK Hove sauna. Corrected its unreviewed pointer to the existing NYC canonical venue and removed the remaining two `.com` references. Reassociated two sources whose explicit addresses identify the NYC bar. Their raw payloads, confidence, source identifiers and timestamps remain unchanged. An addressless Yelp source stays held because its location is ambiguous. No missing historical merge movements were guessed.

The Hove operator's current site says its Hove and Sheffield saunas no longer exist. This concrete closure evidence is retained in the manifest. Confirmed permanent closure is **human-only** in `location_closure_statuses` (`machine_assignable=false`); the Hove closure fields remain unchanged pending that decision. No closure date is invented and no weaker label is substituted to bypass the gate.

## Validation and remaining queue

Every data write passed rollback before commit, with snapshots, unclaimed ownership, provenance and field-delta guards. A redundant city patch on the historical 1851 duplicate hit the human-field guard: the city had already been restored by the audited native undo, so the no-op field was removed rather than weakening protection. Final transaction checks include later trigger effects.

Independent readback confirms **24/24 profile patches**, the three Texas/five Virginia news split, all three empty-patch merge audits, both source moves with intact payloads, and **zero remaining `columbusnightlife.com` or `boilerroomnyc.com` references** in venue/business website fields.

Worklist refresh completed in **24,875 ms server time** under the local 30-second check limit. Later worklist and queue-top requests respected their native locks and skipped; the 20:14 snapshot shows one scheduled refresh active. No timeout, runtime function, source-authorization, publication or confidence setting changed in this pass. Existing PostgreSQL 16 merge-policy CI, including the geographic-index fixture, succeeded on implementation commit `83615638b`; that is not an observed result for the new documentation commit. JSON parsing and staged diff checks validate this continuation.

The largest remaining blockers are missing source (927), source URL (584), actionable proposal (502), conflicting identity (240), source authorization (167), unavailable source (112) and insufficient confidence (64). Several official sources failed TLS/DNS or access checks; Kobalt exceeded the unchanged capture budget. Unsupported inboxes/phones, ambiguous source identities and human-only closure decisions remain held. Failed retrieval is not evidence of closure.
