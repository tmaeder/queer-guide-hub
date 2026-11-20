-- Re-enable city_alias_harvest (auto-paused 2026-10-29).
--
-- It was not slow. Every failed run processed 1 city and stopped because
-- Wikidata answered maxlag; city-factual-backfill then replied HTTP 503, which
-- the run reaper counts as a failure, and three in a row tripped auto-pause.
-- The function now answers 200 + deferred:true for a retryable upstream
-- (2026-11-20.busy-upstream-defers), so a busy Wikidata no longer pauses it.
-- Batch 20 -> 5 so each tick asks Wikidata for less.
--
-- The registry stays canonical: cron.schedule gets the wrapped command that
-- admin_automation_effective_command() derives, the same form
-- sync_automations_to_cron() would apply.
do $$
declare
  v_cmd text;
begin
  update public.admin_automations
     set enabled = true,
         consecutive_failures = 0,
         action = jsonb_set(action, '{command}',
           to_jsonb(replace(action->>'command', '"batch_limit":20', '"batch_limit":5')))
   where slug = 'city_alias_harvest';

  select public.admin_automation_effective_command(slug, action->>'command')
    into v_cmd
    from public.admin_automations where slug = 'city_alias_harvest';

  if v_cmd is null then
    raise notice 'city_alias_harvest not registered here; skipping cron';
    return;
  end if;
  if position('"batch_limit":5' in v_cmd) = 0 then
    raise exception 'city_alias_harvest command does not carry batch_limit 5';
  end if;

  perform cron.schedule('city_alias_harvest',
    (select schedule from public.admin_automations where slug = 'city_alias_harvest'), v_cmd);

  if not exists (select 1 from cron.job where jobname = 'city_alias_harvest' and active) then
    raise exception 'city_alias_harvest cron not active';
  end if;
end $$;
