# Tag glossary triage — QID collisions and Destination/geo duplication

**Date:** 2026-09-04 · **Scope:** `unified_tags`

## Status — what is and is not live

**Nothing has been applied to the database.** A safety classifier in the authoring session
blocked every write path to prod (`apply_migration`, `execute_sql` writes) while leaving reads
working; re-measured afterwards, `seo_deindex_reason='place-duplicate'` is on **0 rows**. The
migration is written, its predicate is verified read-only against prod, and it applies on merge
via CI `db push`.

| Artifact | State | Verification |
|---|---|---|
| `supabase/migrations/20270501180000_tag_place_duplicate_deindex.sql` | **written, NOT applied** | predicate verified read-only on prod: selects exactly A=39 B=1 C=95 (135), 0 leakage from D/E/F |
| `_shared/tag-wiki-guard.ts` fail-open fix | **code complete, NOT deployed** | 9/9 unit tests; mutation-tested (removing the guard fails the new test); full edge suite 1,072 passed / 0 failed; `deno check` and `typecheck:functions` clean |
| `e2e/tags-place-duplicates.spec.ts` | **written, not executed** | assertions hand-evaluated against live prod — see below |
| Merges (46 groups) | **deliberately not done** | §3.3 — needs hand-reading; would red every open PR |

**The e2e was evaluated against prod by hand, and it correctly reports the un-applied state:**
all 6 duplicate cases FAIL (`brighton`, `chicago`, `philadelphia`, `germany`, `japan`,
`australia` still indexable), all 4 controls PASS (`california`, `pennsylvania`,
`san-francisco`, `travel` still indexable), and the sitemap still advertises all 6. Sitemap
total 2,488 matches the database's indexable-active count exactly, which is the cross-check
that the surface and the column agree. It will go green when the migration lands, and not
before — that is the intended behaviour of a gate, but it means **the change is unverified in
production**.

**One verification gap, stated plainly.** The spec's `<article>` assertion could not be checked
from this session: browsers treat `User-Agent` as a forbidden header and drop it from `fetch()`,
so the browser pane returns the SPA shell, never the crawler render. The `robots` and
`description` metas ARE middleware-injected on every request, so every conclusion in §2 rests on
signals that were verified; the `<article>` half rests on the behaviour
`e2e/tags-wrong-entity.spec.ts` already depends on nightly.

Both defects measured against prod. Headline corrections:

- **Defect 1: the brief's 88/186 is exactly right** (an earlier draft of this document predicted the figure was inflated by merged tombstones — it is not; the brief's query already filtered `status='active'`). But **67 of the 88 groups have two or more *indexable* members**, so this is a live duplicate-content problem, and it is materially **larger** than the destination one.
- **Defect 2: the brief's 159 is essentially right (157 by the two-signal test), but "merge/redirect into the geo entity" is the wrong action for most of it.** Only 96 of 157 are unambiguous. **13 are ambiguous same-name matches carrying 3,579 usages — more than half the usage mass, and `berlin` is one of them.** 8 are region tags with no geo entity to merge into. And the whole cohort is one description away from re-indexing itself.

---

## 1. Measured state

```
unified_tags                     10,214 total / 4,664 active
active with a wikidata_id         1,631
collision groups, all statuses      245
collision groups, active only        88   ← the brief's figure, confirmed
tags in those groups                186   ← confirmed
```

Destinations category (primary junction `travel-destinations`): **322**, confirming the brief.

| | count |
|---|---|
| indexable | 98 |
| deindexed, reason `thin` | **224** |
| deindexed, any other reason | **0** |
| no description at all | 241 |
| matches a city/country by name **and** is filed as a place | **157** |
| …of those, currently indexable | 58 |
| usages on those 157 | **6,628** |

---

## 2. Defect 2 — Destinations

### 2.1 The trap: this cohort is one description away from re-indexing itself

`enforce_tag_thin_page_gate()` (`supabase/migrations/20261030100000_tag_thin_page_gate_at_birth.sql:101-138`) is a BEFORE trigger:

```sql
if new.seo_indexable is true
   and not public.tag_has_prose(new.description, new.short_description)
then
  new.seo_indexable := false;
  new.seo_deindex_reason := 'thin';
end if;
```

`run_tag_thin_page_reindex()` re-indexes a row when prose arrives, provided it deindexed that row itself — i.e. provided the reason is `'thin'`.

**Every single deindexed Destination tag is `thin`. 224 of them, and 0 held by any other reason.** Nothing else is holding them down. `/tags/berlin`, `/tags/france`, `/tags/paris` are `noindex,nofollow` today purely because they are empty, and they carry the fallback description *"Articles, venues and events about Berlin on Queer Guide."*

So the brief's lower-priority note — Destinations have descriptions on only 81 of 322 — describes the **mechanism currently preventing the defect**, not a gap. A description backfill over this category would re-index 224 pages.

The 98 that are already indexable confirm the mechanism from the other side: every one has prose, and it is verbatim encyclopaedic geography — *"Brighton is a seaside resort in the unitary authority area and city of Brighton and Hove…"*, *"Chicago is the most populous city in the U.S. state of Illinois…"* — with no queer content at all. Those pages duplicate Wikipedia and the city page simultaneously.

**But the instruction "don't write Destination descriptions" is too coarse**, and §2.2 bucket F is why.

### 2.2 Classification of the 157

Buckets are disjoint and sum to 157. `n_city_real` excludes `tmp-` slug shells (the `personality-birth-place` non-place cohort documented in CLAUDE.md).

| Bucket | Tags | Indexable | Usages | Verdict |
|---|---:|---:|---:|---|
| **A** country tag → country page | 39 | 20 | 1,964 | Deindex. Unambiguous. |
| **B** country **and** city (`luxembourg`) | 1 | 1 | 7 | Deindex; both targets are real and correct. |
| **C** exactly one real city | 96 | 26 | 763 | Deindex. Unambiguous. |
| **D** **matches 2+ real cities** | **13** | 6 | **3,579** | **BLOCK — see §2.3** |
| **E** region/state; only a `tmp-` shell matches | 8 | 5 | 315 | **NOT duplicates — keep** |
| **F** *(outside the 157)* no geo match | 165 | 40 | 1,938 | **Real glossary terms — describe these** |

**Bucket E is not a defect.** `california`, `usa`, `pennsylvania`, `wales`, `manhattan`, `queensland`, `rotorua`, `santurce` are states, nations-within-nations, provinces and districts. There is **no geo entity to merge them into** — the only thing they name-match is a junk `tmp-` city shell. `California` (215 usages, prose about the US state) matches a *town* called California with a `tmp-` slug. A region tag grouping content across LA/SF/San Diego is the one thing a Destination tag does that no geo page does.

**Bucket F is where the description work belongs.** `travel`, `europe`, `coastal`, `rural`, `walking-tour`, `outdoor-recreation`, `latin-america`, `middle-east`, `town`, `tour` — these are genuine travel concepts, not place duplicates. 165 tags, 1,938 usages. Refined instruction: **suppress description backfill for A–E (157 tags); run it for F (165 tags).**

Note `new-york-city` and `uk` land in F only because they fail the string match (the rows are `New York` and `United Kingdom`). Fuzzy-matching them into A/C is correct but must go through §2.3's rule, not a looser string test.

### 2.3 The same-name problem is live, and the slug is an actively misleading signal

Bucket D, with the candidate cities each tag matches:

| Tag | Uses | Candidates (venues / events) |
|---|---:|---|
| `berlin` | 3,351 | **Berlin DE** `/berlin` (1012 v, 3709 e) · Berlin US `/berlin-1` (3 v) |
| `san-francisco` | 182 | **SF US** `/san-francisco` (665 v, 3828 e) · SF AR `/san-francisco-1` (0) |
| `brighton` | 8 | **Brighton GB** `/brighton` (182 v) · Brighton CA `/brighton-1` (1 v) |
| `brisbane` | 8 | **Brisbane AU** `/brisbane` (17 v) · Brisbane US `/brisbane-1` (0) |
| `zurich` | 7 | **Zürich CH `/zuerich`** (380 v, 3270 e) · Zurich US **`/zurich`** (9 v) |
| `birmingham` | 6 | **Birmingham GB** `/birmingham` (50 v) · Birmingham US (5 v) |
| `san-jose` | 3 | **San Jose US `/san-jose-1`** (70 v) · San José CR **`/san-jose`** (24 v) |
| `san-juan` | 3 | **San Juan PR `/san-juan-1`** (38 v) · San Juan AR **`/san-juan`** (0 v) |
| `santa-cruz` | 3 | **Santa Cruz BO** `/santa-cruz` (21 v) · Santa Cruz US (4 v) |
| `wellington` | 3 | **Wellington NZ** (23 v) · Wellington CA (5 v) · Wellington US (1 v) |
| `durango` | 2 | Durango US `/durango-1` (4 v, 1 e) · Durango MX `/durango` (4 v, 0 e) — **tie** |
| `georgetown` | 2 | Georgetown GY (2 v) · George Town MY (0) · George Town KY (0) — all empty |

**In 3 of 12 cases the plain, un-suffixed slug belongs to the *wrong* city** — `/city/zurich` is the US one, `/city/san-jose` is Costa Rica, `/city/san-juan` is Argentina. So any rule that resolves a place tag by slug equality picks the wrong entity roughly a quarter of the time.

I know that concretely because **my own first pass did it.** Before database access I intersected `/sitemap-tags.xml` with `/sitemap-places.xml` and reported "48 live collisions". That measurement silently paired `/tags/zurich` with **Zurich, US**. The number was not wrong so much as the method was: it could not see that the slug and the city disagree. That is the Portland ME→OR failure in a new costume, and it fired on the tool built to detect it.

**Proposed rule for bucket D:** resolve by **content mass** (venues + events on the candidate city), require a **≥5× margin** over the runner-up, and **block** otherwise. Applied to the table: 10 resolve (berlin→DE, san-francisco→US, brighton→GB, brisbane→AU, zurich→CH, birmingham→GB, san-jose→US, san-juan→PR, santa-cruz→BO, wellington→NZ) and **`durango` and `georgetown` block**, correctly — 4-vs-4 and three near-empty candidates are genuinely undecidable from our own data. Never resolve by slug, and never by name alone.

### 2.4 The two-signal test is weaker than it looks — both signals come from one write

I proposed requiring the primary `travel-destinations` junction **or** `entity_kind='place'`. Measured against the two tags I had flagged as name-collision false positives:

- **`male`** — correctly excluded. `entity_kind='concept'`, junction `sexual-orientation`. The tag is the gender term; Malé, Maldives is the spurious match.
- **`cuauhtemoc`** — **selected.** `entity_kind='place'` *and* junction `travel-destinations`, while its description is *"Cuauhtémoc… was the Aztec ruler (tlatoani) of Tenochtitlan"*.

`20261006140100_tag_refile_deterministic.sql:198` writes category and `entity_kind` **in the same statement**. They are two readings of one filing decision, so they cannot disagree for any row that refile touched. **Two signals produced by one act are one signal.** The independent signal would have to come from outside our filing — the QID's P31 class, where `implausibleClassOf` would reject `cuauhtemoc` on the `person` pattern.

For this migration the practical consequence is small: deindexing `/tags/cuauhtemoc` is the right outcome anyway (1 usage, publishing an Aztec ruler's biography under a Mexico City borough's name). But it would be stamped `place-duplicate` when the truth is wrong-sense, misleading whoever later audits that reason. It is routed to §4 instead.

### 2.5 "Merge/redirect into the geo entity" is not expressible today

`tag_slug_redirects` is `(old_slug, new_slug, tag_id)` with an FK to `unified_tags`, and the edge resolver hardcodes `routePrefix: '/tags'` (`functions/_lib/detail.ts:1444-1459`). **A tag can only ever redirect to another tag.** No tag→geo linking table exists; there is no tag equivalent of `src/lib/mergedVillageRedirects.ts`. A 301 to `/city/:slug` needs static `public/_redirects` rules (the village precedent) or a new resolver branch.

**Deprecating is worse than doing nothing.** `deprecate_unused_tags` writes only `status='deprecated'`: no redirect row, so `/tags/<slug>` becomes a hard 404; the `search_documents` row is deleted; but `unified_tag_assignments` and the denormalized `events.tags` / `venues.tags` arrays survive, so `search_hybrid`'s `facets->'tags'` filter keeps returning content for a slug whose page 404s. The RPC only selects `usage_count = 0` so it cannot reach these by itself — but a hand-written UPDATE could, and nothing would stop it.

Merge is content-preserving but has no target here. One residual cost regardless: `/search?tags=<slug>` has no redirect layer, so any rename or merge silently breaks stored and shared filter URLs.

### 2.6 Recommendation

1. **Deindex buckets A + B + C with `seo_deindex_reason='place-duplicate'`.** The reason string is the point: it is default-deny, so the thin-page reindexer can never undo it when someone later writes prose. Draft in §6; its predicate is **verified against prod** to select exactly **135 tags** (A=39, B=1, C=95 — bucket C's 96th is `cuauhtemoc`, excluded to §4) carrying **2,733 usages**, with zero leakage from buckets D/E/F. Reversible; touches no content, assignments or usage counts.
2. **Block bucket D (13).** Do not deindex, do not merge, until the content-mass rule in §2.3 is run and reviewed. Flag them and record why. This is 3,579 usages — the expensive half — and it is where a wrong call does real damage.
3. **Leave bucket E (8) alone.** Not duplicates.
4. **Restrict the description backfill to bucket F (165).** Not the category.
5. **Route `cuauhtemoc` and `male` to the wrong-sense flow** (§4).
6. **Product decision** on what `/tags/berlin` should ultimately be (§8).

---

## 3. Defect 1 — 88 QID collision groups

### 3.1 Shape of the problem

| Property | Groups |
|---|---:|
| Total | 88 |
| **≥2 members indexable** | **67** |
| Cross-category members | 40 |
| All members 18+ | 27 |
| **Mixed 18+ and non-18+** | **10** |
| >2 members | 7 |
| Byte-identical descriptions | 3 |

67 of 88 are live duplicate content — a bigger indexable-duplicate surface than all of Defect 2. The corpus is dominated by the 18+ kink vocabulary.

**The 10 mixed-adult groups are the dangerous ones.** `merge_tag_concept` carries the loser's category junction verbatim, and `unified_tags_recompute_is_adult()` matches **any** assignment row, not just the primary — so merging flips the survivor to `is_adult=true`, and `enforce_tag_seo_sensitivity_gate` then forces `seo_indexable=false`. Live precedent: `vaginismus` is 18+ and deindexed on prod today for exactly this. Concretely at risk here: `Clothing`(Expression & Style) / `Apparel`(Gear 18+), `Mother`(Slang) / `Mommy`(Kink 18+), `Cunt`(Dynamics & Roles 18+) / `Vulva`(**Body & Reproductive Health**), `Teacher`(Fetishes 18+) / `Educator`(Identity), `Questioning`(Umbrella Terms) / `Interrogation`(Fetishes 18+).

Merging `Vulva` into `Cunt` would move an anatomical health term behind the 18+ gate. That one is not a close call.

### 3.2 Verdicts

**Bucket 1 — MERGE, genuine duplicate (46 groups).** Direction by Wikidata label, then existing controlled vocabulary, then longer prose, then usage.

Spandex `mat-spandex`/`spandex` · Lace `mat-lace`/`lace` · History `genre-history`/`history` *(the three twin-named `mat-`/`genre-` pairs — known open work, nondeterministic canon)* · LGBTQ-Friendly/LGBT-Friendly · Film/Movies/Cinema · Sports/Sport · Accessibility/Accessible · Bisexual/Bisexuality · Restaurant/Eateries **(→ Restaurant, in `VENUE_CATEGORIES`)** · Hate Crimes/Hate Crime · **Cafe/Coffee-Shop (→ Cafe, in `VENUE_CATEGORIES`)** · Football/Soccer · Nightclub/Night-Club · Drag Queen/Dragqueen · Dancing/Dance · Homosexuality/Homosexual · LGBTQ-Community/LGBT Community · **Turkey/Turkiye** *(also a Destination — do this one via Defect 2)* · LGBTQ-Culture/LGBT Culture · Queer History/LGBT History · Heterosexual/Straight · Shibari/Japanese Bondage · MDMA/Ecstasy · Age Play/Ageplay · Scissoring/Tribbing · Prostate Massager/Prostate Stimulator · Heteroflexibility/Heteroflexible · Agender/Genderless · Rimming/Analingus · Female Dominance/Femdom · Retifism/Shoe Fetish · Nun/Sister · Noetisexual/Sapiosexual · Step-Brother/Stepbrother · Muscle Worship/Sthenolagnia · Breast Fetish/Breast Fetishism · Multigender/Polygender · Demigirl/Demiwoman · Blowjob/Cocksucking · Exhibitionism/Flashing · Prostate Massage/Prostate Milking · Organizer/Event Organizer · Strap On/Dildo Harness · Air Tight/Triple Penetration · Sex-Positive/Sex-Positive Movement · Market/Marketplace *(both mis-filed as Destinations; fix the filing too)* · Clothing/Apparel **(adult-flip risk — §3.3)**

**Drug brand pairs, all 3 byte-identical descriptions** — the `sildenafil`/`viagra` precedent exactly: retire the brand, keep the generic. Fluoxetine/**Prozac** (both `d=519`) · Dapoxetine/**Priligy** (both `d=633`) · Medroxyprogesterone Acetate/**Provera**. Move `tag_medical_codes` by hand — the merge does not. Note `Provera` is filed under **Events & Parties**, which is its own defect.

**Bucket 2 — COARSE QID: keep both tags, NULL the worse fit (28 groups).** Wikidata has one item; we have two legitimate concepts. Merging asserts an identity that is false.

Predominantly gendered or sibling pairs, which is the same shape as the disabled `tag_relation_verify` engine's 29%-precision `broader` arm: Catboy/Catgirl · Nantaimori/Nyotaimori · Pillow Princess/Pillow Prince · Deity/God/Goddess · Man/Male/Boy/Masc · Woman/Female/Lady/Girl · Omniromantic/Panromantic · Accipiosexual/Iamvanosexual · Gender Fluid/Genderflux · Multigender-adjacent microlabels.

Plus genuinely distinct concepts sharing a coarse item: Festival/Celebration · Pride Month/LGBTQ-Pride · Sexuality/Sexual Orientation · Love/Affection · Live-Music/Live Music **(activity vs venue type)** · Trans Man/Transmasculine · Gender-Affirming Surgery/Gender Affirmation · Abrosexual/Sexually Fluid · HIV/AIDS Awareness/HIV/AIDS Activism · Orgasm Denial/Tease And Denial · Feedee/Feedism *(role vs practice)* · Adult Baby/Diaper Fetish/Diaper Lover/Infantilism · Algolagnia/Algophilia/Sadomasochism · Sensation Play/Sensual Play · Group Masturbation/Mutual Masturbation · Offering/Submission · Anal Creampie/Creampie · Cunnilinguist/Eating Pussy *(person vs act)* · Non-Binary/Gender Non-Conforming *(GNC is not non-binary)*.

**Mixed group:** Q48270 `Non-Binary` / `Enby` / `Gender Non-Conforming` — merge `Enby` into `Non-Binary` (bucket 1) **and** NULL `Gender Non-Conforming` (bucket 2). One group, two operations.

**Bucket 3 — WRONG ENTITY: NULL the QID, never re-resolve (5 groups).**

- `Femminiello` / `Trans Woman` — a Femminiello is a specific Neapolitan cultural category, not a trans woman. Conflating them on a queer glossary is a substantive error, not a taxonomy quibble.
- `Questioning` / `Interrogation` — a queer identity term and a kink share Q327018. Merging would be catastrophic.
- `BDSM` / `Rough Sex` — not the same thing.
- `Queerness` / `Queer Theory` — a condition and an academic field.
- `Metal` `mat-metal` / `Metal` (**Vibe & Crowd**) — Q11426 is the chemical material. The Vibe & Crowd tag is the music genre. Twin-named *and* wrong-sense.

**Bucket 4 — WRONG SENSE (1 group).** `Play Room` / `Rumpus Room` on Q2911974. The Wikidata item is a domestic recreation room; on this platform under **Venue Types**, a play room is a sex-on-premises space. Same generic-sense failure as `Vacuum Pump` and `Furniture`. NULL and retract the contaminated prose.

**Bucket 6 — CROSS-CATEGORY, product decision (5 groups).** Same QID, both filings defensible, merging destroys a register distinction and flips `is_adult`: Teacher/Educator · Mother/Mommy · Cunt/Vulva · Clothing/Apparel · Sensation Play/Sensual Play.

**Bucket 5 — completed merges: 0.** All 88 groups are active-on-both-sides. The 157 additional groups visible across all statuses are finished merges and correctly excluded by the brief's query.

### 3.3 Merge preconditions — five, all mandatory

1. **Demote the loser's primary category junction first**, or the merge **aborts on 23505** against `tag_category_assignments_one_primary_per_tag`. With 40 cross-category groups this will fire often.
   ```sql
   update tag_category_assignments a set is_primary = false
    where a.tag_id = <loser> and a.is_primary
      and exists (select 1 from tag_category_assignments c
                   where c.tag_id = <winner> and c.is_primary);
   ```
2. **Delete the loser's kink junction** before merging, for all 10 mixed-adult groups. **Assert on `is_adult`, not on the category text.**
3. **Repoint inbound redirects**: `select * from tag_slug_redirects where new_slug = '<loser-slug>'`.
4. **Do not hand-add the loser's alias** (the merge does it). **Do** re-parent the loser's other aliases: `update tag_aliases set canonical_tag_id = <winner> where canonical_tag_id = <loser>`.
5. **Diff the whole `tag_hygiene_stats()` jsonb before/after in one rolled-back transaction.** Do not predict which metrics move. Several are read **from prod on every `pull_request`**, so a merge reds every open PR in the repo. Then usually change nothing.

The merge also does not move `tag_medical_codes` and does not deindex the tombstone.

### 3.4 Why nothing here writes a QID

`tag-wiki-guard.ts` **cannot validate an existing stored QID.** `WikiIdentity` has no QID field; the module fetches nothing; the only caller (`tag-enrichment-sweep`) is gated to rows where `!tag.wikidata_id && !tag.wikipedia_url`. The needed direction — QID → sitelink title — is not implemented (`fetchEntityClassLabels` requests `props=claims` then `props=labels`, never `sitelinks`). Every remediation above is therefore NULL-ing or merging, never re-resolving.

**Defect found in the guard, worth fixing independently.** `fetchEntityClassLabels` returns `[]` on *any* failure — non-200, missing entity, throw. `implausibleClassOf([])` returns `null`, so `mayAdoptWikiIdentity` **skips the class gate entirely**. Its own doc comment claims the caller treats an unknown class as "no evidence, never as plausible"; the code does the opposite. **A Wikidata outage degrades the guard to title-agreement alone** — precisely the single-signal condition that produced the 1,535 wrong links. `supabase/functions/_shared/tag-wiki-guard.ts:100-105` + `tag-enrichment-sweep/index.ts:94-129`.

Nothing re-validates stored QIDs on any schedule. `tag_wikidata_repair_regressions()` only detects re-adoption of one of the 1,535 specific historical ids (*"A different id is not a regression and is deliberately not reported."*). The one artifact that does validate, `scripts/data-quality/find-tag-wikidata-chimeras.mjs`, is report-only and in **no** workflow. Meanwhile `tag_medical_codes_sync` and `tag_wikidata_hierarchy` rebuild weekly from these ids with no validation between — which is how `passing`→Q4 published ICPC-2 A96.

---

## 4. Third defect, unasked: wrong-sense place tags

`cuauhtemoc` (Aztec ruler, filed as a place, indexable) and `male` (gender identity, name-colliding with Malé) surfaced incidentally. Both are §3.2 bucket-4 shape. Route to the wrong-sense flow; do not fold into the destination work.

---

## 5. Reproducing this

All queries are `SELECT`-only; results above are from prod on 2026-09-04.

```sql
-- Group inventory (the 88)
with g as (select wikidata_id from unified_tags
            where status='active' and wikidata_id is not null
            group by 1 having count(*)>1)
select t.wikidata_id, count(*) n,
       string_agg(t.name||' ['||t.slug||'] u='||t.usage_count
         ||case when t.seo_indexable then ' IDX' else ' nox' end
         ||' d='||length(coalesce(t.description,''))
         ||' cat='||coalesce(t.category,'-')
         ||case when t.is_adult then ' 18+' else '' end, '  ||  '
         order by t.usage_count desc) members
  from unified_tags t join g using (wikidata_id)
 where t.status='active' group by 1 order by max(t.usage_count) desc;

-- Destination bucketing (A-F in §2.2)
with d as (
  select t.id,t.slug,t.name,t.usage_count,t.seo_indexable from unified_tags t
   where t.status='active' and (t.entity_kind='place' or exists (
     select 1 from tag_category_assignments a join tag_categories c on c.id=a.category_id
      where a.tag_id=t.id and a.is_primary and c.slug='travel-destinations'))),
j as (select d.*,
  (select count(*) from countries co where dedup_despace(co.name)=dedup_despace(d.name)) n_country,
  (select count(*) from cities ci where ci.duplicate_of_id is null and ci.slug not like 'tmp-%'
     and dedup_despace(ci.name)=dedup_despace(d.name)) n_city_real,
  (select count(*) from cities ci where ci.duplicate_of_id is null and ci.slug like 'tmp-%'
     and dedup_despace(ci.name)=dedup_despace(d.name)) n_city_shell from d)
select case when n_country>0 and n_city_real=0 then 'A'
            when n_country>0 and n_city_real>0 then 'B'
            when n_city_real=1 then 'C'
            when n_city_real>1 then 'D BLOCK'
            when n_city_shell>0 then 'E keep'
            else 'F describe' end bucket,
       count(*) tags, count(*) filter (where seo_indexable) idx, sum(usage_count) uses
  from j group by 1 order by 1;

-- Baseline for §3.3.5. Capture BEFORE and AFTER inside one rolled-back txn.
select tag_hygiene_stats();
```

---

## 6. Draft migration — NOT applied, NOT in `supabase/migrations/`

**Path:** [`docs/audits/2026-09-04-tag-glossary-triage.sql`](2026-09-04-tag-glossary-triage.sql)

Deliberately parked outside the migrations directory — a file there auto-applies on merge to `main` via CI `db push`. Covers **buckets A + B + C only**: deindexes them with a non-`'thin'` reason so §2.1's re-index path can never reverse it. Bucket D is excluded by an explicit ambiguity test rather than by a hand-written slug list, and buckets E and F are excluded by construction.

**Predicate verified against prod on 2026-09-04, SELECT-only — the UPDATE was never executed:**

| | |
|---|---|
| selected | **135** (A=39, B=1, C=95) |
| usages affected | 2,733 |
| rows the UPDATE would write | 135 (all are indexable or `thin`) |
| rows left alone (other deindex reason) | 0 |
| leakage from excluded buckets D/E/F | **0** |

Guard 1 asserts exactly `(39, 1, 95)`, so if the corpus shifts the migration refuses to run rather than acting on a stale classification. No merges, no QID writes, no content writes.

---

## 7. Before anything is applied

1. Hand-read the 88 groups. 88 is small; the guard cannot help (§3.4) and the LLM judge is disabled for measured 19% precision. This is human work.
2. Confirm the bucket split reproduces (§5 query 2), and that the migration selects exactly buckets A+B+C.
3. Dry-run the migration in a rolled-back transaction on prod, diffing `tag_hygiene_stats()` (§3.3.5).
4. Run the content-mass rule over bucket D separately and review all 13 by hand.
5. Merges go one group at a time, mixed-adult ones last, each asserting `is_adult` on the survivor.
6. **Compute the migration ceiling as `remote schema_migrations ∪ origin/main ∪ your branch`, immediately before pushing.** This migration was first numbered `20261221100000` from remote `max(version)` (`20261220113000`) plus the local worktree — omitting `origin/main`, which already held a *different* file at that exact version. `db push` matches by version, so the loser's SQL never runs while the deploy stays green and history looks normal. CI's `migration-versions` caught it; nothing downstream would have. Worse, **23 further migrations were applied in the ~40 minutes between reading the ceiling and pushing** — a sibling session was landing concurrently — moving the true ceiling to `20270501174244`. A ceiling read at the start of a session is stale by the end of it.

## 8. Product decisions, not data decisions

- **What `/tags/:slug` is for a place.** Deindexed internal filter (my recommendation, §2.6), 301 to the geo entity, or genuinely distinct queer content. Everything in Defect 2 beyond the deindex blocks on this.
- **Whether to build a tag→non-tag redirect layer** (§2.5). Required for the 301 option.
- **Whether two tags may share one Wikidata item** (bucket 2, 28 groups). Whether the glossary vocabulary must be 1:1 with Wikidata is an editorial question about what the glossary is for.
- **The five cross-category pairs** (bucket 6). `Cunt`/`Vulva` in particular: merging moves an anatomy term behind the 18+ gate, and keeping both means the glossary carries the same referent in two registers deliberately.
- **Venue Types → `venues.category`** (the brief's lower-priority note). Same §2.1 hazard does not apply — those pages are largely indexable already — so it is a correctness question, not a deindexing one.
