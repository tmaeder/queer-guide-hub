-- Unblock the nightly dedup sweep, and restore two other auto-paused automations.
--
-- dedup_truth_sweep auto-paused 2026-11-20 after three nights of statement timeouts (120s,
-- the pg_cron role default; not raised here). Nothing has been deduplicated since 2026-11-17.
-- Two causes, measured 2026-11-22:
--
-- 1. PER-MERGE FAN-OUT. zzz_venue_gate_to_org (99991792753155) fires on every venue merge and
--    ran `where o.primary_venue_id = new.id or o.primary_venue_id in (subquery)`. The OR with a
--    subquery defeats idx_organizations_primary_venue: a seq scan of all ~110k organizations,
--    ~43k blocks, ~390 ms cold, per merge. Harmless while the sweep merged ~0 venues a night;
--    the 2026-11-18 bulk import (9,109 venues) left 289 auto-eligible venue pairs, and 289
--    scans do not fit. Same 50 merges in a rolled-back run: 2,534,845 -> 453,747 shared blocks.
--    The `= any(array(...))` form below is an index scan: 17 blocks, 0.8 ms.
--
-- 2. ONE STATEMENT FOR TWELVE TYPES. The sweep took 88 / 94 / 114 s on 2026-11-15..17 with no
--    merges at all, i.e. it was already at 95% of its budget. statement_timeout applies per
--    statement of a cron command (libpq, PG 17), and `exception when others` does not catch a
--    cancel, so one slow type killed all twelve. run_dedup_truth_sweep_all gains p_types and the
--    cron runs four COMMIT-separated groups. An error aborts the rest of a command string, so
--    the slowest group (venue) runs last: a venue timeout cannot cost the other types a night.
--    Warm full-mode timings: light types ~25 s (organization: 144 merges in 22.6 s), event +
--    marketplace ~17 s, news ~25 s, venue ~28 s.
--
-- 3. review_jev: claim_jev_review_jobs hit the 8 s PostgREST timeout while the DB was saturated
--    by overlapping crons (refresh_admin_review_worklist 70 s, run_event_quality_scan 90 s, ...).
--    The claim itself costs ~1 s. review-automation now records a claim cancelled before any
--    lease as 'partial' (deferred), not 'error'. Re-enabled here.
--
-- 4. wf_marketplace_sync_merchants: one storefront per hourly batch returned an upstream error
--    (Shopify INTERNAL_SERVER_ERROR; mr-riegillio "Online Store channel is locked") and
--    `success: every merchant ok` failed the whole run. marketplace-sync-merchants now fails a
--    run only when every attempted merchant failed; per-merchant errors stay in items_failed,
--    results and marketplace_merchants.last_sync_status. Re-enabled here.

-- 1. Venue -> organization gate propagation, index-friendly.
create or replace function public.propagate_venue_gate_to_organization()
returns trigger language plpgsql security definer
set search_path to 'public', 'pg_temp' as $prop$
begin
  update public.organizations o
     set primary_venue_id = o.primary_venue_id
   where o.primary_venue_id = any (array(
           select new.id
           union all
           select d.id from public.venues d where d.duplicate_of_id = new.id));
  return null;
end $prop$;

-- 2. Sweep a subset of types. Same body as before plus p_types; null = all twelve.
drop function if exists public.run_dedup_truth_sweep_all(text);
drop function if exists api_private.run_dedup_truth_sweep_all(text);

create function api_private.run_dedup_truth_sweep_all(p_mode text default null, p_types text[] default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_automation_id uuid; v_run_id bigint; v_enabled boolean;
  v_conditions jsonb; v_started_at timestamptz := now();
  v_mode text; v_type text; v_type_mode text;
  v_out jsonb := '[]'::jsonb; v_one jsonb; v_modes jsonb := '{}'::jsonb;
  v_types constant text[] := array['venue','event','marketplace','personality','city',
    'hotel','milestone','organization','news','queer_village','country','group'];
begin
  perform public.assert_admin_or_internal();

  if p_types is not null and not (p_types <@ v_types) then
    raise exception 'run_dedup_truth_sweep_all: unknown type in %', p_types using errcode = '22023';
  end if;

  select id, enabled, conditions into v_automation_id, v_enabled, v_conditions
  from public.admin_automations where slug = 'dedup_truth_sweep';

  insert into public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  values (v_automation_id, 'dedup_truth_sweep', v_started_at, 'success', 0, 0)
  returning id into v_run_id;

  if v_automation_id is not null and v_enabled is distinct from true then
    update public.admin_automation_runs
      set finished_at = now(), summary = jsonb_build_object('skipped', true, 'reason', 'paused')
      where id = v_run_id;
    update public.admin_automations
      set last_run_at = v_started_at, last_run_status = 'paused' where id = v_automation_id;
    return jsonb_build_object('skipped', true, 'reason', 'paused');
  end if;

  v_mode := coalesce(p_mode, v_conditions->>'mode', 'queue_only');

  foreach v_type in array v_types loop
    continue when p_types is not null and not (v_type = any (p_types));
    -- Per-type override (2026-08 overhaul P4). conditions.mode_overrides is a
    -- {type: mode} map; personality is pinned 'queue_only' there and, belt +
    -- braces, clamped here too so no registry edit can ever auto-merge people.
    v_type_mode := coalesce(v_conditions->'mode_overrides'->>v_type, v_mode);
    if v_type = 'personality' and v_type_mode = 'full' then
      v_type_mode := 'queue_only';
    end if;
    v_modes := v_modes || jsonb_build_object(v_type, v_type_mode);
    begin
      v_one := public.run_dedup_truth_sweep(v_type, v_type_mode);
    exception when others then
      v_one := jsonb_build_object('type', v_type, 'error', SQLERRM);
    end;
    v_out := v_out || jsonb_build_array(v_one);
  end loop;

  update public.admin_automation_runs
    set finished_at = now(), summary = jsonb_build_object('mode', v_mode, 'modes', v_modes, 'types', p_types, 'results', v_out)
    where id = v_run_id;
  if v_automation_id is not null then
    update public.admin_automations
      set last_run_at = v_started_at, last_run_status = 'success' where id = v_automation_id;
  end if;

  return jsonb_build_object('mode', v_mode, 'modes', v_modes, 'types', p_types, 'results', v_out);
end $function$;

create function public.run_dedup_truth_sweep_all(p_mode text default null, p_types text[] default null)
 returns jsonb
 language sql
 set search_path to ''
as $function$SELECT api_private.run_dedup_truth_sweep_all(p_mode => $1, p_types => $2)$function$;

revoke all on function api_private.run_dedup_truth_sweep_all(text, text[]) from public, anon;
revoke all on function public.run_dedup_truth_sweep_all(text, text[]) from public, anon;
grant execute on function api_private.run_dedup_truth_sweep_all(text, text[]) to service_role, authenticated;
grant execute on function public.run_dedup_truth_sweep_all(text, text[]) to service_role, authenticated;

-- 3. Re-enable the three automations. The cron rows are gone (nightly sync unscheduled them).
update public.admin_automations
   set enabled = true, consecutive_failures = 0, last_run_status = 'restored', updated_at = now()
 where slug in ('dedup_truth_sweep', 'review_jev', 'wf_marketplace_sync_merchants');

-- dedup_truth_sweep is an rpc automation: sync_automations_to_cron cannot schedule it (no
-- action.command), so its own migration owns the cron, as 20260725202000 did.
select cron.schedule('dedup_truth_sweep', '50 5 * * *', $cmd$
select public.run_dedup_truth_sweep_all(null, array['personality','city','hotel','milestone','organization','queer_village','country','group']);
commit;
select public.run_dedup_truth_sweep_all(null, array['event','marketplace']);
commit;
select public.run_dedup_truth_sweep_all(null, array['news']);
commit;
select public.run_dedup_truth_sweep_all(null, array['venue']);
$cmd$);

select cron.schedule(a.action->>'jobname', a.schedule,
                     public.admin_automation_effective_command(a.slug, a.action->>'command'))
from public.admin_automations a
where a.slug in ('review_jev', 'wf_marketplace_sync_merchants');

do $verify$
declare v_bad int; v_cmd text; v_def text;
begin
  -- P1 the propagation no longer ORs a subquery against the org index
  v_def := regexp_replace(pg_get_functiondef('public.propagate_venue_gate_to_organization()'::regprocedure),
                          '--[^' || chr(10) || ']*', '', 'g');
  if position(' or o.primary_venue_id in' in v_def) > 0 or position('= any (array(' in v_def) = 0 then
    raise exception 'P1 failed: propagate_venue_gate_to_organization is not the index-friendly form';
  end if;

  -- P2 the cron sweeps all twelve types, venue last, in COMMIT-separated statements
  select command into v_cmd from cron.job where jobname = 'dedup_truth_sweep' and active and schedule = '50 5 * * *';
  if v_cmd is null then
    raise exception 'P2 failed: dedup_truth_sweep cron missing or inactive';
  end if;
  select count(*) into v_bad
    from unnest(array['venue','event','marketplace','personality','city','hotel','milestone',
                      'organization','news','queer_village','country','group']) t
   where position('''' || t || '''' in v_cmd) = 0;
  if v_bad <> 0 or (length(v_cmd) - length(replace(v_cmd, 'commit;', ''))) / length('commit;') <> 3
     or position('''venue''' in v_cmd) < position('''news''' in v_cmd) then
    raise exception 'P2 failed: cron command does not cover all types in 4 committed groups with venue last';
  end if;

  -- P3 all three registry rows enabled with a counter that can trip again
  select count(*) into v_bad from public.admin_automations
   where slug in ('dedup_truth_sweep', 'review_jev', 'wf_marketplace_sync_merchants')
     and (not enabled or consecutive_failures <> 0);
  if v_bad <> 0 then
    raise exception 'P3 failed: % registry row(s) not restored', v_bad;
  end if;

  -- P4 the two cron automations are scheduled, active and run-tracked
  select count(*) into v_bad
    from public.admin_automations a
   where a.slug in ('review_jev', 'wf_marketplace_sync_merchants')
     and not exists (select 1 from cron.job j
                      where j.jobname = a.action->>'jobname' and j.active and j.schedule = a.schedule
                        and j.command ilike '%admin_automation_run_begin%');
  if v_bad <> 0 then
    raise exception 'P4 failed: % cron(s) missing, inactive or untracked', v_bad;
  end if;
end
$verify$;
