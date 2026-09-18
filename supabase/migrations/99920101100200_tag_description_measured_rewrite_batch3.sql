-- Glossary descriptions: the measured rewrite, batch 3 (7 rows)
--
-- Rows 59-86 of the seeded encyclopedic-pool ordering: 28 read, 7 rewritten,
-- 21 kept. The rate keeps falling (batch 1 ~35%, batch 2 36%, batch 3 25%)
-- because the pool's remaining rows are increasingly house-voice prose that a
-- length screen catches and a reader does not.
--
-- Voice conformance was checked against the live styleguide BEFORE scoring, as
-- of batch 2: zero avoid-term hits, zero British spellings, zero hyphenated
-- non-binary, zero second person, zero exclamation marks, every replacement one
-- sentence.
--
-- TWO ROWS ARE THE DEFINES-ANOTHER-LIVE-TAG CLASS, which is the sharpest defect
-- shape this series finds because the corpus states one concept twice and the
-- row in hand says nothing about itself:
--
--   misgendering  published the definition of TRANSPHOBIA. `transphobia` is a
--                 separate ACTIVE row with 356 assignments and its own correct
--                 description, so the corpus said it twice and the misgendering
--                 page never defined misgendering. Replacement taken from this
--                 row's own short_description and body. (Same shape as
--                 drag-mother in batch 1 and the 84000101100000 cohort.)
--   cervix        published 757 chars of anatomy — Hippocrates, dimensions,
--                 "a woman's life cycle", "women in the fertile years" — on a
--                 row categorised Dynamics & Roles. Beyond being encyclopedic,
--                 that phrasing writes trans men and nonbinary people out of an
--                 organ they have, which `intersectional-by-default` and
--                 `trans-language` both address. The replacement is the row's
--                 own short_description, ungendered.
--
-- ONE IS AN ACCURACY FIX, not a register one: `bictegravir` said "In 2016,
-- bictegravir was in a Phase 3 trial". It has been an approved HIV treatment
-- for years. Publishing a decade-old trial status as the current state of an
-- HIV medication is wrong, not merely dated.
--
-- FOUR ARE GEOGRAPHY: dallas (746ch of census and county detail), germany
-- (649ch), rotterdam (310ch of delta hydrology), corsica (403ch).
--
-- THREE MORE TRUNCATIONS WERE DRAWN AND ALL THREE ARE LEFT ALONE: mysophilia,
-- patient and horny-net-geek-hng each sit at exactly 500 characters ending
-- mid-word. They are asserted still truncated. Closing one with a full stop is
-- the most dangerous edit available here, and CLAUDE.md already names `patient`
-- in that cohort.
--
-- FOUR ROWS ARE FLAGGED RATHER THAN REWRITTEN, each for a stated reason:
--
--   schoneberg  814 assignments, and the description is Berlin borough-reform
--               trivia that never says what the tag is for. The obvious
--               replacement names it as Berlin's historic gay quarter — and
--               NOTHING ON THE ROW SAYS THAT. Writing it would be the same
--               stretch that produced batch 1's single fabrication, however
--               well known the fact is. This needs sourced enrichment, not a
--               rewrite from memory, and is recorded here so the next pass does
--               not mistake it for an oversight.
--   sprecher    the description IS a surname disambiguation list, and
--               short_description is NULL, so it can be neither rewritten from
--               its own evidence nor nulled without failing the thin-page gate.
--               Same as `kerle` in batch 2. Human decision.
--   drink       247 assignments on a Venue Types row whose description is the
--               Wikipedia article on beverages. "Drink" has a live ordinary
--               reading on a travel platform, so the category does not settle
--               the sense — the `solo` refusal of round eleven.
--   color-beige category NULL, usage 0, no evidence of an intended sense. Same
--               disposition as color-black in batch 1.
--
-- Soft on preconditions, hard on postconditions: every UPDATE is guarded on the
-- text it removes, so a concurrent repair no-ops instead of aborting db push.

begin;

select set_config('app.actor', 'admin:tag-description-measured-rewrite-b3', true);

-- 1 cervix  encyclopedic AND gendered; replacement is the row's own summary
update unified_tags set description =
  'The lower part of the uterus, connecting it to the vagina.'
where slug = 'cervix' and status = 'active'
  and description like '%documented anatomically since at least the time of Hippocrates%';

-- 2 bictegravir  publishes a 2016 trial status for an approved HIV medication
update unified_tags set description =
  'An integrase inhibitor used to treat HIV-1, taken as part of a single-tablet regimen.'
where slug = 'bictegravir' and status = 'active'
  and description like '%was in a Phase 3 trial%';

-- 3 dallas  746ch of census and county geography
update unified_tags set description =
  'A city in northern Texas and the anchor of the Dallas-Fort Worth metroplex.'
where slug = 'dallas' and status = 'active' and description like '%Collin, Denton, Kaufman, and Rockwall%';

-- 4 misgendering  publishes the definition of TRANSPHOBIA, a separate live row
update unified_tags set description =
  'Referring to someone as a gender that is not theirs — a wrong pronoun, title or gendered word.'
where slug = 'misgendering' and status = 'active'
  and description like 'Transphobia consists of negative attitudes%';

-- 5 rotterdam  310ch of delta hydrology
update unified_tags set description =
  'The second-largest city in the Netherlands, in the province of South Holland.'
where slug = 'rotterdam' and status = 'active' and description like '%Rhine%Meuse%Scheldt delta%';

-- 6 germany  649ch of borders and population
update unified_tags set description =
  'A country in western and central Europe, with Berlin as its capital.'
where slug = 'germany' and status = 'active' and description like '%the largest urban area is the Ruhr%';

-- 7 corsica  403ch incl. a dated population figure
update unified_tags set description =
  'An island in the Mediterranean and one of the regions of France, southeast of the mainland.'
where slug = 'corsica' and status = 'active' and description like '%it had a population of 365,636%';

do $verify$
declare
  v_bad int;
begin
  -- 1. the reached state, counted positively
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='cervix' and description = 'The lower part of the uterus, connecting it to the vagina.')
    or (slug='bictegravir' and description like 'An integrase inhibitor used to treat HIV-1%')
    or (slug='dallas' and description like 'A city in northern Texas%')
    or (slug='misgendering' and description like 'Referring to someone as a gender that is not theirs%')
    or (slug='rotterdam' and description like 'The second-largest city in the Netherlands%')
    or (slug='germany' and description like 'A country in western and central Europe%')
    or (slug='corsica' and description like 'An island in the Mediterranean%')
  );
  if v_bad <> 7 then
    raise exception 'tag_description_measured_rewrite_b3: expected 7 rows in the reached state, found %', v_bad;
  end if;

  -- 2. THE TRUNCATION REFUSAL. Three cap-length rows were drawn in this tranche
  --    and all three must still be truncated and unpunctuated.
  select count(*) into v_bad from unified_tags
  where status = 'active' and slug in ('mysophilia','patient','horny-net-geek-hng')
    and length(description) = 500 and description !~ '[.!?]["'')\]]?\s*$';
  if v_bad <> 3 then
    raise exception 'tag_description_measured_rewrite_b3: a truncated row was closed (found % of 3 still truncated)', v_bad;
  end if;

  -- 3. misgendering no longer states transphobia's definition, AND transphobia
  --    still carries its own. Asserting only the first is satisfied by a pass
  --    that broke the other row instead.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='misgendering' and description not like 'Transphobia consists%')
    or (slug='transphobia' and description like 'Prejudice, discrimination, or fear directed towards transgender%')
  );
  if v_bad <> 2 then
    raise exception 'tag_description_measured_rewrite_b3: the misgendering/transphobia split is wrong (found % of 2)', v_bad;
  end if;

  -- 4. THE FLAGGED ROWS ARE UNTOUCHED. Each was read and refused for a stated
  --    reason; a later sweep that "finished the job" breaks this.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='schoneberg' and description like '%administrative reform it was a separate borough%')
    or (slug='sprecher' and description like 'Sprecher is a surname%')
    or (slug='drink' and description like 'A drink or beverage is a liquid%')
    or (slug='color-beige' and description like 'Beige is variously described%')
  );
  if v_bad <> 4 then
    raise exception 'tag_description_measured_rewrite_b3: a deliberately flagged row was rewritten (found % of 4)', v_bad;
  end if;

  -- 5. NO VOICE VIOLATION SHIPS. The `s?` is load-bearing: \m...\M anchors both
  --    ends, so \morganisation\M does not match "organisations".
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('cervix','bictegravir','dallas','misgendering','rotterdam','germany','corsica')
    and (description ~* '\m(organisation|characterised|recognised|behaviour|licence)s?\M'
      or description ~* '\mnon-binary\M'
      or description ~* '\m(you|your)\M'
      or description ~ '!');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b3: % row(s) carry a Tone of Voice violation', v_bad;
  end if;
end
$verify$;

commit;
