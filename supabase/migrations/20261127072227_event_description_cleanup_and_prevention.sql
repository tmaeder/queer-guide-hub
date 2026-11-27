create table api_private.event_description_jobs (
  event_id uuid primary key references public.events(id) on delete cascade,
  state text not null default 'pending' check(state in ('pending','editorial','working','done','review')),
  stage text not null default 'pending',
  attempts integer not null default 0,
  issues text[] not null default '{}',
  priority integer not null default 0,
  available_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_description_jobs_due on api_private.event_description_jobs(state,priority desc,available_at,event_id);
alter table api_private.event_description_jobs enable row level security;
revoke all on api_private.event_description_jobs from public,anon,authenticated;
grant select,insert,update,delete on api_private.event_description_jobs to service_role;

create table api_private.event_description_backups (
  event_id uuid not null,
  source_hash text not null,
  original jsonb not null,
  cleaned jsonb not null,
  version text not null,
  captured_at timestamptz not null default now(),
  primary key(event_id,source_hash)
);
alter table api_private.event_description_backups enable row level security;
revoke all on api_private.event_description_backups from public,anon,authenticated;
grant select,insert on api_private.event_description_backups to service_role;

-- Held edits appear in the existing event-quality inbox, not a hidden queue.
create function api_private.sync_event_description_review() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if NEW.state='review' then
    insert into public.event_quality_issues(event_id,dimension,issue_code,detector,severity,evidence,evidence_hash)
      values(NEW.event_id,'validity','description_cleanup_review','event-description-cleanup','medium',
        jsonb_build_object('issues',NEW.issues),md5(array_to_string(NEW.issues,',')))
      on conflict(event_id,issue_code) where status='open' do update set
        evidence=excluded.evidence,evidence_hash=excluded.evidence_hash,last_seen_at=now();
  elsif NEW.state='done' then
    update public.event_quality_issues set status='resolved',resolved_at=now(),resolution='Description cleanup completed'
      where event_id=NEW.event_id and issue_code='description_cleanup_review' and status='open';
  end if;
  return NEW;
end $$;
revoke all on function api_private.sync_event_description_review() from public,anon,authenticated;
create trigger sync_event_description_review after update of state on api_private.event_description_jobs
  for each row when(OLD.state is distinct from NEW.state) execute function api_private.sync_event_description_review();

-- A private trigger function needs definer rights to enqueue writes made by
-- ordinary editors/importers. It has no caller-supplied SQL or public entrypoint.
create function api_private.enqueue_event_description() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if nullif(btrim(NEW.description),'') is null then
    delete from api_private.event_description_jobs where event_id=NEW.id;
    return NEW;
  end if;
  insert into api_private.event_description_jobs(event_id,priority)
    values(NEW.id,case when NEW.status='active' then 10 else 0 end)
    on conflict(event_id) do update set state='pending',stage='pending',attempts=0,
      issues='{}',priority=excluded.priority,available_at=now(),updated_at=now();
  return NEW;
end $$;
revoke all on function api_private.enqueue_event_description() from public,anon,authenticated;
create trigger events_description_cleanup_insert after insert on public.events
  for each row execute function api_private.enqueue_event_description();
create trigger events_description_cleanup_update after update of description,title on public.events
  for each row when (OLD.description is distinct from NEW.description or OLD.title is distinct from NEW.title)
  execute function api_private.enqueue_event_description();

create function public.claim_event_description_jobs(p_stage text default 'pending',p_limit integer default 100)
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
      for update skip locked limit greatest(1,least(p_limit,case when p_stage='editorial' then 5 else 500 end))
  ), claimed as (
    update api_private.event_description_jobs j set state='working',stage=p_stage,
      attempts=case when p_stage='editorial' then j.attempts+1 else j.attempts end,
      available_at=now()+interval '5 minutes',updated_at=now()
      from picked where j.event_id=picked.event_id returning j.event_id
  ) select e.id,e.title,e.description,e.content_language,e.start_date
    from public.events e join claimed c on e.id=c.event_id;
end $$;
revoke all on function public.claim_event_description_jobs(text,integer) from public,anon,authenticated;
grant execute on function public.claim_event_description_jobs(text,integer) to service_role;

-- Compare source, back it up and update in the same transaction. Null is kept.
create function public.apply_event_description_cleanup(p_patches jsonb,p_version text)
returns integer language plpgsql security invoker set search_path='' as $$
declare p jsonb; e public.events%rowtype; applied integer:=0; target_state text; original jsonb;
begin
  if jsonb_typeof(p_patches) is distinct from 'array' or jsonb_array_length(p_patches)>500 then raise exception 'Expected at most 500 patches'; end if;
  for p in select value from jsonb_array_elements(p_patches) loop
    target_state:=p->>'state';
    if target_state is null or target_state not in ('done','editorial','review') then raise exception 'Invalid state'; end if;
    if not (p ?& array['id','expected','description','state','issues']) then raise exception 'Incomplete patch'; end if;
    select * into e from public.events where id=(p->>'id')::uuid for update;
    if not found then continue; end if;
    original:=jsonb_build_object('title',e.title,'description',e.description,'content_language',e.content_language,'start_date',e.start_date);
    if original is distinct from p->'expected' then
      update api_private.event_description_jobs set state='pending',stage='pending',attempts=0,available_at=now() where event_id=e.id;
      continue;
    end if;
    if e.description is distinct from p->>'description' or (p->>'language'='en' and e.content_language is distinct from 'en') then
      if e.description is null or nullif(btrim(p->>'description'),'') is null then raise exception 'Cannot erase description'; end if;
      insert into api_private.event_description_backups(event_id,source_hash,original,cleaned,version)
        values(e.id,md5(original::text),original,jsonb_build_object('description',p->>'description','content_language',coalesce(p->>'language',e.content_language)),p_version)
        on conflict do nothing;
      update public.events set description=p->>'description',content_language=coalesce(p->>'language',content_language)
        where id=e.id;
    end if;
    update api_private.event_description_jobs set state=target_state,stage=case when target_state='editorial' then 'editorial' else stage end,
      issues=array(select jsonb_array_elements_text(p->'issues')),available_at=now(),updated_at=now()
      where event_id=e.id;
    applied:=applied+1;
  end loop;
  return applied;
end $$;
revoke all on function public.apply_event_description_cleanup(jsonb,text) from public,anon,authenticated;
grant execute on function public.apply_event_description_cleanup(jsonb,text) to service_role;

create function public.retry_event_description_job(p_id uuid,p_issue text)
returns void language sql security invoker set search_path='' as $$
  update api_private.event_description_jobs set state=case when attempts>=3 then 'review' else 'editorial' end,
    issues=array[p_issue],available_at=now()+interval '1 hour',updated_at=now()
    where event_id=p_id and state='working' and stage='editorial';
$$;
revoke all on function public.retry_event_description_job(uuid,text) from public,anon,authenticated;
grant execute on function public.retry_event_description_job(uuid,text) to service_role;

-- One-time corpus scan; active listings are always processed first. Writes
-- thereafter enter via the trigger, including re-imports of old source text.
insert into api_private.event_description_jobs(event_id,priority)
 select id,case when status='active' then 10 else 0 end from public.events
 where nullif(btrim(description),'') is not null and duplicate_of_id is null;

insert into public.llm_budget(caller_key,daily_cap) values('event-description-cleanup',1000) on conflict(caller_key) do nothing;
