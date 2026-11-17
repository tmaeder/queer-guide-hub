# Review source recovery — 17 November 2026, pass 13

Applied **14 audited repair entries**: twelve factual profile corrections, one source association and one historical automatic-import target correction. The first live read contained 2,796 active cases; at **21:02 UTC**, the refreshed worklist contained **2,817**, versus the user's checkpoint of 2,760. This is not a claim of fourteen closed cases. Ingestion and scheduled processing change totals.

Triaged twelve profile candidates, captured or attempted 24 public URLs, and investigated seven historical Spartacus imports behind multi-city identity collisions. The [manifest](review-queue-source-research-2026-11-17-pass13.json) records source hashes, identifiers, exact profile deltas, holds and deployment validation. Full before/after snapshots remain in `admin_review_repairs` and content/provenance history. This pass does not individually review every remaining case.

## Correct six venue and business pairs

- Bogota Latin Bistro: replace the West New York, New Jersey association with Brooklyn, New York. The operator identifies Park Slope and 141 Fifth Avenue; preserve its existing point.
- Castle Megastore: replace Medford, Massachusetts with Medford, Oregon. The store-specific operator page confirms **1601 N Riverside Avenue, 97501**, replacing the old Progress Drive address. Withdraw the former-location coordinates on venue and business; do not infer a new pin.
- A. Nic Gay / FORM Ortho: replace Fremont, Nebraska with Fremont, California, correct postal code and timezone, and update Suite 110 to the operator's **Suite 211**. No medical, ownership or sexual-orientation assertion is added.
- Pint and Six26: replace New York city/state associations with **Jersey City, New Jersey**. Preserve their existing supported street addresses and points.
- Oz New Orleans: fill the existing distinct New Orleans venue/business with the operator's **800 Bourbon Street**, website and shared business phone. Preserve its existing New Orleans city and point.

All twelve profile patches passed rollback before commit, exact snapshot and ownership checks, human-field history protection, field-delta/provenance checks and final transaction checks for later trigger effects. Independent readback confirms **12/12** patches.

## Separate the New Orleans source

The New Orleans Spartacus source **12181** was attached to a mixed Phoenix-named Oz canonical, alongside Wausau and Phoenix sources. The source itself explicitly identifies 800 Bourbon Street, New Orleans; the current New Orleans operator independently confirms that address. A distinct New Orleans canonical already exists.

Reassociated that single source with the existing New Orleans venue and corrected the corresponding historical automatic staging target/match ID. Preserve the original raw and normalized source payloads, source identity, confidence, timestamps, presence observations, historical scores/signals and automatic review state. Human review stamps remain NULL. Both changes passed rollback, snapshots, ownership, human-history and active-lease guards. No venue merge, missing historical relationship movement or other source identity was guessed.

## Prevent unsupported same-name automatic updates

Seven historical imports for Oz, Scandals and Partners show the same dangerous pattern: `name_proximity` score 1, no recorded guard, and automatic updates joining namesakes in different US cities. The geographic guard can veto a known distant candidate, but unavailable distance previously left a perfect name score eligible for automatic merging. A semantic boost could also lift weaker unsupported names over the automatic threshold.

The pure decision engine now caps six venue-name match types below the automatic threshold when measured distance is unavailable or invalid, unless an independent exact identity signal already meets that threshold. Apply the cap **after semantic fusion and before candidate ranking**. Preserve the candidate and original signals for review, with reason `name_without_location`; a supported alternative can still win. Existing measured-nearby matches and independently exact contact/source/address identities retain their behavior. Other entity types and thresholds are unchanged.

Deployed `pipeline-deduplicate` **version 1951**, ACTIVE. Used its latest complete ten-file production bundle and replaced only the shared engine. Independent deployed readback matches the tested engine and preserves every other file byte-for-byte, including existing internal/admin authentication and JWT configuration. No new source permission, publication bypass, persistent timeout or schema change was introduced.

Validation: **20/20 engine tests**, including five new regression cases; **4/4 existing argument contract tests** with CI permissions; entrypoint typecheck passed. The initial restricted argument-test attempt could not start its existing HTTP entrypoint. A temporary offline stub was incompatible with Deno's getter; the unmodified contract suite subsequently passed with its normal CI network permission. No temporary fixture or dependency/lockfile drift is committed.

## Remaining holds and queue

The refreshed worklist completed in **25,827 ms server time** under the local 30-second check limit; the earlier request respected the native already-running lock. Snapshot: **939 ready**, **1,878 research**, **2,817 active**.

The largest automation blockers remain missing source (928), missing source URL (584), no actionable candidate (503), conflicting identity (253), source authorization (187), unavailable source (113) and insufficient confidence (69); 159 jobs were queued. Research explains much of the backlog: 723 cases lack a uniquely corroborated settlement, 453 lack a canonical venue in the same city/country, and 280 lack an explicit business relationship. These are overlapping workflow cohorts, not additive case totals.

Colgay Pride's owner confirms Columbus, Georgia and a current street address, but that distinct canonical city is absent. Easton, Pennsylvania and the Ocean Pines/Berlin, Maryland identity also lack resolved canonical geography. The Transverse describes an online community, without a supported physical venue identity. No city identifier, physical venue or QID is invented.

Oz Phoenix/Wausau, Partners Oklahoma City/New Haven and Scandals Portland/Asheville/Florida still need safe historical source separation. Portland's operator confirms a new Alberta Street address, but changing the mixed canonical alone would leave foreign source identities attached. Phoenix returned HTTP 401, Partners failed DNS, and no unambiguous separate existing destinations were found for every namesake. Do not delete source rows: presence-history children cascade on deletion. The deployed guard prevents this specific missing-distance name decision for new candidates; it does not automatically undo existing source identity mappings or make unresolved historical profiles correct.

The prior PR was merged during this pass. This continuation is based on the refreshed main branch and carries its own implementation, audit and source manifest.
