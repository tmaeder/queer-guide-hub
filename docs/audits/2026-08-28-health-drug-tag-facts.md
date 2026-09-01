# Health & drug facts in the tag glossary — audit

Date: 2026-08-28. Scope: every tag carrying a health, drug or clinical claim,
checked against drugs.com, FDA (DailyMed / Drugs@FDA), compendium.ch, PubMed,
The Lancet, JAMA, ScienceDirect and Elsevier Health.

## What was measured first

| Surface | Rows | State |
|---|---|---|
| `unified_tags` prose, health categories | 713 of 760 have prose | mixed — see below |
| `substance_interactions` | 421 | 100 % TripSit-sourced, every row has a URL |
| `sti_profiles` / `_transmission_risks` / `_testing_windows` | 11 / 83 / 14 | Depistage.be-sourced, coherent |
| `tag_myth_facts` | 24 | Darklands-sourced |
| `tag_medical_codes` | 323 | Wikidata-derived, pattern-validated |
| `tag_sources` where `is_public` | **18, all legal instruments** | **zero clinical citations exist** |

The structured tables are in good shape. **Every defect found is in
`unified_tags.long_description`** — the auto-generated encyclopaedic paragraph,
never in the hand-written `description` above it.

## Defect class 1 — wrong entity, live on production

The tag's own `description` is right; the paragraph underneath it is about a
different subject entirely. Confirmed in the crawler-visible HTML, not inferred:

| Tag | Uses | `long_description` is actually about |
|---|---|---|
| `prep` | **56** | the **grammatical prepositional case** |
| `trauma` | **46** | **physical injury to tissue** — "in humans, animals, or plants" |
| `fertility` | 11 | ***Fertility and Sterility***, an Elsevier journal |
| `pep` | 4 | **pep rallies, pep talks, and a boxer named Pep** |
| `pcp` | 0 | the **Portuguese Communist Party** |
| `aids-education` | 1 | ***AIDS Education and Prevention***, a Guilford journal |
| `vascular-health` | 0 | ***Vascular Health and Risk Management***, a Dove journal |

`/tags/prep` is the platform's HIV-prevention page. It serves Google a paragraph
on prepositional grammar.

This is the [[namesake chimera]] class again, and it fails the same way the
Uganda tag did: the prose is *plausible*, not absurd, so nothing flagged it.

## Defect class 2 — model refusals published as encyclopaedia text

Live, indexable pages:

- `heroin` — "It is **not a topic related to LGBTQ+ travel or community**.
  Information on heroin is **not provided due to lack of relevant sources**."
- `ketamine` — "As there is **no specific information provided about its relation
  to LGBTQ+ travel**…"
- `cocaine` — "…is **not supported or promoted by our community**." Moralising,
  not factual, and against the house harm-reduction voice.

~160 tags corpus-wide carry this artifact; all but these three are
`status='deprecated'` and 404, so the live blast radius is small — but these
three are exactly the harm-reduction pages where a refusal is worst.

## Defect class 3 — wrong molecule (deprecated, not live)

- `estradiol` describes **17α-estradiol**, the weak endogenous epimer with ~100×
  lower estrogenic potency — not the 17β-estradiol used in feminizing hormone
  therapy. Subtle, plausible, and wrong on a gender-affirming-care page.
- `paxil` (paroxetine) describes ***Paxillus***, a genus of poisonous mushrooms.

These 404 today because the tags are `deprecated`. The rows are still wrong and
would publish the moment usage revives them.

## Defect class 4 — the nitrite gap

`poppers` and the PDE5 inhibitors are **absent from `substance_interactions`
entirely** — 421 rows, not one covering the single combination this audience
most needs: alkyl nitrites plus sildenafil/tadalafil/vardenafil/avanafil.

The warning exists only as prose on `/tags/poppers` and `/tags/viagra`. The
generic names — `sildenafil`, `tadalafil`, `vardenafil`, `avanafil`, `cialis`,
`levitra` — are all `deprecated` and 404, and none of their stored prose
mentions nitrates at all; three of them say the drug is "not directly related to
LGBTQ+ travel or community".

The chart's own footer says *"a combination that is not listed is one this chart
says nothing about — that is not the same as safe."* That is honest, and it is
also why the omission matters.

## Defect class 5 — claims a source contradicts

Each checked against the label or the paper, not recalled. Corrected in
`20261002100100` and `…100300`.

| Tag | Stored claim | What the source says |
|---|---|---|
| `syphilis` | "Antibiotics cure it at every stage" | Penicillin eradicates the infection at any stage but does **not reverse established damage**; benzathine penicillin does not reach treponemicidal CSF levels, so neurosyphilis needs IV therapy |
| `genital-herpes` | "typically caused by HSV type 2" | **HSV-1 now leads new genital diagnoses** in high-income countries; HSV-2 still causes most recurrent disease. HSV-1 recurs far less — that is the prognosis a newly diagnosed person is asking about |
| `hiv` | "average survival … 9 to 11 years" | A **pre-ART** figure (Morgan, *AIDS* 2002) stated as current. On modern ART a 40-year-old starting after 2015 with CD4 ≥ 500 had ~42 years remaining (Trickey, *Lancet HIV* 2023, n=206,891) |
| `naloxone` | "effects … last 30 to 90 minutes" | That is the **serum half-life**. No label states that duration — and the labelled fact points the other way: opioids can outlast naloxone, so breathing can fail again after apparent recovery |
| `testosterone` | low levels "lead to frailty, anxiety, and depression" | Association, not causation; trials do not show an antidepressant effect. Also a claim about cis men with hypogonadism |
| `cotton-fever` | "caused by an endotoxin from *Pantoea agglomerans*" | Leading of **three** hypotheses, resting on a 1993 case report whose own wording is "unknown etiology … with most probability" |
| `lithium` | psychedelic seizure risk is "well-documented" | The source is a content analysis of **unverified posts on Erowid, Shroomery and Reddit**; the authors conclude only provisionally |
| `methamphetamine` | — | Label facts stale: the Desoxyn **obesity indication no longer exists** and the brand is discontinued |
| `ghb` | used "as a general anaesthetic" | Sodium oxybate is indicated for **cataplexy or excessive daytime sleepiness in narcolepsy** |

### Two things the popular retelling gets wrong, and we would have repeated

- **"Wait 24 hours after Viagra before nitrates" is not in the label.** The
  sildenafil label says the opposite — it is *unknown* when nitrates can safely
  follow a dose. The vardenafil label says the interval "has not been
  determined." Only tadalafil (≥48 h) and avanafil (≥12 h) state one.
- **Tadalafil's 48-hour nitrate exclusion outlasts its 36-hour efficacy
  window.** "It has worn off" is not "it is safe".

Also deliberately **not** claimed: a body of published deaths from poppers plus
PDE5 inhibitors. There is one forensically attributed case in a UK series of 42
poppers deaths, plus a regulatory pharmacovigilance signal — not a case-report
literature. The interaction is stated as mechanistically established and
label-contraindicated, which is what the evidence supports.

## Sources: the channel exists and is empty

`get_tag_reference_links` already renders non-legal citations in the "Elsewhere"
rail, host-labelled (`20260907100200`). Health tags currently carry only
harm-reduction org links — saferparty.ch (59), dancesafe.org (16),
testfinder.info (3), thedrugswheel.com (1). **No FDA, no drugs.com, no PubMed,
no compendium.ch row exists on any tag.** Adding them needs no schema or UI
change; `is_public` is not involved, because that flag is reserved for legal
instruments by CHECK constraint.

## Outcome (2026-08-29): all shipped and verified on production

Everything below was written on 2026-08-28 and is now live. Re-measured against
prod after every session's edits had landed:

| Check | Result |
|---|---|
| Live tags carrying a refusal artifact or wrong-entity paragraph | **0** |
| PDE5 tags with no nitrate/nitrite warning | **0** of 7 |
| Dangerous combinations on `/tags/poppers` | **8** (was 0) |
| Tags carrying a clinical citation | **52** (was 0) |

`/tags/prep` no longer serves a paragraph on prepositional grammar; `/tags/trauma`
no longer describes injury to plants. Both confirmed in the crawler-visible HTML,
which is where the defect was confirmed in the first place.

The eighth poppers combination is not ours — `poppers + ghb`, added from the
eve&rave Substanzhandbuch by a parallel session. It is also the vindication of
the attribution fix: that page now carries **two** distinct sources, so the
hardcoded "TripSit" credit would have mislabelled both.

## What was written

| File | Does |
|---|---|
| `20261002100000_health_tag_wrong_entity_prose.sql` | the seven wrong-entity pages |
| `20261002100100_health_tag_clinical_corrections.sql` | contradicted claims, refusals, the PDE5 nitrate contraindication |
| `20261002100200_health_tag_sources_and_pde5_revival.sql` | revives the 11 deprecated pages, adds the 7 poppers/PDE5 interaction rows, adds ~85 clinical citations across 45 tags |
| `20261002100300_substance_tag_corrections.sql` | ketamine, lithium, ghb, methamphetamine, nbomes |
| `src/components/tags/SubstanceInteractions.tsx` | per-source attribution + test |

`SubstanceInteractions` printed a hardcoded **"TripSit"** credit under
`rows[0]`. Rows sort worst-first, so once the FDA-sourced poppers rows exist,
`/tags/poppers` would have credited TripSit for a DailyMed label — a false
provenance claim on a safety surface. The new test was run against the old
implementation and fails on it.

Plus two tags added on 2026-08-29, after measuring the corpus rather than
trusting this document's own first draft:

| Migration | Adds |
|---|---|
| `20261004100100_doxy_pep_tag.sql` | `doxy-pep`, leading with the limits (no benefit shown in cisgender women; measured tetracycline resistance) rather than the effect size |
| `20261004120000_fentanyl_test_strips_revival.sql` | revives `fentanyl-test-strips`, replacing LLM advocacy with the two limits that cut against a negative result |

## Three self-inflicted failures, all caught by the guards

Recorded because the guards worked and the mistakes were mine:

1. **An assertion covered a fix from a LATER migration.** `…100100` asserted
   `ketamine` was clean; `ketamine` is repaired in `…100300`. The block reported
   the migration *order* as a defect in the data. **A guard may only cover what
   its own migration changed.**
2. **A guard tripped on its own correction.** The `ghb` check matched
   `general an(a)?esthetic`, but the corrected prose NAMES the misconception in
   order to refute it — "…not, as is sometimes said, as a general anaesthetic".
   **Match the OLD CLAIM in full**, never a phrase the fix legitimately quotes.
3. **A version collision.** `doxy-pep` was numbered by incrementing the max in
   my own worktree, which did not yet have a migration that landed in between.
   **Pick a version against `origin/main` and every worktree.**

Two more from the same day, not mine but worth the same shelf:

- **`DRIFT_DETECTED` does not mean drift.** The workflow labels several distinct
  faults that way, including a `schema_migrations_pkey` violation from replaying
  applied migrations. Read the `Applying migration … ERROR:` line, never the
  summary. Reading the summary is how this audit spent an hour chasing a drift
  that had already been fixed.
- **A green run can be bought by hand-editing the rows an assertion names.**
  `20261003110400` went failing → failing → green across three runs on an
  identical `headSha` with no repo change. The assertion was working; the code
  path it guarded was never exercised, and the row changes are in no migration.

## Still not done

- **`events` does not use the unified tag system at all** — 35k events carry
  free-text `tags[]` and `unified_tag_assignments` has zero `entity_type='event'`
  rows — so none of this reaches event content. Unchanged from the Phase 4
  finding of the tag DQ programme.
- `drug-checking` and `slamming` are listed above as gaps and **were not**:
  the first had already been revived by the substance vocabulary work, and the
  second is `status='merged'` into `safer-injecting` with a working 301 and both
  spellings kept as aliases. Left visible rather than deleted, because "this
  audit was wrong about two of its three gaps" is the useful part.
- The nitazene blind spot on `fentanyl-test-strips` is a **class-level** claim,
  sourced to the nitazene literature rather than to a manufacturer
  cross-reactivity panel. Brands differ. It errs in the safe direction, but it
  is not a per-product guarantee.
