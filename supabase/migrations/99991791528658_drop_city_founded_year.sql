-- Drop cities.founded_year (and its geo-spine mirror).
--
-- The column was never a product decision: it was a by-product of the
-- Wikidata P571 ("inception") read in city-factual-backfill, weighted 0.75 of
-- 100 in the completeness score and rendered as a "Founded" row on the city
-- About card. The data was also partly wrong: BCE foundation dates sat in the
-- column as positive years (Athens 7000, Adana 6000, Aleppo 5000, Jerusalem
-- 4000, Izmir 3000), so the page published "Founded 7000". Measured
-- 2026-10-08: 2,324 of 7,790 live cities carried a value, 1,602 indexable.
--
-- Function bodies are PATCHED from pg_get_functiondef() with exactly-once
-- anchors rather than restated, because the live body is not guaranteed to
-- match the newest migration file that defines it.
--
-- field_provenance->'founded_year' keys are deliberately kept: inert jsonb,
-- and the only record of what Wikidata said.

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  -- 1. compute_city_completeness: trivia band now spans three fields.
  v_def := pg_get_functiondef('public.compute_city_completeness(uuid)'::regprocedure);
  v_old := E'  v_trivia := (case when c.mayor is not null then 0.25 else 0 end)\n'
        || E'            + (case when c.founded_year is not null then 0.25 else 0 end)\n'
        || E'            + (case when c.sister_cities is not null and array_length(c.sister_cities, 1) > 0 then 0.25 else 0 end)\n'
        || E'            + (case when c.postal_codes is not null and array_length(c.postal_codes, 1) > 0 then 0.25 else 0 end);';
  v_new := E'  v_trivia := (case when c.mayor is not null then 1.0/3 else 0 end)\n'
        || E'            + (case when c.sister_cities is not null and array_length(c.sister_cities, 1) > 0 then 1.0/3 else 0 end)\n'
        || E'            + (case when c.postal_codes is not null and array_length(c.postal_codes, 1) > 0 then 1.0/3 else 0 end);';
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'compute_city_completeness: trivia anchor not found exactly once';
  end if;
  execute replace(v_def, v_old, v_new);

  -- 2. sync_geo_spine_city: stop mirroring the column.
  v_def := pg_get_functiondef('public.sync_geo_spine_city()'::regprocedure);
  foreach v_old in array array[
    'climate_type, founded_year, area_km2',
    'new.climate_type, new.founded_year, new.area_km2',
    'climate_type = excluded.climate_type, founded_year = excluded.founded_year,'
  ] loop
    v_new := replace(replace(v_old, ' founded_year,', ''), ' new.founded_year,', '');
    v_new := replace(v_new, ' founded_year = excluded.founded_year,', '');
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'sync_geo_spine_city: anchor % not found exactly once', v_old;
    end if;
    v_def := replace(v_def, v_old, v_new);
  end loop;
  execute v_def;
end
$patch$;

alter table public.geo_city_profiles drop column founded_year;
alter table public.cities drop column founded_year;

do $verify$
declare
  v_id uuid;
  v_score smallint;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and column_name = 'founded_year'
               and table_name in ('cities', 'geo_city_profiles')) then
    raise exception 'founded_year column still present';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prosrc ilike '%founded_year%') then
    raise exception 'a public function still references founded_year';
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
