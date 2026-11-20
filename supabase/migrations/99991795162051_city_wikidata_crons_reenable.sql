-- Re-enable city_alias_harvest and city_qid_gap_link (both auto-paused
-- 2026-10-29).
--
-- Neither was slow. Every failed run processed 1 city and stopped because
-- Wikidata answered maxlag; city-factual-backfill then replied HTTP 503, which
-- the run reaper counts as a failure, and three in a row tripped auto-pause.
-- The function now answers 200 + deferred:true for a retryable upstream
-- (2026-11-20.busy-upstream-defers), so a busy Wikidata no longer pauses them.
-- city_alias_harvest also drops batch 20 -> 5; city_qid_gap_link keeps 20,
-- which ran cleanly whenever Wikidata was not lagging.
--
-- The registry stays canonical: cron.schedule gets the wrapped command that
-- admin_automation_effective_command() derives, the same form
-- sync_automations_to_cron() would apply.
do $$
declare
  v_slug text;
  v_cmd text;
begin
  update public.admin_automations
     set action = jsonb_set(action, '{command}',
           to_jsonb(replace(action->>'command', '"batch_limit":20', '"batch_limit":5')))
   where slug = 'city_alias_harvest';

  foreach v_slug in array array['city_alias_harvest', 'city_qid_gap_link'] loop
    update public.admin_automations
       set enabled = true, consecutive_failures = 0
     where slug = v_slug;

    select public.admin_automation_effective_command(slug, action->>'command')
      into v_cmd
      from public.admin_automations where slug = v_slug;

    if v_cmd is null then
      raise notice '% not registered here; skipping cron', v_slug;
      continue;
    end if;

    perform cron.schedule(v_slug,
      (select schedule from public.admin_automations where slug = v_slug), v_cmd);

    if not exists (select 1 from cron.job where jobname = v_slug and active) then
      raise exception '% cron not active', v_slug;
    end if;
  end loop;

  if exists (select 1 from public.admin_automations where slug = 'city_alias_harvest'
               and position('"batch_limit":5' in action->>'command') = 0) then
    raise exception 'city_alias_harvest command does not carry batch_limit 5';
  end if;
end $$;

-- city_cost_of_living_backfill was retired on 2026-09-26 as "verified no
-- eligible work remains". That stopped being true as the corpus grew: 13,831
-- live cities hold an empty cost_of_living ('{}', not NULL), 13,805 of them
-- created after the retirement, and nothing else fills it. Hourly at 300 rows
-- clears that in ~2 days; once drained a run updates nothing. It is an rpc
-- automation (no action.command), so the cron is scheduled here directly.
do $$
begin
  if not exists (select 1 from public.admin_automations where slug = 'city_cost_of_living_backfill') then
    raise notice 'city_cost_of_living_backfill not registered here; skipping';
    return;
  end if;

  -- admin_automation_lifecycle_guard refuses to enable a 'completed' row, but
  -- allows moving it back to 'active' while it is still disabled.
  update public.admin_automations
     set lifecycle_state = 'active',
         capability_reason = 'No supported manual runner or truthful dry-run is registered'
   where slug = 'city_cost_of_living_backfill' and lifecycle_state = 'completed';

  update public.admin_automations
     set enabled = true,
         consecutive_failures = 0,
         schedule = '10 * * * *',
         description = 'Derives a coarse cost band from the country GDP per capita. No numeric indices — the source cannot support them. Re-enabled 2026-11-20: new cities arrive with an empty band.'
   where slug = 'city_cost_of_living_backfill';

  perform cron.schedule('city_cost_of_living_backfill', '10 * * * *',
    'SELECT public.run_city_cost_of_living_backfill(300);');

  if not exists (select 1 from cron.job where jobname = 'city_cost_of_living_backfill' and active) then
    raise exception 'city_cost_of_living_backfill cron not active';
  end if;
end $$;
