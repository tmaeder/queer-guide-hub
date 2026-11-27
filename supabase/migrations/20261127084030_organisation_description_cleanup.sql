-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127084030 with no repo file — the signature of
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
create table api_private.organisation_description_jobs (
  entity_table text not null check(entity_table in ('venues','organizations')),
  entity_id uuid not null,
  source_field text not null check(source_field in ('description','editorial_long','editorial_hook')),
  state text not null default 'pending' check(state in ('pending','editorial','working','done','review')),
  stage text not null default 'pending' check(stage in ('pending','editorial')),
  lease uuid,
  attempts integer not null default 0,
  issues text[] not null default '{}',
  priority integer not null default 0,
  available_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(entity_table,entity_id,source_field),
  check(entity_table='organizations' or source_field='description')
);
create index organisation_description_due on api_private.organisation_description_jobs(state,priority desc,available_at);
create table api_private.organisation_description_backups (
  entity_table text not null, entity_id uuid not null, source_field text not null,
  source_hash text not null, original jsonb not null, cleaned jsonb not null,
  version text not null, captured_at timestamptz not null default now(),
  primary key(entity_table,entity_id,source_field,source_hash)
);
create table api_private.organisation_description_verified_edits (
  cache_key text primary key, name text not null, source_field text not null,
  source text not null, description text not null, version text not null,
  verified_at timestamptz not null default now()
);
alter table api_private.organisation_description_jobs enable row level security;
alter table api_private.organisation_description_backups enable row level security;
alter table api_private.organisation_description_verified_edits enable row level security;
revoke all on api_private.organisation_description_jobs,api_private.organisation_description_backups,api_private.organisation_description_verified_edits from public,anon,authenticated;
grant select,insert,update,delete on api_private.organisation_description_jobs to service_role;
grant select,insert on api_private.organisation_description_backups,api_private.organisation_description_verified_edits to service_role;

-- Closed table/field allowlists are enforced before any dynamic SQL.
create function api_private.organisation_description_source(p_table text,p_id uuid,p_field text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r jsonb;
begin
  if p_table not in ('venues','organizations') or p_table is null or p_field is null
    or p_field not in ('description','editorial_long','editorial_hook')
    or (p_table='venues' and p_field<>'description') then raise exception 'Invalid source'; end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1',p_table) into r using p_id;
  if r is null then return null; end if;
  return jsonb_build_object('name',r->'name','description',r->p_field,
    'content_language',case when p_table='venues' then r->'content_language' else 'null'::jsonb end,
    'duplicate_of_id',r->'duplicate_of_id',
    'status',case when p_table='venues' then r->'review_status' else r->'status' end);
end $$;
revoke all on function api_private.organisation_description_source(text,uuid,text) from public,anon,authenticated;
grant execute on function api_private.organisation_description_source(text,uuid,text) to service_role;

create function api_private.enqueue_organisation_description() returns trigger
language plpgsql security definer set search_path='' as $$
declare field text; r jsonb; old_r jsonb;
begin
  if TG_OP='DELETE' then
    delete from api_private.organisation_description_jobs where entity_table=TG_TABLE_NAME and entity_id=OLD.id;
    return OLD;
  end if;
  r:=to_jsonb(NEW);
  if TG_OP='UPDATE' then old_r:=to_jsonb(OLD); end if;
  foreach field in array case when TG_TABLE_NAME='venues' then array['description'] else array['description','editorial_long','editorial_hook'] end loop
    if TG_OP='UPDATE' and r->field is not distinct from old_r->field and r->'name' is not distinct from old_r->'name'
      and r->'content_language' is not distinct from old_r->'content_language'
      and r->'duplicate_of_id' is not distinct from old_r->'duplicate_of_id'
      and r->'status' is not distinct from old_r->'status' and r->'review_status' is not distinct from old_r->'review_status' then continue; end if;
    if nullif(btrim(r->>field),'') is null or r->>'duplicate_of_id' is not null
      or coalesce(r->>'review_status',r->>'status','')='archived' then
      delete from api_private.organisation_description_jobs where entity_table=TG_TABLE_NAME and entity_id=NEW.id and source_field=field;
      update public.review_queue set status='resolved',resolved_at=now() where entity_id=NEW.id
        and entity_type=case when TG_TABLE_NAME='venues' then 'venue' else 'organization' end
        and review_type='description_cleanup_review' and details->>'field'=field and status='pending';
      continue;
    end if;
    insert into api_private.organisation_description_jobs(entity_table,entity_id,source_field,priority)
      values(TG_TABLE_NAME,NEW.id,field,case when coalesce(r->>'review_status',r->>'status') in ('approved','active') then 10 else 0 end)
      on conflict(entity_table,entity_id,source_field) do update set state='pending',stage='pending',lease=null,
        attempts=0,issues='{}',priority=excluded.priority,available_at=now(),updated_at=now();
  end loop;
  return NEW;
end $$;
revoke all on function api_private.enqueue_organisation_description() from public,anon,authenticated;
create trigger venues_description_cleanup after insert or delete or update of description,name,content_language,duplicate_of_id,review_status on public.venues
  for each row execute function api_private.enqueue_organisation_description();
create trigger organizations_description_cleanup after insert or delete or update of description,editorial_long,editorial_hook,name,duplicate_of_id,status on public.organizations
  for each row execute function api_private.enqueue_organisation_description();

create function api_private.sync_organisation_description_review() returns trigger
language plpgsql security invoker set search_path='' as $$
declare kind text:=case when NEW.entity_table='venues' then 'venue' else 'organization' end;
begin
  if NEW.state='review' then
    update public.review_queue set details=jsonb_build_object('source','organisation-description-cleanup','field',NEW.source_field,'issues',NEW.issues)
      where entity_type=kind and entity_id=NEW.entity_id and review_type='description_cleanup_review'
        and details->>'field'=NEW.source_field and status='pending';
    if not found then
      insert into public.review_queue(entity_type,entity_id,review_type,status,details)
        values(kind,NEW.entity_id,'description_cleanup_review','pending',jsonb_build_object('source','organisation-description-cleanup','field',NEW.source_field,'issues',NEW.issues));
    end if;
  elsif NEW.state='done' then
    update public.review_queue set status='resolved',resolved_at=now(),details=details||'{"resolution":"description_cleanup_completed"}'::jsonb
      where entity_type=kind and entity_id=NEW.entity_id and review_type='description_cleanup_review'
        and details->>'field'=NEW.source_field and status='pending';
  end if;
  return NEW;
end $$;
revoke all on function api_private.sync_organisation_description_review() from public,anon,authenticated;
create trigger organisation_description_review after update of state on api_private.organisation_description_jobs
  for each row when(OLD.state is distinct from NEW.state) execute function api_private.sync_organisation_description_review();

create function public.preview_organisation_description_jobs(p_stage text default 'pending',p_limit integer default 100)
returns table(entity_table text,id uuid,source_field text,lease uuid,name text,description text,content_language text,expected jsonb)
language sql stable security invoker set search_path='' as $$
  select j.entity_table,j.entity_id,j.source_field,j.lease,r.s->>'name',r.s->>'description',r.s->>'content_language',r.s
  from api_private.organisation_description_jobs j
  cross join lateral (select api_private.organisation_description_source(j.entity_table,j.entity_id,j.source_field) s) r
  where j.state=p_stage and r.s is not null
  order by j.priority desc,j.available_at,j.entity_table,j.entity_id,j.source_field limit greatest(1,least(p_limit,100));
$$;
create function public.claim_organisation_description_jobs(p_stage text default 'pending',p_limit integer default 100)
returns table(entity_table text,id uuid,source_field text,lease uuid,name text,description text,content_language text,expected jsonb)
language plpgsql security invoker set search_path='' as $$
begin
  if p_stage is null or p_stage not in ('pending','editorial') then raise exception 'Invalid stage'; end if;
  update api_private.organisation_description_jobs set state='review',issues=array['retry_limit'],lease=null,updated_at=now()
    where state='working' and stage='editorial' and attempts>=3 and available_at<=now();
  return query with picked as (
    select j.entity_table,j.entity_id,j.source_field from api_private.organisation_description_jobs j
    where (j.state=p_stage or (j.state='working' and j.stage=p_stage)) and j.available_at<=now()
      and (p_stage='pending' or j.attempts<3)
    order by j.priority desc,j.available_at,j.entity_table,j.entity_id,j.source_field
    for update skip locked limit greatest(1,least(p_limit,case when p_stage='editorial' then 20 else 100 end))
  ), claimed as (
    update api_private.organisation_description_jobs j set state='working',stage=p_stage,lease=gen_random_uuid(),
      attempts=case when p_stage='editorial' then j.attempts+1 else j.attempts end,
      available_at=now()+interval '5 minutes',updated_at=now()
    from picked p where (j.entity_table,j.entity_id,j.source_field)=(p.entity_table,p.entity_id,p.source_field)
    returning j.*
  ) select c.entity_table,c.entity_id,c.source_field,c.lease,r.s->>'name',r.s->>'description',r.s->>'content_language',r.s
    from claimed c cross join lateral(select api_private.organisation_description_source(c.entity_table,c.entity_id,c.source_field) s) r
    where r.s is not null;
end $$;

create function public.apply_organisation_description_cleanup(p_patches jsonb,p_version text)
returns integer language plpgsql security invoker set search_path='' as $$
declare p jsonb; original jsonb; j api_private.organisation_description_jobs%rowtype; n integer:=0; language text;
begin
  if jsonb_typeof(p_patches) is distinct from 'array' or jsonb_array_length(p_patches)>100 then raise exception 'Expected at most 100 patches'; end if;
  for p in select value from jsonb_array_elements(p_patches) loop
    if not(p ?& array['entity_table','id','source_field','lease','expected','description','state','issues'])
      or p->>'state' is null or p->>'state' not in ('done','editorial','review') then raise exception 'Invalid patch'; end if;
    -- Lock source before queue, matching the order followed by editor triggers.
    original:=api_private.organisation_description_source(p->>'entity_table',(p->>'id')::uuid,p->>'source_field');
    if original is null then continue; end if;
    execute format('select 1 from public.%I where id=$1 for update',p->>'entity_table') using (p->>'id')::uuid;
    original:=api_private.organisation_description_source(p->>'entity_table',(p->>'id')::uuid,p->>'source_field');
    select * into j from api_private.organisation_description_jobs where entity_table=p->>'entity_table'
      and entity_id=(p->>'id')::uuid and source_field=p->>'source_field' for update;
    if not found or j.state<>'working' or j.lease is distinct from (p->>'lease')::uuid then continue; end if;
    if original is distinct from p->'expected' then
      update api_private.organisation_description_jobs set state='pending',stage='pending',lease=null,attempts=0,available_at=now()
        where (entity_table,entity_id,source_field)=(j.entity_table,j.entity_id,j.source_field);
      continue;
    end if;
    if original->>'duplicate_of_id' is not null or original->>'status'='archived' then
      delete from api_private.organisation_description_jobs where (entity_table,entity_id,source_field)=(j.entity_table,j.entity_id,j.source_field);
      continue;
    end if;
    language:=case when j.entity_table='venues' and p->>'language'='en' then 'en' else original->>'content_language' end;
    if original->>'description' is distinct from p->>'description' or language is distinct from original->>'content_language' then
      if nullif(btrim(p->>'description'),'') is null then raise exception 'Cannot erase source'; end if;
      insert into api_private.organisation_description_backups(entity_table,entity_id,source_field,source_hash,original,cleaned,version)
        values(j.entity_table,j.entity_id,j.source_field,md5(original::text),original,
          jsonb_build_object('description',p->>'description','content_language',language),p_version) on conflict do nothing;
      if j.entity_table='venues' then
        update public.venues set description=p->>'description',content_language=language where id=j.entity_id;
      else
        execute format('update public.organizations set %I=$1 where id=$2',j.source_field) using p->>'description',j.entity_id;
      end if;
    end if;
    -- Our own source update can enqueue pending work: finish it atomically.
    update api_private.organisation_description_jobs set state=p->>'state',stage=case when p->>'state'='editorial' then 'editorial' else j.stage end,
      lease=null,issues=array(select jsonb_array_elements_text(p->'issues')),available_at=now(),updated_at=now()
      where (entity_table,entity_id,source_field)=(j.entity_table,j.entity_id,j.source_field);
    n:=n+1;
  end loop;
  return n;
end $$;

create function public.retry_organisation_description_job(p_table text,p_id uuid,p_field text,p_lease uuid,p_issue text)
returns void language sql security invoker set search_path='' as $$
  update api_private.organisation_description_jobs set
    state=case when p_issue in ('budget_unavailable','budget_exhausted','batch_yield') then 'editorial' when attempts>=3 then 'review' else 'editorial' end,
    attempts=case when p_issue in ('budget_unavailable','budget_exhausted','batch_yield') then greatest(0,attempts-1) else attempts end,
    lease=null,issues=case when p_issue='batch_yield' then issues else array[p_issue] end,
    available_at=case when p_issue='budget_exhausted' then date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day 5 minutes'
      when p_issue='batch_yield' then now()+interval '10 seconds' else now()+interval '1 hour' end,updated_at=now()
    where entity_table=p_table and entity_id=p_id and source_field=p_field and lease=p_lease and state='working' and stage='editorial';
$$;
create function public.organisation_description_cached_edit(p_name text,p_field text,p_source text,p_version text)
returns text language sql stable security invoker set search_path='' as $$
  select description from api_private.organisation_description_verified_edits where cache_key=md5(jsonb_build_array(p_name,p_field,p_source,p_version)::text)
    and name=p_name and source_field=p_field and source=p_source and version=p_version;
$$;
create function public.remember_organisation_description_edit(p_name text,p_field text,p_source text,p_version text,p_description text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if nullif(btrim(p_name),'') is null or nullif(btrim(p_source),'') is null or nullif(btrim(p_description),'') is null or nullif(btrim(p_version),'') is null
    or p_field is null or p_field not in ('description','editorial_long','editorial_hook') then raise exception 'Invalid verified edit'; end if;
  insert into api_private.organisation_description_verified_edits(cache_key,name,source_field,source,description,version)
    values(md5(jsonb_build_array(p_name,p_field,p_source,p_version)::text),p_name,p_field,p_source,p_description,p_version) on conflict do nothing;
end $$;
revoke all on function public.preview_organisation_description_jobs(text,integer),public.claim_organisation_description_jobs(text,integer),public.apply_organisation_description_cleanup(jsonb,text),public.retry_organisation_description_job(text,uuid,text,uuid,text),public.organisation_description_cached_edit(text,text,text,text),public.remember_organisation_description_edit(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.preview_organisation_description_jobs(text,integer),public.claim_organisation_description_jobs(text,integer),public.apply_organisation_description_cleanup(jsonb,text),public.retry_organisation_description_job(text,uuid,text,uuid,text),public.organisation_description_cached_edit(text,text,text,text),public.remember_organisation_description_edit(text,text,text,text,text) to service_role;

insert into api_private.organisation_description_jobs(entity_table,entity_id,source_field,priority)
 select 'venues',id,'description',case when review_status='approved' then 10 else 0 end from public.venues
 where nullif(btrim(description),'') is not null and duplicate_of_id is null and review_status is distinct from 'archived';
insert into api_private.organisation_description_jobs(entity_table,entity_id,source_field,priority)
 select 'organizations',o.id,f,case when status='active' then 10 else 0 end from public.organizations o
 cross join unnest(array['description','editorial_long','editorial_hook']) f
 where nullif(btrim(to_jsonb(o)->>f),'') is not null and duplicate_of_id is null and status is distinct from 'archived';
insert into public.llm_budget(caller_key,daily_cap) values('organisation-description-cleanup',1000) on conflict(caller_key) do nothing;
;
