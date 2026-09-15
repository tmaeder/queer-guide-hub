-- The tag title-caser has no concept of a function word, so the glossary
-- publishes "Convention On The Rights Of Persons With Disabilities".
--
-- WHAT IS WRONG
--
-- `normalize_tag_name()` runs a three-rung ladder over each letter run: an
-- explicit acronym wins, then an all-uppercase run is left alone, then
-- everything else is capitalised. Nothing in it knows that "and", "of" and
-- "with" stay lowercase inside a title, so every one of them is capitalised.
--
-- Measured on prod: 557 rows carry a title-cased function word, 116 of them
-- active and 72 active AND indexable. The worst are proper names on a rights
-- platform -- "Convention On The Rights Of Persons With Disabilities", "UN High
-- Commissioner For Human Rights", "Convention On The Elimination Of All Forms
-- Of Discrimination Against Women" -- plus "Men Who Have Sex With Men" at 83
-- assignments, which is the standard public-health term spelled wrong.
--
-- The function does not merely fail to fix these; it CREATES them. Measured:
-- normalize_tag_name('Men Who Have Sex with Men') returns '... With Men', so a
-- human who types the correct form has it degraded by the trigger on save.
-- That is why this is a producer fix and not only a data repair: without it,
-- repairing the rows would be undone by the next edit to any of them.
--
-- WHY IT BLOCKS MORE THAN COSMETICS
--
-- `50900101100000` recorded the hiv-aids rename as abandoned partly because
-- setting the name to the UNAIDS form "HIV and AIDS" stored "HIV And AIDS" --
-- the rename could not achieve its own purpose. This removes that half of the
-- blocker. The other half (a rename re-derives the slug) is deliberately NOT
-- touched here; see the note at the end.
--
-- THE FOURTH RUNG, AND WHY IT SITS WHERE IT DOES
--
-- The rung order is load-bearing and the new rule goes THIRD, after the
-- all-uppercase rule and before ordinary title case:
--
--   1. an explicit acronym          HIV, PrEP, SSRIs        (unchanged)
--   2. an all-uppercase run          LSD, MDMA, OR           (unchanged)
--   3. an INTERIOR function word     and, of, with           (new)
--   4. ordinary title case           Freedom, Speech         (unchanged)
--
-- Rung 2 must stay above rung 3 or a deliberate all-caps "OR" (Oregon) or "IN"
-- (Indiana) would be lowercased into a conjunction. Two such rows exist.
--
-- FIRST AND LAST WORD ARE NEVER LOWERCASED, which is ordinary title-case
-- practice and is also what protects real rows in this corpus:
--
--   Hepatitis A     -- "A" is the last run and is the vitamin-letter, not an article
--   Strap On        -- phrasal-verb particles carry the meaning
--   Crushing On     -- same
--   Sidle Up        -- same
--   Dine-In         -- a hyphen separates runs, so "In" is the last run here
--   In Service To   -- "In" is first and "To" is last; both protected
--   A               -- a one-run name is both first and last
--
-- "In A Hive With" is the case that shows all three rules at once: "In" is
-- first, "With" is last, and only the interior "A" moves -> "In a Hive With".
--
-- Knowing which run is LAST needs the run count before emission, so the count
-- is taken in a pre-pass that repeats the emit loop's boundary condition
-- verbatim rather than approximating it with a regex. The per-run ladder moved
-- into `tag_name_cap_run()` because the old body carried it TWICE -- once in
-- the loop and once in the trailing flush -- and the trailing flush is exactly
-- where the last run usually lands, so a rule added to one copy and not the
-- other would fail on precisely the run the protection exists for.
--
-- THE REPAIR
--
-- Rows are re-normalised through the fixed function rather than by a list, so
-- the repair cannot drift from the producer.
--
-- Two exclusions, both measured rather than assumed:
--
--   * `status = 'merged'` rows are skipped. Three of them carry legacy slugs
--     with punctuation the current normaliser strips -- clit-and-pussy-torture-(cpt),
--     dining-at-the-y-(daty), princess-by-day,-slut-by-night -- so touching
--     their name would move a redirect trail. A merged row renders nothing
--     (0 of 288 merged tags are in search_documents), so there is no reader to
--     gain anything.
--
--   * Every row is additionally required to keep its slug. A case-only change
--     cannot move a slug, because `normalize_tag_slug` lowercases -- measured
--     across all 546 affected rows, 0 would move -- but this is asserted per
--     row rather than trusted, because `normalize_tag_input()` re-derives the
--     slug from the name on ANY name change, so a row whose stored slug already
--     disagrees with its name would be silently re-slugged by this UPDATE.
--
-- 66 of the affected rows are `human_reviewed`, and `log_unified_tag_change()`
-- RAISEs when an undeclared `system:%` actor modifies one, so the actor
-- declaration below is load-bearing, not attribution.
--
-- NOT DONE HERE, deliberately: `normalize_tag_input()` re-derives the slug
-- whenever the name changes, so a rename that alters letters still moves the
-- page's URL. That is a separate decision about default behaviour (should a
-- display-name edit move a canonical URL?) with its own blast radius across
-- every caller that renames a tag, and it is not required by anything in this
-- file -- every change here is case-only and provably slug-stable. Note for
-- whoever takes it: the writer is `normalize_tag_input()`, NOT
-- `unified_tags_normalize_slug()`, which runs later and merely re-reads the
-- slug that the former already overwrote.

begin;

select set_config('app.actor', 'migration:83000101143000_tag_name_function_words', true);

-- The per-run ladder, extracted so it has exactly one definition.
create or replace function public.tag_name_cap_run(p_run text, p_ordinal int, p_total int)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
declare
  acronyms text[] := ARRAY['LGBT','LGBTQ','LGBTQI','LGBTQIA','LGBTQIAP','LGBTI',
    'BIPOC','POC','BDSM','HIV','AIDS','STI','STD','NSFW','SFW',
    'FTM','MTF','AFAB','AMAB','NB','TERF','PrEP','PEP','DJ','VJ','MC',
    -- Chemical and pharmacological acronyms. Mixed-case ones only need to be
    -- here; all-uppercase runs (LSD, MDMA, DMT, GHB, PCP, MXE, AMT) are already
    -- preserved by the run = upper(run) branch below.
    'NBOMe','NBOMes','NBOH','MeO','xxT','MAOI','MAOIs','SSRI','SSRIs',
    'SNRI','SNRIs','THC','CBD','DXM'];
  -- Lowercase inside a title. Deliberately short: articles, coordinating
  -- conjunctions and the one- and two-syllable prepositions. Anything longer
  -- ("Between", "Through", "Against") stays capitalised, which is the
  -- conservative side of a style question.
  function_words text[] := ARRAY['a','an','and','as','at','but','by','for','from',
    'in','into','nor','of','on','onto','or','per','the','to','up','via','vs','with','yet'];
  upper_run text := upper(p_run);
  acro text;
begin
  if p_run is null or p_run = '' then return p_run; end if;

  -- 1. an explicit acronym keeps its own casing
  foreach acro in array acronyms loop
    if upper(acro) = upper_run then return acro; end if;
  end loop;

  -- 2. an all-uppercase run is the author's decision (LSD, and OR for Oregon)
  if length(p_run) >= 2 and p_run = upper_run then return p_run; end if;

  -- 3. an interior function word is lowercase; first and last never are
  if p_ordinal > 1 and p_ordinal < p_total and lower(p_run) = any(function_words) then
    return lower(p_run);
  end if;

  -- 4. ordinary title case
  return upper(substring(p_run from 1 for 1)) || lower(substring(p_run from 2));
end $fn$;

create or replace function public.normalize_tag_name(input text)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  collapsed text;
  result text := '';
  run text := '';
  i int;
  len int;
  ch text;
  next_ch text;
  prev_ch text;
  is_letter boolean;
  is_apos_in_word boolean;
  total_runs int := 0;
  run_ordinal int := 0;
  in_run boolean := false;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  collapsed := regexp_replace(btrim(input), '\s+', ' ', 'g');
  IF collapsed = '' THEN RETURN ''; END IF;
  len := length(collapsed);

  -- Pre-pass: count runs using the IDENTICAL boundary rule the emit loop uses,
  -- so "is this the last run" is exact rather than inferred from a regex.
  FOR i IN 1..len LOOP
    ch := substring(collapsed FROM i FOR 1);
    next_ch := CASE WHEN i < len THEN substring(collapsed FROM i+1 FOR 1) ELSE '' END;
    prev_ch := CASE WHEN i > 1 THEN substring(collapsed FROM i-1 FOR 1) ELSE '' END;
    is_letter := ch ~ '[[:alpha:]]';
    is_apos_in_word := ch IN ('''','’','‘')
      AND prev_ch ~ '[[:alpha:]]'
      AND next_ch ~ '[[:alpha:]]';
    IF is_letter OR is_apos_in_word THEN
      IF NOT in_run THEN total_runs := total_runs + 1; in_run := true; END IF;
    ELSE
      in_run := false;
    END IF;
  END LOOP;

  FOR i IN 1..len LOOP
    ch := substring(collapsed FROM i FOR 1);
    next_ch := CASE WHEN i < len THEN substring(collapsed FROM i+1 FOR 1) ELSE '' END;
    prev_ch := CASE WHEN i > 1 THEN substring(collapsed FROM i-1 FOR 1) ELSE '' END;
    is_letter := ch ~ '[[:alpha:]]';
    is_apos_in_word := ch IN ('''','’','‘')
      AND prev_ch ~ '[[:alpha:]]'
      AND next_ch ~ '[[:alpha:]]';

    IF is_letter OR is_apos_in_word THEN
      run := run || ch;
    ELSE
      IF run <> '' THEN
        run_ordinal := run_ordinal + 1;
        result := result || public.tag_name_cap_run(run, run_ordinal, total_runs);
        run := '';
      END IF;
      result := result || ch;
    END IF;
  END LOOP;

  IF run <> '' THEN
    run_ordinal := run_ordinal + 1;
    result := result || public.tag_name_cap_run(run, run_ordinal, total_runs);
  END IF;

  RETURN result;
END $function$;

-- Snapshot every slug, so the postcondition can assert what this file actually
-- promises -- that IT moved no page -- rather than the proxy "name agrees with
-- slug", which is already false on 130 non-merged rows for unrelated reasons
-- (hand-set slugs, punctuation the normaliser strips) and would abort db push
-- on main for a condition this file neither created nor can fix.
create temp table _slug_before on commit drop as
  select id, slug from public.unified_tags;

-- Repair: re-normalise through the fixed function, never from a frozen list.
update public.unified_tags u
set name = public.normalize_tag_name(u.name)
where u.status <> 'merged'
  and public.normalize_tag_name(u.name) is distinct from u.name
  and public.normalize_tag_slug(public.normalize_tag_name(u.name)) = u.slug;

do $verify$
declare
  v_remaining int;
  v_bad_slug int;
  v_name text;
begin
  -- The producer: the cases this file exists for, and the ones it must not break.
  if public.normalize_tag_name('HIV and AIDS') <> 'HIV and AIDS' then
    raise exception 'function: HIV and AIDS -> %', public.normalize_tag_name('HIV and AIDS');
  end if;
  if public.normalize_tag_name('Men Who Have Sex with Men') <> 'Men Who Have Sex with Men' then
    raise exception 'function: MSM -> %', public.normalize_tag_name('Men Who Have Sex with Men');
  end if;
  if public.normalize_tag_name('freedom of speech') <> 'Freedom of Speech' then
    raise exception 'function: freedom of speech -> %', public.normalize_tag_name('freedom of speech');
  end if;
  -- first and last run are never lowercased
  if public.normalize_tag_name('Hepatitis A') <> 'Hepatitis A' then
    raise exception 'function: Hepatitis A -> %', public.normalize_tag_name('Hepatitis A');
  end if;
  if public.normalize_tag_name('Strap On') <> 'Strap On' then
    raise exception 'function: Strap On -> %', public.normalize_tag_name('Strap On');
  end if;
  if public.normalize_tag_name('Dine-In') <> 'Dine-In' then
    raise exception 'function: Dine-In -> %', public.normalize_tag_name('Dine-In');
  end if;
  if public.normalize_tag_name('In A Hive With') <> 'In a Hive With' then
    raise exception 'function: In A Hive With -> %', public.normalize_tag_name('In A Hive With');
  end if;
  -- rungs 1 and 2 are unchanged
  if public.normalize_tag_name('prep') <> 'PrEP' then
    raise exception 'function: prep -> %', public.normalize_tag_name('prep');
  end if;
  if public.normalize_tag_name('ssris') <> 'SSRIs' then
    raise exception 'function: ssris -> %', public.normalize_tag_name('ssris');
  end if;
  if public.normalize_tag_name('Trans IN Sport') <> 'Trans IN Sport' then
    raise exception 'function: all-caps IN was lowercased -> %', public.normalize_tag_name('Trans IN Sport');
  end if;

  -- The corpus, counted positively on the REACHED state so that a row which
  -- has gone missing entirely cannot read as success -- and scoped to the rows
  -- this file UNDERTOOK to repair, because a row the slug guard deliberately
  -- declined is not a failure and must not abort the push.
  select count(*) into v_remaining
  from public.unified_tags
  where status <> 'merged'
    and public.normalize_tag_name(name) is distinct from name
    and public.normalize_tag_slug(public.normalize_tag_name(name)) = slug;
  if v_remaining <> 0 then
    raise exception 'unrepaired repairable rows remain: %', v_remaining;
  end if;

  -- No page moved: compared against the pre-repair snapshot, not against a
  -- derived value.
  select count(*) into v_bad_slug
  from _slug_before b
  join public.unified_tags u using (id)
  where u.slug is distinct from b.slug;
  if v_bad_slug <> 0 then
    raise exception 'this migration moved % slug(s)', v_bad_slug;
  end if;

  -- Named survivors, read back from the rows rather than from the function.
  select name into v_name from public.unified_tags where slug = 'hepatitis-a';
  if v_name is not null and v_name <> 'Hepatitis A' then
    raise exception 'hepatitis-a name became %', v_name;
  end if;
  select name into v_name from public.unified_tags where slug = 'men-who-have-sex-with-men';
  if v_name is not null and v_name <> 'Men Who Have Sex with Men' then
    raise exception 'msm name is %', v_name;
  end if;
end $verify$;

commit;
