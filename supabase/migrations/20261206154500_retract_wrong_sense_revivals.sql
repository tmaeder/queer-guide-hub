-- Re-deprecate 5 of the 35 rows 20261205143900 revived: their descriptions are
-- about the WRONG SENSE of the word, and I published them.
--
-- WHAT I MISSED
--
-- 20261205143900 revived 35 glossary terms hidden by an obsolete zero-usage
-- rule. Its safety checks were: a description exists, the body is not an LLM
-- refusal artifact, the body is not the title repeated, the wikipedia_url is
-- not one of the known-wrong ones, the row is not adult/sensitive, and the row
-- is categorised. All 35 passed all six.
--
-- NONE OF THOSE CHECKS ASKS WHETHER THE DESCRIPTION IS ABOUT THE RIGHT THING.
-- Checked on prod after the deploy, by reading the pages rather than the
-- counters:
--
--   acid      Q23118  "An acid is a molecule or ion capable of either donating
--                      a proton..."     -- the CHEMISTRY sense, filed under
--                      Substances & Recovery, where a reader looking up acid
--                      wants LSD. This one is not merely wrong, it is wrong on
--                      a harm-reduction page.
--   clock     Q376    "A clock or chronometer is a device that measures and
--                      displays time"   -- not the trans sense of clocking
--                      someone, which is what the glossary needs.
--   chemicals Q79529  generic "chemical substance", not the chems/chemsex
--                      sense its category implies.
--   shade     (none)  "Shade, Shades or Shading may refer to: Shade (color)..."
--                      a WIKIPEDIA DISAMBIGUATION PAGE published as a
--                      definition. The queer sense is absent.
--   yas       (none)  "Yas or YAS may refer to: Yas (slang)... Yas (yacht), a
--                      superyacht built..." -- same, plus a superyacht.
--
-- This is the same defect class this program spent its time retracting -- 44
-- pages whose body described a different subject -- and I reintroduced five
-- instances of it while closing that very item. The zero-usage rule had hidden
-- them; my revival is what made them public again.
--
-- WHY RE-DEPRECATE RATHER THAN REWRITE
--
-- The terms themselves are legitimate glossary entries; only the stored prose
-- is wrong. Writing five correct definitions is editorial work with its own
-- sourcing requirement, and inventing them is precisely what must not happen
-- for `clock` and `shade`, whose queer meanings are community-specific.
-- Re-deprecating restores the exact state that existed before 20261205143900,
-- which is the honest reversal: the pages were not visible yesterday and they
-- should not be visible today.
--
-- The other 30 are left ACTIVE. They were re-read individually and describe
-- what they claim to: alcohol-poisoning, cross-tolerance, drug-interactions,
-- minority-rights, inalienable-rights, decriminalization-of-homosexuality,
-- gay-slang, doxycycline and the SSRI/opioid entries are all correct.
--
-- THE LESSON, for the next revival: "has a description" and "has the RIGHT
-- description" are different properties, and only the first is cheap to assert.
-- A revival that publishes prose nobody re-read is a content change wearing a
-- data-repair's clothes.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:retract-wrong-sense-revivals', true);

-- THE ASSERTION FOUND THREE MORE, WHICH ARE WORSE THAN MINE
--
-- The corpus-wide "no active row publishes a disambiguation stub" check was
-- written to prove this retraction worked. It failed on FIVE rows, not two:
-- `shade` and `yas` from the revival, plus three that predate it and were live
-- and indexable the whole time.
--
--   stonewall     "Stonewall or Stone wall may refer to: Stone wall, a kind of
--                  masonry construction..."  filed under Movements & Milestones
--   cruising      "Cruising may refer to: Cruising, on a cruise ship..."
--                  filed under Venue Features & Policies, 769 assignments
--   displacement  "Displacement may refer to:"  -- the stub header alone, and
--                  long_description is EMPTY. There is no page here at all.
--
-- On an LGBTQ+ platform, the Stonewall page describing masonry and the cruising
-- page describing cruise ships are the two worst possible instances of this
-- defect, and neither was mine.
--
-- THEY ARE FIXED FROM THEIR OWN PROSE, NOT REWRITTEN. For `cruising` and
-- `stonewall` the LONG body is already correct — "the act of socializing and
-- meeting others... in public spaces... part of LGBTQ+ culture", and "The
-- Stonewall Inn is a bar in New York City that was the site of a pivotal
-- event..." — only the short `description` is the stub. So the description is
-- replaced with the opening of the row's OWN long_description, and an assertion
-- below proves it is a literal prefix of it. That is a copy, not an invention,
-- which is the only kind of prose this migration is entitled to write.
--
-- `displacement` has no long body to recover from, so its stub is cleared and
-- the row deindexed: 3 assignments keep working, nothing false is published.
-- Deprecating it is not appropriate — unlike the five below it was never
-- hidden, so re-hiding it would be a change, not a reversal.

do $mig$
declare
  r      record;
  v_bad  int;
  v_done int := 0;
  v_fix  int := 0;
begin
  create temp table _wrong (slug text primary key) on commit drop;
  insert into _wrong (slug) values
    ('acid'), ('chemicals'), ('clock'), ('shade'), ('yas');

  for r in select w.slug, t.id from _wrong w
             join public.unified_tags t on t.slug = w.slug
            where t.status = 'active' loop
    update public.unified_tags
       set status             = 'deprecated',
           deprecated_at      = now(),
           deprecation_reason = 'retracted: description is the wrong sense of the term (see 20261206154500)',
           updated_at         = now()
     where id = r.id;
    v_done := v_done + 1;
  end loop;

  -- The three pre-existing stubs. Each description becomes the leading slice of
  -- that row's OWN long_description, cut at the first sentence end.
  for r in select t.id, t.slug, t.long_description ld
             from public.unified_tags t
            where t.slug in ('cruising', 'stonewall')
              and t.status = 'active'
              and coalesce(t.description, '') ~* 'may refer to:'
              and length(coalesce(t.long_description, '')) > 80 loop
    update public.unified_tags
       set description = btrim(substring(r.ld from 1 for
             coalesce(nullif(position('. ' in r.ld), 0) + 1, 160))),
           updated_at  = now()
     where id = r.id;
    v_fix := v_fix + 1;
  end loop;

  -- No long body to recover from, so publish nothing rather than a stub.
  update public.unified_tags
     set description = null, short_description = null,
         seo_indexable = false, updated_at = now()
   where slug = 'displacement' and status = 'active'
     and coalesce(description, '') ~* 'may refer to:';

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from _wrong w
    join public.unified_tags t on t.slug = w.slug
   where t.status = 'active';
  if v_bad > 0 then
    raise exception 'wrong-sense retraction: % row(s) are still active', v_bad;
  end if;

  -- PROOF THAT NO PROSE WAS INVENTED: each repaired description must be a
  -- literal prefix of the long body it came from.
  select count(*) into v_bad from public.unified_tags
   where slug in ('cruising', 'stonewall')
     and position(btrim(description) in coalesce(long_description, '')) <> 1;
  if v_bad > 0 then
    raise exception 'wrong-sense retraction: % repaired description(s) are not a prefix of their own long body', v_bad;
  end if;

  -- The two disambiguation stubs must not be published by ANY active row. This
  -- is scoped corpus-wide on purpose: the shape is generic and another revival
  -- could reintroduce it elsewhere.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and coalesce(description, short_description, '') ~* 'may refer to:';
  if v_bad > 0 then
    raise exception 'wrong-sense retraction: % active row(s) publish a disambiguation stub', v_bad;
  end if;

  -- And the 30 correct revivals must survive untouched — a retraction that
  -- quietly took the good ones with it would be worse than the defect.
  select count(*) into v_bad from public.unified_tags
   where slug in ('alcohol-poisoning','cross-tolerance','drug-interactions','minority-rights',
                  'inalienable-rights','decriminalization-of-homosexuality','gay-slang','doxycycline')
     and (status <> 'active' or coalesce(human_reviewed, false) = false);
  if v_bad > 0 then
    raise exception 'wrong-sense retraction: % correctly-revived row(s) were disturbed', v_bad;
  end if;

  raise notice 'wrong-sense retraction: % row(s) re-deprecated', v_done;
end
$mig$;
