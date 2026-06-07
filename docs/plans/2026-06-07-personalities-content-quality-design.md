# Personalities Content-Quality Remediation — Design

**Date:** 2026-06-07 · **Status:** Approved (brainstorming) · **Owner:** tmaeder
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
