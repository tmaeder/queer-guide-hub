-- The geo sentinel. Before this migration there was NO geographic check
-- anywhere in CI: pipeline_hygiene_stats() had ten keys and none were geo,
-- check-pipeline-health.mjs had thirteen sections and none were geo, and
-- release_gate_checks() had no geo gate. Every geo signal was visible only if a
-- human opened /admin/quality. That is why a city centroid could sit 151 km out
-- in the Gulf of Mexico, propagate to 48 events and 22 venues, and go unreported.
--
-- WHY A SEPARATE FUNCTION rather than a geo key inside pipeline_hygiene_stats().
-- Adding a key there means CREATE OR REPLACE over a ~150-line body that several
-- concurrent sessions also edit; this repo has already had a restated stats
-- function land as a merge collision. geo_hygiene_stats() is additive, so the
-- two cannot conflict, and check-pipeline-health.mjs calls both.
--
-- THE EMPTY-AUTHORITY RULE IS THE LOAD-BEARING PART. geo_boundaries was created
-- on 2026-09-05 and sat at zero rows -- the table, the helper functions and a
-- digest-pinned loader all existed and nothing had run it. A containment check
-- over an empty boundary set returns zero violations, which is indistinguishable
-- from a clean corpus. So boundary_rows and boundary_cells are reported as
-- first-class values and the health script FAILS when either is zero. Absence of
-- an authority is a broken sentinel, never a passing one.

create or replace function public.geo_hygiene_stats()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    -- The authority itself. Zero here means every other number below is a lie.
    'boundary_rows', (select count(*) from public.geo_boundaries where boundary_kind = 'country'),
    'boundary_cells', (select count(*) from public.geo_boundary_cells),
    'boundary_iso_codes', (
      select count(distinct iso_a2) from public.geo_boundaries
       where boundary_kind = 'country' and iso_a2 is not null
    ),

    -- Entities whose coordinate contradicts their country, by class and table.
    -- Read from the materialised findings so the sentinel and the admin panel
    -- cannot measure different sets.
    'containment', coalesce((
      select jsonb_object_agg(k, n) from (
        select violation_class || ':' || entity_type as k, count(*) as n
          from public.geo_containment_findings
         group by 1
      ) s
    ), '{}'::jsonb),
    'containment_total', (select count(*) from public.geo_containment_findings),

    -- Root causes. A bad city centroid poisons every entity linked to it, and
    -- centroid-based detectors are blind to it because they measure distance TO
    -- that centroid. km_to_land > 5 excludes coastline generalisation, which was
    -- 125 of 131 rows when measured.
    'city_coord_defects', (
      select count(*) from public.geo_city_coord_findings
       where violation_class = 'country_mismatch' or coalesce(km_to_land, 0) > 5
    ),
    'city_coord_defects_with_content', (
      select count(*) from public.geo_city_coord_findings
       where (violation_class = 'country_mismatch' or coalesce(km_to_land, 0) > 5)
         and coalesce(venues, 0) + coalesce(events, 0) > 0
    ),

    -- Relational contradictions: city_id's country vs the row's own country_id.
    'integrity_violations', coalesce((
      select jsonb_object_agg(violation, n) from (
        select violation, count(*) n from public.geo_integrity_violations group by 1
      ) s
    ), '{}'::jsonb),

    -- The postal queue. Depth alone is not health: a shallow queue whose head is
    -- six months old is stalled, and that is exactly what the admin panel could
    -- not show because it never rendered oldest_enqueued_at.
    'address_queue', jsonb_build_object(
      'depth', (select count(*) from public.geo_address_queue),
      'parked', (select count(*) from public.geo_address_queue where attempts >= 4),
      'oldest_hours', (
        select round(extract(epoch from (now() - min(enqueued_at))) / 3600)::int
          from public.geo_address_queue
      ),
      'entity_types', coalesce((
        select jsonb_object_agg(entity_type, n) from (
          select entity_type, count(*) n from public.geo_address_queue group by 1
        ) s
      ), '{}'::jsonb)
    ),

    -- Staleness of the findings themselves. A sweep that stopped running leaves
    -- yesterday's counts looking healthy forever.
    'findings_age_hours', (
      select round(extract(epoch from (now() - max(detected_at))) / 3600)::int
        from public.geo_containment_findings
    )
  );
$$;

revoke all on function public.geo_hygiene_stats() from public, anon;
grant execute on function public.geo_hygiene_stats() to authenticated, service_role;

comment on function public.geo_hygiene_stats() is
  'Geographic data-quality sentinel. boundary_rows/boundary_cells being zero means the authority was never loaded and every other figure here is vacuous — check-pipeline-health.mjs treats that as a hard failure, not a clean run.';

-- ---------------------------------------------------------------------------
-- The sweep that keeps the findings current.

create or replace function public.run_geo_containment_sweep()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started       timestamptz := now();
  v_entities      int;
  v_cities        int;
begin
  select id, enabled into v_automation_id, v_enabled
    from public.admin_automations where slug = 'geo_containment_sweep';

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'geo_containment_sweep', v_started, 'success', 0, 0)
  returning id into v_run_id;

  if v_enabled is distinct from true then
    update public.admin_automation_runs
       set finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
     where id = v_run_id;
    return jsonb_build_object('skipped', true);
  end if;

  -- Refuse to overwrite real findings with vacuous ones. Without this, a day
  -- when geo_boundaries is empty would blank both tables and the sentinel would
  -- report a perfectly clean corpus.
  if (select count(*) from public.geo_boundary_cells) = 0 then
    update public.admin_automation_runs
       set finished_at = now(), status = 'error',
           error = 'geo_boundary_cells is empty; refusing to publish a vacuous all-clear'
     where id = v_run_id;
    update public.admin_automations
       set last_run_at = v_started, last_run_status = 'error' where id = v_automation_id;
    raise exception 'geo_boundary_cells is empty; run refresh_geo_boundary_cells() first';
  end if;

  delete from public.geo_containment_findings;
  insert into public.geo_containment_findings
    (entity_type, entity_id, entity_name, claimed_iso, actual_iso, match_kind, violation_class, latitude, longitude)
  select entity_type, entity_id, entity_name, claimed_iso, actual_iso, match_kind, violation_class, latitude, longitude
    from public.geo_containment_violations();
  get diagnostics v_entities = row_count;

  delete from public.geo_city_coord_findings;
  insert into public.geo_city_coord_findings
    (city_id, name, claimed_iso, actual_iso, violation_class, latitude, longitude, venues, events)
  select c.id, c.name, c.claimed, hit.iso,
         case when hit.iso is null then 'offshore' else 'country_mismatch' end,
         c.latitude, c.longitude, c.venues, c.events
  from (
    select ci.id, ci.name, co.code claimed, ci.latitude, ci.longitude,
           ST_SetSRID(ST_MakePoint(ci.longitude, ci.latitude), 4326) g,
           (select count(*) from public.venues v where v.city_id = ci.id and v.duplicate_of_id is null) venues,
           (select count(*) from public.events e where e.city_id = ci.id and e.duplicate_of_id is null) events
      from public.cities ci join public.countries co on co.id = ci.country_id
     where ci.duplicate_of_id is null and ci.latitude is not null
  ) c
  left join lateral (
    select cell.iso_a2 iso from public.geo_boundary_cells cell
     where cell.geom && c.g and ST_Contains(cell.geom, c.g)
     order by (cell.iso_a2 is null) limit 1
  ) hit on true
  where hit.iso is null or not public.geo_countries_equivalent(c.claimed, hit.iso);
  get diagnostics v_cities = row_count;

  -- Distance to land, so coastline generalisation can be told from a real
  -- defect. Only for the offshore rows; a country mismatch is already decided.
  with src as (
    select f.city_id, ST_SetSRID(ST_MakePoint(f.longitude, f.latitude), 4326) g
      from public.geo_city_coord_findings f where f.violation_class = 'offshore'
  ), m as (
    select s.city_id, n.iso, round((n.d / 1000)::numeric, 1) km
      from src s cross join lateral (
        select c.iso_a2 iso, ST_Distance(c.geom::geography, s.g::geography) d
          from public.geo_boundary_cells c
         where c.iso_a2 is not null
         order by c.geom <-> s.g limit 1
      ) n
  )
  update public.geo_city_coord_findings f
     set km_to_land = m.km, nearest_iso = m.iso
    from m where m.city_id = f.city_id;

  update public.admin_automation_runs
     set finished_at = now(), items_examined = v_entities + v_cities, items_changed = v_entities,
         summary = jsonb_build_object('entity_findings', v_entities, 'city_findings', v_cities)
   where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started, last_run_status = 'success' where id = v_automation_id;

  return jsonb_build_object('entity_findings', v_entities, 'city_findings', v_cities);
exception when others then
  update public.admin_automation_runs
     set finished_at = now(), status = 'error', error = sqlerrm where id = v_run_id;
  update public.admin_automations
     set last_run_at = v_started, last_run_status = 'error' where id = v_automation_id;
  raise;
end;
$$;

revoke all on function public.run_geo_containment_sweep() from public, anon, authenticated;
grant execute on function public.run_geo_containment_sweep() to service_role;

insert into public.admin_automations (slug, name, description, schedule, enabled, action, conditions)
values (
  'geo_containment_sweep',
  'Geo containment sweep',
  'Re-derives geo_containment_findings and geo_city_coord_findings from the Natural Earth boundary set. Feeds geo_hygiene_stats() and the /admin/quality address panel.',
  '55 3 * * *',
  true,
  jsonb_build_object('type', 'rpc', 'function', 'run_geo_containment_sweep'),
  '{}'::jsonb
)
on conflict (slug) do update
  set schedule = excluded.schedule,
      action = excluded.action,
      description = excluded.description;

-- rpc automations carry no action.command, so sync_automations_to_cron() cannot
-- schedule them (branch (d) needs a command). Schedule it here, as every other
-- rpc automation in this schema does.
select cron.schedule('geo_containment_sweep', '55 3 * * *',
                     $cron$select public.run_geo_containment_sweep();$cron$);

do $$
declare
  v jsonb;
begin
  v := public.geo_hygiene_stats();
  if (v->>'boundary_rows')::int = 0 then
    raise notice 'geo_boundaries is EMPTY — the sentinel will fail until scripts/data-quality/load-geo-boundaries.mjs has run';
  else
    raise notice 'geo sentinel live: % boundary rows, % cells, % containment findings',
      v->>'boundary_rows', v->>'boundary_cells', v->>'containment_total';
  end if;

  if not exists (select 1 from cron.job where jobname = 'geo_containment_sweep') then
    raise exception 'geo_containment_sweep was not scheduled';
  end if;
end $$;
