-- cities_directory(): serve a precomputed snapshot instead of building 16k rows per call.
--
-- SYMPTOM. /cities intermittently renders "0 cities in the directory": the anonymous
-- RPC returns HTTP 500 `57014 canceling statement due to statement timeout`. anon's
-- statement_timeout is 3s (pg_roles.rolconfig — do NOT loosen it). Measured 2026-10-23:
-- six page loads two-at-a-time gave 2 x 500; `e2e/feedback-stories-fixed.spec.ts`
-- "anonymous search for Berlin" fails intermittently on prod.
--
-- WHERE THE TIME GOES, measured with EXPLAIN (ANALYZE, BUFFERS) on the live body, warm,
-- leaf nodes only (buffers roll up the tree):
--
--   cities seq scan ................ 3,870 blk   53 ms
--   venues index-only (vc) ......... 5,742 blk   47 ms  (+ GroupAggregate to 78 ms;
--                                                        Heap Fetches 5,755 — VM stale again)
--   events index scan (ec) ......... 4,382 blk   44 ms
--   geo_country_profiles (hr) ...... 3,155 blk   24 ms
--   rows build total ............... 17,953 blk 269 ms
--   jsonb_agg over 16,173 rows ......     3 blk ~325 ms  (pure CPU)
--   sort ..........................          ~85 ms
--   planning ......................        111 ms
--   TOTAL ......................... ~0.9 s warm, 17,962 shared hits, 0 reads
--
-- It is CPU-bound, not I/O-bound: zero physical reads. That is why it is flaky rather
-- than slow: ~0.9s alone, ~1.6s when two calls (or a busy cron minute) share the CPU,
-- and anything that pushes it past 3s is a 500. 99991792214562 (index) and
-- 99991792214568 (columnar payload) already took the constant factor from 2.5s to
-- ~0.8s; what is left is jsonb_agg + the join itself, i.e. the cost of the answer, and
-- it grows with the corpus (2,529 -> 16,173 rows in ~5 weeks). Another constant-factor
-- pass buys weeks.
--
-- FIX: compute once per 10 minutes, serve the stored jsonb. The body is UNCHANGED —
-- moved verbatim into api_private.cities_directory_compute(), so every reasoning comment
-- in 99991792214562 / 99991792214568 still applies to it — plus one additive key,
-- `generated_at`. The RPC returns the snapshot with `refreshed_at` spliced in; the live
-- compute runs only when no snapshot row exists (fresh database / rebuild), so the RPC
-- can never return nothing. The client ignores both new keys.
--
-- STALENESS IS BOUNDED AND WATCHED, NOT SILENT. A new city or a changed venue count
-- appears up to 10 minutes late. high_risk is card copy here — RLS on venues/events is
-- what actually gates content — so a <=10 min lag on a criminalization change is copy
-- lagging, not exposure. A dead refresher would freeze the directory, so
-- check-pipeline-health.mjs FAILS when `refreshed_at` is over 2h old, and the cron is
-- registered in admin_automations so its failures are run-tracked and auto-pause-able.
--
-- NO TOAST CHURN ON A QUIET CORPUS: the refresh rewrites `payload` only when the content
-- changed (an UPDATE that keeps the old value reuses its TOAST pointer), and always stamps
-- `refreshed_at`. So `generated_at` = last content change, `refreshed_at` = last refresh;
-- the gate reads the second, which measures the REFRESHER rather than the corpus.

create table if not exists api_private.cities_directory_snapshot (
  id           boolean primary key default true check (id),
  payload      jsonb       not null,
  refreshed_at timestamptz not null default now()
);
revoke all on table api_private.cities_directory_snapshot from public, anon, authenticated;

create or replace function api_private.cities_directory_compute()
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with vc as (
    -- Index-only scan on idx_venues_city_id_approved; see 99991792214562 for the two
    -- measured visibility-map bounds and why the degraded one is still a win.
    select v.city_id, count(*)::int as n
    from public.venues v
    where v.review_status = 'approved'
      and v.city_id is not null
    group by v.city_id
  ),
  -- Upcoming only. The events corpus is ~99% past (36.5k rows scraped from the
  -- Wayback Machine), so a lifetime count would say nothing about whether there is
  -- anything to go to.
  ec as (
    select e.city_id, count(*)::int as n
    from public.events e
    where e.city_id is not null
      and e.start_date >= now() - interval '1 day'
    group by e.city_id
  ),
  qv as (
    select q.city_id, count(*)::int as n
    from public.queer_villages q
    where q.city_id is not null
    group by q.city_id
  ),
  -- The high-risk COUNTRY set, resolved once (67 of 250 countries). Must stay
  -- `materialized` — see the header.
  hr as materialized (
    select cp.place_id as country_id
    from public.geo_country_profiles cp
    where (cp.lgbti_criminalization->>'legal') = 'false'
       or public.death_penalty_risk(cp.lgbti_criminalization) <> 'none'
  ),
  -- `materialized` because `ctry` and the row build both read it; without it this
  -- whole join runs twice.
  rows as materialized (
    select
      c.id,
      c.slug,
      c.name,
      c.name_en,
      c.name_de,
      c.region_name,
      c.population,
      c.latitude,
      c.longitude,
      c.is_capital,
      nullif(c.is_regional_capital, false) as is_regional_capital,
      c.capital_of_region,
      c.editorial_hook,
      co.id            as country_id,
      co.name          as country_name,
      co.slug          as country_slug,
      co.equality_score,
      cont.code        as continent_code,
      cont.name        as continent_name,
      coalesce(vc.n, 0) as venue_count,
      coalesce(ec.n, 0) as upcoming_event_count,
      coalesce(qv.n, 0) as village_count,
      -- Resolved here, not in the client, so the card cannot disagree with the RLS
      -- predicate that decides whether that city's venues are gated at all. A LEFT JOIN
      -- rather than a per-row EXISTS; `is not null` keeps it strictly boolean, which
      -- `in (select ...)` would not.
      (hr.country_id is not null) as high_risk
    from public.cities c
    left join public.countries  co   on co.id   = c.country_id
    left join public.continents cont on cont.id = co.continent_id
    left join vc on vc.city_id = c.id
    left join ec on ec.city_id = c.id
    left join qv on qv.city_id = c.id
    -- Inlined from location_is_high_risk(); the coalesce is that function's own
    -- geo_places fallback, kept verbatim.
    left join hr on hr.country_id = coalesce(
      c.country_id,
      (select gp.country_id from public.geo_places gp
        where gp.id = c.id and gp.place_type = 'city')
    )
    where c.duplicate_of_id is null
      and c.slug is not null
      and c.slug not like 'tmp-%'
      and c.latitude is not null
      and c.longitude is not null
      and c.seo_indexable is true
      -- `not in` would swallow NULLs; shell_status is NOT NULL on every row.
      and c.shell_status not in ('ghost', 'merged')
  ),
  -- 212 distinct tuples, which is the whole point: they were being repeated 16,206
  -- times for 2,673 kB. Objects rather than tuples here — at 212 rows the key names
  -- cost ~17 kB and buy a self-describing lookup.
  ctry as (
    select
      row_number() over (order by country_slug nulls last) - 1 as ix,
      country_id, country_name, country_slug, equality_score,
      continent_code, continent_name
    from rows
    where country_id is not null
    group by country_id, country_name, country_slug, equality_score,
             continent_code, continent_name
  )
  select jsonb_build_object(
    -- When this payload was built. Freshness of the cached copy is watched from
    -- check-pipeline-health.mjs, the only reader that can see it from outside.
    'generated_at', now(),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',             k.country_id,
               'name',           k.country_name,
               'slug',           k.country_slug,
               'equality_score', k.equality_score,
               'continent_code', k.continent_code,
               'continent_name', k.continent_name
             ) order by k.ix)
      from ctry k), '[]'::jsonb),
    -- Shipped WITH the data so the client decodes by name. See the header: a hardcoded
    -- column order fails silently on an insert.
    'cols', jsonb_build_array(
      'id', 'slug', 'name', 'name_en', 'name_de', 'region_name', 'population',
      'latitude', 'longitude', 'is_capital', 'is_regional_capital', 'capital_of_region',
      'editorial_hook', 'venue_count', 'upcoming_event_count', 'village_count',
      'high_risk', 'country'),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_array(
               r.id, r.slug, r.name, r.name_en, r.name_de, r.region_name, r.population,
               r.latitude, r.longitude, r.is_capital, r.is_regional_capital,
               r.capital_of_region, r.editorial_hook, r.venue_count,
               r.upcoming_event_count, r.village_count, r.high_risk, k.ix)
             -- Explicit on the aggregate, not inherited: the maps script pins the
             -- first-listed city per country.
             order by r.venue_count desc, r.population desc nulls last, r.name asc)
      from rows r
      left join ctry k on k.country_id = r.country_id), '[]'::jsonb)
  );
$function$;

revoke all on function api_private.cities_directory_compute() from public, anon, authenticated;

create or replace function api_private.cities_directory_refresh()
returns void
language sql
volatile
set search_path to 'public'
as $function$
  insert into api_private.cities_directory_snapshot as s (id, payload, refreshed_at)
  values (true, api_private.cities_directory_compute(), now())
  on conflict (id) do update
    set payload = case
                    -- generated_at differs on every build; compare the content only.
                    when (s.payload - 'generated_at') is distinct from (excluded.payload - 'generated_at')
                    then excluded.payload
                    else s.payload
                  end,
        refreshed_at = excluded.refreshed_at;
$function$;

revoke all on function api_private.cities_directory_refresh() from public, anon, authenticated;

-- The RPC: read the snapshot; `refreshed_at` is spliced into the envelope so the health
-- check measures when the REFRESHER last ran, not when the content last changed.
create or replace function api_private.cities_directory()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select s.payload || jsonb_build_object('refreshed_at', s.refreshed_at)
       from api_private.cities_directory_snapshot s where s.id),
    api_private.cities_directory_compute()
  );
$function$;

select api_private.cities_directory_refresh();

insert into public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
values (
  'cities_directory_refresh',
  'cities_directory_refresh',
  'Rebuilds the cached /cities directory payload served by cities_directory(). The live build is ~0.9s CPU and anon has a 3s statement_timeout, so it is precomputed. Payload is only rewritten when content changed.',
  'system',
  true,
  jsonb_build_object('type', 'schedule'),
  '*/10 * * * *',
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'cities_directory_refresh',
    'command', 'select api_private.cities_directory_refresh();'
  )
)
on conflict (slug) do nothing;

select cron.schedule(
  'cities_directory_refresh',
  '*/10 * * * *',
  public.admin_automation_effective_command(
    'cities_directory_refresh',
    (select action ->> 'command' from public.admin_automations where slug = 'cities_directory_refresh')))
where not exists (select 1 from cron.job where jobname = 'cities_directory_refresh');

do $verify$
declare
  v_p jsonb;
begin
  -- P1: the snapshot exists and the RPC serves it.
  if not exists (select 1 from api_private.cities_directory_snapshot) then
    raise exception 'P1 failed: no cities_directory snapshot row';
  end if;
  v_p := public.cities_directory();
  if not (v_p ? 'refreshed_at') then
    raise exception 'P1 failed: cities_directory() is not serving the snapshot';
  end if;

  -- P2: the served shape is the columnar envelope, non-empty, cols aligned with rows.
  if jsonb_array_length(v_p -> 'rows') < 1
     or jsonb_array_length(v_p -> 'countries') < 1
     or jsonb_array_length(v_p -> 'cols') <> jsonb_array_length(v_p -> 'rows' -> 0) then
    raise exception 'P2 failed: snapshot payload is empty or cols/rows misaligned';
  end if;

  -- P3: the snapshot equals a live build (content, ignoring the two timestamps).
  if (v_p - 'generated_at' - 'refreshed_at')
     is distinct from (api_private.cities_directory_compute() - 'generated_at') then
    raise exception 'P3 failed: snapshot differs from a live compute';
  end if;

  -- P4: nothing below the RPC is reachable by anon/authenticated.
  if has_table_privilege('anon', 'api_private.cities_directory_snapshot', 'SELECT')
     or has_table_privilege('authenticated', 'api_private.cities_directory_snapshot', 'SELECT')
     or has_function_privilege('anon', 'api_private.cities_directory_refresh()', 'EXECUTE')
     or has_function_privilege('anon', 'api_private.cities_directory_compute()', 'EXECUTE') then
    raise exception 'P4 failed: snapshot internals are reachable by anon/authenticated';
  end if;

  -- P5: the refresher is scheduled.
  if not exists (select 1 from cron.job where jobname = 'cities_directory_refresh' and active) then
    raise exception 'P5 failed: cities_directory_refresh is not scheduled';
  end if;
end
$verify$;
