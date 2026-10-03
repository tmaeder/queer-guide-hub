# Sexology / trans / BDSM glossary comparison — decisions

Migration `99991791039872_sexology_glossary_pass.sql`.
Guard `src/lib/__tests__/sexologyGlossaryPass.test.ts` (27 tests, mutation-tested
14/14 with a comment-only control that correctly survives).

## Sources

Thirteen read, one unread.

| source | file | read |
|---|---|---|
| ffzg.unizg.hr *Dictionary of Sexology* | `ffzg-dictionary-of-sexology.txt` | yes |
| sexology.it | `sexology-it.txt` | yes |
| masterclass.com sexual-terms-guide | `masterclass.txt` | yes |
| gettingiton.org.uk *Sex A to Z* (A–Y, 25 pages) | `gettingiton.txt` | yes |
| plannedparenthood.org/learn/glossary | `plannedparenthood.txt` | yes (HTML parse; markdown collapses term+definition) |
| transactual.org.uk | `trans-and-gender.txt` | yes |
| genderminorities.com | `trans-and-gender.txt` | yes |
| apa.org CE-corner glossary | `trans-and-gender.txt` | yes |
| Wikipedia *Glossary of BDSM* | `bdsm-six-sources.txt` | yes (raw wikitext) |
| getkneel.com | `bdsm-six-sources.txt` | yes |
| andana-bizarr.ch | `bdsm-six-sources.txt` | yes (page covers C–W only) |
| naturallynaughty.shop Kinkipedia | `bdsm-six-sources.txt` | yes |
| mercyindustries.com | `bdsm-six-sources.txt` | yes |
| thesubcoven.wordpress.com | `bdsm-six-sources.txt` | yes |
| **Make UK Glossary of Transgender and Gender Diverse Terms (PDF)** | — | **NO** |

**The PDF was never opened.** `~/Downloads` is sandboxed in this environment:
both the file-read tool and `cp` return `EPERM: operation not permitted`. A
source that could not be read is recorded as unread rather than dropped from the
list, and nothing in the migration is attributed to it. To include it, move the
file somewhere readable (e.g. into the repo or `/tmp`) and re-run the join.

Two sources were **already compared by earlier work**, and that is why the hit
rate here is low rather than because the comparison was shallow:
`sexuality-vocabulary-candidates.json` triaged Wikipedia's *Glossary of BDSM* at
6,319 rows, and CLAUDE.md records the Kinkipedia comparison in the 2026-09-14
rope/kink pass. A sex & sexual-health pass (`99991789812141`, #3807 + #3810) and
a WebMD pass also shipped before this one.

## Mechanical result

1,347 distinct slugs after slugifying every headword with the exact rule
`public.normalize_tag_slug` uses, joined against `unified_tags` on both the slug
and the despaced form (`public.dedup_despace`).

| bucket | n |
|---|---|
| active | 585 |
| — of which already carry both description and body | 485 |
| — thin (missing description or body) | 100 |
| absent | 659 |
| alias_only (no tag row, but a `tag_aliases` row exists) | 49 |
| merged | 38 |
| deprecated | 16 |
| — of which carry a real body | 14 |

So **51% of the corpus matched outright.** Re-derive by slugifying the seven
`.txt` files and re-running the join; `slug-map.json` maps every slug back to its
source files and original spellings.

## What shipped

- **2 prose defects on live rows.** `binder` (u=91) published
  `short_description = "Family name"` over a correct description — the
  half-repaired namesake class, and `short_description` is both the page lead and
  the search-facet text. `men-who-have-sex-with-men` (u=83) published a truncated
  generation artifact as its description. Both replaced, content-guarded, wrong
  field only.
- **2 category misfilings on live rows.** `pap-smear` was filed under
  *Events & Parties*; `jizz` (seo_indexable) under *Dynamics & Roles*. Moved by
  writing `category_id` alone and letting both triggers reconcile.
- **1 dead canonical.** `terf` was deprecated as "canonical alias of
  trans-exclusionary-radical-feminist" **and that target is itself deprecated**,
  so TERF had no live row at all. Revived unpublished; the shadowing alias
  deleted rather than re-pointed.
- **12 creations**, unpublished, all three category representations set by hand.
- **12 aliases**, approved, routing source spellings onto existing rows.
- **4 empty `short_description` fills** on thin active rows (`ace`, `brat`,
  `latex`, `top`).

## Refusals — the substance of the pass

The 659 absent slugs are **not** 659 gaps. Four classes are refused wholesale.

### 1. The paraphilia taxonomy of the 1970s clinical dictionary — REFUSED

ffzg is Money's vocabulary, and a large part of its `-philia` cohort names child
sexual abuse and sexual homicide: `pedophilia`, `nepiophilia`, `hebephilia`,
`ephebophilia`, `biastophilia`, `raptophilia`, `erotophonophilia`,
`homicidophilia`, `lust-murder`, `necrophilia`.

Creating a tag here does not describe a word — it mints a **page** and an
**auto-tagging rule** on an LGBTQ+ community platform. Refused outright, and the
migration carries a postcondition that fails if a later pass imports them. This
is the single most important call in the pass and the reason the headword list
was triaged by hand rather than swept.

The remainder of that cohort (`acrotomophilia`, `apotemnophilia`,
`chrematistophilia`, `dendrophilia`, `hyphephilia`, `kleptophilia`,
`morphophilia`, `osmolagnia`, `pictophilia`, `polyiterophilia`, `renifleurism`,
`stigmatophilia`, `symphorophilia`, `toucheurism`, `undinism`, `urethralism`) is
deferred rather than refused: obsolete clinical coinages with no community
currency, which would need a per-term decision about whether the glossary
documents the taxonomy at all.

### 2. General medicine and neuroanatomy — REFUSED

`amygdala`, `hypothalamus`, `limbic-system`, `pituitary-gland`,
`adrenogenital-syndrome`, `abuse-dwarfism`, `agnosia`, `alexithymia`,
`follicle-stimulating-hormone`, `immune-system`, `endorphin`, `imprinting`,
`anorexia-nervosa`, `circadian`. Real terms; not glossary vocabulary for this
platform.

### 3. US policy and case law — REFUSED

`comstock-act`, `hyde-amendment`, `abortion-funds`, `anti-choice`, `pro-choice`,
`affordable-care-act`, `roe-v-wade`. Planned Parenthood is a US advocacy
organisation and its policy vocabulary is not this platform's subject.

### 4. One studio's equipment list — REFUSED

`ultra-chair`, `gyno-chair`, `spread-bench`, `scrotum-stretcher`, `hoist`,
`dilatator`, `latex-punishment`, `never-ending-games`. andana-bizarr is a single
Swiss studio and these are its room inventory, not shared vocabulary. Contrast
`st-andrews-cross`, which IS standard — and which the corpus already holds.

### 5. Obstetric procedure detail — DEFERRED, not refused

`amniocentesis`, `blastocyst`, `embryo-transfer`, `epidural`, `episiotomy`,
`cesarean-section`, `doula`, `midwife`, `colostrum`, `molar-pregnancy`,
`quickening`, and the full fertility-awareness method set
(`calendar-method`, `basal-body-temperature-method`, `cervical-mucus-method`,
`dry-days`, `fertile-days`, `perfect-use`). Reproductive health IS in scope —
the corpus has a *Body & Reproductive Health* category and `99991789812141`
created `menarche`, `menstrual-cup`, `tampon`, `spotting`, `diaphragm`, `IUD`.
What is deferred is the *degree*: clinical obstetric procedure vocabulary is a
different subject from reproductive health as a traveller or community member
meets it, and importing ~80 rows of it is its own decision.

## Would-be duplicates the collision check caught

Checked before writing any SQL, which is why none of these became a row:

| proposed | why it was dropped |
|---|---|
| `forced-orgasm` | already ACTIVE |
| `st-andrews-cross` | already ACTIVE |
| `u-u` | slugification artifact; shadowed by the NAME of `U=U` |
| `st-andrew-s-cross` | slugification artifact; shadowed by `St Andrew's Cross` |
| `grey-asexual` | concept held by `greysexual` → became an alias |
| `endosex` | concept held by `dyadic` → became an alias |
| `chest-surgery` | concept held by `top-surgery` → became an alias |

## Alias refusals

| refused alias | reason |
|---|---|
| `pulling-out` → `withdrawal` | **Wrong sense.** `withdrawal` is filed under *Substances & Recovery* and is about a body adapted to a substance. The contraceptive method got its own row instead. |
| `warts` → `genital-warts` | An approved alias is an **auto-tagging rule** as well as a displayed synonym, and "warts" covers plantar and common warts. The routing gain is small; the false-tagging is not. |

Both refusals are asserted by a postcondition, so a later pass reaching for
either breaks this migration's own check.

## The 16 deprecated rows — none revived

**All 16 are correctly deprecated.** Every one carries an explicit
`deprecation_reason` of the form *"canonical alias of X; duplicate vocabulary row
retired"* with a named target. This is the **opposite** of the cohort earlier
passes kept finding, where the 2026-06-05 orphan audit and the zero-usage sweep
had culled core vocabulary on a false premise. A blanket revive here would have
minted 16 duplicates.

`terf` is the sole exception and is handled separately, because its target is
itself deprecated.

### Two canonical targets are wrong — reported, not repaired

`deprecation_reason` is prose, not a redirect mechanism, so nothing is being
served off these and neither leaves a gap:

- **`sex` → "canonical alias of biological-sex".** That row's own description
  reads *"sexual intercourse and intimate physical acts between consenting
  partners"*, which is not biological sex. The concept is held by the active
  `sexual-activity`.
- **`dom` → "canonical alias of dominatrix".** A dom is not a dominatrix;
  `dominatrix` is specifically female-identified per its own prose. The concept
  is held by the active `dominant`.

## Open, named rather than counted

- **96 of the 100 thin active rows still have no `long_description`**, including
  `fetish` (u=1710), `trans` (u=2580), `bondage` (u=806), `vagina` (u=731),
  `harness` (u=592), `bottom` (u=330). Their pages render a lead paragraph and
  stop. This pass filled four empty summaries and authored **no** bodies:
  96 bodies is a prose-authoring job that deserves its own pass, and bulk
  LLM-generated prose is the experiment this repo already ran and retired.
- The `-philia` residue and the obstetric cohort above.
- The Make UK PDF.
