# Review queue continuation — 17 November 2026, pass 9

Applied **32 audited record repairs**, including **eight native business merges**. The repaired native reconciler retired **34 superseded findings in 264 ms**. A separate read confirms all eight expected survivor/source audits and zero open, non-waived fail/pending findings on the donors.

The user's checkpoint was 2,820 cases. This pass first read 2,804; the latest **18:05:11 UTC (19:05 Zurich)** snapshot has **2,766 active cases**. Scheduled research and ingestion contribute to that movement. These counts are not attributed solely to the manual repairs.

## Location corrections

Eighteen venue/business records were repaired:

- River Hostel: canonical Massamagrell → Valencia, supported by its official Plaza del Temple 6 address.
- Schnürsenkel: canonical Plauen/Saxony → Hof/Bavaria, supported by the regional tourism listing at Fabrikzeile 1.
- Sauna Portugal: donor Vera/Andalusia → Las Palmas de Gran Canaria/Canary Islands. The official sauna site confirms Las Palmas; a local resort's own guide corroborates Calle Portugal 27.
- Rosie's Tavern: donor Cincinnati/Ohio → Covington/Kentucky, matching its official 643 Bakewell Street address.
- Masquerade: donor Birkenhead → Liverpool, confirmed by the current Liverpool City Council licensing register at 10 Cumberland Street.
- Vauxhall Tavern: canonical missing city and donor's mislocated Hull reference → the existing canonical Kingston upon Hull record, Q128147. Exact 1 Hessle Road/Hull address evidence comes from Companies House and Historic England's public-house listing. These sources support location; no legal-operator relationship or current trading status was certified.
- Two Spades donors: the mislocated Ghent/Brussels-Capital reference → the existing canonical Gent record, Q1296. The current official Spades4Gents website confirms Koning Albertlaan 172, 9000 Gent.

The Vera mainland pin and one Spades donor's Brussels-area pin were withdrawn to NULL on both venue and business records. No replacement exact pin was inferred. All other coordinates and the canonical venue pins are preserved. No events were linked to the affected venues at repair time.

The first full rollback test caught an expected-state mismatch: updating Vauxhall's previously missing venue city automatically inherited that city into its business before the business check. The final transaction updates business rows first; rollback and commit both pass without weakening any guard.

## Business and public-profile repairs

Eight duplicate businesses were merged through the native entity merge: The River Hostel, translated “Restaurant laces”/Schnürsenkel, Portugal, Rosie's Tavern, The Masquerade Bar, Vauxhall Tavern, Spades4Gents and Spades 4ours. All are unclaimed venue-only profiles, in the same corrected canonical city/country, with already-merged donor venues. Automatic field-transfer patches are empty and every canonical profile is byte-for-byte preserved during its merge. Guards reject additional distinct venue, merchant or news relationships. Native quality-event audits record the 34 retired findings.

Six separate public-profile repairs update three venue/business pairs. River Hostel receives its verified official website and shared `hello@riverhostelvalencia.com` inbox. Rosie's Tavern receives its verified official website; no email was invented. Spades receives its current public Spades4Gents name, official website and shared `info@spades4gents.be` inbox. Its prior `info@spades4our.bemailto` value was malformed and machine-inherited. Exact derived website-domain, email-normalization and name-normalization changes were asserted. Slugs, pins, other geography, operating hours, ownership and publication fields stay unchanged. Public branding does not assert legal ownership continuity.

## Why related cases remain blocked

The malformed Ghent city row was created by Nominatim geocoding and has a pin near Brussels plus a Brussels-Capital region. Its source candidates identify Gent, but Q1296 is already held by the correct canonical Gent row. The malformed Hull row points into London; its existing ONS audit identifies Tower Hamlets, and its Q128147 identity candidate is approximately 248 km from the stored pin. A correct Kingston upon Hull/Q128147 record already exists.

This pass repairs the corroborated venue/business references individually. It does not globally merge those city rows or move their other associated records without inspection. No new city point, external ID or human verification stamp was inferred.

Maspalomas versus San Bartolomé, Cuauhtémoc versus Mexico City, and Wilton Manors versus Fort Lauderdale require locality/municipal-boundary decisions. Hong Kong versus China country-record conventions also remain unresolved. Those records were not changed just to satisfy same-city/country merge eligibility.

The old Spades website returned 401; the independently discovered current official site supplied the repair evidence. The chamber directory and direct Historic England capture returned 403, and Hull's property page timed out. Historic England's primary entry text was available through web search; no access/TLS checks were bypassed. Masquerade's newer website is a maintenance page, so no opening-hours or operating-status claim was made from it.

## Verification and queue refresh

All repairs first passed rolled-back transactions with row locks, expected-state, unclaimed/provenance guards and exact before/after checks. Production audit confirms **18 municipality + eight merge + six public-profile rows = 32**. Independent reads confirm both withdrawn venue pins remain NULL, current contact/website values are correct, all eight survivor/source audits match, and donor findings have no open non-waived failures/pending work. Full source metadata, hashes, entity IDs and limits are in [the pass 9 manifest](review-queue-source-research-2026-11-17-pass9.json).

The prior reconciler fix's merge-policy CI job completed successfully on commit 87450d1e8, including the PostgreSQL 16 regression fixture. This pass changes production data and documentation only. No new runtime test or CI success is claimed for its documentation commit.

The queue-top refresh completed in 3.0 seconds. A worklist refresh hit this session's 30-second check limit; a one-off 45-second retry returned `already_running` because a scheduled refresh held its native lock. The later live snapshot shows 2,766 active cases and zero active refreshes. The manual retry is not represented as a completed refresh, and no persistent timeout or worklist function changed.

The largest remaining blockers are missing source (969), source URL (617), actionable proposal (553), conflicting identity (224), unavailable source (125), source authorization (117) and insufficient confidence (52). Queued, protected/visual review and retry cases remain visible. This bounded pass does not claim individual examination of all remaining cases or relax any source, confidence, publication or human-review requirement.
