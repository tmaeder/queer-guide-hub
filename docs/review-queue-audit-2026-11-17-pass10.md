# Review source recovery — 17 November 2026, pass 10

Applied **15 audited production changes**: eight rejected physical-venue proposals, six native business merges and one factual canonical description. At 19:17 UTC the refreshed queue contained **2,838 active cases**, compared with the user's checkpoint of 2,766 and this pass's first live read of 2,850. Ingestion and scheduled processing also change these totals; the movement is not a manual-closure count.

This pass triaged 31 GayBasel staging records and 35 duplicate-business candidates, attempting 18 current publisher/official-site captures. It does not claim individual research of every remaining case. The [source manifest](review-queue-source-research-2026-11-17-pass10.json) records IDs, URLs, retrieval timestamps, hashes, decisions, guards and observed results. Full before/after records remain in `admin_review_repairs`; merges also have native `entity_merge_audit` source evidence.

## Physical-venue proposals

Rejected eight unpublished proposals whose publisher captures establish another entity type: Briccos Wines, Denis Clyde, gayParship, Joy4Men, LGBTIQ Helpline, Noxlov, Queer Students Basel and Regenbogen familien. The sources describe online shops, remote services or associations. Joy4Men explicitly says its former physical shop closed and sales continue online. These decisions reject only the unsupported physical-venue proposals; they do not assert that each organization lacks any office or deserves removal from other appropriate categories.

The raw and normalized payloads remain intact, and human review timestamps/identities remain NULL. No alternative entity was published. The other 23 station, square and physical-place candidates were not rejected merely because a street was missing.

Inspection of `staged-discovery.ts` and `gaybasel-parse.ts` explains why a publisher URL can coexist with `missing_source_url`: staged physical-venue discovery requires exact publisher identity, matching name/city and a street. A URL alone does not satisfy that evidence gate. No extraction, authorization or confidence gate was loosened.

## Duplicate businesses

Merged the venue-only, unclaimed business duplicates for Mann's Street, Marie's Crisis, Petit Café, Pieces, The Pumping Station and Campus. Their donor venue records were already merged into the corresponding canonical venues. Current official pages corroborate the locations and any gap fields transferred: Mann's shared inbox/short factual description, Marie's website and Petit's website/menu description. The other native patches were empty.

Campus first received a neutral missing canonical description identifying its type and exact published street. Its donor's unsupported superlatives were never transferred. Canonical fields outside the verified patches, ownership/publication/attention fields and venue content were preserved.

The rollback relationship guard stopped a proposed Metropol/Essen merge: the donor also owns a separate live Frankfurt venue. That merge was excluded and remains unresolved. Inderwear returned HTTP 403; Menagerie's official hostname failed DNS. Nowhere's homepage capture did not establish the exact street. None was treated as proof of closure or bypassed. Unsupported coordinates, personal contacts and conflicting addresses remain held.

## Validation and queue state

Every write transaction passed rollback before commit, with exact snapshots, row locks, eligibility and before/after checks. Staging additionally excludes human revisions, review notes/manual holds, enriched/published targets and active automation/research/source-verification leases. Independent reads confirm all eight payloads and human stamps preserved, six source-attributed merge audits, and zero remaining open non-waived findings on the six donors.

The existing repaired native reconciler completed two observed calls in 5.7 and 9.6 seconds including network overhead, retiring seven and two findings respectively. These are observations, not a performance benchmark or a claim that manual calls retired all six donors' findings. No timeout or persistent function setting changed.

Queue-top refresh skipped under its native lock. The worklist refresh completed in 29,670 ms server time; the subsequent snapshot showed no active refresh. The largest blockers are missing source (962), source URL (606), actionable proposal (553), conflicting identity (231), source authorization (145), unavailable source (122) and insufficient confidence (52). The first three account for 2,121 of 2,838 active cases. Queued, protected and retry work remains visible.

This continuation changes documentation only in Git; JSON parsing and diff checks validate the artifacts. No new runtime or model-evaluation test is claimed. Previous PR #5325 and integration #5335 are merged; this evidence belongs on a new branch based on current main.
