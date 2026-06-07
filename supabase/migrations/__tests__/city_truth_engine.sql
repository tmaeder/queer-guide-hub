-- Contract tests for the City Truth Engine.
-- Run via: psql "$DATABASE_URL" -f city_truth_engine.sql
-- Self-contained: inserts synthetic rows, asserts, then ROLLS BACK. Also runs a
-- few read-only contract checks against live data.

begin;

do $$
declare
  v_country uuid;
  rich_id   uuid := gen_random_uuid();
  empty_id  uuid := gen_random_uuid();
  s_rich    smallint;
  s_empty   smallint;
begin
  select id into v_country from public.countries limit 1;

  -- A richly-populated city should score high; an empty one near zero.
  insert into public.cities (id, name, slug, country_id, description, lgbt_friendly_rating,
      latitude, longitude, timezone, image_url, population, region_name,
      best_time_to_visit, climate_type, major_airport_code, local_customs)
  values (rich_id, 'Testopia', 'testopia-'||substr(rich_id::text,1,8), v_country,
      repeat('A queer-friendly city with a vibrant gay district and rich history. ', 5),
      5, 52.5, 13.4, 'Europe/Berlin', 'https://x/img.jpg', 1000000, 'Test Region',
      'Spring', 'Temperate', 'TST', 'Welcoming LGBTQ+ pride and safe spaces.');
  insert into public.queer_villages (id, city_id, name, slug)
    values (gen_random_uuid(), rich_id, 'Test Village', 'tv-'||substr(rich_id::text,1,8));

  insert into public.cities (id, name, slug, country_id)
  values (empty_id, 'Emptyville', 'emptyville-'||substr(empty_id::text,1,8), v_country);

  s_rich  := public.compute_city_completeness(rich_id);
  s_empty := public.compute_city_completeness(empty_id);

  if s_rich is null or s_rich < 80 then
    raise exception 'FAIL: rich city completeness too low (got %)', s_rich; end if;
  if s_empty > 15 then
    raise exception 'FAIL: empty city completeness too high (got %)', s_empty; end if;
  if s_rich <= s_empty then
    raise exception 'FAIL: rich (%) should exceed empty (%)', s_rich, s_empty; end if;
  if s_rich > 100 or s_empty < 0 then
    raise exception 'FAIL: completeness out of 0..100 range'; end if;

  raise notice 'OK: completeness rich=% empty=%', s_rich, s_empty;
end $$;

-- Read-only contract checks against live data.
do $$
declare bad int;
begin
  select count(*) into bad from public.cities
    where shell_status = 'placeholder' and trust_score > 5;
  if bad > 0 then raise exception 'FAIL: % placeholder cities exceed trust cap 5', bad; end if;

  select count(*) into bad from public.cities
    where shell_status = 'ghost' and trust_score > 15;
  if bad > 0 then raise exception 'FAIL: % ghost cities exceed trust cap 15', bad; end if;

  select count(*) into bad from public.cities
    where trust_score not between 0 and 100 or completeness_score not between 0 and 100;
  if bad > 0 then raise exception 'FAIL: % cities have scores out of range', bad; end if;

  -- Every non-duplicate city should have a coverage-gap row after a radar pass.
  select count(*) into bad from public.cities c
    where c.duplicate_of_id is null
      and not exists (select 1 from public.city_coverage_gaps g where g.city_id = c.id);
  if bad > 0 then raise exception 'FAIL: % non-dup cities missing a coverage_gap row', bad; end if;

  raise notice 'OK: live contract checks passed';
end $$;

-- Recompute must be idempotent (zero changes on an immediate re-run).
do $$
declare r jsonb;
begin
  r := public.run_city_trust_recompute(false);  -- paused unless enabled; force a real run below if enabled
  r := public.run_city_trust_recompute(true);
  -- A second forced run right after must rescore 0 (IS DISTINCT FROM guard).
  r := public.run_city_trust_recompute(true);
  if (r->>'rescored')::int <> 0 then
    raise exception 'FAIL: trust recompute not idempotent, rescored=%', r->>'rescored'; end if;
  raise notice 'OK: trust recompute idempotent';
end $$;

rollback;
