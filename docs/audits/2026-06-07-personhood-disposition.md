# Personhood disposition pass — 2026-06-07

## Problem

A share of the bare-name `personalities` residue (the rows the Wikidata resolver
can't match because its `P31=Q5` human filter correctly refuses them) are not
people at all — they are organizations, venues, restaurants, sports teams, and
churches misfiled into `public.personalities`. Examples: *The Sisters of
Perpetual Indulgence*, *San Francisco Tsunami Water Polo*, *La Montaña*, *Divine
Connection Now*.

## Findings (live DB before the pass)

- `personalities`: 12,619 rows; only ~1,143 public. The `insufficient_data`
  residue (4,408) is **entirely `visibility='draft'` except one row** — already
  off every public read path (listing / detail / search all gate on
  `visibility='public'`).
- **No public row was a detectable non-person.** Every heuristic that flagged a
  public row was a false positive: a real person *associated with* an org
  ("is the founder of the org…", "is an American rapper"). The public set is
  clean.
- The real non-persons live in the **draft + has-bio** cohort. Bare-name no-bio
  residue (4,392) is un-classifiable (no text to ground on, no data to migrate)
  and indistinguishable from obscure real people, so it is left untouched.
- No `organizations` table exists as a reclassification target; `community_groups`
  is a different (user-facing) domain. Disposition is therefore **reversible
  soft-archive**, never reclassification or hard-delete.

## What shipped

Migration `20260607400000_personality_personhood_disposition.sql`:
- `archive_personality_as_nonperson(id, reason, signals)` — reversible archive
  (`visibility→draft` + `review_status='archived'` + `seo_indexable=false`,
  matching the Phase-1 adult-cohort convention). Stores a prior-state snapshot in
  `enrichment_status.personhood.archived`.
- `unarchive_personality(id)` — **extended** the existing admin restore (kept its
  `→integer` signature + `review_status→pending` behavior) to also restore
  `visibility`/`seo_indexable` from the snapshot.
- `set_personhood_verdict(id, verdict, payload)` — records `person`/`uncertain`
  verdicts without archiving (excludes from future runs; `uncertain` →
  `needs_attention`).
- `personalities_nonperson_candidates(limit)` — heuristic recall selector.
- `release_gate_checks()` gains a critical `person_nonperson_public` gate.
- Weekly cron `wf-classify-personhood` + `classify-personhood` workflow def.

Classifier `_shared/personhood-classifier.ts` (+ `classifyWikidataPersonhood` in
`_shared/wikidata-resolve.ts`): fuses name/bio heuristics + Wikidata `P31` +
LLM grounded in the bio, hybrid-by-confidence. A confident Wikidata-human match
**vetoes** archiving. Edge function `pipeline-classify-personhood` drives it
(circuit-broken, daily-capped, webhook/internal-secret gated).

## Pass results

80 candidates classified (broad recall net + no-bio selector residue):

- **12 archived** as confirmed non-persons (orgs / venues / teams / one misfiled
  country), all at confidence ≥ 0.8.
- **6 flagged `uncertain`** → `needs_attention` (weak signal, no confident
  Wikidata match; includes 2 real rugby players the conservative thresholds
  correctly **refused to archive**).
- **62 confirmed persons** retained (the public false-positives).
- 0 errors.

## Verification

- All 12 non-persons: `visibility != 'public'` (0 public), `seo_indexable=false`,
  `review_status='archived'`, reversibility snapshot present, **0 present in
  `search_documents`**.
- `release_gate_checks()` critical gates all 0, including
  `person_nonperson_public`.
- Reversibility round-trip (`unarchive` → restore → re-archive) verified.

## Deferred

- Bare-name no-bio residue (4,392) stays as-is (un-classifiable; conservative).
- 6 `uncertain` rows await human triage (`/admin` needs_attention queue).
- A targeted re-fetch could give bare-name rows a bio to classify; out of scope.
