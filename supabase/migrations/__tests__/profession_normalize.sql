-- Contract tests for normalize_profession v2 + the personalities write gate.
-- Run via: psql "$DATABASE_URL" -f profession_normalize.sql
-- Read-only against live data plus one synthetic personality, then ROLLS BACK.

begin;

-- ---------------------------------------------------------------------------
-- 1. IDEMPOTENCY over every canonical.
--
-- This is the single most important assertion in the file. The write gate calls
-- normalize_profession on EVERY insert and update, so a canonical that does not
-- survive its own normalizer is destroyed a little more on each write — the exact
-- failure 20260810120000 had to retrofit for normalize_event_accessibility, which
-- had already eaten 11 of 18 stored slugs by the time it was caught.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select name from public.professions where is_active loop
    if public.normalize_profession(r.name) is distinct from r.name then
      raise exception 'FAIL idempotency: % -> %', r.name, public.normalize_profession(r.name);
    end if;
    -- and stable under a second pass
    if public.normalize_profession(public.normalize_profession(r.name)) is distinct from r.name then
      raise exception 'FAIL idempotency (2nd pass): %', r.name;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tier 1 must run BEFORE the splitter, or aliases containing a separator are
--    shredded into their first token.
-- ---------------------------------------------------------------------------
do $$
begin
  if public.normalize_profession('hiv/aids activist') <> 'Activist' then
    raise exception 'FAIL: hiv/aids activist -> % (splitter beat tier 1)',
      public.normalize_profession('hiv/aids activist'); end if;
  if public.normalize_profession('r&b singer') <> 'Singer' then
    raise exception 'FAIL: r&b singer -> %', public.normalize_profession('r&b singer'); end if;
  if public.normalize_profession('stand-up comedian') <> 'Comedian' then
    raise exception 'FAIL: stand-up comedian -> %', public.normalize_profession('stand-up comedian'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. All three gender-inclusive conventions plus the bare feminine collapse onto
--    ONE canonical. Before this migration these were four separate facet values
--    for one profession (Schriftsteller/in 145 + Schriftsteller 32 +
--    Schriftstellerin 27 + Schriftsteller:in 7).
-- ---------------------------------------------------------------------------
do $$
declare v text[]; x text;
begin
  foreach x in array array['Schriftsteller','Schriftsteller/in','Schriftstellerin',
                           'Schriftsteller:in','Schriftsteller*in','Schriftsteller_in',
                           'Schriftsteller/-in','Schriftsteller*innen'] loop
    if public.normalize_profession(x) <> 'Writer' then
      raise exception 'FAIL gender fold: % -> %', x, public.normalize_profession(x); end if;
  end loop;

  foreach x in array array['Politiker','Politiker/in','Politikerin','Politiker:in'] loop
    if public.normalize_profession(x) <> 'Politician' then
      raise exception 'FAIL gender fold: % -> %', x, public.normalize_profession(x); end if;
  end loop;

  -- Umlauts, both stored and folded spellings of the input.
  foreach x in array array['Sänger','Sänger/in','Sängerin','Saenger','Sanger','Opernsänger/in'] loop
    if public.normalize_profession(x) <> 'Singer' then
      raise exception 'FAIL umlaut fold: % -> %', x, public.normalize_profession(x); end if;
  end loop;

  -- Paired masculine/feminine forms: the splitter takes the first, both resolve.
  if public.normalize_profession('Koch/Köchin') <> 'Chef' then
    raise exception 'FAIL: Koch/Köchin -> %', public.normalize_profession('Koch/Köchin'); end if;
  if public.normalize_profession('Arzt/Ärztin') <> 'Physician' then
    raise exception 'FAIL: Arzt/Ärztin -> %', public.normalize_profession('Arzt/Ärztin'); end if;
  -- ß must fold to ss, not to a single s (translate() would get this wrong).
  if public.normalize_profession('Fußballspieler/in') <> 'Athlete' then
    raise exception 'FAIL: Fußballspieler/in -> %', public.normalize_profession('Fußballspieler/in'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Case and spacing duplicates collapse (Drag queen 666 / Dragqueen 78 /
--    Drag Queen 5 were three facet chips for one profession).
-- ---------------------------------------------------------------------------
do $$
declare x text;
begin
  foreach x in array array['Drag queen','Drag Queen','DRAG QUEEN','Dragqueen','drag queen'] loop
    if public.normalize_profession(x) <> 'Drag queen' then
      raise exception 'FAIL case fold: % -> %', x, public.normalize_profession(x); end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Parenthetical annotations are stripped before matching; a value that is ONLY
--    a parenthetical falls back to the raw text rather than to the empty string.
-- ---------------------------------------------------------------------------
do $$
begin
  if public.normalize_profession('Aktivist/in (Mexiko)') <> 'Activist' then
    raise exception 'FAIL paren: %', public.normalize_profession('Aktivist/in (Mexiko)'); end if;
  if public.normalize_profession('Bischof (Episkopalkirche)') <> 'Religious leader' then
    raise exception 'FAIL paren: %', public.normalize_profession('Bischof (Episkopalkirche)'); end if;
  if public.normalize_profession('(Lady of Llangollen)') is null then
    raise exception 'FAIL: paren-only value must not normalize to NULL'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Separators. ';' and ' und ' were missing from v1 entirely; the corpus uses
--    both. The PRIMARY segment wins the column, the rest become role slugs.
-- ---------------------------------------------------------------------------
do $$
declare nf jsonb;
begin
  nf := public.normalize_profession_full('Journalist/in; Schriftsteller/in');
  if nf->>'profession' <> 'Journalist' then
    raise exception 'FAIL semicolon primary: %', nf->>'profession'; end if;
  if not (nf->'roles' ? 'writer') then
    raise exception 'FAIL semicolon secondary: %', nf->'roles'; end if;

  nf := public.normalize_profession_full('Sänger und Schauspieler');
  if nf->>'profession' <> 'Singer' or not (nf->'roles' ? 'actor') then
    raise exception 'FAIL " und ": % / %', nf->>'profession', nf->'roles'; end if;

  -- THE regression that motivated this work: v1 kept only the first atom and
  -- silently discarded the second profession on 1,236 rows.
  nf := public.normalize_profession_full('Dichter/Schriftsteller');
  if nf->>'profession' <> 'Poet' then
    raise exception 'FAIL: Dichter/Schriftsteller primary -> %', nf->>'profession'; end if;
  if not (nf->'roles' ? 'writer') then
    raise exception 'FAIL: Dichter/Schriftsteller lost the secondary profession'; end if;

  -- A gender marker must never survive splitting as its own segment. v1 produced
  -- the atoms `in (Magier` and `in)` from this exact value.
  nf := public.normalize_profession_full('Zauberkünstler/in (Magier/in)');
  if nf->>'profession' <> 'Entertainer' then
    raise exception 'FAIL marker-as-segment: %', nf->>'profession'; end if;
  if exists (select 1 from jsonb_array_elements_text(nf->'all') a where btrim(a) in ('in','in)','r')) then
    raise exception 'FAIL: gender marker leaked into the segment list: %', nf->'all'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Known non-professions reject to NULL; nobility titles deliberately do NOT
--    (they describe a real historical station — they go to the review queue).
-- ---------------------------------------------------------------------------
do $$
declare x text;
begin
  foreach x in array array['Kunst','Politik','Literatur','Musik','Tanz','Wissenschaft'] loop
    if public.normalize_profession(x) is not null then
      raise exception 'FAIL reject: % -> %', x, public.normalize_profession(x); end if;
  end loop;
  if public.normalize_profession('König von Preußen') is null then
    raise exception 'FAIL: nobility titles must not be rejected to NULL'; end if;
  if (public.normalize_profession_full('Kunst')->>'match') <> 'rejected' then
    raise exception 'FAIL: Kunst must report match=rejected'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Fallback casing. v1's initcap() turned 'DJ' into 'Dj' and 'HIV' into 'Hiv'.
-- ---------------------------------------------------------------------------
do $$
declare nf jsonb;
begin
  nf := public.normalize_profession_full('Krankenpfleger');
  if nf->>'profession' <> 'Krankenpfleger' then
    raise exception 'FAIL fallback casing: %', nf->>'profession'; end if;
  if nf->>'match' <> 'fallback' then
    raise exception 'FAIL: unmatched value must report match=fallback, got %', nf->>'match'; end if;
  if public.normalize_profession('MMA-Kämpfer/in') <> 'Athlete' then
    raise exception 'FAIL: MMA-Kämpfer/in -> %', public.normalize_profession('MMA-Kämpfer/in'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. The adult cohort must survive normalization unchanged — 6,967 rows and the
--    facet matview's exclusion both key on this exact string.
-- ---------------------------------------------------------------------------
do $$
begin
  if public.normalize_profession('Adult performer') <> 'Adult performer' then
    raise exception 'FAIL: Adult performer moved'; end if;
  if public.normalize_profession('porn star') <> 'Adult performer' then
    raise exception 'FAIL: porn star -> %', public.normalize_profession('porn star'); end if;
  -- Sex worker is a DIFFERENT concept and must not be swept into the adult cohort.
  if public.normalize_profession('Sexarbeiterin') <> 'Sex worker' then
    raise exception 'FAIL: Sexarbeiterin -> %', public.normalize_profession('Sexarbeiterin'); end if;
  if public.normalize_profession('Sexarbeiterin') ilike '%adult%'
     or public.normalize_profession('Sexarbeiterin') ilike '%porn%' then
    raise exception 'FAIL: sex-worker canonical collides with the adult ILIKE patterns'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. The write gate: normalizes on INSERT, rejects unknown role slugs, and is a
--     no-op on a second write of the same value.
-- ---------------------------------------------------------------------------
-- NB: lgbti_connection is CHECK-constrained to
-- community_member|ally|activist|representation|none_known|unclear — an arbitrary
-- fixture string fails with 23514 before the gate is ever exercised.
do $$
declare v_id uuid := gen_random_uuid(); v_prof text; v_roles text[]; v_adult boolean;
begin
  insert into public.personalities (id, name, slug, profession, roles, lgbti_connection)
  values (v_id, 'Test Person '||substr(v_id::text,1,8), 'test-person-'||substr(v_id::text,1,8),
          'Schauspieler/in; Sänger/in', array['not-a-real-slug','activist'], 'unclear');

  select profession, roles into v_prof, v_roles from public.personalities where id = v_id;
  if v_prof <> 'Actor' then raise exception 'FAIL gate insert: %', v_prof; end if;
  if 'not-a-real-slug' = any(v_roles) then
    raise exception 'FAIL gate: unknown role slug survived: %', v_roles; end if;
  if not ('singer' = any(v_roles)) then
    raise exception 'FAIL gate: derived secondary role missing: %', v_roles; end if;
  if not ('activist' = any(v_roles)) then
    raise exception 'FAIL gate: caller-supplied valid role was dropped: %', v_roles; end if;

  -- Second write must not move it.
  update public.personalities set profession = profession where id = v_id;
  select profession into v_prof from public.personalities where id = v_id;
  if v_prof <> 'Actor' then raise exception 'FAIL gate idempotency: %', v_prof; end if;

  -- Adult assertion from the RAW string on INSERT.
  insert into public.personalities (id, name, slug, profession, lgbti_connection)
  values (gen_random_uuid(), 'Test Adult '||substr(v_id::text,1,8),
          'test-adult-'||substr(v_id::text,1,8), 'Porn star', 'unclear')
  returning is_adult into v_adult;
  if not v_adult then raise exception 'FAIL gate: is_adult not asserted from raw profession'; end if;

  -- Blank normalizes to NULL, not to ''.
  update public.personalities set profession = '   ' where id = v_id;
  select profession into v_prof from public.personalities where id = v_id;
  if v_prof is not null then raise exception 'FAIL gate: blank profession -> %', quote_literal(v_prof); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Live-data contract checks (read-only).
-- ---------------------------------------------------------------------------
do $$
declare n bigint;
begin
  -- No stored value may disagree with its own normalizer once the backfill has run.
  select count(*) into n from public.personalities
   where profession is not null
     and enrichment_status->'profession'->>'version' = 'v2'
     and public.normalize_profession(profession) is distinct from profession;
  if n > 0 then raise exception 'FAIL: % normalized rows are not stable under re-normalization', n; end if;

  -- The facet matview must never surface the adult cohort.
  select count(*) into n from public.personality_profession_facets
   where profession ilike '%adult%' or profession ilike '%porn%';
  if n > 0 then raise exception 'FAIL: adult cohort leaked into the public facet list'; end if;
end $$;

rollback;
