# Tag Data-Quality Program (2026-08-22)

Audit measured live on prod 2026-08-22; full plan in the session plan file
(`data-quality-of-the-cosmic-creek`). Phase 0 + 1.2 shipped as migrations
`20260916110000`–`20260916112000` (this PR). This doc carries the numbers that
justify the remaining phases and the **Phase 1.1 category consolidation map
awaiting sign-off**.

## Audit snapshot (before Phase 0)

9,377 tags — 2,767 active, 6,456 deprecated, 148 merged.

| Dimension | State |
|---|---|
| Descriptions | 1,082/2,767 active missing (39%); 666 more under 80 chars; 53 sensitive/adult tags with none |
| Images | 982 active without; 1,167 of 1,785 with an image have NO license/source/alt; 294 gradient placeholders |
| Categories | 2,154 active uncategorized = 1,366 NULL + 788 DANGLING (no FK; fixed in `20260916112000`) |
| Ontology | 413 active (15%) have a broader parent |
| Assignments | 8,823 on deprecated tags; 35,250 retired news_article writer rows (both swept); marketplace 36.5k rows over 41 tags, personalities 9 tags, hotels 7 |
| Twins | 19 active same-name pairs → 11 merged, 6 sense-split exclusions, 3 review-queued |

## Phase 1.1 — category consolidation map (PROPOSAL, needs sign-off)

`tag_categories` is a 2-level tree (9 level-0 roots, 46 level-1 children).
Proposal folds the overlapping/near-duplicate and empty entries, 55 → 47.
Mechanism: `merge` = repoint tags + junction rows to the target, delete the row
(FK now guards); `delete` = 0-tag rows dropped outright.

| Action | Category (active tags) | Into | Why |
|---|---|---|---|
| delete | Risk-Aware Play (0) | — | empty |
| delete | Safer Sex (0) | — | empty; Sexual Health covers it |
| merge | Places & Travel (116, L0) | Travel & Destinations (191) | same concept, two eras |
| merge | Queer History by Region (44) | History & Heritage (12) | region split adds nothing at this size |
| merge | Friendship & Community (10) | Community & Culture (76) | duplicate concept |
| merge | Global & Regional Rights (7) | Legal Rights (47) | duplicate concept |
| merge | Helplines & Hotlines (1) | Support Services & NGOs (59) | one tag; /help owns hotlines editorially |
| merge | Support & News (4, L0) | Current Affairs (31) | orphan L0 duplicating Current Affairs + Support Services |
| merge | Dating & Courtship (3) | Relationships & Connection (3) | tiny; parent covers it |

Kept deliberately despite small size: Care Access (3), Intersex & Bodies (4),
Consent & Negotiation (9), Questioning & Labels (9) — semantically distinct,
safety- or identity-relevant, expected to grow.

NOT part of consolidation: re-categorizing miscategorized tags (freedom-of-* under
BDSM & Power Exchange, gym under Physical & Reproductive) — that is Phase 1.3
(wikidata/embedding-driven re-vote, hybrid-by-confidence, review-gated).

## Remaining phases

- **1.3** category backfill/correction for the ~800 weak assignments + the 8
  active tags with no junction data at all.
- **2** description filler (Wikipedia-grounded, `llm_budget_consume`-capped;
  sensitive/adult ALWAYS review-gated; `data_unavailable` terminal sentinel).
- **3** image provenance backfill (keep serving while backfilling — user
  decision 2026-08-22); alt-text auto-fill; Commons P18 replacements for the
  294 gradients.
- **4** cross-entity coverage (personality/hotel/marketplace derivations,
  events.tags reconciliation — 40 of 80 distinct strings unresolved), news
  concentration ratchet (design doc 2026-08-16 part 4).
- **5** ratchet sentinels in CI (new active tag uncategorized >N days, image
  without license, assignment to non-active tag, duplicate active name) +
  coverage panel on /admin/tags.
