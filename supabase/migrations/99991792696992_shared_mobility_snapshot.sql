-- Shared bikes & e-scooters: one national snapshot from sharedmobility.ch (SFOE, GBFS 2.0).
-- Design: docs/plans/2026-10-22-zurich-late-night-mobility-design.md (Step 2).
--
-- ONE ROW, a ~100 m grid of counts — never per-vehicle rows. Measured 2026-10-22:
-- 23,370 vehicles nationally (7,906 in Zürich) refreshed every few minutes. Per-vehicle
-- rows would be ~2M row writes/day on a disk-constrained DB; one jsonb row of grid cells
-- is a single UPDATE per refresh, read by bbox/radius RPCs. The browser only ever reads
-- this table (design §4.3: never proxy a user query to an external API).
--
-- Not search-indexed, never writes an entity table.

create table if not exists public.shared_mobility_snapshot (
  region         text primary key check (region ~ '^[a-z]{2}$'),
  -- [[lat, lng, count], ...] — cell centres, ~111 m (lat) x ~113 m (lng at 47°N)
  cells          jsonb not null check (jsonb_typeof(cells) = 'array'),
  vehicles       integer not null check (vehicles >= 0),
  providers      text[] not null default '{}',
  source_url     text not null,
  attribution    text not null,
  source_updated_at timestamptz,
  generated_at   timestamptz not null default now()
);

alter table public.shared_mobility_snapshot enable row level security;
drop policy if exists shared_mobility_snapshot_select on public.shared_mobility_snapshot;
create policy shared_mobility_snapshot_select on public.shared_mobility_snapshot for select using (true);
revoke all on public.shared_mobility_snapshot from anon, authenticated;
grant select on public.shared_mobility_snapshot to anon, authenticated;
grant all on public.shared_mobility_snapshot to service_role;

-- Map viewport. Returns at most p_limit cells, biggest first, plus the snapshot age so
-- the UI can say how old "now" is.
create or replace function public.shared_mobility_in_bbox(
  south double precision, west double precision, north double precision, east double precision,
  p_limit integer default 3000)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'generated_at', s.generated_at,
      'attribution', s.attribution,
      'cells', coalesce((
        select jsonb_agg(c.cell)
        from (
          select e.cell
          from jsonb_array_elements(s.cells) as e(cell)
          where (e.cell->>0)::float8 between south and north
            and (e.cell->>1)::float8 between west and east
          order by (e.cell->>2)::int desc
          limit least(greatest(coalesce(p_limit, 3000), 1), 5000)
        ) c), '[]'::jsonb))
    from shared_mobility_snapshot s
    where s.region = 'ch'), '{}'::jsonb);
$$;

-- Venue page: vehicles whose cell centre lies within p_radius_m of a point.
-- Cell-centre approximation (cells are ~110 m), so the UI says "about".
create or replace function public.shared_mobility_near(
  p_lat double precision, p_lng double precision, p_radius_m integer default 300)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'count', coalesce(sum((e.cell->>2)::int), 0),
    'radius_m', least(greatest(coalesce(p_radius_m, 300), 50), 1000),
    -- "0 nearby" is only a claim where the feed covers the area: a Berlin venue (no Swiss
    -- feed) must render nothing, not "0 bikes". Covered = any vehicle within ~3 km.
    'covered', exists (
      select 1 from jsonb_array_elements(s.cells) as c(cell)
      where abs((c.cell->>0)::float8 - p_lat) < 0.027
        and abs((c.cell->>1)::float8 - p_lng) < 0.04),
    'generated_at', s.generated_at,
    'attribution', s.attribution)
  from shared_mobility_snapshot s
  left join lateral jsonb_array_elements(s.cells) as e(cell)
    -- cheap bbox prefilter, then equirectangular distance (exact enough at <= 1 km)
    on abs((e.cell->>0)::float8 - p_lat) < 0.01
   and abs((e.cell->>1)::float8 - p_lng) < 0.015
   and 6371000 * sqrt(
         power(radians((e.cell->>0)::float8 - p_lat), 2) +
         power(radians((e.cell->>1)::float8 - p_lng) * cos(radians(p_lat)), 2))
       <= least(greatest(coalesce(p_radius_m, 300), 50), 1000)
  where s.region = 'ch'
  group by s.region, s.cells, s.generated_at, s.attribution;
$$;

revoke all on function public.shared_mobility_in_bbox(double precision, double precision, double precision, double precision, integer) from public;
revoke all on function public.shared_mobility_near(double precision, double precision, integer) from public;
grant execute on function public.shared_mobility_in_bbox(double precision, double precision, double precision, double precision, integer) to anon, authenticated, service_role;
grant execute on function public.shared_mobility_near(double precision, double precision, integer) to anon, authenticated, service_role;

-- Registry row FIRST, then the cron (20261029094600 pattern). */5: the source's ttl is
-- 60 s, but a count 5 minutes old answers "is there something to ride home" and costs a
-- fifth of the writes.
insert into admin_automations (slug, name, description, trigger, action, schedule, enabled, managed_by)
values (
  'shared_mobility_refresh',
  'Shared bikes & e-scooters snapshot (sharedmobility.ch)',
  'Fetches the national GBFS free_bike_status (SFOE), drops cars/mopeds and disabled/reserved vehicles, aggregates to a ~100 m grid and writes the single shared_mobility_snapshot row read by the map and venue pages.',
  jsonb_build_object('type', 'schedule'),
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'shared_mobility_refresh',
    'command', $cmd$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/shared-mobility-refresh',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('triggered_by', 'cron'),
    timeout_milliseconds := 30000
  ) as request_id;
  $cmd$
  ),
  '*/5 * * * *',
  true,
  'system'
)
on conflict (slug) do update
  set enabled     = true,
      schedule    = excluded.schedule,
      action      = excluded.action,
      description = excluded.description;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'shared_mobility_refresh') then
    perform cron.unschedule('shared_mobility_refresh');
  end if;
end $$;

select cron.schedule(
  'shared_mobility_refresh',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/shared-mobility-refresh',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := jsonb_build_object('triggered_by', 'cron'),
    timeout_milliseconds := 30000
  ) as request_id;
  $cron$
);

do $verify$
declare
  v_sched text;
begin
  if not exists (select 1 from admin_automations where slug = 'shared_mobility_refresh' and enabled) then
    raise exception 'shared_mobility_refresh registry row missing or disabled';
  end if;
  select schedule into v_sched from cron.job where jobname = 'shared_mobility_refresh';
  if v_sched is distinct from '*/5 * * * *' then
    raise exception 'shared_mobility_refresh cron not created as */5: %', v_sched;
  end if;
  if not has_function_privilege('anon', 'public.shared_mobility_near(double precision, double precision, integer)', 'EXECUTE') then
    raise exception 'shared_mobility_near must be readable by anon';
  end if;
  if has_table_privilege('anon', 'public.shared_mobility_snapshot', 'UPDATE') then
    raise exception 'anon must not write shared_mobility_snapshot';
  end if;
end
$verify$;
