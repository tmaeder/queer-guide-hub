-- Five batch functions (marketplace-categorize, marketplace-relevance-rescore,
-- marketplace-translate, marketplace-enrich, personality-refresh) ran a service-role client and paid
-- LLM calls behind nothing but the platform's verify_jwt — which accepts the
-- PUBLIC anon key shipped in the frontend bundle. Their crons authenticated with
-- exactly that key, so anyone could trigger writes and LLM spend.
--
-- The functions now call requireInternalOrAdmin(), like their siblings
-- (marketplace-relevance, marketplace-tag-backfill). This migration adds the
-- X-Internal-Secret header (vault 'internal_invoke_secret', the pattern 97
-- active crons already use) to their crons. Header first, deploy second:
-- db push runs before functions deploy, and the old code ignores the header.
--
-- Token substitution, never an argument-list parse (CLAUDE.md, cron tracking):
-- append the header after the Content-Type pair in jsonb_build_object.

do $$
declare
  v_hdr constant text :=
    $h$, 'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')$h$;
  v_re  constant text := $r$('Content-Type'\s*,\s*'application/json')$r$;
  r record;
  v_cmd text;
begin
  if not exists (select 1 from vault.secrets where name = 'internal_invoke_secret') then
    raise exception 'vault secret internal_invoke_secret missing';
  end if;

  -- 4 crons with no registry command (admin_automations type 'edge'): cron.job is canonical.
  for r in
    select jobid, command from cron.job
    where jobname in ('marketplace_categorize_weekly','marketplace_relevance_rescore_weekly','marketplace_translate_titles','marketplace_enrich_weekly')
      and command !~* 'x-internal-secret'
  loop
    v_cmd := regexp_replace(r.command, v_re, '\1' || v_hdr);
    if v_cmd = r.command then raise exception 'no Content-Type anchor in cron %', r.jobid; end if;
    perform cron.alter_job(r.jobid, command := v_cmd);
  end loop;

  -- personality_refresh: registry is canonical; re-derive the wrapped live command
  -- now rather than waiting for the nightly sync (the function would 401 until then).
  select action->>'command' into v_cmd from admin_automations where slug = 'personality_refresh';
  if v_cmd is not null and v_cmd !~* 'x-internal-secret' then
    v_cmd := regexp_replace(v_cmd, v_re, '\1' || v_hdr);
    if v_cmd !~* 'x-internal-secret' then raise exception 'no Content-Type anchor in personality_refresh'; end if;
    update admin_automations set action = jsonb_set(action, '{command}', to_jsonb(v_cmd)) where slug = 'personality_refresh';
    perform cron.alter_job(j.jobid, command := public.admin_automation_effective_command('personality_refresh', v_cmd))
      from cron.job j where j.jobname = 'personality-refresh';
  end if;
end $$;

do $verify$
declare v_bad int;
begin
  select count(*) into v_bad from cron.job
  where jobname in ('marketplace_categorize_weekly','marketplace_relevance_rescore_weekly',
                    'marketplace_translate_titles','marketplace_enrich_weekly','personality-refresh')
    and active and command !~* 'x-internal-secret';
  if v_bad <> 0 then raise exception 'gate migration: % active cron(s) still lack x-internal-secret', v_bad; end if;
end $verify$;
