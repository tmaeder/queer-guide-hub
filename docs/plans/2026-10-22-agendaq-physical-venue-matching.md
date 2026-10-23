# Automatic event destinations from source location identities

AgendaQ event records can list an organizer before the destination. Matching only the displayed venue name therefore left real venue links unresolved, including French rubbermen → IDM Sauna and Les Patounes → Duplex Bar.

Use the provider's physical location IDs rather than choosing the first business reference or relaxing fuzzy-name thresholds. An event and venue must share a positive, non-approximate source location ID and country code; current city/country IDs must agree, and current coordinates must be within 100 metres. Both source URLs, slugs and entity names must corroborate the current records. Exactly one canonical, open physical venue may qualify. Existing venue links/name provenance, human-owned or confirmation/force-review cases, ambiguous destinations and competing same-title/time/venue slots remain protected.

Project source fields before joining profiles. The initial plan evaluated geographic distance before matching source location IDs, expanding into unrelated event/venue pairs. A materialized source-pair boundary makes the operation bounded and keeps expensive geography checks on actual source matches.

Every repair records source IDs, URLs, payload hashes, location ID, previous venue name and a machine-authored provenance marker. Native content revision logging captures the full before/after event. Only the destination link/name and their ordinary derived geography/provenance change. The related named-venue finding is resolved; other quality findings and reviews remain intact.

The migration adds a service-only, dry-run-by-default helper and calls it from the existing event-link automation. Its existing enabled/paused control, schedule and run log remain authoritative, and reported totals include source matches. This migration is **pending normal deployment**, not manually applied during the concurrent email release.

## Verification and actual repairs

- Production dry run: 28 pending cases.
- Rolled-back real pass: 28 links, 28 resolved findings and 28 native content revisions; protected event values, other findings and unrelated reviews retained identical hashes.
- Committed real pass: 28 links and 28 findings resolved. Repeated real pass: zero changes.
- Disposable PostgreSQL fixtures cover 31 cases, including curated provenance, source identity/URL/country contradictions, closed/duplicate/nonphysical venues, approximate/invalid location IDs, distance, confirmation flags (including legacy strings), ambiguity, duplicate slots, other findings, batch bounds, permissions, idempotency and the automation's paused state. The complete migration corpus parses with PostgreSQL 17.

## Additional contact repair

Twenty-five active organizations had a source phone but no native contact. The phone repair requires their sole canonical primary venue to match name/city/country, preserves existing contacts/provenance/waivers, and requires all parseable recorded phone claims to agree. It uses the existing country rules and requires a country-consistent E.164 result; no number is guessed. Every mutation has a business-quality audit event and source provenance.

Production rollback confirmed all 25 repairs while preserving protected organization fields, waivers and other findings. The committed pass corrected 25 phones and 25 contact findings; repeat real pass changed zero. Early filtering to supported source records avoids an expensive scan of unrelated payloads.

Full pending total at 2026-10-22 19:42:47 UTC: **131,326 = 123,905 findings + 7,421 decisions**. Concurrent source/review jobs also run, so this is not a claim that all net movement came from these repairs. The fewer-than-100 target remains unmet.
