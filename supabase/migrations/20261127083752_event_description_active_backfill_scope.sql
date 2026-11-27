-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127083752 with no repo file — the signature of
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
-- Explicit scope prevents historical rows from taking a model slot when fewer
-- than one full batch of active events remains. Preserve row priority on return.
create function public.claim_event_description_jobs(p_stage text,p_limit integer,p_active_only boolean)
returns table(id uuid,title text,description text,content_language text,start_date timestamptz)
language plpgsql security invoker set search_path='' as $$
begin
  if p_stage not in ('pending','editorial') then raise exception 'Invalid stage'; end if;
  update api_private.event_description_jobs set state='review',issues=array['retry_limit'],updated_at=now()
    where state='working' and stage='editorial' and attempts>=3 and available_at<=now();
  return query with picked as (
    select j.event_id from api_private.event_description_jobs j
      where (j.state=p_stage or (j.state='working' and j.stage=p_stage))
        and (not coalesce(p_active_only,false) or j.priority>0)
        and j.available_at<=now() and (p_stage='pending' or j.attempts<3)
      order by j.priority desc,j.available_at,j.event_id
      for update skip locked limit greatest(1,least(p_limit,case when p_stage='editorial' then 20 else 500 end))
  ), claimed as (
    update api_private.event_description_jobs j set state='working',stage=p_stage,
      attempts=case when p_stage='editorial' then j.attempts+1 else j.attempts end,
      available_at=now()+interval '5 minutes',updated_at=now()
      from picked where j.event_id=picked.event_id returning j.event_id
  ) select e.id,e.title,e.description,e.content_language,e.start_date
    from public.events e join claimed c on e.id=c.event_id
    join api_private.event_description_jobs j on j.event_id=e.id
    order by j.priority desc,e.id;
end $$;
revoke all on function public.claim_event_description_jobs(text,integer,boolean) from public,anon,authenticated;
grant execute on function public.claim_event_description_jobs(text,integer,boolean) to service_role;

create or replace function public.claim_event_description_jobs(p_stage text default 'pending',p_limit integer default 100)
returns table(id uuid,title text,description text,content_language text,start_date timestamptz)
language sql security invoker set search_path='' as $$
  select * from public.claim_event_description_jobs(p_stage,p_limit,false);
$$;
;
