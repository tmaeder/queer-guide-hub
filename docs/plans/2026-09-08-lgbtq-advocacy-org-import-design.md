# LGBTQ political advocacy groups → `organizations` (2026-09-08)

Import the English Wikipedia LGBTQ political organization / advocacy group
category tree into `public.organizations` under a new `advocacy` role.

## Why `organizations`, not `unified_tags`

The request was "tags or organisations". Measured on prod, the tag table
answers this itself: named organizations exist in `unified_tags` only as
residue, never as a pattern — `ACT UP` is there twice, `PFLAG (Parents,
Families And Friends Of Lesbians And Gays)` and `The Trevor Project` sit at
`usage_count = 0` with no category at all, `Ilga-Member` has one use. The
`Politics & Activism` category (117 rows) is a *concept* vocabulary —
Protest, Advocacy, Lobbying — carrying its own wrong-entity garbage
(`Seafood`, `Guinness`, `Fish-&-Chips`).

The repo has already ruled on this once: `organization` was removed from the
venue category vocabulary because "is this a venue at all" is answered by the
`organizations` table, never by a category value. An organization is an
entity with a country, a website and a lifespan; a tag is a concept. Filing
421 named bodies as tags would put 421 un-navigable concept pages into the
glossary and leave the entity directory — which already holds 6,142 rows and
is live at `/organizations` — none the richer.

## Measured scope

Crawl: 7 root categories, depth ≤3, cycle-safe, 99 distinct categories
visited. Artifacts in `scripts/data-quality/out/lgbtq-political-orgs.json`.

| | count |
|---|---|
| Distinct article titles | 426 |
| **Distinct Wikidata QIDs** | **421** |
| Have official website (P856) | 247 (58%) |
| Have inception (P571) | 318 (75%) |
| Have dissolved date (P576) | 25 |
| In the Defunct category | 28 |
| **Defunct by either signal (union)** | **48** — they overlap on only 5 |
| No P17 country claim | 118 (28%) |
| No P31 class claim at all | 32 |
| Already in `organizations` | 50 (26 by QID, 43 by name) |

After exclusions the importable set is **408 entities**, of which 45 are
defunct — the union above minus the excluded rows.

424 of 426 appear under more than one root — the tree is nested views of one
corpus, so root counts must never be summed.

## Four traps, each measured

**1. Redirects are returned as articles.** `categorymembers` hands back
redirect pages carrying their own category tags, indistinguishable from real
articles without a second lookup. `Act Up-Paris` → *ACT UP*;
`National Stonewall Democratic Federation` → *Stonewall Democrats*;
`Kentucky Fairness Alliance` → *Fairness Campaign*; `Diversity Champions` →
a *section* of *Stonewall (charity)*. 425 titles collapse to 421 QIDs.
**Key on QID, never on title** — a title-keyed import creates four duplicate
rows on the first run.

**2. A quarter of the "countries" are US states.** The category pattern
`LGBTQ political advocacy groups in X` fires identically for `…in France`
and `…in California`. Category-vs-P17 disagreement fires on 82 of 290
comparable rows, but **79 are this artifact** (plus Scotland-vs-UK). A naive
"disagreement blocks" rule would flag 79 false positives and bury the two
real ones:

- `Pink Panthers` — category says United States; P17 lists Canada, France,
  Portugal, Spain, and no US at all.
- `Parliamentary League for Considering LGBT Issues` — a **Japanese Diet
  caucus** carrying **P17 = United States**. Wikidata is wrong here.

So the state→country resolution runs *before* the comparison, and only then
does disagreement block. Same shape as `resolve_country_from_text`.

**3. Defunct cannot be read off P576, and the gap is far wider than it
looks.** 28 rows sit in a Defunct category and 25 carry a P576 dissolved
date — but they overlap on only **5**, a union of **48**. Neither signal
identifies more than about half the dead organizations. This was originally
written as "28 defunct", which was wrong in the direction that matters:
keying liveness off `dissolved_at` alone would have published 20 dead
organizations as live and contactable. Hence `is_defunct` (the fact, from
either signal) is a separate column from `dissolved_at` (the date, when there
is one), and a CHECK enforces that a date implies the flag.

**4. 32 QID'd articles carry no P31 at all** — `OutNebraska`, `Janus
Society`, `Human Dignity Trust` among them, all real organizations. A P31
allowlist would drop them. **Absence of a class claim is not evidence of not
being an organization**, so the exclusion list is hand-curated per row with a
stated reason, never derived from P31.

## Exclusion list (hand-read, reason per row)

Rows go live on insert, so this filter runs *before* the write, not as a
post-hoc review.

Not organizations: the 4 Wikimedia list articles; `Rick Zbur` (P31 = human —
a misfiled biography); `Gay and Lesbian Kingdom of the Coral Sea Islands`
(micronation); `ILGA consultative status controversy` (an event);
`Yes Equality campaign` and `OneLove` (time-boxed campaigns, not standing
bodies); `PaykanArtCar` (an art car).

Out of scope: `SiegedSec` (P31 = criminal organization — a hacktivist crew;
`Category:LGBTQ political organizations` is not a safety-reviewed
vocabulary). General parties that entered only via their LGBT wings and are
not themselves queer organizations: `Green Party Korea`,
`Socialist Alternative (Russia)`, `Russian Socialist Movement`.

Kept deliberately: LGBT party wings (`Rainbow Labour`, `LGBTory`,
`LGBT+ Liberal Democrats`, …) are real standing organizations; `SPoD`, whose
only P31 label is the Turkish *dernek* ("association"); and the archive
projects `Queer History Boston` / `The Rainbow History Project`.

## Dissolved organizations stay findable

`search_hybrid` excludes on `closed_at` in the **candidate CTE**:

```sql
where ($3 is null or sd.entity_type=any($3)) and sd.closed_at is null
```

The `-0.5` penalty further down the scorer is dead code for closed rows —
they never reach it. So setting `closed_at = dissolved_at` would make Gay
Liberation Front, STAR and the Scientific-Humanitarian Committee
**unfindable in site search**. Deleting the movement's founding
organizations from a queer platform's search is the wrong outcome.

Therefore: `closed_at` stays NULL and `liveness_status` becomes `dead_link`
for dissolved rows, which *is* in the scorer's `-0.5` derank list. Dissolved
organizations rank below live ones and remain reachable by name.

`closed_at` is non-null on 0 of 120,170 search documents today; this design
does not change that.

## Schema

Migration `20360317142253`:

- widen `organizations_roles_known` to admit `advocacy`
- add `organizations.founded_at date`, `organizations.dissolved_at date`
- `search_documents_index_organizations`: emit
  `case when dissolved_at is not null then 'dead_link' else 'live' end` as
  liveness, keep `closed_at` NULL, add `defunct` to the facets jsonb

`advocacy` is a new role rather than the unused `community` slot or the
existing `support` role. `support` (3,019 rows) is the help directory — a
reader looking for a hotline must not be handed a 1970s liberation front.
`community` is empty and undefined; spending it here would name the lane
wrongly.

**Three-file lockstep.** The role vocabulary lives in the DB CHECK, in
`OrgRole` (`src/hooks/useOrganization.ts`) and in `ROLE_LABEL` + `TABS`
(`src/pages/Organizations.tsx`). Miss one and the tab silently never renders.
A drift test ties the CHECK to `OrgRole`.

## Merge against the existing 50

- **26 by QID** → update in place; fill website / description / founded /
  dissolved, stamp the QID.
- **43 by normalized name** → auto-merge **only** where the country resolves
  to a real country on both sides and matches. Country is the guard, and per
  trap 2 the country signal is itself unreliable for ~28% of rows, so
  ambiguous or null-country pairs fall out to a printed list instead of
  merging. Roughly 30 of 43 are expected to clear.
- Remainder → insert, `roles = ['advocacy']`, `status = 'active'`.

Only 110 of 6,142 organizations carry a resolved QID today (a
`wikidata_lookup` pass on 2026-08-10 returned `no_match` for 2,011), which is
why name matching cannot be avoided entirely and why its guard has to be
real.

## Provenance

`field_provenance.<field>.source = 'wikipedia'` and
`enrichment_status.wikipedia_orgs = {date, qid, categories, defunct}`,
matching the existing `wikidata` / `ilga_member_directory` convention.

## Guards

- The migration ends in a `DO $$ … RAISE` asserting the advocacy-role count
  lands in an expected band, that no dissolved organization carries a
  non-null `closed_at`, and that no excluded title is present.
- Unit tests: the exclusion list, the state→country resolver, and the
  auto-merge country guard (including its refusal cases).
- Drift test: `roles` CHECK ↔ `OrgRole`. It *locates* the defining migration
  by scanning for the highest-versioned file that declares the constraint,
  rather than naming a filename the way the sibling venueCategories test does
  — which is what let the migration be renumbered twice during review with no
  test edit.

## Measured outcome of the planning run

Against prod, before any write:

```
entities              408  (426 titles - 4 redirects - 14 exclusions)
insert new            356
merge by QID           25
merge by name+country  23
refused (printed)       4
defunct among them     45
with description      356   (100%)
with website          198
no country resolved    15
```

The four refusals are the country guard, and each is a judgement a script
should not make: `All Out` is Germany on the existing row and the United
States in the category; `ILGA-Europe` matches `ILGA Europe` whose row has no
country at all; `Sarajevo Open Centre` and `Kif-Kif` resolve to no single
country (Kif-Kif spans Morocco and Spain). Nothing was merged that could not
be corroborated.

## Notes for a re-crawl

The corpus JSON and the extracts JSON are both committed, so the import is
reproducible without touching Wikipedia. If they are regenerated:

- re-read the exclusion list before trusting the entity count assertion in
  `wikipediaOrgs.test.ts`; it is `426 - 4 - EXCLUSIONS.size` by construction,
  so a larger crawl needs the number re-derived, not bumped;
- the conflict-count assertion (`< 10`) is the alarm for `SUBNATIONAL` going
  stale against new country categories;
- `resolveCategoryCountry` is asserted against *every* country string the
  corpus contains, so a new unrecognised subdivision fails rather than being
  filed as a country.
