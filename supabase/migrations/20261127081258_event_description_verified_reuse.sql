-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127081258 with no repo file — the signature of
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
create table api_private.event_description_verified_edits (
  cache_key text primary key,
  title text not null,
  source text not null,
  description text not null,
  version text not null,
  verified_at timestamptz not null default now()
);
alter table api_private.event_description_verified_edits enable row level security;
revoke all on api_private.event_description_verified_edits from public,anon,authenticated;
grant select,insert on api_private.event_description_verified_edits to service_role;

create function public.event_description_cached_edit(p_title text,p_source text,p_version text)
returns text language sql stable security invoker set search_path='' as $$
  select c.description from api_private.event_description_verified_edits c
    where c.cache_key=md5(jsonb_build_array(p_title,p_source,p_version)::text)
      and c.title=p_title and c.source=p_source and c.version=p_version;
$$;
create function public.remember_event_description_edit(p_title text,p_source text,p_description text,p_version text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if nullif(btrim(p_title),'') is null or nullif(btrim(p_source),'') is null
    or nullif(btrim(p_description),'') is null or nullif(btrim(p_version),'') is null then
    raise exception 'Incomplete verified edit';
  end if;
  insert into api_private.event_description_verified_edits(cache_key,title,source,description,version)
    values(md5(jsonb_build_array(p_title,p_source,p_version)::text),p_title,p_source,p_description,p_version)
    on conflict do nothing;
end $$;
revoke all on function public.event_description_cached_edit(text,text,text) from public,anon,authenticated;
revoke all on function public.remember_event_description_edit(text,text,text,text) from public,anon,authenticated;
grant execute on function public.event_description_cached_edit(text,text,text) to service_role;
grant execute on function public.remember_event_description_edit(text,text,text,text) to service_role;

-- Only reuse edits accepted by the strong-verifier version, still present on
-- the original event. Earlier weak-verifier output is deliberately excluded.
insert into api_private.event_description_verified_edits(cache_key,title,source,description,version)
  select distinct on (b.original->>'title',b.original->>'description')
    md5(jsonb_build_array(b.original->>'title',b.original->>'description',b.version)::text),
    b.original->>'title',b.original->>'description',b.cleaned->>'description',b.version
  from api_private.event_description_backups b
  join public.events e on e.id=b.event_id
  join api_private.event_description_jobs j on j.event_id=e.id
  where b.version='2026.11.27.2' and b.cleaned->>'content_language'='en'
    and b.cleaned->>'description'=e.description and j.state='done'
    and b.original->>'title' is not null and b.original->>'description' is not null
  order by b.original->>'title',b.original->>'description',b.captured_at desc
  on conflict do nothing;

-- Up to twenty source rows, with only one model edit per invocation. Exact
-- previously verified copies can finish without another inference.
create or replace function public.claim_event_description_jobs(p_stage text default 'pending',p_limit integer default 100)
returns table(id uuid,title text,description text,content_language text,start_date timestamptz)
language plpgsql security invoker set search_path='' as $$
begin
  if p_stage not in ('pending','editorial') then raise exception 'Invalid stage'; end if;
  update api_private.event_description_jobs set state='review',issues=array['retry_limit'],updated_at=now()
    where state='working' and stage='editorial' and attempts>=3 and available_at<=now();
  return query with picked as (
    select j.event_id from api_private.event_description_jobs j
      where (j.state=p_stage or (j.state='working' and j.stage=p_stage))
        and j.available_at<=now() and (p_stage='pending' or j.attempts<3)
      order by j.priority desc,j.available_at,j.event_id
      for update skip locked limit greatest(1,least(p_limit,case when p_stage='editorial' then 20 else 500 end))
  ), claimed as (
    update api_private.event_description_jobs j set state='working',stage=p_stage,
      attempts=case when p_stage='editorial' then j.attempts+1 else j.attempts end,
      available_at=now()+interval '5 minutes',updated_at=now()
      from picked where j.event_id=picked.event_id returning j.event_id
  ) select e.id,e.title,e.description,e.content_language,e.start_date
    from public.events e join claimed c on e.id=c.event_id;
end $$;

create or replace function public.retry_event_description_job(p_id uuid,p_issue text)
returns void language sql security invoker set search_path='' as $$
  update api_private.event_description_jobs set
    state=case when p_issue in ('budget_unavailable','budget_exhausted','batch_yield') then 'editorial' when attempts>=3 then 'review' else 'editorial' end,
    attempts=case when p_issue in ('budget_unavailable','budget_exhausted','batch_yield') then greatest(0,attempts-1) else attempts end,
    issues=case when p_issue='batch_yield' then issues else array[p_issue] end,
    available_at=case when p_issue='budget_exhausted' then date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day 5 minutes'
      when p_issue='batch_yield' then now()+interval '10 seconds' else now()+interval '1 hour' end,
    updated_at=now()
    where event_id=p_id and state='working' and stage='editorial';
$$;

update public.admin_automations set action=jsonb_set(action,'{command}',to_jsonb(replace(action->>'command',
  '''batch_size'',1)','''batch_size'',20)'))),updated_at=now()
  where slug='event_description_editorial';
select cron.alter_job(j.jobid,command:=public.admin_automation_effective_command(a.slug,a.action->>'command'))
  from cron.job j join public.admin_automations a on a.slug=j.jobname
  where a.slug='event_description_editorial';
;
