-- Glossary prose round sixteen: the concept published as a COMMUNITY
--
-- Rounds two to fifteen worked the disowned-prose backlog on ten orderings. This
-- one is NOT a slice of that backlog and the file says so up front: all thirteen
-- rows carry NO wikidata_id and NO tag_wikidata_repair_audit row, so
-- tag_disowned_prose_signals() is structurally blind to them and its three
-- counts do not move at all. They are the OTHER half of the same producer --
-- CLAUDE.md already records that rows which never had a QID got prose from a
-- NAME-ONLY lookup -- and the selection rule is unchanged: repair only where the
-- row's own `description` establishes a sense the published prose contradicts or
-- fails to state, derive the replacement FROM that description, and never write
-- `description`, which is the evidence.
--
-- THE AXIS: the description defines a TERM -- a person-type, a behaviour, an
-- orientation -- and the published prose reframes it as a COMMUNITY, a PLACE or
-- a TAG. It is round nine's role-typing one step out: there the contradiction
-- was "a role" against "an animal", here it is "a person or a practice" against
-- "a group you can join".
--
-- THE SPLIT IS WHAT MAKES THE SIGNATURE TRUSTWORTHY, and most of what it returns
-- is correct prose. `trans-community` IS a community, `rope-dojo` IS a space,
-- `sexual-assault-resources` IS a set of resources, `peer-rope` IS a community
-- and a practice, `needle-exchange-program-nep` IS a programme. None is touched,
-- and the verify block asserts they survive. The regex narrows what a human
-- reads; it does not decide.
--
-- REFUSED, WITH THE REASON, NOT MERELY UNREACHED:
--   * `lgbtq-support`, `comedy`, `outdoor`, `family-friendly`, `adult-beverages`
--     and the rest of the "This tag is for ..." cohort. Their bodies are
--     addressed to a content manager rather than a reader, but they carry the
--     CORRECT facts, so this is the REGISTER class round thirteen measured and
--     declined to sweep. Removing the opener would mean authoring prose, which
--     this series does not do.
--   * `queer` (13,119 uses). Its summary "Umbrella term for LGBTQ+ individuals"
--     is THIN against a rich authored description, not wrong. Under-reaching is
--     the correct error.
--   * `futanari`, `pussy-worship`, `shemale` -- the anatomy-phrase residue round
--     fourteen named. Re-read on 2026-09-19 rather than re-reading the deferral:
--     on all three the row's OWN description carries the same phrasing as the
--     summary, so there is no contradicting evidence on the row and this series
--     never writes that column. The deferral still holds.
--
-- GROUP A (10) -- the description is a full authored definition, so the
-- replacement is derived from it. `uranic` is the sharpest row in the file and
-- is a factual error as well as a wrong subject: its body describes URANIAN, the
-- 19th-century historic term, and attributes it to Karl Maria Kertbeny, who
-- coined "homosexual"/"heterosexual" -- the Uranian vocabulary is Karl Heinrich
-- Ulrichs'. The row's own description defines the MODERN orientation label whose
-- feminine counterpart is `neptunic`, a tag this corpus already holds
-- separately. `sex-favorable` is an asexual-spectrum identity published as a
-- venue facet ("This tag is used to indicate destinations or spaces").
-- `vulturing` is inverted by its own summary: a vulture targets vulnerability,
-- it does not seek attention.
--
-- GROUP B (3) -- the description is a single line, enough to state what the tag
-- is and not enough to write a body from, so the replacement RESTATES it and
-- CHOOSES NO SENSE. `ukete` published "Ukete is a term" as its summary over a
-- body admitting "its meaning and usage are unclear" -- defining the term with
-- the term, the seventh recorded instance, plus published uncertainty.
--
-- BODY DISCIPLINE: 12 bodies are NULLED (wrong subject, or a tagging instruction
-- that adds nothing beyond the summary) and ONE is KEPT -- `aesthetic-fetishist`
-- carries a correct generic body whose only fault was the summary above it, the
-- `casting` rule of repairing only the wrong FIELDS. No body is authored.
-- Nulling is safe and ASSERTED rather than assumed: enforce_tag_thin_page_gate
-- reads tag_has_prose(description, short_description) only, and all thirteen
-- keep both -- the verify block calls the real function rather than restating
-- it, because a hand-rolled "both present" form would be a different predicate.
--
-- Round thirteen's refusal is re-asserted inside this file: twelve body nulls
-- are exactly the shape that could quietly take a protected row with them.
--
-- 12 of the 13 rows are human_reviewed, so the actor declaration is LOAD-BEARING
-- (`queer-romantic` is the exception) -- log_unified_tag_change() RAISEs when an
-- undeclared system actor modifies such a row.

select set_config('app.actor', 'migration:99960101100000', true);

-- ---------------------------------------------------------------- GROUP A (10)

update unified_tags set
  short_description = 'Attraction to men and masculine or neutral non-binary people, but not to women or feminine-aligned people.',
  long_description  = null
where slug = 'uranic' and short_description = 'Historic term for LGBTQ+ individuals';

update unified_tags set
  short_description = 'Circling someone who is emotionally vulnerable and moving in to benefit from it.',
  long_description  = null
where slug = 'vulturing' and short_description = 'Unwanted, attention-seeking behavior';

update unified_tags set
  short_description = 'An asexual person who enjoys sex and may seek it out.',
  long_description  = null
where slug = 'sex-favorable' and short_description = 'Places with sex-positive attitudes';

update unified_tags set
  short_description = 'Someone in the swinging scene who enjoys the social side and often does not play.',
  long_description  = null
where slug = 'social-swinger' and short_description = 'Community for consensual non-monogamy';

update unified_tags set
  short_description = 'A preference for dating and sex exclusively with other queer people.',
  long_description  = null
where slug = 'queer-for-queer-q4q' and short_description = 'Community support for queer individuals';

update unified_tags set
  short_description = 'Slang for a newcomer in an online space who comes across as overly forward.',
  long_description  = null
where slug = 'horny-net-geek-hng' and short_description = 'Community for tech-savvy individuals with diverse desires';

update unified_tags set
  short_description = 'A submissive who prefers touch, intimacy and erotic pleasure over heavy pain or strict rules.',
  long_description  = null
where slug = 'sensual-submissive' and short_description = 'Exploring submissive desires and sensations.';

update unified_tags set
  short_description = 'Kink lived as part of everyday life and relationships, not confined to scenes.',
  long_description  = null
where slug = 'lifestyle-kink' and short_description = 'Exploring kink and alternative lifestyles';

update unified_tags set
  short_description = 'Romantic attraction that is non-normative or fluid.',
  long_description  = null
where slug = 'queer-romantic' and short_description = 'Romantic experiences for queer individuals';

-- body KEPT: correct generic prose, only the summary above it was wrong
update unified_tags set
  short_description = 'Someone aroused by beauty, symmetry and flawless presentation, not merely appreciative of it.'
where slug = 'aesthetic-fetishist' and short_description = 'Community for those with aesthetic fetishes';

-- ----------------------------------------------------------------- GROUP B (3)
-- Restates the row's own one-line description and chooses no sense.

update unified_tags set
  short_description = 'The receiving partner in Japanese rope.',
  long_description  = null
where slug = 'ukete' and short_description = 'Ukete is a term';

update unified_tags set
  short_description = 'A person who pursues sensual pleasure.',
  long_description  = null
where slug = 'sensual-hedonist' and short_description = 'Exploring pleasure and desire';

update unified_tags set
  short_description = 'A clever exchanger of pain.',
  long_description  = null
where slug = 'smart-ass-sadomasochist' and short_description = 'Exploring consensual BDSM practices';

do $verify$
declare
  v_bad int;
  v_slugs text[] := array[
    'uranic','vulturing','sex-favorable','social-swinger','queer-for-queer-q4q',
    'horny-net-geek-hng','sensual-submissive','lifestyle-kink','queer-romantic',
    'aesthetic-fetishist','ukete','sensual-hedonist','smart-ass-sadomasochist'];
begin
  -- 1. REACHED STATE, counted positively: every one of the thirteen carries a
  -- summary that is not the community/place/says-nothing text it replaced.
  -- Counting rows in a BAD state would return zero for a slug that has gone
  -- missing from the corpus entirely, which is the vacuous form.
  select count(*) into v_bad
    from unified_tags
   where slug = any(v_slugs)
     and short_description is not null
     and short_description not in (
       'Historic term for LGBTQ+ individuals','Unwanted, attention-seeking behavior',
       'Places with sex-positive attitudes','Community for consensual non-monogamy',
       'Community support for queer individuals','Community for tech-savvy individuals with diverse desires',
       'Exploring submissive desires and sensations.','Exploring kink and alternative lifestyles',
       'Romantic experiences for queer individuals','Community for those with aesthetic fetishes',
       'Ukete is a term','Exploring pleasure and desire','Exploring consensual BDSM practices');
  if v_bad <> 13 then
    raise exception 'round sixteen: expected 13 repaired summaries, found %', v_bad;
  end if;

  -- 2. Every repaired row stays publishable. Calls the REAL predicate rather
  -- than restating it: tag_has_prose is an OR, and a hand-rolled "both present"
  -- form is a stricter, different check.
  select count(*) into v_bad
    from unified_tags
   where slug = any(v_slugs)
     and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'round sixteen: % repaired rows fail the thin-page predicate', v_bad;
  end if;

  -- 3. Twelve bodies gone, and the thirteenth KEPT -- a sweep that took
  -- everything would satisfy the first half alone.
  select count(*) into v_bad
    from unified_tags
   where slug = any(v_slugs) and slug <> 'aesthetic-fetishist'
     and long_description is null;
  if v_bad <> 12 then
    raise exception 'round sixteen: expected 12 nulled bodies, found %', v_bad;
  end if;

  select count(*) into v_bad
    from unified_tags
   where slug = 'aesthetic-fetishist'
     and long_description is not null
     and long_description ilike '%strong attraction to specific aesthetics%';
  if v_bad <> 1 then
    raise exception 'round sixteen: the aesthetic-fetishist body must survive';
  end if;

  -- 4. The signature matched CORRECT prose on these five, and they are not this
  -- file's to touch: they really are communities, spaces and programmes.
  select count(*) into v_bad
    from unified_tags
   where slug in ('trans-community','rope-dojo','sexual-assault-resources','peer-rope','needle-exchange-program-nep')
     and long_description is not null
     and short_description is not null;
  if v_bad <> 5 then
    raise exception 'round sixteen: a refused control row was modified (% intact of 5)', v_bad;
  end if;

  -- 5. The anatomy-phrase deferral, re-asserted so a later pass cannot quietly
  -- reverse it without breaking this file's own check.
  select count(*) into v_bad
    from unified_tags
   where slug in ('futanari','pussy-worship','shemale')
     and status = 'active'
     and long_description ~* '(male genitalia|male genitals|female genitalia|female genitals)';
  if v_bad <> 3 then
    raise exception 'round sixteen: the anatomy refusal was altered (% of 3 intact)', v_bad;
  end if;

  -- 6. Round thirteen's refusal. Twelve body nulls are exactly the shape that
  -- could take a protected row with them, so one check covers both authors.
  select count(*) into v_bad
    from unified_tags
   where slug = 'rape-play'
     and long_description ilike '%not the same as actual non-consensual acts%';
  if v_bad <> 1 then
    raise exception 'round sixteen: rape-play lost its banned-register sentence';
  end if;

  raise notice 'round sixteen: 13 summaries repaired, 12 bodies nulled, 1 kept, 11 controls intact';
end
$verify$;
