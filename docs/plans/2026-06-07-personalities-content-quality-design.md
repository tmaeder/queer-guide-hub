# Personalities Content-Quality Remediation — Design

**Date:** 2026-06-07 · **Status:** Phases 0–4 SHIPPED · **Owner:** tmaeder

## Progress (2026-06-07)

- **Phase 0 — SHIPPED.** `20260607000000_personality_outing_guard_strengthen.sql`. The shipped `person_outing_guard` was tautologically zero; redefined to the real harm (committed identity claim + living + public/indexable + no provenance anchor). BEFORE trigger demotes violators to draft instead of raising. Verified live (gate=0; insert test demoted).
- **Phase 1 — SHIPPED.** `20260607001000_personality_archive_unanchored_adult.sql`. Soft-archived 2,857 unanchored adult rows; kept 4,155 Wikidata-anchored. Reversible via `unarchive_personality(uuid)`. Verified: 0 publicly exposed, 0 left in search.
- **Phase 2 — SHIPPED.** Rewrote `_shared/wikidata-resolve.ts` into a precision-first, recall-improved resolver (multilingual + birth-year/death-year/nationality disambiguation, profession optional, living stricter bar); 16 unit tests. Wired into `personality-refresh` (replaced inline top-1 pick), deployed. `personality_data_health` view now excludes archived (`20260607002000`). Re-queued 4,855 unanchored rows (`last_refreshed_at=NULL`) so the 30-min cron re-attempts them with the new resolver. **Live verification: 75/75 manual-batch matches correct, all high-confidence** (Freddie Mercury, Lana Wachowski, Marsha P. Johnson, Lili Elbe, Patricia Highsmith, …). Active-anchored rose to 50.6%; ~4,780 still draining via cron.
  - **Honest ceiling:** of the 4,855 re-queued, only 432 carry a corroborating signal (birth/profession/nationality); the other ~4,400 are name-only and will mostly *not* match (correctly — name-only living people must not be force-matched). That residue is Phase 3 / human-curation work.
- **Phase 3 — SHIPPED (reframed for safety).** The Wikidata-absent residue turned out to be ~94% bare names, a meaningful share of which are **organizations / venues / teams misfiled as personalities** (e.g. "The Sisters of Perpetual Indulgence", "La Montaña" restaurant, "SF Tsunami Water Polo"). A web-research LLM over bare names = fabrication of identity claims, so Phase 3 was split:
  - **3a — `personality-extract-from-bio`** edge function (deployed, daily cron `15 4 * * *`): extracts *factual* fields (birth/death year, profession, nationality) **strictly from a row's own bio** — grounded, never invented, never `lgbti_connection` — fills blanks, writes `self-bio` provenance, re-queues for a Wikidata pass. Verified faithful (Jiří Karásek 1871–1951; 0 fabrication; living thin-bio rows yield nothing). Migration `20260607003000`.
  - **3b — honest triage:** 4,408 bare-name rows flagged `enrichment_status.triage='insufficient_data'` for human review (queryable bucket; not auto-enriched).
  - **New finding (own follow-up):** non-person pollution of the personalities table needs a reclassify/remove pass (the resolver's P31=Q5 filter already refuses them, which is why they're the unmatchable residue).
- **Follow-up SHIPPED — sourced `lgbti_connection`.** `lgbti_connection` was `unclear` for the entire corpus. Now that Phase 2 anchors people to Wikidata, `personality-refresh` derives a *sourced* connection from orientation (P91) / gender-identity (P21) claims → `community_member` (else null, never guessed). The QID is the provenance the outing guard requires, so it's safe for living people; only upgrades the `unclear`/`none_known` placeholders. Pure mapping unit-tested (`_shared/lgbti-connection.ts`, 10 tests). `personality_data_health` now counts a missing connection in debt and **excludes the 4,408 insufficient_data-triaged bare names** (they were starving the loop). Verified: Parker Brookes → `community_member` via P91:Q6636 (living, sourced, guard-passed). **Honest ceiling:** Wikidata P91/P21 coverage is sparse, so connection fill will be modest; it drains via cron behind the recall pass.
- **Follow-up SHIPPED — non-person cleanup.** Found the shared entity classifier matched place keywords as *substrings* ("bar"⊂"Barbara", "inn"⊂"Quinn", "spa"⊂"Spahn") — a dry-run showed it would have wrongly archived real icons (Barry Manilow, Natalie Clifford Barney, Barbara Grier). Fixed to whole-word matching in both byte-identical copies (`src/lib/entityClassifier.ts` + `_shared/entity-classifier.ts`; benefits the import validator + CSV preview too) with a regression test. New `personality-detect-nonpersons` edge function then soft-archived **101 confirmed non-persons** (venues/scrape-junk; e.g. Café Gnosa, Crown and Anchor Inn, The Stonewall Inn) and flagged 91 ambiguous — **0 real people archived** (audited all 101). Reversible (`archived_reason='non_person'`).
- **Phase 4 — SHIPPED (partial, with a deliberate non-action).**
  - **Observability:** `personality_quality_overview()` RPC (`20260607004000`) + `PersonalityQualityPanel` on `/admin/content/personalities` — shows anchored %/count, re-queue drain, archived cohort, the `insufficient_data` triage bucket, bio-extractable, and low-confidence matches. Build + tests green.
  - **`lgbti_relevance_score` default — investigated, deliberately NOT bulk-nulled.** Evidence: the 0.8 is a blanket import default **only for the adult cohort** (5,310 "Gay adult performer" + 1,676 null-src, all `is_adult`); the **non-adult scores are genuinely varied** (0.0/0.2/0.6/0.9… across 74 distinct classify-times) — i.e. real classifier output. A bulk null would destroy real signal and risk search-ranking regressions. The only blanket-0.8 rows still surfacing are the 4,155 kept-anchored adult, where 0.8 is not unreasonable. Per the standing "don't back-write it" caution, left as-is. A *proper* re-classification (not a null) would be the real fix — separate, larger effort.

---

**Date:** 2026-06-07 · **Owner:** tmaeder
**Supersedes context:** `docs/audits/2026-06-05-trust-safety-audit.md` findings C-2, H-5, M-6 (people)

---

## Diagnosis

The `personalities` corpus (12,528 live) is two inverted populations:

| Cohort | Count | Bio | Image | Birth date | Wikidata | Avg quality | Public |
|---|---|---|---|---|---|---|---|
| **Adult performers** (`is_adult`) | 7,012 (56%) | 100% | 100% | 25% | 59% | 68 | 3% |
| **Genuine icons** (non-adult) | 5,516 (44%) | 19% | 20% | 18% | 12% | 47 | 16% |

Additional facts (live, 2026-06-07):
- 4,460 (36%) have **zero text** (no bio, no description).
- 9,797 (78%) have **no birth or death date**.
- `lgbti_connection` = `"unclear"` (10,178) or NULL (2,350) — **real LGBTQ+ connection established for nobody**; `lgbti_details` 0% filled.
- `lgbti_relevance_score` = 0.8 for 7,389 rows — a **default constant, not a real signal**.
- `social_links` 0% filled.
- 5,096 living adult performers carry the assigned "Gay adult performer" provenance label (outing risk; now demoted to draft — 1,147 total public).

### Root cause (the key finding)

The enrichment loop **already runs** (`personality-refresh` "Loop A" — 5,935 refreshed in last 7d, 7 crons, 11,286 `personality_sources` provenance rows). It is **not** broken or missing.

The failure is **reconciliation recall**: among the 5,516 icons, 5,514 were refreshed but **4,853 (88%) got no Wikidata match**, and 4,457 remain empty. The matcher uses a naive top-1, English-only `wbsearchentities` lookup — it misses non-English names, pseudonyms, dead activists, and anyone needing disambiguation. Fixing reconciliation recall is the lever; building new enrichment would be wasted effort.

---

## Decisions (locked)

1. **Scope:** Both populations, in sequence — de-risk the adult cohort first, then enrich the icons.
2. **Adult cohort fate:** Curate — keep Wikidata-anchored (~4,155), drop the unanchored (~2,857).
3. **Drop method:** Soft-archive (reversible), never delete.
4. **Enrich method:** Wikidata-first; LLM (circuit-broken agentic-enrich) only for the Wikidata-absent residual. Always draft + provenance, never auto-public.

---

## Phase 0 — Guardrail first

Ship the audit's **`person_outing_guard`** as an enforced constraint: no `public`/`seo_indexable` personality may carry an `lgbti_connection` outside a controlled vocab **without** a provenance anchor (`wikidata_qid` or a cited `personality_sources` row). Runs on write + nightly. Freezes the harm surface so no later phase can leak a mislabeled living person.

## Phase 1 — Curate the adult cohort

- **Keep** the 4,155 Wikidata-anchored adult rows.
- **Soft-archive** the 2,857 unanchored rows: `review_status='archived'` + `seo_indexable=false` + `visibility='draft'`. Excluded from search/surfaces, audit trail kept, reversible. (752 have zero signal — clear noise.)
- One reversible migration + an `unarchive` path. No deletes.

## Phase 2 — Fix reconciliation recall (the actual lever)

Rewrite the matcher in `personality-refresh` / `_shared/wikidata-resolve.ts` from top-1 English search to a **scored multi-candidate resolver**:

1. Pull top-N `wbsearchentities` candidates across **all languages + aliases** (not `limit=1`, not en-only).
2. **Disambiguate by evidence:** score each candidate's P569 (birth year), P106 (occupation), P27 (nationality) against our row; require P31=Q5 (human). Threshold the score.
3. Accept only above-confidence matches; everything else → unresolved queue.
4. On match, fill blank columns (birth/death/image/nationality/occupation/sitelinks) **and** derive a **sourced `lgbti_connection`** from Wikidata P91 (sexual orientation) / P21 (gender) — turning "unclear" into a provenance-anchored value that satisfies the Phase 0 guard.

**Target:** lift icon reconciliation from ~12% toward 50–70%.

## Phase 3 — LLM fallback for the Wikidata-absent

For names that resolve to no QID (dead local activists, pseudonymous figures), use the **existing circuit-broken agentic-enrich pattern** (Claude/OpenAI, grounded in web sources, daily cap):
- Generates bio/dates/connection **with cited sources** written to `personality_sources`.
- **Always lands in `draft`, never auto-public.** Living-person records get a stricter confidence bar. Subject to the Phase 0 guard.

## Phase 4 — Observability & self-correction

- `personality_data_health` view ranks unresolved/thin/stale records; the loop drains it by priority.
- Admin panel on `/admin/personalities`: reconciliation coverage %, unresolved queue, "needs human ID" list, archive/unarchive controls.
- Fix the `lgbti_relevance_score` default-0.8 artifact: null it where it was never truly computed, so it stops masquerading as signal.

---

## Sequence & verification

`Phase 0 (guard)` → `Phase 1 (archive)` → `Phase 2 (recall)` → `Phase 3 (LLM residual)` → `Phase 4 (observability)`.

Each phase is independently shippable and verified on production (queer.guide), not just localhost.

## Reuse inventory (already exists — do not rebuild)

- `supabase/functions/personality-refresh/` — Loop A continuous refresh (Wikidata + Wikipedia, fills blanks only, writes provenance, recomputes quality).
- `supabase/functions/_shared/wikidata-resolve.ts` — resolution primitives (the thing to upgrade in Phase 2).
- `supabase/functions/_shared/personality-quality.ts` — quality rubric (max 100; rewards image/desc/connection/dates/profession/nationality/wikidata).
- `supabase/functions/_shared/personality-enrich-core.ts` — `fillBlanks`, `parseWikipediaSummary`.
- `supabase/functions/event-agentic-enrich/` — circuit-broken LLM enrichment pattern to mirror for Phase 3.
- `personality_sources` table — provenance ledger.
- `personality_data_health` — health-ranking view feeding the loop.
