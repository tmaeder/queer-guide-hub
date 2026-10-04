-- Round 21 of the glossary prose series: the seam rounds 19 and 20 deferred.
--
-- Rounds 19 and 20 each ended by NAMING this seam with its evidence already gathered rather than
-- counting it silently. This works it. 17 rows in four labelled groups, kept labelled because the
-- risk of a mixed migration is that a later reader takes the loosest group's licence and applies
-- it to the rest.
--
-- THE HEADLINE IS THAT THE PUBLISHED STANDARD, NOT A SIBLING, IS THE EVIDENCE FOR GROUP D.
-- `styleguide_terms` carries `opposite sex` in the `avoid` array of the `nonbinary` term at
-- severity `never` (measured live). So `cross-dressing`, `transvestism` and `transvestite`, all
-- three publishing "Dressing in a manner traditionally associated with the opposite sex", are a
-- LIVE VIOLATION OF A PUBLISHED STANDARD rather than a taste call -- the `masc`/`woman`
-- precedent, where `styleguide_terms` rating the essentialist phrasing `never` is what made that
-- fix a standard violation instead of an opinion.
--
-- AND IT IS ALREADY COUNTED. `styleguide_content_drift()` reports `opposite sex` at 27 flagged
-- rows and `tag.short_description` at 18, corpus-wide. So unlike rounds 14, 15, 16 and 20 --
-- every one of which had to state that `tag_disowned_prose_signals()` does not move -- this round
-- moves a gauge that already existed, and the number is one anyone can re-derive.
--
-- THE MECHANISM IS PROVEN RATHER THAN INFERRED. All three group-D rows carry Q486680, and that
-- entity's own English description, resolved live, is literally
--   "practice of dressing in a manner traditionally associated with the opposite sex"
-- so the sweep copied the entity's description verbatim. The identifier is CORRECT (Q486680 really
-- is transvestism), which is the `methadone`/`jockstrap` rule: a correct identifier does not make
-- the prose derived from it correct. NO IDENTIFIER IS TOUCHED IN THIS ROUND AT ALL.
--
-- Group A -- the body is the WRONG SUBJECT while the row's own description establishes the right
-- one (the original rule). Summary restated from the description, body NULLED.
--   cock-socket   article, human_reviewed, Dynamics & Roles. Its own description opens
--                 "A cock socket is a term for a PERSON who acts mainly as a penis receptacle",
--                 and both its summary ("A type of sex toy") and its body ("a hollow, cylindrical
--                 device made of various materials, such as silicone or latex") publish a DEVICE.
--                 A person published as an object, on a roles page.
--                 Note the description ends on a colon -- a truncated fragment -- but unlike
--                 `zaddy`, whose whole description was "Zaddy can be defined in two ways:", the
--                 clause BEFORE the colon is a complete definition, so it IS usable as evidence.
--   cock          body is a disambiguation list: "a family name, a male bird such as a rooster,
--                 ... the hammer of a gun", plus the banned padding.
--   playing-the-field  body is "a 2012 film by Gabriele Muccino and a BBC television drama series
--                 about a female football team ... the Castlefield Blues", against a description
--                 reading "Dating multiple people casually".
--   swab          body is "a nautical term for a yarn mop or a low-ranking sailor, and a surname
--                 shared by individuals such as John Swab, an American film director", against a
--                 description about collecting samples for STI testing.
--
-- `cock` IS A LABELLED SUB-CASE AND THE REASON IS STATED RATHER THAN BURIED. Its description
-- reads "Slang for a man's penis." A plain restatement would publish the gendering this very round
-- exists to remove, and the corpus has already decided that question elsewhere: `99991789823744`
-- de-gendered the `penis` row to say "Trans women, non-binary people and intersex people have
-- penises too -- this is anatomy, not gender." So the summary restates the description with the
-- qualifier DROPPED. That is a REDUCTION of what the row says, never an addition, which is why it
-- stays inside the series' rule.
--
-- Group B -- the summary states nothing a reader can use. Each replacement restates the row's OWN
-- description and CHOOSES NO SENSE, so it carries none of group A's licence.
--   hot-wax, pinching                       "Term with multiple meanings"; long_description
--                                           already NULL, so no body is written or removed.
--   cock-and-ball-ring, feather-tickler,
--   suction-cup-dildo                       "A type of sex toy" -- true of a dozen tags, and it
--                                           tells a reader nothing the tag name does not.
--   domestic-discipline-dd                  "Consensual relationship dynamic" -- equally true of
--                                           every power-exchange tag in the glossary.
--
-- ALL FOUR GROUP-B BODIES THAT EXIST ARE KEPT, AND THREE OF THEM CARRY THE BANNED ADVICE PADDING
-- ("It's essential to prioritize safety and consent ..."). That is round 13's MEASURED REFUSAL,
-- not an oversight: that cohort is ~405 rows, no regex separates contentless exhortation from real
-- harm-reduction content wearing the same register, and sweeping it strips consent and safety
-- content from a kink and sexual-health glossary. The bodies are correct about their subject,
-- which is the only question this round asks of them.
--
-- Group C -- ONE SHARED SUMMARY ACROSS FOUR DIFFERENT DRUGS, and what it erases is drug class and
-- route. All four published "Medication for erectile dysfunction", and THREE OF THE FOUR ARE NOT
-- PDE5 INHIBITORS AT ALL:
--   alprostadil   prostaglandin E1, injected or placed in the urethra (its own body: "administered
--                 through injection or suppository").
--   caverject     brand of injected alprostadil.
--   apomorphine   a DOPAMINE AGONIST whose own description leads with Parkinson's disease.
--   stendra       brand of avanafil, and the one that IS a PDE5 inhibitor.
--
-- THE SIBLING IS THE EVIDENCE, MEASURED RATHER THAN RECALLED: `avanafil` already publishes
-- "Sold as Stendra or Spedra; the fastest-acting of its class. Its label requires 12 hours before
-- any nitrate", and `cialis`/`levitra` already carry the brand-row shape ("Brand name for
-- tadalafil ... Its label requires 48 hours before any nitrate"). So `stendra`'s line is its own
-- sibling's stated interval in its own siblings' shape -- the `soft-limits`->`hard-limits` and
-- `foot-bottom`->`foot-top` pattern. Nothing is invented.
--
-- THE NITRATE CLAIM IS DELIBERATELY NOT EXTENDED TO THE OTHER THREE, and that is a safety
-- decision rather than caution for its own sake. On this platform the poppers interaction is what
-- a reader comes to these rows for, so a wrong interval is real harm in both directions: stating
-- one for a non-PDE5 drug asserts a fact not on the row, and the honest alternative is to state
-- the CLASS and the ROUTE, which is exactly what the flattened summary erased. Each of the three
-- restates only what its own description and body support.
--
-- Group D -- the de-binary three (see the headline above). Summary rewritten; the body gets an
-- EXACT-PHRASE replace of "associated with the opposite sex", measured to occur EXACTLY ONCE in
-- each of the three bodies and in `transvestite`'s description. A `replace()` cannot author prose,
-- so every other sentence survives byte-identically BY CONSTRUCTION rather than by retyping --
-- the `jockstrap`/`sexual-arousal`/`accessibility` precedent. The Hirschfeld history in all three
-- bodies is kept intact.
--
-- ONE SHARED SUMMARY ALSO ERASED THREE DIFFERENT THINGS HERE: `cross-dressing` is the ACT,
-- `transvestism` is the historical clinical term Hirschfeld coined in 1910, and `transvestite` is
-- a PERSON. So group D is the round-12/round-19 distinctness class as well as a standard
-- violation, and either reason alone would reach it.
--
-- `transvestite` IS THE ONE ROW WHERE THIS SERIES WRITES `description`, and the exception is
-- stated rather than smuggled: the phrase the standard rates `never` is IN that column, so
-- leaving it would fix the summary and leave the violation live -- the half-repair class this
-- series has recorded four times. Precedent is `99991789823744`, whose `anus`/`labia` repairs
-- deliberately wrote `description` for the same reason. It is an exact-phrase replace there too.
--
-- DELIBERATELY NOT DONE, each with the reason rather than counted:
--   * `opposite-sex` -- an active tag in `Orientation` whose summary is the literal string
--     "Opposite Sex" (define-the-term-with-the-term, now the 8th recorded instance) and whose
--     description also carries the phrase. A tag NAMED "opposite sex" legitimately contains the
--     phrase, so this is a VOCABULARY question -- whether the tag should exist, and under what
--     name -- not a prose repair. Writing a summary for it means choosing a stance on the term.
--   * THE BODY-ONLY HALF OF THE `opposite sex` COHORT, 11 further active rows, measured and named:
--     `heterosexual`, `heterosexuality`, `sexuality`, `sexual-orientation`, `sexual-identity`,
--     `heteronormativity`, `sexual-preference`, `gender-bender`, `bisexual-flag`,
--     `bisexual-pride-flag`, `the-heterosexual-matrix`. These are the ROUND-15 BODY-SIDE SEAM on a
--     phrase the standard rates `never`, and the sharpest shape in it is that `heterosexual` and
--     `heterosexuality` BOTH already publish the correct "attraction to people of a DIFFERENT
--     gender" in their summary while their bodies still say "opposite sex" -- a summary-ordered
--     sweep reads those as clean. Two of the eleven (`heteronormativity`, `bisexual-pride-flag`)
--     are `seo_indexable` articles, so they are the reachable ones. They are left because each
--     needs its own per-row read of a long body, which is a pass, not a footnote to this one.
--   * `alprostadil` carries NO `wikidata_id` while `caverject`, its own brand row, holds Q579348 --
--     which resolves to "alprostadil", a chemical compound, enwiki "Prostaglandin E1", i.e. the
--     GENERIC on the BRAND row and nothing on the generic. The inversion is real and is NOT fixed:
--     assigning an identifier is adoption, and this series does not adopt. Q579348 is also KEPT
--     rather than cleared -- it is the broader-concept case, and auto-clearing a concept QID was
--     measured to destroy ~70% correct links. It carries 2 medical codes, which are alprostadil's
--     and are correct for Caverject's own active ingredient.
--   * All three group-D rows share ONE identifier for an act, a clinical term and a person.
--     Repointing is forbidden here for the usual reason, and `cross-dresser` already holds the
--     only obvious alternative (Q9304839), so there is nothing free to move `transvestite` to.
--   * The 156-row banned-register cohort and the ~405-row advice-padding class stay refused.
--
-- The actor declaration IS load-bearing: `cock-socket` and `domestic-discipline-dd` are
-- `human_reviewed`, so `log_unified_tag_change()` RAISEs for an undeclared `system:%` actor; and
-- `cross-dressing`, `transvestism` and `domestic-discipline-dd` are `is_sensitive`, which
-- `tag_prose_apply()` hard-refuses whatever the caller claims. A migration is the only path.

begin;

select set_config('app.actor', 'migration:99991791072113_tag_prose_deferred_seam', true);

-- Snapshot BEFORE anything is written, so "no collateral" and the controls are MEASUREMENTS
-- rather than promises. Every control and refusal is in here, or the checks that read it go
-- vacuous while still naming the row (the mutation that survived round 20's first batch).
create temporary table _r21_before on commit drop as
select slug, short_description, description, long_description, wikidata_id,
       (long_description is not null) as had_body
from public.unified_tags
where slug in (
  -- group A
  'cock-socket','cock','playing-the-field','swab',
  -- group B
  'hot-wax','pinching','cock-and-ball-ring','feather-tickler','suction-cup-dildo',
  'domestic-discipline-dd',
  -- group C
  'alprostadil','caverject','apomorphine','stendra',
  -- group D
  'cross-dressing','transvestism','transvestite',
  -- controls that must survive untouched
  'cross-dresser','avanafil','poppers','opposite-sex','heterosexual','heteronormativity'
);

-- ---------------------------------------------------------------------------
-- Group A: wrong-subject body. Summary restated from the row's own description; body NULLED.
-- ---------------------------------------------------------------------------
update public.unified_tags t
   set short_description = g.new_sd,
       long_description  = null
  from (values
    ('cock-socket',
     'A type of sex toy',
     'A person who serves mainly as a receptacle for penetration.'),
    ('cock',
     'Term with multiple meanings',
     'Slang for the penis.'),
    ('playing-the-field',
     'Term with multiple meanings',
     'Dating several people casually at the same time.'),
    ('swab',
     'Term with multiple meanings',
     'A sample taken from the throat, rectum or genitals with a cotton swab for STI testing.')
  ) as g(slug, old_sd, new_sd)
 where t.slug = g.slug
   and t.status = 'active'
   and btrim(t.short_description) = g.old_sd;

-- ---------------------------------------------------------------------------
-- Group B: says-nothing summary. Body is KEPT where it exists (round 13's measured refusal) and
-- is already NULL on hot-wax and pinching, so this statement touches no body at all.
-- ---------------------------------------------------------------------------
update public.unified_tags t
   set short_description = g.new_sd
  from (values
    ('hot-wax',
     'Term with multiple meanings',
     'Dripping melted candle wax onto the skin for heat and sensation.'),
    ('pinching',
     'Term with multiple meanings',
     'Sensation play that pinches the skin, from playful to intense.'),
    ('cock-and-ball-ring',
     'A type of sex toy',
     'A ring worn around the base of the penis and testicles to firm an erection and add sensation.'),
    ('feather-tickler',
     'A type of sex toy',
     'Soft feathers on a handle, drawn lightly across the skin.'),
    ('suction-cup-dildo',
     'A type of sex toy',
     'A dildo with a suction-cup base that sticks to a smooth surface for hands-free use.'),
    ('domestic-discipline-dd',
     'Consensual relationship dynamic',
     'A dynamic where one partner sets the household rules and enforces them, often by spanking.')
  ) as g(slug, old_sd, new_sd)
 where t.slug = g.slug
   and t.status = 'active'
   and btrim(t.short_description) = g.old_sd;

-- ---------------------------------------------------------------------------
-- Group C: one flattened summary across four drugs of three different classes and three routes.
-- Bodies are KEPT -- each is correct about its own drug, which is the only question asked here.
-- ---------------------------------------------------------------------------
update public.unified_tags t
   set short_description = g.new_sd
  from (values
    ('alprostadil',
     'Medication for erectile dysfunction',
     'Prostaglandin E1, injected into the penis or placed in the urethra rather than swallowed.'),
    ('caverject',
     'Medication for erectile dysfunction',
     'Brand name for injected alprostadil — a prostaglandin, not a PDE5 inhibitor.'),
    ('apomorphine',
     'Medication for erectile dysfunction',
     'A dopamine agonist acting on the brain, mainly used for Parkinson''s disease.'),
    ('stendra',
     'Medication for erectile dysfunction',
     'Brand name for avanafil, the fastest-acting PDE5 inhibitor. Its label requires 12 hours before any nitrate.')
  ) as g(slug, old_sd, new_sd)
 where t.slug = g.slug
   and t.status = 'active'
   and btrim(t.short_description) = g.old_sd;

-- ---------------------------------------------------------------------------
-- Group D: the published standard rates "opposite sex" `never`. Summary rewritten; body gets an
-- exact-phrase replace that cannot author prose. Identifiers untouched.
-- ---------------------------------------------------------------------------
update public.unified_tags t
   set short_description = g.new_sd,
       long_description  = replace(t.long_description,
                                   'associated with the opposite sex',
                                   'associated with another gender')
  from (values
    ('cross-dressing',
     'Wearing clothes associated with another gender, for pleasure, expression or performance.'),
    ('transvestism',
     'The historical clinical term Hirschfeld coined in 1910 for wearing another gender''s clothes.'),
    ('transvestite',
     'A person who dresses in clothes associated with another gender.')
  ) as g(slug, new_sd)
 where t.slug = g.slug
   and t.status = 'active'
   and btrim(t.short_description) = 'Dressing in a manner traditionally associated with the opposite sex'
   and t.long_description like '%associated with the opposite sex%';

-- `transvestite` is the only row in this series whose `description` is written, because the phrase
-- the standard rates `never` is in that column. Exact-phrase replace, same as the bodies above.
update public.unified_tags t
   set description = replace(t.description,
                             'associated with the opposite sex',
                             'associated with another gender')
 where t.slug = 'transvestite'
   and t.status = 'active'
   and t.description like '%associated with the opposite sex%';

do $verify$
declare
  v_bad int;
  v_names text;
begin
  -- P1 round 21: every one of the 17 rows carries a usable summary and none of the defect strings.
  -- CALL tag_has_prose rather than restating it -- the predicate is an OR, and the stricter
  -- hand-rolled "both present" form is a different check (the trap `75000101100000` recorded).
  select count(*), string_agg(slug, ', ' order by slug) into v_bad, v_names
  from public.unified_tags t
  where t.slug in ('cock-socket','cock','playing-the-field','swab',
                   'hot-wax','pinching','cock-and-ball-ring','feather-tickler','suction-cup-dildo',
                   'domestic-discipline-dd',
                   'alprostadil','caverject','apomorphine','stendra',
                   'cross-dressing','transvestism','transvestite')
    and public.tag_has_prose(t.description, t.short_description)
    and btrim(t.short_description) not in (
          'A type of sex toy',
          'Term with multiple meanings',
          'Consensual relationship dynamic',
          'Medication for erectile dysfunction',
          'Dressing in a manner traditionally associated with the opposite sex');
  if v_bad <> 17 then
    raise exception 'round 21 P1 failed: % of 17 rows repaired and publishable (%)', v_bad, v_names;
  end if;

  -- P2 round 21: the four group-A bodies are gone.
  select count(*), string_agg(slug, ', ' order by slug) into v_bad, v_names
  from public.unified_tags
  where slug in ('cock-socket','cock','playing-the-field','swab')
    and long_description is null;
  if v_bad <> 4 then
    raise exception 'round 21 P2 failed: % of 4 group-A bodies nulled (%)', v_bad, v_names;
  end if;

  -- P3 round 21: every body this round promised to KEEP is still there, byte-identical to the
  -- snapshot. Nulling a good body is the exact mirror of leaving a wrong one, so both directions
  -- are asserted. Four group-B bodies plus all four group-C bodies.
  select count(*), string_agg(t.slug, ', ' order by t.slug) into v_bad, v_names
  from public.unified_tags t
  join _r21_before b on b.slug = t.slug
  where t.slug in ('cock-and-ball-ring','feather-tickler','suction-cup-dildo','domestic-discipline-dd',
                   'alprostadil','caverject','apomorphine','stendra')
    and t.long_description is not null
    and t.long_description = b.long_description;
  if v_bad <> 8 then
    raise exception 'round 21 P3 failed: % of 8 kept bodies intact and unchanged (%)', v_bad, v_names;
  end if;

  -- P4 round 21: hot-wax and pinching had no body and still have none -- this round neither wrote
  -- nor removed one there, so a statement that quietly minted a body is caught.
  select count(*) into v_bad
  from public.unified_tags t
  join _r21_before b on b.slug = t.slug
  where t.slug in ('hot-wax','pinching')
    and not b.had_body
    and t.long_description is null;
  if v_bad <> 2 then
    raise exception 'round 21 P4 failed: % of 2 bodyless group-B rows still bodyless', v_bad;
  end if;

  -- P5 round 21: the phrase the published standard rates `never` is gone from all three group-D
  -- rows, in EVERY prose column -- summary, description and body together. The half-repair class.
  select count(*), string_agg(slug, ', ' order by slug) into v_bad, v_names
  from public.unified_tags
  where slug in ('cross-dressing','transvestism','transvestite')
    and coalesce(short_description,'') not ilike '%opposite sex%'
    and coalesce(description,'')       not ilike '%opposite sex%'
    and coalesce(long_description,'')  not ilike '%opposite sex%';
  if v_bad <> 3 then
    raise exception 'round 21 P5 failed: % of 3 group-D rows clear of the phrase in all columns (%)', v_bad, v_names;
  end if;

  -- P6 round 21: the group-D bodies were EDITED, not rewritten. Each must still carry its
  -- Hirschfeld history and must differ from the snapshot by exactly the replaced phrase, which is
  -- what proves a `replace()` ran rather than a new body being authored.
  select count(*), string_agg(t.slug, ', ' order by t.slug) into v_bad, v_names
  from public.unified_tags t
  join _r21_before b on b.slug = t.slug
  where t.slug in ('cross-dressing','transvestism','transvestite')
    and t.long_description = replace(b.long_description,
                                     'associated with the opposite sex',
                                     'associated with another gender')
    and t.long_description <> b.long_description;
  if v_bad <> 3 then
    raise exception 'round 21 P6 failed: % of 3 group-D bodies edited by exactly the replace (%)', v_bad, v_names;
  end if;

  -- P7 round 21: NO identifier moved anywhere in this round.
  select count(*), string_agg(t.slug, ', ' order by t.slug) into v_bad, v_names
  from public.unified_tags t
  join _r21_before b on b.slug = t.slug
  where t.wikidata_id is distinct from b.wikidata_id;
  if v_bad <> 0 then
    raise exception 'round 21 P7 failed: % identifiers moved (%)', v_bad, v_names;
  end if;

  -- P8 round 21: `description` is unchanged on all 16 rows other than `transvestite`, so the one
  -- stated exception cannot quietly become a licence.
  select count(*), string_agg(t.slug, ', ' order by t.slug) into v_bad, v_names
  from public.unified_tags t
  join _r21_before b on b.slug = t.slug
  where t.slug <> 'transvestite'
    and t.description is distinct from b.description;
  if v_bad <> 0 then
    raise exception 'round 21 P8 failed: % rows had description changed outside transvestite (%)', v_bad, v_names;
  end if;

  -- P9 round 21: the refusals and controls are untouched. `avanafil` is the EVIDENCE for stendra's
  -- line, `cross-dresser` the evidence for group D's phrasing, and `opposite-sex`,
  -- `heterosexual` and `heteronormativity` are named refusals -- a sweep that took them would
  -- otherwise satisfy P5 just as well.
  select count(*), string_agg(t.slug, ', ' order by t.slug) into v_bad, v_names
  from public.unified_tags t
  join _r21_before b on b.slug = t.slug
  where t.slug in ('cross-dresser','avanafil','poppers','opposite-sex','heterosexual','heteronormativity')
    and t.short_description is not distinct from b.short_description
    and t.description       is not distinct from b.description
    and t.long_description  is not distinct from b.long_description;
  if v_bad <> 6 then
    raise exception 'round 21 P9 failed: only % of 6 controls untouched (%)', v_bad, v_names;
  end if;

  raise notice 'round 21 OK: 17 summaries, 4 bodies nulled, 8 bodies kept, 3 bodies phrase-edited, 0 identifiers moved';
end
$verify$;

commit;
