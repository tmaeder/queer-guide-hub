-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261127142157 with no repo file — the signature of
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
-- Durable logo checks, evidence, rollback history, and human review.
insert into public.logo_platform_domains(value,match_mode,class) values
 ('translate.google.com','suffix','aggregator'),
 ('helloasso.com','suffix','aggregator')
on conflict do nothing;
insert into public.logo_denied_marks(sha256,label,note) values
 ('525b075474e7f890985c8e0a2cadc3d358f58ad43888c83347ec0406f88bb46b','Google','Visually confirmed Google G on unrelated entities; translation-wrapper lookup.'),
 ('6dd99eff3e8e694a6096c02ae9d508a452ae75838194cc1ef06d42ebfc5ed514','HelloAsso','Visually confirmed HelloAsso platform mark on unrelated associations.')
on conflict do nothing;

create table public.logo_quality_jobs (
 entity_table text not null check(entity_table in ('venues','events','organizations','marketplace_brands')),
 entity_id uuid not null,
 entity_name text not null,
 expected_url text,
 expected_website text,
 status text not null default 'pending' check(status in ('pending','processing','retry','verified','repaired','review','quarantined','superseded')),
 attempts integer not null default 0,
 lease uuid,
 updated_at timestamptz not null default now(),
 checked_at timestamptz,
 candidate_url text,
 reason text,
 evidence jsonb not null default '{}',
 primary key(entity_table,entity_id)
);
create index logo_quality_jobs_worklist on public.logo_quality_jobs(status,attempts,updated_at);
alter table public.logo_quality_jobs enable row level security;
revoke all on public.logo_quality_jobs from anon,authenticated;
grant all on public.logo_quality_jobs to service_role;
grant select on public.logo_quality_jobs to authenticated;
create policy logo_quality_jobs_admin on public.logo_quality_jobs for select to authenticated using(public.has_role_jwt('admin'));

create table public.logo_quality_history (
 id uuid primary key default gen_random_uuid(),
 entity_table text not null,
 entity_id uuid not null,
 previous_url text,
 replacement_url text,
 previous_website text,
 outcome text not null,
 evidence jsonb not null,
 created_at timestamptz not null default now()
);
create index logo_quality_history_entity on public.logo_quality_history(entity_table,entity_id,created_at);
alter table public.logo_quality_history enable row level security;
revoke all on public.logo_quality_history from anon,authenticated;
grant all on public.logo_quality_history to service_role;
grant select on public.logo_quality_history to authenticated;
create policy logo_quality_history_admin on public.logo_quality_history for select to authenticated using(public.has_role_jwt('admin'));

-- An importer or CMS edit automatically becomes eligible for checking. Known
-- bad hashes are removed immediately; customer images on CMS CDNs are allowed.
create function public.logo_quality_enqueue() returns trigger language plpgsql
security definer set search_path='' as $$
declare j jsonb := to_jsonb(new); old_url text := j->>'logo_url';
begin
 if current_setting('app.logo_quality_writer',true)='on' then return new; end if;
 if new.logo_url is not null and public.logo_mark_denied(new.logo_url) then
   new.logo_url := null;
 end if;
 if tg_op='UPDATE' and new.logo_url is not distinct from old.logo_url and new.website is not distinct from old.website then return new; end if;
 if new.logo_url is null and new.website is null and old_url is null then return new; end if;
 insert into public.logo_quality_jobs(entity_table,entity_id,entity_name,expected_url,expected_website,evidence)
 values(tg_table_name,new.id,coalesce(j->>'name',j->>'title',j->>'display_name',''),new.logo_url,new.website,
   case when old_url is distinct from new.logo_url then jsonb_build_object('blocked_url',old_url) else '{}'::jsonb end)
 on conflict(entity_table,entity_id) do update set
   entity_name=excluded.entity_name,expected_url=excluded.expected_url,expected_website=excluded.expected_website,
   status='pending',attempts=0,lease=null,updated_at=now(),checked_at=null,candidate_url=null,reason=null,evidence=excluded.evidence;
 if old_url is distinct from new.logo_url then
   insert into public.logo_quality_history(entity_table,entity_id,previous_url,replacement_url,previous_website,outcome,evidence)
   values(tg_table_name,new.id,old_url,new.logo_url,new.website,'write_guard',jsonb_build_object('reason','known_denied_mark'));
   if not exists(select 1 from public.review_queue where entity_id=new.id and review_type='logo_quality' and status='pending') then
     insert into public.review_queue(entity_type,entity_id,review_type,details)
     values(case tg_table_name when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' else 'marketplace_brand' end,
       new.id,'logo_quality',jsonb_build_object('title',coalesce(j->>'name',j->>'title',j->>'display_name',''),
       'field','logo_url','previous_url',old_url,'current_url',null,'reason','known_platform_or_cms_mark_removed','website',new.website));
   end if;
 end if;
 return new;
end $$;
revoke all on function public.logo_quality_enqueue() from public,anon,authenticated;

do $$ declare t text; begin
 foreach t in array array['venues','events','organizations','marketplace_brands'] loop
   execute format('create trigger zz_logo_quality_guard before insert or update of logo_url,website on public.%I for each row execute function public.logo_quality_enqueue()',t);
 end loop;
end $$;

-- Snapshot existing logos, including the old URL needed for conflict checking.
insert into public.logo_quality_jobs(entity_table,entity_id,entity_name,expected_url,expected_website)
 select 'venues',id,name,logo_url,website from public.venues where logo_url is not null and duplicate_of_id is null
 union all select 'events',id,title,logo_url,website from public.events where logo_url is not null and duplicate_of_id is null
 union all select 'organizations',id,name,logo_url,website from public.organizations where logo_url is not null
 union all select 'marketplace_brands',id,display_name,logo_url,website from public.marketplace_brands where logo_url is not null
on conflict do nothing;

-- Remove only marks already visually identified as another company's logo.
-- The BEFORE guard saves their original values and queues replacement research.
update public.venues set logo_url=logo_url where public.logo_mark_denied(logo_url);
update public.events set logo_url=logo_url where public.logo_mark_denied(logo_url);
update public.organizations set logo_url=logo_url where public.logo_mark_denied(logo_url);
update public.marketplace_brands set logo_url=logo_url where public.logo_mark_denied(logo_url);

create function public.logo_quality_claim(p_table text default 'all',p_limit integer default 40)
returns setof public.logo_quality_jobs language sql security invoker set search_path='' as $$
 with picked as (
   select entity_table,entity_id from public.logo_quality_jobs
   where (p_table='all' or entity_table=p_table) and attempts<3
     and (status='pending' or (status='retry' and updated_at<now()-interval '1 minute')
       or (status='processing' and updated_at<now()-interval '10 minutes'))
   order by attempts,updated_at,entity_table,entity_id
   for update skip locked limit greatest(1,least(p_limit,200))
 ) update public.logo_quality_jobs j set status='processing',lease=gen_random_uuid(),attempts=attempts+1,updated_at=now()
 from picked p where j.entity_table=p.entity_table and j.entity_id=p.entity_id returning j.*;
$$;
revoke all on function public.logo_quality_claim(text,integer) from public,anon,authenticated;
grant execute on function public.logo_quality_claim(text,integer) to service_role;

create function public.logo_quality_finish(p_table text,p_id uuid,p_lease uuid,p_outcome text,p_url text,p_reason text,p_evidence jsonb,p_on_ink boolean default false)
returns text language plpgsql security invoker set search_path='' as $$
declare j public.logo_quality_jobs; current_url text; current_website text; final_url text; et text; next_status text; matched bigint;
begin
 if p_outcome not in ('repaired','verified','review','quarantined','retry') then raise exception 'invalid logo outcome'; end if;
 select * into j from public.logo_quality_jobs where entity_table=p_table and entity_id=p_id and lease=p_lease and status='processing' for update;
 if not found then return 'stale_lease'; end if;
 -- Identifier comes from the checked job table, never directly from an RPC caller.
 execute format('select logo_url,website from public.%I where id=$1 for update',j.entity_table) into current_url,current_website using p_id;
 get diagnostics matched = row_count;
 if matched=0 or current_url is distinct from j.expected_url or current_website is distinct from j.expected_website then
   update public.logo_quality_jobs set status='superseded',updated_at=now() where entity_table=p_table and entity_id=p_id;
   return 'superseded';
 end if;
 if p_outcome in ('repaired','verified') and (p_url is null or p_url !~ '^https://img[.]queer[.]guide/logos/[0-9a-f]{64}[.](png|jpg|webp|svg)$' or public.logo_mark_denied(p_url)) then raise exception 'unqualified logo'; end if;
 final_url := case when p_outcome='repaired' then p_url when p_outcome='quarantined' then null else current_url end;
 perform set_config('app.logo_quality_writer','on',true);
 if final_url is distinct from current_url then
   execute format('update public.%I set logo_url=$1,logo_fetched_at=now() where id=$2',j.entity_table) using final_url,p_id;
   if j.entity_table in ('venues','marketplace_brands') then
     execute format('update public.%I set logo_on_ink=$1 where id=$2',j.entity_table) using p_on_ink,p_id;
   end if;
 end if;
 perform set_config('app.logo_quality_writer','off',true);
 next_status := case when p_outcome='retry' and j.attempts>=3 then 'review' else p_outcome end;
 if next_status<>'retry' then
   execute format('update public.%I set logo_fetched_at=now() where id=$1',j.entity_table) using p_id;
 end if;
 update public.logo_quality_jobs set status=next_status,candidate_url=p_url,reason=p_reason,
   evidence=evidence||coalesce(p_evidence,'{}'),checked_at=now(),updated_at=now()
 where entity_table=p_table and entity_id=p_id;
 insert into public.logo_quality_history(entity_table,entity_id,previous_url,replacement_url,previous_website,outcome,evidence)
 values(p_table,p_id,current_url,final_url,current_website,next_status,coalesce(p_evidence,'{}')||jsonb_build_object('reason',p_reason,'candidate_url',p_url));
 if next_status in ('review','quarantined') then
   et := case p_table when 'venues' then 'venue' when 'events' then 'event' when 'organizations' then 'organization' else 'marketplace_brand' end;
   if not exists(select 1 from public.review_queue where entity_type=et and entity_id=p_id and review_type='logo_quality' and status in ('pending','open','pending_review','review')) then
     insert into public.review_queue(entity_type,entity_id,review_type,details)
     values(et,p_id,'logo_quality',jsonb_build_object('title',j.entity_name,'name',j.entity_name,'field','logo_url',
       'current_url',final_url,'previous_url',current_url,'candidate_url',p_url,'website',j.expected_website,'reason',p_reason,'evidence',p_evidence));
   end if;
 end if;
 return next_status;
end $$;
revoke all on function public.logo_quality_finish(text,uuid,uuid,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.logo_quality_finish(text,uuid,uuid,text,text,text,jsonb,boolean) to service_role;
;
