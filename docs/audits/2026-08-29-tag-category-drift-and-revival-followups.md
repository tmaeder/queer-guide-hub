# Tag category drift, and what the kinktionary revival still leaves open

Measured on prod 2026-08-29, while unblocking a `db push` that had been failing
for hours. Three findings, only one of which was fixable without an editorial
decision. Written down because two of them are traps the next revival wave will
walk into.

## 1. Category drift — FIXED (`20260829072807`)

A tag states its category three times: `unified_tags.category_id`, the
`unified_tags.category` TEXT derived from it, and a primary row in
`tag_category_assignments`. **378 rows disagreed with themselves**:

| shape | n |
|---|---|
| `category_id` with no matching primary junction row | 366 |
| **two** primary junction rows, so "the primary" is undefined | 12 |

Cause: both sync triggers are guarded by
`new.category_id is distinct from old.category_id`, so they only maintain the
junction when `category_id` **changes**. Any writer that inserted a junction row
directly, or set the TEXT column directly, left the three representations free to
diverge with nothing to pull them back.

The repair anchors on the **published TEXT** — the value a reader sees — and
asserts that not one published category moved. Anchoring on `category_id`
instead would have silently re-filed 309 rows, because the BEFORE trigger derives
the text from the column. Post-state: 0 drifted, 0 double-primaries.

The 12 double-primary rows were found only because two of my own queries
disagreed about the same number (1 vs 3 three-way conflicts) — a scalar
`(select … limit 1)` was picking arbitrarily between two primaries. **A
`limit 1` over a set you believe is unique will hide the fact that it is not.**

## 2. Three rows whose published category looks wrong — NOT fixed, needs an editor

These disagreed on all three axes. They are now internally consistent, at their
existing published value, and can be moved by the normal category path.

| slug | published category | note |
|---|---|---|
| `prep` | Consent & Negotiation | PrEP is sexual health; this reads plainly wrong |
| `mullerian` | Fetishes & Interests | an anatomy term filed as a fetish |
| `viagra` | Sexual Health | defensible, though the PDE5 work may prefer Substances |

Re-filing a live health page is an editorial call, not deploy hygiene, so the
repair migration deliberately left them.

## 3. The revival's header cites three examples it did not revive

`20261004110000_kinktionary_revival_w1` opens by naming four pages as the
motivating case — "/tags/felching, /tags/figging, /tags/bastinado and
/tags/omorashi are each a finished page with 300-550 characters of prose and a
Wikidata ID, serving a 404."

Measured after all four waves applied:

| slug | status | prose length | in a wave? |
|---|---|---|---|
| `felching` | active | 178 | yes |
| `figging` | deprecated | 19 | no |
| `bastinado` | deprecated | 20 | no |
| `omorashi` | deprecated | 31 | no |

Three of the four are 19–31 character stubs, not "finished pages", and the
generator was right to exclude them — reviving them would publish exactly the
thin pages the rest of that migration takes care to avoid. The header's example
list was evidently written before the wave lists were finalised and never
re-checked. **Do not cite it as evidence again**; the claim is wrong for three of
its four examples.

## 4. What is left of the 2026-06-05 orphan sweep

The four waves revived 956 tags. Remaining orphan-deprecated rows, and the
candidate pool a wave 5 would draw from:

| cohort | n |
|---|---|
| still `status='deprecated'` with the 2026-06-05 orphan reason | 3,399 |
| …of which prose ≥ 200 chars | 878 |
| …of which prose ≥ 200 chars **and** a `wikidata_id` | **445** |
| prose 50–199 chars | 1,703 |
| stubs under 50 chars (where `figging` et al. live) | 818 |
| carry a `wikidata_id` | 1,364 |
| `is_adult` or `is_sensitive` | 857 |

The 445 with both real prose and an external identifier are the defensible next
tranche. The 818 stubs are not revival candidates at all — they need prose
written before they are worth a page, which is content work, not a status flip.

## For the next wave author

The junction invariant is now clean corpus-wide, so a wave asserting it will
pass. But the assertion is still the fragile kind: it tests a **corpus-wide**
invariant the migration itself has no way to establish, so any new drift from an
unrelated writer blocks that wave — and therefore every merged migration behind
it. Prefer asserting only over the rows the migration actually writes, or repair
the mismatch in-migration by writing `category_id` (which makes
`sync_tag_category_assignment_after` do the junction work for you).
