-- Sexual practices filed as Fetishes. `anal-sex` was one of them.
--
-- THE DISTINCTION, STATED ONCE
--
-- A FETISH is an attraction — to an object, a material, a body part, a
-- scenario. Leather, feet, uniforms, gear. A PRACTICE is something people do.
-- Anal sex, oral sex, masturbation, a threesome. The two are different kinds of
-- thing, and the taxonomy already has a stop for each: `fetishes-interests`
-- ("Fetishes", 828 primary tags) and `practices-play` ("Practices & Play", 254).
--
-- 20 tags naming a plain sexual act sat under Fetishes. That is not a filing
-- nicety — /tags/anal-sex told a reader that anal sex is a fetish, and the
-- search facet said the same. For a glossary aimed at queer readers, filing the
-- most common sexual practices as fetishes is the sort of framing the site
-- exists to correct.
--
-- WHY THIS WAS MISSED THE FIRST TIME, WHICH IS THE USEFUL PART
--
-- The drgay coverage audit found this. `anal-sex` and `rimming` are named
-- explicitly in its defect class 4 as "Fetishes & Interests rather than
-- Practices & Play". Then that list was narrowed from ~16 to 6 after an
-- aggregation error was found in it, and these went out with the correction —
-- filed as "debatable" and skipped, without the debate ever being had. Removing
-- a wrong claim is not the same as removing a claim that happens to sit beside
-- it. The narrowing should have been per-row, not wholesale.
--
-- IS_ADULT CANNOT CHANGE, WHICH IS WHY THIS IS SAFE
--
-- `unified_tags_recompute_is_adult()` derives the flag from the junction's
-- PARENT line, and both `fetishes-interests` and `practices-play` hang off
-- `sex-kink`. Every row here keeps is_adult exactly as it is, so no page gains
-- or loses its adult gate and nothing is re-indexed or de-indexed as a side
-- effect. That is the difference between this move and the `sauna` one the same
-- audit deliberately did NOT make: that one would have flipped is_adult to
-- false on a live venue term. The verify block asserts the flag is unchanged
-- rather than assuming it.
--
-- WHAT IS DELIBERATELY LEFT IN FETISHES
--
--   breeding   — an impregnation FANTASY, not the act of coming inside someone.
--   creampie   — a porn-genre framing of the same, named for the depiction.
--   outdoor-sex — a location preference shading into exhibitionism; the act is
--                 ordinary sex, the interest is the setting. Genuinely either.
--
-- Those three are framings and attractions, which is exactly what Fetishes is
-- for. `felching` and `snowballing` DO move: niche and kink-adjacent, but each
-- names a thing done rather than a thing desired, and the test has to be the
-- definition or it is just squeamishness.
--
-- MECHANISM: write `unified_tags.category_id`. The BEFORE trigger derives the
-- denormalised `category` TEXT and the AFTER trigger syncs the junction to one
-- is_primary row. Writing the junction instead moves the page but leaves the
-- text — and the search facet — stale; measured in 20261007163200.

set local statement_timeout = '300s';

select set_config('app.actor', 'migration:practices_are_not_fetishes', true);

do $mig$
declare
  s        text;
  v_tag    uuid;
  v_cat    uuid;
  v_moved  int := 0;
  v_absent int := 0;
begin
  select id into v_cat from public.tag_categories where slug = 'practices-play';
  if v_cat is null then
    raise exception 'practices-play category not found; taxonomy changed';
  end if;

  foreach s in array array[
    -- penetrative / oral acts
    'anal-sex', 'oral-sex', 'oral', 'blowjob', 'rimming', 'deepthroat',
    'handjob', 'felching', 'snowballing', 'tribbing',
    -- solo and mutual
    'masturbation', 'masturbating', 'mutual-masturbation',
    -- configurations and positions
    'threesome', 'orgy', 'group-sex', '69', 'doggy-style',
    -- other plain acts
    'making-out', 'sexting'
  ] loop
    select id into v_tag from public.unified_tags
     where slug = s and status = 'active' and merged_into_id is null;
    if v_tag is null then
      raise notice 'skip: % not an active tag', s;
      v_absent := v_absent + 1;
      continue;
    end if;

    update public.unified_tags
       set category_id = v_cat,
           updated_at  = now()
     where id = v_tag
       and category_id is distinct from v_cat;

    if found then
      v_moved := v_moved + 1;
      raise notice 're-filed % -> practices-play', s;
    end if;
  end loop;

  raise notice 'practices: % moved, % absent', v_moved, v_absent;
end $mig$;

do $verify$
declare
  v_bad text;
  v_n   int;
begin
  -- Every named tag that EXISTS is now under Practices & Play, and its
  -- denormalised text followed. Absent slugs are skipped above, so this checks
  -- only rows that are really there.
  select string_agg(u.slug || '=' || coalesce(c.name, 'NULL') ||
                    ' text=' || coalesce(u.category, 'NULL'), ', ')
    into v_bad
  from public.unified_tags u
  left join public.tag_categories c on c.id = u.category_id
  where u.slug = any (array[
          'anal-sex','oral-sex','oral','blowjob','rimming','deepthroat',
          'handjob','felching','snowballing','tribbing','masturbation',
          'masturbating','mutual-masturbation','threesome','orgy','group-sex',
          '69','doggy-style','making-out','sexting'])
    and u.status = 'active' and u.merged_into_id is null
    and (c.slug is distinct from 'practices-play' or u.category is distinct from c.name);
  if v_bad is not null then
    raise exception 'practices: not filed under Practices & Play: %', v_bad;
  end if;

  -- Exactly one primary each — the AFTER trigger should leave no duplicate.
  select string_agg(slug, ', ') into v_bad from (
    select u.slug from public.unified_tags u
      join public.tag_category_assignments a on a.tag_id = u.id
     where u.slug = any (array[
             'anal-sex','oral-sex','oral','blowjob','rimming','deepthroat',
             'handjob','felching','snowballing','tribbing','masturbation',
             'masturbating','mutual-masturbation','threesome','orgy','group-sex',
             '69','doggy-style','making-out','sexting'])
       and a.is_primary
     group by u.slug having count(*) <> 1
  ) d;
  if v_bad is not null then
    raise exception 'practices: not exactly one primary for: %', v_bad;
  end if;

  -- The three framings stay in Fetishes. Asserted so a later sweep that drags
  -- them across has to argue with a named expectation rather than drift.
  select string_agg(u.slug, ', ') into v_bad
  from public.unified_tags u
  join public.tag_category_assignments a on a.tag_id = u.id and a.is_primary
  join public.tag_categories c on c.id = a.category_id
  where u.slug in ('breeding','creampie','outdoor-sex')
    and u.status = 'active' and u.merged_into_id is null
    and c.slug <> 'fetishes-interests';
  if v_bad is not null then
    raise exception 'practices: a deliberately-kept fetish framing moved: %', v_bad;
  end if;

  -- is_adult unchanged. Both stops hang off sex-kink, so any change here means
  -- the parent line moved under this migration and a moderation gate shifted
  -- without review — the failure mode 20261006090100 exists to prevent.
  select count(*) into v_n
  from public.unified_tags u
  where u.slug = any (array[
          'anal-sex','oral-sex','oral','blowjob','rimming','deepthroat',
          'handjob','felching','snowballing','tribbing','masturbation',
          'masturbating','mutual-masturbation','threesome','orgy','group-sex',
          '69','doggy-style','making-out','sexting'])
    and u.status = 'active' and u.merged_into_id is null
    and not u.is_adult;
  if v_n > 0 then
    raise exception 'practices: % row(s) lost is_adult — the parent line moved', v_n;
  end if;
end $verify$;
