-- Drop cities.mayor (and its geo-spine mirror).
--
-- Follows 99991791528658_drop_city_founded_year, which this migration builds on:
-- it patches the trivia band that one left at three fields of 1/3 each.
--
-- The column was a by-product of the Wikidata P6 ("head of government") read in
-- city-factual-backfill, weighted 1/3 of the 0.03 trivia band in the
-- completeness score and rendered as a "Mayor" row on the city About card. It
-- was also the field with the worst record of wrong-entity harm: Buenos Aires
-- published a Cordoba town's mayor, Frisco TX served San Francisco's, and a
-- Kent village served St Petersburg's governor. Measured 2026-10-08: 1,106 live
-- cities carried a value.
--
-- Function bodies are PATCHED from pg_get_functiondef() with exactly-once
-- anchors rather than restated, because the live body is not guaranteed to
-- match the newest migration file that defines it.
--
-- field_provenance->'mayor' keys are deliberately kept: inert jsonb, and the
-- only record of what Wikidata said.
--
-- suggest_milestone_category() also contains the word "mayor" — inside a
-- keyword regex for milestone text, not a column reference — and is untouched.

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
  v_pairs text[][] := array[
    array['official_website, mayor, postal_codes', 'official_website, postal_codes'],
    array['new.official_website, new.mayor, new.postal_codes', 'new.official_website, new.postal_codes'],
    array['official_website = excluded.official_website, mayor = excluded.mayor,', 'official_website = excluded.official_website,']
  ];
  i int;
begin
  -- 1. compute_city_completeness: trivia band now spans two fields.
  v_def := pg_get_functiondef('public.compute_city_completeness(uuid)'::regprocedure);
  v_old := E'  v_trivia := (case when c.mayor is not null then 1.0/3 else 0 end)\n'
        || E'            + (case when c.sister_cities is not null and array_length(c.sister_cities, 1) > 0 then 1.0/3 else 0 end)\n'
        || E'            + (case when c.postal_codes is not null and array_length(c.postal_codes, 1) > 0 then 1.0/3 else 0 end);';
  v_new := E'  v_trivia := (case when c.sister_cities is not null and array_length(c.sister_cities, 1) > 0 then 0.5 else 0 end)\n'
        || E'            + (case when c.postal_codes is not null and array_length(c.postal_codes, 1) > 0 then 0.5 else 0 end);';
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'compute_city_completeness: trivia anchor not found exactly once';
  end if;
  execute replace(v_def, v_old, v_new);

  -- 2. sync_geo_spine_city: stop mirroring the column.
  v_def := pg_get_functiondef('public.sync_geo_spine_city()'::regprocedure);
  for i in 1 .. array_length(v_pairs, 1) loop
    v_old := v_pairs[i][1];
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'sync_geo_spine_city: anchor % not found exactly once', v_old;
    end if;
    v_def := replace(v_def, v_old, v_pairs[i][2]);
  end loop;
  execute v_def;
end
$patch$;

alter table public.geo_city_profiles drop column mayor;
alter table public.cities drop column mayor;

do $verify$
declare
  v_id uuid;
  v_score smallint;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and column_name = 'mayor'
               and table_name in ('cities', 'geo_city_profiles')) then
    raise exception 'mayor column still present';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname <> 'suggest_milestone_category'
               and p.prosrc ~* '\mmayor\M') then
    raise exception 'a public function still references mayor';
  end if;
  -- plpgsql only plans at call time: prove both functions still run.
  select id into v_id from public.cities where duplicate_of_id is null limit 1;
  if v_id is not null then
    v_score := public.compute_city_completeness(v_id);
    if v_score is null then
      raise exception 'compute_city_completeness returned null';
    end if;
    update public.cities set name = name where id = v_id; -- fires trg_sync_geo_spine
  end if;
end
$verify$;
