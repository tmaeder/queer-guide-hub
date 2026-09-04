-- Feed the geo_address_drain. It has been healthy and idle.
--
-- THE MACHINERY WORKS AND HAS NO WORK. `geo_address_drain` runs */5 with 0
-- consecutive failures, `backfill-venue-postal.mjs` exists to clear a backlog,
-- and `geo_address_queue` is EMPTY — while 2,872 venues with coordinates carry
-- no postal_code, none of them holding any attempt marker: 635 US, 174 ES,
-- 155 GB, all countries that use postal codes. The queue's own comment says it
-- is "enqueued by triggers and by backfill scripts": the triggers cover rows
-- written from now on, the scripts are one-shot and were never run, and nothing
-- recurring ever looks at the historical residue. So it accumulates silently.
--
-- This adds the missing third writer: a bounded, self-limiting top-up that can
-- run forever. It is NOT a second drain — the drain is fine.
--
-- WHY EVENTS ARE CUT AT ONE YEAR, measured:
--   events missing postal, with coordinates ....... 39,727
--     upcoming ......................................... 68
--     within 90 days .................................. 695
--     within 1 year ................................. 2,242
--     older than 1 year ............................. 37,485   (94%)
-- This corpus deliberately holds ~36.5k past events from the Wayback import, so
-- a past date is not a defect here. But a postal code on a 2017 event serves
-- nobody, and enqueuing all of them is ~37k Photon requests — six days of drain
-- capacity spent ahead of the 2,872 LIVE venues. The cut takes the whole job
-- from 43,176 rows (~6 days) to 5,691 (~20 hours) and loses nothing a reader
-- could reach. Widen it by changing one interval if that judgement changes.
--
-- Priority order is venue → organization → hotel → event for the same reason:
-- a venue is a place someone is deciding whether to walk into tonight.

create or replace function public.run_geo_address_enqueue_backlog(
  p_target_depth integer default 400
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_depth   integer;
  v_room    integer;
  v_added   jsonb := '{}'::jsonb;
  v_n       integer;
begin
  perform public.assert_admin_or_internal();
  p_target_depth := least(greatest(coalesce(p_target_depth, 400), 0), 5000);

  -- Outstanding work is rows the drain can still act on. Rows at the 4-attempt
  -- ceiling are permanently stuck and must NOT count towards depth, or a
  -- handful of unresolvable coordinates would pin the queue at "full" and
  -- starve every remaining entity forever.
  select count(*) into v_depth from public.geo_address_queue where attempts < 4;
  v_room := p_target_depth - v_depth;

  if v_room <= 0 then
    return jsonb_build_object('skipped', true, 'depth', v_depth, 'target', p_target_depth);
  end if;

  -- Each arm excludes rows ALREADY in the queue in its WHERE, not by leaning on
  -- ON CONFLICT. A row that failed geocoding still matches `postal_code is
  -- null`, so without this it is re-selected every hour, consumes a LIMIT slot,
  -- inserts nothing, and blocks a row that could have been done — the same
  -- head-of-queue wedge the rollback drain had to avoid.

  -- venues
  with c as (
    select 'venue'::text et, v.id, v.latitude, v.longitude
    from public.venues v
    where v.duplicate_of_id is null and v.postal_code is null
      and v.latitude is not null and v.longitude is not null
      and not exists (
        select 1 from public.geo_address_queue q
        where q.entity_type = 'venue' and q.entity_id = v.id
      )
    order by v.id
    limit v_room
  )
  insert into public.geo_address_queue (entity_type, entity_id, reason, latitude, longitude)
  select et, id, 'missing_postal', latitude, longitude from c
  on conflict (entity_type, entity_id) do nothing;
  get diagnostics v_n = row_count;
  v_added := v_added || jsonb_build_object('venue', v_n);
  v_room := v_room - v_n;

  if v_room > 0 then
    with c as (
      select 'organization'::text et, o.id, o.latitude, o.longitude
      from public.organizations o
      where o.duplicate_of_id is null and o.postal_code is null
        and o.latitude is not null and o.longitude is not null
        and not exists (
          select 1 from public.geo_address_queue q
          where q.entity_type = 'organization' and q.entity_id = o.id
        )
      order by o.id
      limit v_room
    )
    insert into public.geo_address_queue (entity_type, entity_id, reason, latitude, longitude)
    select et, id, 'missing_postal', latitude, longitude from c
    on conflict (entity_type, entity_id) do nothing;
    get diagnostics v_n = row_count;
    v_added := v_added || jsonb_build_object('organization', v_n);
    v_room := v_room - v_n;
  end if;

  if v_room > 0 then
    with c as (
      select 'hotel'::text et, h.id, h.latitude, h.longitude
      from public.hotels h
      where h.postal_code is null
        and h.latitude is not null and h.longitude is not null
        and not exists (
          select 1 from public.geo_address_queue q
          where q.entity_type = 'hotel' and q.entity_id = h.id
        )
      order by h.id
      limit v_room
    )
    insert into public.geo_address_queue (entity_type, entity_id, reason, latitude, longitude)
    select et, id, 'missing_postal', latitude, longitude from c
    on conflict (entity_type, entity_id) do nothing;
    get diagnostics v_n = row_count;
    v_added := v_added || jsonb_build_object('hotel', v_n);
    v_room := v_room - v_n;
  end if;

  if v_room > 0 then
    with c as (
      select 'event'::text et, e.id, e.latitude, e.longitude
      from public.events e
      where e.duplicate_of_id is null and e.postal_code is null
        and e.latitude is not null and e.longitude is not null
        and e.start_date >= current_date - interval '1 year'
        and not exists (
          select 1 from public.geo_address_queue q
          where q.entity_type = 'event' and q.entity_id = e.id
        )
      order by e.start_date desc
      limit v_room
    )
    insert into public.geo_address_queue (entity_type, entity_id, reason, latitude, longitude)
    select et, id, 'missing_postal', latitude, longitude from c
    on conflict (entity_type, entity_id) do nothing;
    get diagnostics v_n = row_count;
    v_added := v_added || jsonb_build_object('event', v_n);
  end if;

  return jsonb_build_object(
    'skipped', false,
    'depth_before', v_depth,
    'target', p_target_depth,
    'added', v_added,
    'depth_after', (select count(*) from public.geo_address_queue where attempts < 4)
  );
end $$;

revoke all on function public.run_geo_address_enqueue_backlog(integer) from public, anon, authenticated;
grant execute on function public.run_geo_address_enqueue_backlog(integer) to service_role;

comment on function public.run_geo_address_enqueue_backlog(integer) is
  'Tops geo_address_queue up to a target depth from entities missing postal_code. '
  'Self-limiting: a no-op while the queue is deep enough, so it can run hourly forever. '
  'Events are restricted to the last year — 94% of the missing ones are older, and the '
  'corpus deliberately holds ~36.5k past Wayback events.';


-- Registry row FIRST, then the cron — the registry is the register of record and
-- an `rpc` action carries no action.command, so sync_automations_to_cron() can
-- never recreate this job. It is scheduled here and nowhere else.
insert into public.admin_automations
  (slug, name, description, trigger, conditions, schedule, action, enabled, auto_pause_threshold, managed_by)
values (
  'geo_address_enqueue_backlog',
  'Geo address queue — backlog top-up',
  'Hourly: tops geo_address_queue up to 400 ready rows from venues/orgs/hotels/recent events '
  || 'missing postal_code. The geo_address_drain (*/5, 25 rows) does the geocoding; this only '
  || 'supplies it. Added 2026-09-04 after the drain was found healthy with an empty queue and '
  || '2,872 venues still unprocessed.',
  jsonb_build_object('type', 'schedule'),
  '[]'::jsonb,
  '40 * * * *',
  jsonb_build_object('type', 'rpc', 'fn', 'run_geo_address_enqueue_backlog'),
  true,
  3,
  'system'
)
on conflict (slug) do update
  set schedule = excluded.schedule,
      action = excluded.action,
      description = excluded.description,
      enabled = true;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'geo_address_enqueue_backlog') then
    perform cron.unschedule('geo_address_enqueue_backlog');
  end if;
end $$;

-- :40 keeps it off the top-of-hour herd and 20 minutes clear of the */5 drain's
-- own busiest moments.
select cron.schedule(
  'geo_address_enqueue_backlog',
  '40 * * * *',
  $cron$select public.admin_automation_run_begin('geo_address_enqueue_backlog'); select public.run_geo_address_enqueue_backlog(400);$cron$
);

-- Assert rather than assume: a cron.schedule inside a migration has silently
-- not taken before (20260820191944).
do $$
declare
  v_enabled boolean;
  v_jobs    integer;
  v_sched   text;
begin
  select enabled into v_enabled from public.admin_automations where slug = 'geo_address_enqueue_backlog';
  if v_enabled is not true then
    raise exception 'geo_address_enqueue_backlog registry row missing or disabled';
  end if;
  select count(*), max(schedule) into v_jobs, v_sched
  from cron.job where jobname = 'geo_address_enqueue_backlog';
  if v_jobs <> 1 then
    raise exception 'geo_address_enqueue_backlog cron job not created (% rows)', v_jobs;
  end if;
  if v_sched <> '40 * * * *' then
    raise exception 'geo_address_enqueue_backlog schedule drifted to %', v_sched;
  end if;
  if to_regprocedure('public.run_geo_address_enqueue_backlog(integer)') is null then
    raise exception 'run_geo_address_enqueue_backlog was not created';
  end if;
end $$;
