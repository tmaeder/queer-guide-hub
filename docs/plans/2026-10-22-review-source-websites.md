# Fill missing business contacts from recorded source websites

The contact queue still contained source-backed websites that had reached `venue_sources` but not the corresponding organization. Re-crawling the same venue is unnecessary when the stored evidence already supplies an unambiguous website.

Use a bounded repair with a dry-run default. Require the organization's sole canonical, open primary venue to link back to it, matching names and all known city/country values. Restrict organization roles to venue/support/community/advocacy. Require an unwaived failed/pending contact finding, completely empty contacts, and no existing website provenance. Existing contact values and curated provenance are preserved.

Inspect both raw and normalized website claims across every source attached to that venue. All syntactically valid claims must agree on the host. Choose an explicitly supported source with a recorded source URL; reject source-directory links, search/map/translation links, social links and shortened URLs. Category labels, escaped URLs and literal `null` values are invalid. Keep domain conflicts pending. Copy the actual recorded URL, without inventing or claiming to verify a website.

The script locks and rechecks organizations, venues, findings and source rows, records an audit event with previous finding state and source evidence, stamps field provenance, and corrects only the contact finding and corresponding summary. Content, safety, lifecycle, verification and scores remain unchanged. Time and lock limits bound each transaction. Candidate IDs are selected before materializing and locking evidence: materializing complete source payloads caused excessive temporary-file IO, so the final query retains only the needed scalar fields and finishes in under three seconds in production.

## Verified production result — 2026-10-22

Dry run: 50 candidates, zero mutations. A rolled-back real write repaired all 50, produced exactly 50 audit events, and preserved hashes of every protected organization field, all waivers and every other quality finding on those organizations. Actual committed pass: **50 websites and 50 contact findings corrected**. Repeated real pass: zero candidates and zero changes. Source IDs, source URLs and payload hashes remain in the database audit/provenance; these are source inheritance, not human verification.

The full queue count refreshed at 18:57:12 UTC was **131,450 = 123,930 findings + 7,520 decisions**. Concurrent source/review activity means this is not a claim that all net movement came from this repair. The user's fewer-than-100 target remains unmet.

Archived profiles were also investigated: 1,555 of 1,556 canonical archived organizations still link to open venues. Their 5,007 completeness findings were not retired merely because the organization is archived; the live linked venues make that an unsafe assumption.

The actionable review-gate revision `2026-10-22.actionable-verdicts-v2` remains served. Its database changes and earlier bounded sweeps are recorded in `2026-10-22-actionable-review-gate.md`; the final PR checks and release must still be verified separately.
