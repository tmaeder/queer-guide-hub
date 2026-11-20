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
