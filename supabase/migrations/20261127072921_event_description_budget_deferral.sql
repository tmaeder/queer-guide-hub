-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127072921 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- A spend limit is deferred work, never evidence that the event is uneditable.
create or replace function public.retry_event_description_job(p_id uuid,p_issue text)
returns void language sql security invoker set search_path='' as $$
  update api_private.event_description_jobs set
    state=case when p_issue in ('budget_unavailable','budget_exhausted') then 'editorial' when attempts>=3 then 'review' else 'editorial' end,
    attempts=case when p_issue in ('budget_unavailable','budget_exhausted') then greatest(0,attempts-1) else attempts end,
    issues=array[p_issue],
    available_at=case when p_issue='budget_exhausted' then date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day 5 minutes' else now()+interval '1 hour' end,
    updated_at=now()
    where event_id=p_id and state='working' and stage='editorial';
$$;
revoke all on function public.retry_event_description_job(uuid,text) from public,anon,authenticated;
grant execute on function public.retry_event_description_job(uuid,text) to service_role;
;
