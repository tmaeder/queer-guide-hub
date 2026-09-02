# drgay.ch as a coverage probe for the health glossary

**Date:** 2026-08-29
**Probe:** https://drgay.ch/en/ — Aids-Hilfe Schweiz / Swiss AIDS Federation
**Scope of corrections (user decision):** the whole Health & Wellness + Safety & Practices
subtree, not only what drgay covers.
**Swiss material (user decision):** excluded entirely — no cantonal services, no OKP coverage
facts, no Swiss statutes. Concepts stay jurisdiction-neutral.

---

## What drgay.ch is, and what it is used for here

A sexual-health service for gay, bi and queer men and trans people: 80 English content pages
across four sections (Life & Love, Sexuality, Safer Sex, Safer Drugs). It is a curated inventory
of the concepts this glossary claims to cover, which makes it a good probe for **which topics
exist** — and for nothing else.

**It carries no open licence.** The Impressum names the publisher and states no terms, so the
default is all rights reserved. This is the Kinktionary/saferparty situation: vocabulary may be
stored, expression may not, and "paraphrased" is still copied. The trap specific to this site is
the meta description — one to three sentences of their copy sitting in a machine-readable
attribute, one property access from `unified_tags.description`. It is not captured.
`scripts/data-quality/drgay-topic-index.json` holds labels, URLs and section paths only, capped at
80 characters / 8 words / no terminal sentence punctuation, and
`src/lib/__tests__/drgayLicence.test.ts` makes storing anything else fail the build.

Two things were excluded from the capture as decisions, not filters:

- **Service and organisational pages** (/about-us/, /your-contacts/, /blog/, /shop/). A first run
  put six named Dr. Gay staff into the committed artifact. Staff names are personal data about
  identifiable people at an HIV organisation and are not concepts. A section allowlist keeps them
  out by construction rather than by a name filter that has to be right.
- **Swiss service directories** — the cantonal vaccination-centre lists and the national
  drug-checking alert feed, whose labels are the 26 canton codes.

Result: **362 labels from 80 pages.**

---

## What was measured on prod first

Subtree = tags with a junction row under `sexual-health`, `substances-harm-reduction`,
`mental-health`, `physical-reproductive`, `care-access`, `consent-negotiation`,
`physical-digital-safety`.

| | active | deprecated | merged |
|---|---:|---:|---:|
| tags | 368 | 406 | 31 |
| description < 30 chars | 47 | 84 | 2 |
| …and still `seo_indexable` | **33** | **82** | 2 |
| `category_id IS NULL` | 4 | 50 | 0 |

---

## Defect classes

### 1. Six tags still point at the wrong Wikidata entity, and the derived layers keep rebuilding from it

The 2026-08-28 health/drug fact-check (`docs/audits/2026-08-28-health-drug-tag-facts.md`) found
seven tags whose prose was about a different subject and rewrote that prose. It did not touch
`wikidata_id`. Resolving each stored QID against Wikidata rather than trusting the corrected
paragraph above it:

| tag | stored QID | what that item actually is |
|---|---|---|
| `prep` | Q2114906 | prepositional case (a grammatical case) |
| `pep` | Q43306119 | "Pep", a male given name |
| `trauma` | Q193078 | injury — "physiological wound caused by an external source" |
| `fertility` | Q15724525 | *Fertility and Sterility* (journal) |
| `vascular-health` | Q7916443 | *Vascular Health and Risk Management* (journal) |
| `aids-education` | Q15734526 | *AIDS Education and Prevention* (journal) |

`pcp` was checked with them and is **correct** (Q407324 is phencyclidine); only its three
Portuguese-Communist-Party aliases are residue.

**This is not cosmetic once the prose is fixed.** `wikidata_id` is an input to
`tag_medical_codes_sync` and `tag_wikidata_hierarchy` (both weekly) and to the public "Elsewhere"
rail. The measured damage is on **`trauma`** (50 uses), whose own description reads "a distressing
event… lasting emotional and psychological effects" while the page publishes seven clinical codes
for physical wounds — ICD-10 **T79**, ICD-10-CM **S00.T98**, ICD-9 **957** and **900**, ICD-11
**NF2Z**, ICPC-2 **A80**, DiseasesDB 28858 — with `last_seen_at` 2026-08-24, i.e. still being
refreshed. Same class as the 86 `safety_notes` describing another country's law: a derived field
outliving the input it was derived from.

Checked and found clean, so not touched: no `tag_relations` edge derives from any of the six, and
no tag other than `trauma` carries a wikidata-sourced medical code.

### 2. 182 tags publish a bulk-import stamp as their definition

Four strings, detected rather than listed (any description ≤ 40 chars shared by more than five
tags): `"Toys tag"` (83 rows), `"Sexual activity tag"` (63), `"Philia tag"` (24),
`"Scene safety tag"` (12) — **137 of them active**, and indexable.

`/tags/anal-sex`, `/tags/rimming`, `/tags/fisting`, `/tags/bareback` and `/tags/sexting` all serve
`"Sexual activity tag"` as their lead paragraph. These are exactly the practices drgay devotes a
per-practice HIV-risk and STI-risk page to.

**No existing counter could see this.** `indexable_without_description` reads **0** on the same
corpus, and `run_tag_thin_page_reindex()` cannot deindex them either — both fire only when
`description` AND `short_description` are empty, and a placeholder satisfies neither test. A stamp
is worse than a blank: a blank is measurable, a stamp reads as content.

### 3. 435 tags carry a category in the junction that never reached the denormalised column

Corpus-wide: 435 with `category_id IS NULL` and a junction row; **0** where `category_id`
contradicts the junction; **0** orphan `category_id`. So this is not the "which side wins" question
`12af05ccb` settled — nothing disagrees, a derived column was simply never written. Every one of
the 435 has exactly one junction assignment, so the resync has no tiebreak to get wrong.

Includes `doxy-pep` and `naloxone`, both shipped in the last few weeks correct in the junction and
null in the column — which is how a brand-new tag lands in this state.

### 4. Wrong primary category — the first list was ~16, the real number is 6

**This entry was wrong when first written, and the error is the useful part.** The original list
was produced by a query that joined `unified_tags` to `tag_category_assignments` **without
filtering on `is_primary`**, so a tag's secondary assignment surfaced as though it were the tag's
category. Read un-aggregated, four headline claims dissolve:

| Tag | Audit first said | Actual primary | Verdict |
|---|---|---|---|
| `coming-out` (613 uses) | Events & Scene | `questioning-labels` | **correct already** — Events was a secondary |
| `cruising` (646 uses) | Relationship Structures | `safe-spaces` | **defensible** — both were secondaries |
| `sauna` (1,370 uses) | Fetishes & Interests | `venues-nightlife` | **correct already** |
| `bathhouse` | Fetishes & Interests | `venues-nightlife` | **correct already** |

An aggregate over a one-to-many join answers a different question than the one being asked, and
its answer is confidently shaped. Same class as the two other measurement errors in this file.

**The six with a genuinely wrong primary — all fixed in
`20261007163200_tag_primary_category_corrections.sql`:**

| Tag | Was | Now | Reason |
|---|---|---|---|
| `prep` | Consent & Negotiation | Sexual Health | HIV pre-exposure prophylaxis is not a consent topic |
| `bareback` | Events & Parties | Sexual Health | a practice, not an event type |
| `age-of-consent` | Slang & Language | Laws & Legal Rights | a statutory threshold |
| `deadnaming` | Orientation | Gender | nothing to do with orientation |
| `misgendering` | Orientation | Gender | same class |
| `chosen-family` | Events & Parties | Family & Parenting | the central term of that stop |

**The mechanism was also wrong on the first attempt**, and this is worth stealing: writing the
**junction** moves the page (`fetchTagWithCategories` reads the junction) but leaves
`unified_tags.category` at its old value, because both sync triggers run `unified_tags → junction`
and fire only on a `category_id` change. Measured in a rolled-back transaction: `junction_primary`
read `legal-rights` while `category` still read `Slang & Language`. That column is in
`trg_search_documents_tag`'s scope, so the junction-only write would have made the page and the
search facet disagree — the exact class `20261006110000` had just repaired corpus-wide. **Write
`category_id`; everything else derives from it.**

`sauna` (**1,370 uses**) and `bathhouse` still derive `is_adult = true` from a *secondary*
Fetishes assignment, so a venue term stays adult-gated. Not changed here — see "Not done".

### 5. Duplicate deprecated twins of live tags

`u-equals-u` is active and human-reviewed, has **no aliases at all**, and has two deprecated
duplicates (`u-u-undetectable-equals-untransmittable`, `u-u-undetectable-untransmittable`) — so
the site's own word, "Undetectable", resolves to nothing. Same shape: `ecstasy` exists as a
deprecated tag *and* as an auto alias of `mdma`; `scat` + `scat-play`; `masturbation` +
`masturbating` + `mutual-masturbation`; `sex-toy` (deprecated, singular) with no `sex-toys`;
`piss-play` deprecated with 452 characters of finished prose and still `seo_indexable`.

---

## Coverage: the gap is smaller than a strict probe reports

An exact-slug probe reported 18 drgay concepts absent. Loose matching against **all statuses** cut
that to 9 — `dark-room`, `internalized-homophobia` (US spelling), `amphetamine`,
`benzodiazepines`, `anabolic-steroids`, `3-mmc`, `sex-toy` and `piss-play` all already exist under
a different slug or status. Every one would have been minted a second time by a migration
generated from the strict probe. Hence `match-drgay-to-tags.mjs` matches loosely, compares against
active AND deprecated AND merged, and refuses the anon key (the wave-5 RLS lesson: a row-count
assertion cannot catch RLS filtering, because both sides go through the same predicate).

Genuinely absent, and worth creating: **stealthing** (non-consensual condom removal),
**window period**, **serophobia**, **HIV self-test**, **booty bumps**, **safer snorting**,
**safer slamming**, **bottom shaming**, **fetishisation**, **heteronormativity/cisnormativity**,
**T4T**, **sending nudes**, plus STI vocabulary — **condyloma**, **crabs**, **scabies**,
**herpes (HSV)**, **Mycoplasma genitalium**, **hepatitis D**, **hepatitis E**, **candidosis**.

Deprecated but core to this domain, and candidates for revival with a reason each: `hpv`, `anus`,
`penis`, `prostate`, `foreskin`, `lube`, `transition`, `dysphoria`, `domestic-violence`,
`sexual-health`, `pornography`, `piss-play`, `sti-testing`, `viral-load`, `serosorting`,
`minority-stress`.

---

## What shipped

| File | What |
|---|---|
| `scripts/data-quality/scrape-drgay.mjs` | Playwright capture (the site is a Craft CMS + Vue SPA; curl returns a 10 KB shell with one line of text). Labels only. |
| `scripts/data-quality/drgay-topic-index.json` | Committed signal: 362 labels / 80 pages. |
| `scripts/data-quality/match-drgay-to-tags.mjs` | Matcher + subtree census → `out/drgay-disposition.json`. Refuses the anon key. |
| `src/lib/__tests__/drgayLicence.test.ts` | Makes storing their prose fail the build. |
| `supabase/migrations/20261007163000_wrong_entity_wikidata_repair.sql` | Defect class 1. Validated in a rolled-back transaction on prod. |
| `supabase/migrations/20261007163100_tag_denorm_category_resync.sql` | Defect class 3, plus two new hygiene counters. Validated in a rolled-back transaction on prod. |
| `supabase/migrations/20261007163200_tag_primary_category_corrections.sql` | Defect class 4 — the six with a genuinely wrong primary. |
| `supabase/migrations/20261007163300_drgay_absent_concepts.sql` | The six absent concepts, the U=U twin merges, and the aliases `u-equals-u` never had. |
| `supabase/migrations/20261007163400_drgay_placeholder_prose_and_deindex.sql` | Defect class 2 — prose for seven, deindex for the rest. |
| `src/lib/tagHygieneMetrics.ts`, `scripts/tag-hygiene-baseline.json` | The panel + baseline halves of those counters. |

**Both migration versions were renumbered from `20261005*`.** `main` applied up to `20261006140100`
while this branch was open, and `db push` aborts on an unapplied file that sorts *below* the applied
head — so the original numbers could never have run. `20261006110000` on main cites
`20261005100100` by its old number; that reference is stale by name only.

Two counters were added because neither class had one:
`denorm_category_missing` (baseline 0 — the resync and the function replacement land in the same
migration, so there is no window where the key exists at its pre-repair value) and
`placeholder_description_active` (baseline **137**, a backlog being worked down, hard-gated because
no writer outside this program produces those strings).

**Also fixed, unrelated but adjacent:** `src/lib/__tests__/tagHygieneStats.test.ts` re-read all
1,322 migration files up to four times, measured at 73 s cold / 25 s warm against its own 15 s
timeout — it was failing on repo size, not on the invariant it guards, and getting worse with
every migration. It now reads each file once.

---

## Not done

- **`sauna` (1,370 uses) and `bathhouse` stay adult-gated.** Both derive `is_adult = true` from a
  *secondary* Fetishes assignment, so a venue term is adult-gated and `/tags/sauna` sits behind it.
  The obvious fix is to drop that secondary — but `20261006090100`, applied hours before this
  branch was written, exists specifically to stop accidental `is_adult = false` flips during the
  taxonomy swap and calls under-moderation "the worst failure class here". Flipping two live tags
  to non-adult immediately after that guard shipped is not a call to make from a category audit.
  Left for a human, deliberately.
- **`sex-work` keeps its Sexual Health primary.** Arguable in both directions — sex work is not a
  health condition, but Laws & Legal Rights is not obviously better for the practice as opposed to
  its legal status. No correctness gain, and it would move a reader-visible facet.
- **~122 placeholder tags were deindexed, not written.** They are Kinktionary fetish and toy
  vocabulary (`algophilia`, `curry-comb`, `spreader-bar`), 122 of them with zero usage, and they
  belong to the programme that owns that vocabulary rather than to a health audit. They stay active
  and usable for tagging; `run_tag_thin_page_reindex()` re-indexes each one the moment prose exists.
  **This is the handover list for the Kinktionary programme.**
- **Community-language concepts still have no tag** — bottom shaming, fetishisation, T4T. They need
  a citable source before they get prose, which the clinical concepts had and these do not.
- **`out/drgay-disposition.json` is not committed**: generating it needs a service-role key, which
  this checkout does not carry. The measurements in this document were taken directly against prod
  through privileged SQL, using the real `normalize_tag_slug()` rather than the script's JS mirror.
- **STI structured data not extended — but the measurement is now taken.** This entry previously
  said only "a measurement not yet taken". It has been.

  drgay's practice grid has **10 named practices**; `sti_practices` holds **11 rows** feeding an
  11 STI × 11 practice matrix in `sti_transmission_risks`, sparse by design at **83 of 121 cells**
  (a cell exists only where there is a risk to state).

  | drgay practice | `sti_practices` |
  |---|---|
  | Touching and Kissing | `kissing` + `sexual-caress` |
  | Oral Sex | `fellatio` + `cunnilingus` |
  | Anal Sex | `anal-penetration` |
  | Vaginal Sex | `vaginal-penetration` |
  | Fisting | `fisting` |
  | **Masturbating** | **absent** |
  | **BDSM** | **absent** |
  | **Piss Play** | **absent** |
  | **Scat (Faeces)** | **absent** |
  | **Body Modifications** | **absent** |

  QG additionally carries `rimming`, `toy-sharing`, `straw-sharing` and `syringe-sharing`, which
  drgay covers on their own pages rather than in the grid — all four are legitimate and stay.

  **Five practices are genuinely absent, and they are not filler.** `scat` is faecal-oral, the same
  route on which `rimming` already scores *high* for hepatitis A and shigella. `body-modification`
  is blood-borne and would be the second non-sexual route beside `syringe-sharing`. QG already has
  tags for `scat`, `piss-play` and `bdsm`, so the concepts exist; only the risk rows do not.

  **Two of the five shipped** in `20261118120000_sti_practices_mutual_masturbation_scat.sql`:
  `mutual-masturbation` (→ `oral_touching`) and `scat` (→ `anorectal`), 7 cells total.

  **Every level is copied from an anchor, not graded fresh.** The matrix is sparse by design (83 of
  121 cells) and a missing cell is how it says "no meaningful risk by this route" — `hiv` is absent
  from `kissing`, `sexual-caress` and `rimming` for exactly that reason. So a cell was written only
  where an existing cell in the *same transmission mode* fixes the level: mutual masturbation is
  skin-to-skin genital contact, so it takes `sexual-caress`'s levels; scat is faecal-oral, so it
  takes `rimming`'s. **HIV is omitted from both** — hands are not an inoculation site and faeces is
  not a vehicle — which follows the table rather than departing from it, and the migration asserts
  that no HIV cell exists for either, so a later sweep has to argue with a named expectation.

  **The other three stay out for a structural reason, not squeamishness.**
  `sti_practices.practice_group` is effectively a closed set: `StiProfile.tsx` renders
  `groupLabels[r.group]` from a hardcoded four-key map and `useStiProfile.ts` types the field as
  `'anorectal' | 'oral_touching' | 'chems' | 'vaginal'`. A new group renders `undefined` to a reader
  and lies in the type — a three-layer change on a health surface. BDSM and body modification have
  no honest home in those four, and their risk is entirely conditional on whether blood or a skin
  breach is involved, which one level cannot express. Piss play would fit `oral_touching`, but urine
  is not an established vehicle for anything in this table, so every cell would be an omission and
  the row would assert nothing.
