-- Disowned prose, round THIRTEEN: the self-citation register, one wrong
-- subject, and a REFUSAL that is the substance of this file (2026-09-15)
--
-- This round is three rows, and the small number is the result rather than the
-- budget. The class it set out to work -- prose written in the register
-- `TAG_STYLE_SYSTEM` bans -- was measured, hand-read, and mostly REFUSED.
--
-- ---------------------------------------------------------------------------
-- WHAT IS REPAIRED
--
-- `trampling` is not a register defect at all, it is the original rule at its
-- sharpest and was found while reading for one. Category `Fetishes`,
-- `is_adult`, INDEXABLE, description **"Walking or standing on someone"** --
-- and the published summary is **"Cause of death by being walked on"**, over a
-- body about crowd disasters, animal stampedes and the German and French words
-- for being crushed. The description types the tag as a practice; the summary
-- asserts a manner of death. Summary replaced, body nulled (pure
-- literal-referent encyclopedia over a one-line description, so there is
-- nothing to write a body from -- the doe/fae/flock treatment).
--
-- `puberty-blockers` (17 uses, indexable) and `polyandrous` close with prose
-- CITING ITS OWN SOURCE TO THE READER -- *"According to scientific research
-- published in 2020, these medications can be an important option..."* and
-- *"According to scientific research, polyandrous relationships can take
-- various forms..."*. This is the register `impaired-driving`, `sti-testing`
-- and `60000301100000`'s group C were repaired for: a glossary entry states
-- what a thing is, it does not narrate that a study exists. `polyandrous` also
-- closes with the affirmation padding.
--
-- **THE OFFENDING SENTENCES ARE DELETED AND EVERY OTHER SENTENCE IS KEPT
-- BYTE-IDENTICAL**, and the postcondition asserts the survivors in full. A
-- check that merely confirms the citation is gone passes equally against a
-- full rewrite, which is the retired experiment wearing a fix's clothes.
--
-- ---------------------------------------------------------------------------
-- WHAT IS REFUSED, AND WHY THAT IS THE FINDING
--
-- CLAUDE.md has carried a note that the consent-padding class is "93 rows, all
-- in long_description" and "NOT a judgement-free sweep -- hand-read per row".
-- Re-measuring it corrects the number and then confirms the warning the hard
-- way. **157 active rows** carry a sentence of the form *"it's essential to
-- prioritize / remember / note / understand ..."*.
--
-- A first measurement reported **two distinct sentences**, which would have
-- made this a stamped boilerplate and a clean mechanical deletion. **That was
-- an artifact of the regex** -- `substring` returns the first match and the
-- grouping collapsed on the truncation. Grouped correctly the 157 rows carry
-- roughly **150 DISTINCT sentences**. Re-measure before believing a number
-- that makes the work easy.
--
-- Hand-reading all of them splits the class in two, and the split is why no
-- sweep is shipped:
--
--   * Contentless exhortation, which the style guide is right to ban --
--     "It's essential to prioritize communication and consent in any sexual
--     activity" adds nothing a reader of that page does not already have.
--
--   * REAL CONTENT WEARING THE BANNED REGISTER, on exactly the pages where it
--     matters most:
--       `rape-play`   "rape play is not the same as actual non-consensual
--                      acts, and it should never be used to normalize or
--                      trivialize sexual violence"
--       `piss-drinker` "carries health risks if not practiced safely"
--       `hiv-transmission`, `water-bondage`, `electrostimulation`,
--       `self-bondage`, `vajazzle`, `ampallang` -- safety facts
--       `morosexual`, `novosexual` -- "not an officially recognized term in
--                      the scientific community", an epistemic caveat
--       `latino`      the Latino/Hispanic distinction
--       `alloromantic` romantic orientation is distinct from sexual orientation
--       `lipstick-lesbian`, `exclusive` -- how the term is contested
--
-- No regex separates those two groups: both are one trailing sentence in the
-- same voice. A sweep keyed on the phrasing would strip harm-reduction and
-- consent-boundary content from a kink and sexual-health glossary, which is
-- the one direction this codebase has repeatedly refused to fail in. So the
-- class is left standing, the measurement is recorded, and **the refusal is
-- made ENFORCEABLE**: the postcondition asserts that eight named
-- content-bearing rows still carry their sentences, so a later pass that
-- reaches for the easy sweep breaks this file's own check.
--
-- That is the same conclusion `styleguide_content_drift()` reached for
-- `vibrant` and `explore` -- a counter, not a rewrite -- and the same one the
-- tag prose judge earned when it retracted 16 of its first 18 rows with 13 of
-- them wrong.
--
-- The actor declaration is load-bearing: all three rows are `human_reviewed`.

select set_config('app.actor', 'admin:tag-prose-register-and-refusal', true);

-- ---------------------------------------------------------------------------
-- The wrong subject.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'Walking or standing on a partner as play.',
       long_description  = null
 where slug = 'trampling' and short_description = 'Cause of death by being walked on';

-- ---------------------------------------------------------------------------
-- The self-citation register. One sentence removed from each body; every other
-- sentence is byte-identical, and the postcondition asserts the whole survivor.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set long_description = 'Puberty blockers are medications that temporarily delay the onset of puberty. They are often used to give young people time to explore their gender identity without the physical changes of puberty. The effects of puberty blockers are generally reversible when the medication is stopped.'
 where slug = 'puberty-blockers'
   and long_description like '%According to scientific research published in 2020%';

update public.unified_tags
   set long_description = 'Polyandry is a form of polyamory where one woman is married to or in a relationship with multiple men. This type of relationship can be found in some cultures and societies around the world.'
 where slug = 'polyandrous'
   and long_description like '%According to scientific research, polyandrous relationships%';

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
begin
  -- 1. The wrong summary and both self-citations are gone.
  select count(*) into v_bad
    from public.unified_tags
   where short_description = 'Cause of death by being walked on'
      or long_description like '%According to scientific research published in 2020%'
      or long_description like '%According to scientific research, polyandrous relationships%'
      or long_description like '%It is essential to approach and respect individuals in polyandrous%';
  if v_bad <> 0 then
    raise exception 'register seam: % row(s) still publish the disowned text', v_bad;
  end if;

  -- 2. The reached state, counted POSITIVELY.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('trampling', 'puberty-blockers', 'polyandrous')
     and coalesce(btrim(short_description), '') <> '';
  if v_bad <> 3 then
    raise exception 'register seam: expected 3 rows carrying a summary, found %', v_bad;
  end if;

  -- 3. The thin-page gate, CALLED rather than restated.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('trampling', 'puberty-blockers', 'polyandrous')
     and not public.tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'register seam: % row(s) would fail the thin-page gate', v_bad;
  end if;

  -- 4. THE SURVIVING SENTENCES, ASSERTED IN FULL. "the citation is gone"
  --    passes equally against a full rewrite; only the exact remaining text
  --    distinguishes a sentence deletion from the bulk rewrite this repo
  --    retired after the prose judge got 13 of 16 retractions wrong.
  select count(*) into v_bad
    from public.unified_tags
   where slug = 'puberty-blockers'
     and long_description is distinct from 'Puberty blockers are medications that temporarily delay the onset of puberty. They are often used to give young people time to explore their gender identity without the physical changes of puberty. The effects of puberty blockers are generally reversible when the medication is stopped.';
  if v_bad <> 0 then
    raise exception 'register seam: puberty-blockers body is not the original minus one sentence';
  end if;

  select count(*) into v_bad
    from public.unified_tags
   where slug = 'polyandrous'
     and long_description is distinct from 'Polyandry is a form of polyamory where one woman is married to or in a relationship with multiple men. This type of relationship can be found in some cultures and societies around the world.';
  if v_bad <> 0 then
    raise exception 'register seam: polyandrous body is not the original minus two sentences';
  end if;

  select count(*) into v_bad
    from public.unified_tags
   where slug = 'trampling' and long_description is not null;
  if v_bad <> 0 then
    raise exception 'register seam: the literal-referent body survives on trampling';
  end if;

  -- 5. THE REFUSAL, MADE ENFORCEABLE. These eight rows carry a sentence in the
  --    banned register that is also the safety, epistemic or contested-usage
  --    content of the page. A later pass that sweeps the 157-row class on
  --    phrasing alone takes these with it and breaks this check.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('rape-play','piss-drinker','hiv-transmission','water-bondage',
                  'electrostimulation','morosexual','latino','alloromantic')
     and status = 'active'
     and long_description ~* 'it(''s| is) (essential|important) to (prioritize|remember|note|understand)';
  if v_bad <> 8 then
    raise exception 'register seam: expected all 8 content-bearing rows to keep their sentence, found %', v_bad;
  end if;
end $verify$;
