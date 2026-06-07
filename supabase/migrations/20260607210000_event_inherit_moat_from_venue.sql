-- P2.5a: inherit moat fields from the linked venue.
-- A venue's curated audience/accessibility is a legitimate default for events held
-- there. Today only target_groups exists on venues (43 venues; accessibility is 0
-- across all 22.7k venues — it has no source in the system, hence the admin
-- capture UI). The function handles accessibility too, so it auto-fills once
-- venues gain that data via the venue consensus engine. Only fills EMPTY event
-- fields; reversible.

create or replace function public.run_event_inherit_moat_from_venue()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tg bigint;
  v_acc bigint;
begin
  with upd as (
    update public.events e
    set target_groups = v.target_groups
    from public.venues v
    where e.venue_id = v.id
      and e.duplicate_of_id is null
      and (e.target_groups is null or array_length(e.target_groups, 1) is null)
      and array_length(v.target_groups, 1) >= 1
    returning e.id
  ) select count(*) into v_tg from upd;

  with upd as (
    update public.events e
    set accessibility_attributes = v.accessibility_attributes,
        accessibility_notes = coalesce(e.accessibility_notes, v.accessibility_notes)
    from public.venues v
    where e.venue_id = v.id
      and e.duplicate_of_id is null
      and (e.accessibility_attributes is null or array_length(e.accessibility_attributes, 1) is null)
      and array_length(v.accessibility_attributes, 1) >= 1
    returning e.id
  ) select count(*) into v_acc from upd;

  return jsonb_build_object('target_groups_inherited', v_tg, 'accessibility_inherited', v_acc);
end;
$$;

grant execute on function public.run_event_inherit_moat_from_venue() to service_role;

-- Run once now.
select public.run_event_inherit_moat_from_venue();

-- Weekly: propagate as venue moat data improves (cheap pure-SQL job).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'event_inherit_moat_from_venue') then
    perform cron.unschedule('event_inherit_moat_from_venue');
  end if;
end $$;
select cron.schedule('event_inherit_moat_from_venue', '40 4 * * 1',
  $cron$ select public.run_event_inherit_moat_from_venue(); $cron$);
