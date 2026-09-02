# Tag language normalisation — design

Date: 2026-09-02
Status: approved, not yet implemented

## The premise, corrected

The request was "tags are in mixed languages, normalise to English, be careful with
queer slang, and make sure descriptions and synonyms are correct."

Measurement changed the shape of three of those four.

**`unified_tags.name` is not a display string — it is the English slot of an
11-language system.** `name_i18n` carries the translations and **never** holds an
`en` key (0 of 8,364 populated rows). So a German `name` is a vocabulary defect in
the English column, not a missing localisation. This was already established by
PR #2504 (2026-08-02) and is restated here because it is the fact the whole design
rests on.

The cohort is **small and live**, not large and historical: tens of rows, created
2026-08-09, 2026-08-23 and 2026-08-30.

## What must not be done

Two heuristics were built, measured, and thrown away. Both are recorded because
they are the obvious approaches and each would have caused damage.

**1. "Flag tags whose name equals their own German translation."** Precision ~5%.
The 95 hits are dominated by English words German borrowed: `Party`, `Film`,
`Pride`, `Transgender`, `Cruising`, `Coming Out`, `Dating`, `Cosplay`. Renaming
them would have vandalised the most-used tags on the platform (`Transgender`, 4,714
uses).

**2. "Repair every row where `slug <> normalize_tag_slug(name)`."** 115 active rows
match; **only 8 are defects.** The other 106 are deliberate namespace prefixes —
`mat-silicone` (4,643 uses), `vibe-bold`, `occ-pride`, `news-education`,
`genre-horror`, `color-black`. Marketplace facet vocabularies and the news taxonomy
share the `unified_tags` table with the glossary. Re-deriving those slugs would
rename `mat-silicone` → `silicone`, break 4,643 links, and collide outright —
`Pride` exists as **both** `occ-pride` and `news-pride`, two different tags with the
same name.

A third trap, same family: **`tag_hygiene_stats().duplicate_active_name` is not a
merge work-list.** 13 of its 14 rows are a marketplace facet colliding with a
glossary term (`mat-leather`, 1,887 listings, vs. glossary `leather`, 17 uses).
Merging those collapses a material facet into a kink term. Only `Mavie Hörbiger` is
a real duplicate.

**Names are not unique in this table; slugs are.** Any work-list keyed on `name`
is wrong by construction.

## The defects

### D1 — non-English `name` (56 candidates, all hand-read)

Detection is a report, never an automatic rewrite — the #2504 precedent, confirmed
independently above. All 56 candidates were read individually. The regex that
produced them flagged `Fur`, `Young`, `Tennis`, `Badung` and `Dining At The Y` as
German, which is the argument for hand-reading rather than a better regex.

Disposition, four buckets:

- **Keep.** `Stammtisch` (40 uses, a genuine English loanword with an English
  description), `Stolperstein`, `Beyoncé`, `Müllerian`, `Charité`, every person
  name, and `Neukölln` / `Schöneberg` — the English name *is* the German one, so
  these need a slug fix only. Diacritics mark orthography, not language.
- **Rename.** `München`→Munich, `Deutschland`→Germany, `Preisträger`→Award Winner,
  `Bühne`→Stage.
- **Merge** into the existing English tag (see D4).
- **Deprecate.** The six `#Mordopfer #Hassverbrechen` / `#Strafverfolgung` names —
  scraped German hashtag strings, not concepts — and the German occupation nouns
  (`Schauspielerin`, `Schriftsteller`, `Weberin`, `Töpferin`, `Kriegerin`,
  `Wissenschaftler`, `Dekan Von St Albans`, `Jugendbund Grunder`), all at 0 uses.
  "Weaver" would not be a glossary tag in English either, so translating them is not
  the fix.

The hashtag rows name real events — Admiral Duncan (1999), Bar Noar (2009), Pulse
(2016), Club Q (2022). Deprecating the scraped *string* is not a judgement about
the events; if the platform wants those concepts they deserve authored tags.

Note: the existing `RENAMES` map in `scripts/data-quality/englishify-tags.mjs` keys
on **slug**, and its `munchen: 'Munich'` entry can never fire — the live slug is
`m-nchen`. D3 silently disabled half of the prior fix.

### D2 — the producer, in three layers

`supabase/functions/source-tags-extract/index.ts` promotes free-text `tags[]` from
`venues` / `events` / `personalities` into `unified_tags` on cron `0 5 * * 0`
(Sunday 05:00 UTC — matching all three observed creation dates). It has no language
gate, and at `:39` it computes its own slug:

```js
name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
```

`.toLowerCase()` runs, but nothing transliterates, so `ü ä ö ß` survive into the
`[^a-z0-9]` class and become `-`. It then passes that slug into
`.upsert(…, { onConflict: 'slug' })`, which is what lets it beat the database.

Upstream, the German enters `tags[]` from:

- `source-milchjugend/index.ts:145` — raw, unslugified German section headings from
  a Zurich site. This is the direct source of `Bühne`, `Beratung`, `Bildung`,
  `Vernetzung`, `Gesundheit`.
- `source-gay-ch`, `source-display-magazin`, `source-eventfrog` — German CMS
  keywords passed through.
- `pipeline-enrich-venue` / `pipeline-enrich-events` merge `ai.suggested_tags`, and
  the prompts in `_shared/ai-enrichment.ts:236-247` and `:278-288` feed the model a
  German page with **no output-language instruction**.

The occupation nouns are legacy German already sitting in `personalities.tags`; the
codebase already knows about this population (`profession_review_queue.looks_german`).

**The database guard stays deterministic.** `tag_language_guard` rejects non-Latin
script only. It will *not* be widened with German word lists — that is heuristic 1,
at 5% precision, moved into a trigger where it would abort writes.

### D3 — lossy slugs (21 rows, 9 active)

Correct predicate:

```sql
name ~ '[^\x00-\x7F]' AND slug IS DISTINCT FROM public.normalize_tag_slug(name)
```

Never the general drift predicate. Rows include `b-hne`, `preistr-ger`, `nonbin-r`,
`sch-neberg`, `kirsten-pl-tz`, `m-nchen`, `caf` (from `Café`), `fu-ball` (from
`Fußball`), a slug containing a literal `ü`, and `Ü30` → slug `30`.

`normalize_tag_slug` itself is already correct (`Preisträger` → `preistrager`); only
the caller bypasses it.

### D4 — cross-language duplicates (~12, curated)

`Schwul`→Gay (4,914 uses), `Lesbisch`→Lesbian (2,960), `Nonbinär`→Non-Binary (454),
`Gesundheit`→Health (789), `Deutschland`→Germany (85), `München`→Munich,
`Feministisch`→Feminist, `Bühne`→Stage, `Beratung`→Counseling, `Bildung`→Education,
plus the `Mavie Hörbiger` self-duplicate. Every loser is at 0–2 uses, so the merges
are cheap. Work-list is hand-picked.

### D5 — `name_i18n` is unread and wrong for slang

`unified_tags.name_i18n` has **no reader** anywhere in `src/`, `functions/` or
`workers/` — written by `translate-i18n-batch`, rendered nowhere. Positive control:
`description_i18n` *does* have readers (`KinkGridEditor`, `KinkWizard`,
`useKinkTaxonomy`), so the search would have found one.

The content is measurably wrong where it matters most. Machine translation took
queer slang literally:

| Tag | Stored translation | Actually means |
|---|---|---|
| `Stud` | es *Estudio* | a studio |
| `Ussy` | es *Vagina* | — (and not a vagina) |
| `Trade` | es *Trueque* | barter |
| `Cruising` | fr *Croisière* | a boat cruise |
| `Missing Stair` | es *Escalera que falta* | an absent staircase |
| `Backshot` | es *Disparo por detrás* | a gunshot from behind |

"Sense category" is not a new concept here — reuse `isSenseCategory` in
`supabase/functions/_shared/tag-style.ts:61`, the same predicate the wrong-sense
prose guard and `tag-wiki-guard` already use. **Do not restate its membership here
or in the migration** — it is 12 display names plus their category slugs, and a copy
would rot silently the moment the tree changes. It deliberately excludes Venue
Types, Destinations and Substances, where the generic dictionary sense is the right
one ("Beer-Garden" really is a beer garden).

Scope against that real list: **1,953 active sense-category tags, 1,736 with any
translation, 650 whose Spanish differs from the name.** (An earlier pass of this
spec said 568, measured against a hand-written 8-category subset — the kind of
drift the previous paragraph exists to prevent.)

Harm today is zero. The risk is that someone wires up a reader and the glossary
starts publishing *Estudio* for **Stud** in Spanish. So: delete the name
translations for the sense categories and stop `translate-i18n-batch` writing them
there. Description translations are unaffected.

### D6 — descriptions and synonyms, deterministically only

The LLM prose judge for this exact job was measured and **disabled**: its first live
batch retracted 16 definitions and **13 were correct** (`outing`, `deadnaming`,
`soft-limits`, `pillow-princess`), every one at high self-reported confidence. The
relations verifier ran ~29%. Both crons are off by decision. Nothing here re-runs a
judged sweep.

`tag_hygiene_stats()` already holds `alias_mojibake`, `alias_equals_name`,
`refusal_prose_active` and `indexable_without_description` at 0. Extend it with four
mechanically-checkable keys:

- `slug_diacritic_lossy` — the D3 predicate. Currently 21, target 0.
- `name_mojibake` — U+FFFD in `name`. `M�Llerian` is present **and indexable**.
- `name_contains_hashtag` — the scraped-hashtag cohort. Currently 6.
- `non_latin_name` — 0 today; asserts `tag_language_guard` still holds.

On synonyms: display is already approved-only, so the 12,090 unreviewed
`multilingual` aliases do not render. The displayed surface is ~397 approved rows —
small enough to hand-read if wanted, and not a sweep.

### Incidental — three indexable wrong-entity chimeras

Found while reading D1, unrelated to language:

- `Pulse #Mordopfer #Hassverbrechen` — description is about the pulse in an artery.
- `Schwimmen` — filed under *Kink Community & Scenes*, description is a card game.
- `Bischof` — description reads "Bischof is a surname."

All three are `seo_indexable = true`. Retract the prose (removal only, never a
rewrite — the same rule the disabled judge violated).

## Plan of work

1. **Seal the slug at both ends.** Fix `source-tags-extract:39` to transliterate
   before the character class, matching `normalize_tag_slug`/`tag_deaccent`. Then,
   defence in depth, make `unified_tags_normalize_slug()` prefer the name-derived
   slug **whenever the name contains a non-ASCII character** — every deliberate
   namespaced slug sits on a pure-ASCII name, so `mat-*`, `news-*`, `occ-*`,
   `genre-*`, `color-*`, `vibe-*` are provably untouched.
2. **Repair the 21 slugs.** `unified_tags_slug_redirect` already logs redirects (284
   live), so old URLs keep resolving.
3. **Apply the D1 dispositions** as a curated list, extending the existing
   `englishify-tags.mjs` map — and re-key it on `id`, not slug, so D3 cannot disable
   it again.
4. **D4 merges** via `merge_tag_concept`, hand-picked list, one at a time.
5. **D5** — delete sense-category `name_i18n`, exclude from `translate-i18n-batch`.
6. **D6 sentinels** into `tag_hygiene_stats()`; wire the zero-invariants into
   `check-pipeline-health.mjs`.
7. **Upstream language hygiene** — add an output-language instruction to the two
   enrichment prompts; stop the German scrapers passing raw section headings into
   `tags[]`.

## Open decision

`source-tags-extract` currently auto-activates any free-text string it finds. The
minimal fix above stops it producing *broken slugs* and stops German *arriving* from
the known feeders, but it does not stop the next German-language source from doing
the same thing. The stronger fix is for it to propose into a review queue instead of
inserting `active` rows directly — matching what `tag-enrichment-sweep` already does
with `ai_suggestions`. That changes the behaviour of a live weekly pipeline and is
called out here rather than decided unilaterally.

## Verification

- D3: re-run the predicate; expect 0. Confirm `mat-silicone` and `news-education`
  are byte-identical before and after.
- D1/D4: `Gay`, `Lesbian`, `Non-Binary`, `Health` keep their usage counts; the
  German losers resolve as redirects, not 404s.
- D2: after the next Sunday run, no new row matches the D3 predicate.
- D5: `name_i18n` still absent from every reader; description translations intact.
- Guard test asserting the namespace prefixes are excluded from the slug seal, so a
  future widening of the predicate fails loudly instead of renaming 4,643 links.
