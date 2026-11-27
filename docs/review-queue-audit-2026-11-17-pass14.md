# Review source recovery — 17 November 2026, pass 14

Applied **19 audited repair entries**: fifteen profile corrections, three native city creations and one existing city identity correction. The first live read contained **2,815** active cases, versus the user's 2,817 checkpoint. At **21:30 UTC**, **2,780** remained: 902 ready and 1,878 research. These audit entries are not case closures; ingestion and scheduled processing also change totals.

The [source manifest](review-queue-source-research-2026-11-17-pass14.json) records 22 public capture attempts, precise profile deltas, identifiers, source hashes, holds and deployment evidence. Full snapshots remain in `admin_review_repairs`, content revisions and provenance. This is not an individual review of every active case.

## Create the missing distinct cities

The catalogue lacked Columbus, Georgia; Milford, Connecticut; and Easton, Pennsylvania. Existing Ohio, Pennsylvania and Maryland namesakes had absorbed venue associations. Current official municipal pages and Wikidata entities **Q239870**, **Q755798** and **Q1056542** establish three distinct municipalities.

Used the unchanged native `city_resolve_or_create` with verified city-center coordinates and region hints. Each returned `created / region_twin`. Keep **SEO disabled** for all three, with municipal source provenance and appropriate timezone. City-center coordinates are city evidence, not venue pins.

Each creation transaction required exact snapshots and byte-preserved its existing namesake. Final independent readback confirms Maryland Easton and Pennsylvania Milford remain identical. Ohio Columbus changed only three refresh timestamps at 21:24; its identity and every other field remain intact.

Easton initially hit the resolver's proximity safeguard: a Williams Township record without a QID lay 1,725 metres from the proposed city center. No coordinates were omitted and no threshold was weakened to bypass it. Research identified **Q941495**, whose GeoNames ID **5219572** exactly matches the township's existing source. Its own Northampton County municipal site independently confirms that identity. Added the QID under exact-snapshot and human-history guards; preserved the existing point, SEO, shell status and prior unresolved audit. The unchanged resolver then accepted the distinct Easton QID. Direct township captures failed, while the primary website was read successfully through the web tool; no raw-page hash is claimed for that read.

## Repair fifteen venue and business profiles

Colgay Pride's operator publishes **4214 16th Avenue, Columbus, Georgia 31904**. Correct its venue/business city and former 42nd Street address. Withdraw former-location pins without inferring a new point. No named staff contact is imported.

Milford's official recreation department identifies Eisenhower Park at **780 North Street, Milford, Connecticut 06461**. Correct both profiles' Pennsylvania city link and generic address; preserve their existing park-area coordinates, without entrance precision.

Firsthand 2011 reporting identifies La Pazza in Easton, Pennsylvania's West Ward, consistent with its existing source address and 18042 postcode. Correct the canonical venue, its historical duplicate and business from Maryland to Pennsylvania. Preserve addresses, pins, duplicate status and operating/closure fields. This is a historical geographic correction, not a claim that the bar currently operates. The first rollback caught a trigger-derived timezone change on the old duplicate; the explicit, appropriate timezone was added to the guarded patch before retrying.

Four further original publisher records explicitly identify Audubon in Milford, Connecticut, and Barnes and Noble, Foxe's Cinema and Green in Columbus, Georgia. Their existing states, postcodes and points agree with those source locations. Correct eight venue/business city associations only, with appropriate state/timezone. Preserve names, generic addresses, pins, categories, source payloads and publication/operating state. No publisher user comments, contacts or behavioral assertions are imported. The Audubon operator independently confirms its Milford Point geography; the Barnes & Noble owner capture returned 403 and was not bypassed.

All fifteen patches passed rollback before commit, exact snapshots, unclaimed ownership, human-field protection, provenance and field-delta checks, including later trigger effects. Independent readback confirms **15/15** desired patches.

## Fix location-worker lease contention

The first Colgay rollback failed with **55P03** in `wake_entity_location_worker`: saving its location enqueued a durable job, but the wake trigger waited for the singleton worker lease. Postgres logs corroborated a lock timeout.

The deployed migration **20261117212117** makes the wake notification use `SELECT ... FOR UPDATE SKIP LOCKED` before updating the eligible dispatch row. A locked lease leaves the job queued for the existing **50-second cron**. Preserve the same worker-lease eligibility, 60-second debounce, webhook authentication and 55-second HTTP request timeout. PostgreSQL documents this locking mode for avoiding contention among queue consumers. [PostgreSQL SELECT locking clauses](https://www.postgresql.org/docs/current/sql-select.html)

A disposable native PostgreSQL 17 fixture holds the lease in a second connection until explicit rollback. It reproduces the old trigger's statement timeout, then proves the migrated trigger inserts a pending job without waiting or dispatching. It also verifies later eligible dispatch, debounce, active-lease exclusion, webhook inputs, migration idempotency and unchanged function ownership, ACL, SECURITY DEFINER and search_path. The fixture is added to PostgreSQL 16 merge-policy CI.

Production readback preserves the function's OID, owner, ACL and security settings. Colgay's guarded rollback and commit succeeded after deployment. No broad exception swallowing, source authorization, confidence or publication rule changed. The prior geographic-index fixture and twenty deduplication tests also pass. Post-migration security advisors were read; unrelated existing findings were not changed.

## Queue and remaining holds

Worklist refresh completed in **22,359.93 ms server time**, under the local 30-second limit. The final 21:30 snapshot is 2,780 active cases; no persistent timeout was raised.

Largest automation blockers: missing source 920; missing source URL 584; no actionable candidate 506; conflicting identity 258; source authorization 199; unavailable source 110; insufficient confidence 68. There were 127 queued jobs, four expired-lease retries and two visual-evidence decisions requiring human review. These are live workflow cohorts, not a claim that every case was manually researched.

New owner and tourism evidence confirms Partners New Haven at 365 Crown Street. Its mixed Oklahoma City canonical still lacks a clearly identified separate existing New Haven destination, so no historical split is guessed. Oz and Scandals namesake histories also remain held for safe source separation. Genesee Park/Ulysses lacks corroboration of the specific park/jurisdiction; Ocean Pines retains its prior unresolved Maryland identity. No ambiguous source rows or cascading presence history were deleted.
