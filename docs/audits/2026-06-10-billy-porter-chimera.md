# Billy Porter identity chimera — audit & remediation (2026-06-10)

## Summary

`personalities` row `6287f296-8229-4a62-969d-dd21b782f52f` (slug `billy-porter`, PUBLIC)
was a data chimera: created from an LGBTQ+ list (intent: US actor/singer Billy Porter,
\*1969), but the Wikidata resolver matched **Q4913178 — Billy Porter, English footballer
(1905–1946)** and the refresh pipeline overwrote bio, dates, nationality, birthplace and
profession with footballer facts. The actually queer-relevant actor was missing from the
table. Fixed by repurposing the row to the actor (option a). While verifying on
production, a second, unrelated sitewide regression from the same day's import was found
and fixed (see below).

## How the chimera happened

| When | Event |
|------|-------|
| 2025-08-15 | Row created (source: LGBTQ+ list ingest, `lgbti_connection_source='lgbtq_listed_source'`) |
| 2026-04-26 | Scrape source `wikipedia:billy-porter` attached (actor's Wikimedia image in raw payload). Same run created an empty stub `billy-porter-actor` (id `89abbc11-…`) from the `/wiki/Billy_Porter_(actor)` disambiguation entry |
| 2026-06-07 | Wikidata resolver (resolver rewrite) bare-name-matched **Q4913178** at confidence 1.0 with empty `match_reasons`; refresh overwrote the row with footballer facts. Note: actor is **Q4913177** — adjacent QID, classic disambiguation near-miss |
| 2026-06-10 19:42 | Arbeitsliste import (upsert key = slug) tried to write the actor's data (birth 1969-09-21) onto the row → `personalities_birth_before_death` violation (death 1946 still present) → batch aborted, row logged to `imports/personalities-2026-06/identity_mismatches.json` |

Root cause: **name-keyed matching without identity verification across two pipelines** —
the list ingest keyed on name/slug, the Wikidata resolver keyed on bare name. Neither
checked birth-date consistency against the row's existing claims. The
`birth_before_death` constraint was the only thing that stopped the import from
completing the chimera.

## Remediation (applied 2026-06-10, prod DB)

1. **Repurposed `billy-porter` to the actor** (kept id/slug/view history — the row's
   provenance was the queer list, i.e. the actor; the footballer data was enrichment
   contamination): QID → `Q4913177`, birth 1969-09-21, death NULL, profession `Actor`,
   nationality United States, Pittsburgh geo links, tags from the verified Arbeitsliste,
   Tony achievements, Wikimedia image, `lgbti_connection='community_member'` (publicly
   out for decades; Wikidata P91 documented; outing guard satisfied via QID),
   `external_ids.freebase_id` → `/m/04g2kn2`, `payload_hash` NULL (forces re-refresh).
   Audit trail in `enrichment_status.identity_fix`.
2. **Fixed `personality_sources`**: wikidata source row → Q4913177; wikipedia source row
   → `https://en.wikipedia.org/wiki/Billy_Porter`.
3. **Stub `billy-porter-actor`** (`89abbc11-…`, empty draft): `duplicate_of_id` →
   canonical row (soft, reversible).
4. Verified: row serves correctly via anon PostgREST; `search_documents` re-synced
   ("American actor and singer").

## Related-rows audit

Public rows with `profession='Athlete'` + `lgbti_connection_source='lgbtq_listed_source'`:
only Isaac Humphries and Solomon Bates — both genuinely out athletes. **No other
footballer-style chimera found** in that slice.

Recommended follow-up: a one-shot consistency check comparing `personalities.birth_date`
against the primary wikidata source's P569 for all rows with a `wikidata` source —
date mismatch ⇒ probable wrong-QID match.

## Collateral finding: import broke 408 public detail pages (separate bug, fixed)

The same 2026-06-10 import wrote **jsonb objects** into columns the frontend renders as
`string[]`:

- `fields = '[{}]'` on **1,673 rows** (341 public) — junk
- `fields = [{"parties": ["…"]}]` on **150 rows** (67 public) — real politician data,
  wrong shape for the UI
- `achievements` objects (`{"type":"award","key":…}` / `{"type":"award_detail","text":…}`)
  on **184 rows**

`transformPersonality` (src/pages/PersonalityDetail.parts.tsx) passed them through and
React threw *"Objects are not valid as a React child"* → ErrorBoundary on **every
affected public personality detail page** from ~19:45 UTC.

**Fix shipped:** `toRenderableStrings()` coercion in `transformPersonality` (keep
strings, unwrap `object.text`, drop the rest) — repairs all pages on deploy and keeps
the structured data in the DB.

**Open (needs operator approval):** batched DB cleanup of the 1,673 junk rows:

```sql
-- run in batches of ≤300 (search_documents trigger fires per row)
WITH b AS (SELECT id FROM personalities WHERE fields = '[{}]'::jsonb LIMIT 300)
UPDATE personalities p SET fields = '[]'::jsonb FROM b WHERE p.id = b.id;
```

The `{"parties":…}` rows and structured achievements can stay (UI now tolerates them);
longer term the import transform should write strings or a dedicated column.
