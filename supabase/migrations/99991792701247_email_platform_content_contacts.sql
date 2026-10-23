begin;
alter table public.email_operator_events drop constraint email_operator_events_object_type_check;
alter table public.email_operator_events add check(object_type in ('campaign','journey','message','import','retention','content','contacts','experiment'));
alter table public.email_operator_events drop constraint email_operator_events_action_check;
alter table public.email_operator_events add check(action in ('save','submit','approve','request_changes','cancel','snapshot','reconcile','import','purge','export'));
-- Locale variants live beside, not inside, the canonical template. Resolve the
-- exact requested locale, then its language, then the active base template.
create table public.email_template_localizations (
 id uuid not null unique default gen_random_uuid(),
 template_key text not null references public.email_templates(template_key) on delete cascade,
 locale text not null check(locale ~ '^[a-z]{2}(-[a-z0-9]{2,8})?$'),
 subject text not null check(length(subject) between 1 and 998 and subject!~E'[\r\n]'),
 html_content text not null check(octet_length(html_content)<=500000),
 text_content text check(octet_length(text_content)<=500000),
 is_active boolean not null default true,
 version integer not null default 1 check(version>0),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(template_key,locale)
);
create index on public.email_template_localizations(updated_by);
alter table public.email_template_localizations enable row level security;
revoke all on public.email_template_localizations from public,anon,authenticated;
grant all on public.email_template_localizations to service_role;
create function public.email_template_tokens(p_source text)
returns text[] language sql immutable set search_path=pg_catalog,pg_temp as $$
 select coalesce(array_agg(distinct token[1]),'{}') from regexp_matches(coalesce(p_source,''),'\{\{[[:space:]]*([A-Za-z_][A-Za-z0-9_.-]*)[[:space:]]*\}\}','g') token;
$$;
create function public.email_template_localization_save(p_key text,p_locale text,p_subject text,p_html text,p_text text,p_version integer,p_actor uuid default null,p_active boolean default true)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare base public.email_templates; current_version integer; locale_key text:=lower(p_locale); source_tokens text[]; translated_tokens text[]; result public.email_template_localizations;
begin
 perform public.email_operator_barrier(p_actor);
 if locale_key is null or locale_key!~'^[a-z]{2}(-[a-z0-9]{2,8})?$' or p_subject is null or length(btrim(p_subject)) not between 1 and 998 or p_subject~E'[\r\n]'
  or p_html is null or octet_length(p_html)>500000 or octet_length(coalesce(p_text,''))>500000 or p_active is null or p_version is null or p_version<0 then raise exception 'invalid_localized_template' using errcode='22023'; end if;
 select * into base from public.email_templates where template_key=p_key;
 if not found then raise exception 'template_missing' using errcode='P0002'; end if;
 source_tokens:=public.email_template_tokens(base.subject||base.html_content||coalesce(base.text_content,''));
 translated_tokens:=public.email_template_tokens(p_subject||p_html||coalesce(p_text,''));
 if not source_tokens<@translated_tokens or not translated_tokens<@source_tokens then raise exception 'translation_variables_must_match_base' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key||':'||locale_key,917));
 select coalesce((select version from public.email_template_localizations where template_key=p_key and locale=locale_key),0) into current_version;
 if current_version<>p_version then raise exception 'translation_version_conflict' using errcode='40001'; end if;
 insert into public.email_template_localizations(template_key,locale,subject,html_content,text_content,is_active,version,updated_by)
 values(p_key,locale_key,p_subject,p_html,p_text,p_active,p_version+1,p_actor)
 on conflict(template_key,locale) do update set subject=excluded.subject,html_content=excluded.html_content,text_content=excluded.text_content,is_active=excluded.is_active,version=excluded.version,updated_by=excluded.updated_by,updated_at=now() returning * into result;
 insert into public.email_operator_events(object_type,object_id,version,action,actor_id) values('content',result.id,result.version,'save',p_actor);
 return to_jsonb(result);
end $$;
create function public.email_template_resolve(p_key text,p_locale text default null)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare base public.email_templates; translation public.email_template_localizations; locale_key text:=lower(coalesce(p_locale,'')); source_tokens text[];
begin
 select * into base from public.email_templates where template_key=p_key and is_active;
 if not found then return null; end if;
 source_tokens:=public.email_template_tokens(base.subject||base.html_content||coalesce(base.text_content,''));
 select * into translation from public.email_template_localizations l where l.template_key=p_key and l.is_active
  and l.locale in(locale_key,split_part(locale_key,'-',1))
  -- Changing the base's variable contract cannot silently break old translations.
  and source_tokens<@public.email_template_tokens(l.subject||l.html_content||coalesce(l.text_content,''))
  and public.email_template_tokens(l.subject||l.html_content||coalesce(l.text_content,''))<@source_tokens
 order by case when l.locale=locale_key then 0 else 1 end limit 1;
 if found then return jsonb_build_object('template_key',p_key,'subject',translation.subject,'html_content',translation.html_content,'text_content',translation.text_content,'variables',base.variables,'resolved_locale',translation.locale,'version',translation.version,'fallback',translation.locale<>locale_key); end if;
 return jsonb_build_object('template_key',p_key,'subject',base.subject,'html_content',base.html_content,'text_content',base.text_content,'variables',base.variables,'resolved_locale','base','version',null,'fallback',true);
end $$;

create or replace function public.email_campaign_save(p_data jsonb,p_actor uuid default null,p_id uuid default null,p_expected_version integer default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.email_campaigns; t public.email_templates; s public.email_segments;
 rule jsonb:='{"field":"status","op":"eq","value":"subscribed"}'; at_date timestamptz; campaign_topic text; lang text; sid uuid; content jsonb; localized jsonb;
begin
 perform public.email_operator_barrier(p_actor);
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('name','template_key','topic','locale','scheduled_at','segment_id','catalog_references'))
  or jsonb_typeof(p_data->'name') is distinct from 'string' or length(btrim(p_data->>'name')) not between 1 and 200
  or jsonb_typeof(p_data->'template_key') is distinct from 'string' then raise exception 'invalid_campaign' using errcode='22023'; end if;
 if p_data?'catalog_references' then
  if jsonb_typeof(p_data->'catalog_references') is distinct from 'array' or jsonb_array_length(p_data->'catalog_references')>12 then raise exception 'invalid_catalog_references' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_data->'catalog_references') r where jsonb_typeof(r) is distinct from 'object' or (r->>'kind') is null or (r->>'kind') not in ('event','venue','news','organization') or (r->>'id') is null or (r->>'id')!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or exists(select 1 from jsonb_object_keys(r) k where k not in ('kind','id')))
   or (select count(distinct (r->>'kind',lower(r->>'id'))) from jsonb_array_elements(p_data->'catalog_references') r)<>jsonb_array_length(p_data->'catalog_references') then raise exception 'invalid_catalog_references' using errcode='22023'; end if;
 end if;
 campaign_topic:=p_data->>'topic'; lang:=nullif(p_data->>'locale','');
 if campaign_topic is null or campaign_topic not in ('newsletter','product_updates','events') or (lang is not null and lang !~ '^[a-z]{2}(-[A-Za-z]{2,8})?$') then raise exception 'invalid_campaign_audience' using errcode='22023'; end if;
 if nullif(p_data->>'scheduled_at','') is not null then
  at_date:=(p_data->>'scheduled_at')::timestamptz;
  if not isfinite(at_date) then raise exception 'invalid_campaign_schedule' using errcode='22023'; end if;
 end if;
 select * into t from public.email_templates where template_key=p_data->>'template_key' and is_active;
 if not found then raise exception 'active_template_required' using errcode='22023'; end if;
 localized:=public.email_template_resolve(t.template_key,lang);
 sid:=nullif(p_data->>'segment_id','')::uuid;
 if sid is not null then
  select * into s from public.email_segments where id=sid and status='active';
  if not found then raise exception 'active_segment_required' using errcode='22023'; end if;
  rule:=s.rule;
 end if;
 if lang is not null then rule:=jsonb_build_object('all',jsonb_build_array(rule,jsonb_build_object('field','locale','op','eq','value',lang))); end if;
 perform public.email_segment_validate(rule);
 if p_id is null then
  insert into public.email_campaigns(name,template_key,subject,html_content,text_content,topic,locale,scheduled_at,status,blocked_reason,created_by,segment_id)
  values(btrim(p_data->>'name'),t.template_key,(localized->>'subject'),(localized->>'html_content'),coalesce((localized->>'text_content'),''),campaign_topic,lang,at_date,
   case when at_date is null then 'draft' else 'blocked' end,case when at_date is not null then 'cloudflare_transactional_only' end,p_actor,sid) returning * into c;
 else
  select * into c from public.email_campaigns where id=p_id for update;
  if not found then raise exception 'campaign_not_found' using errcode='P0002'; end if;
  if c.version is distinct from p_expected_version or c.status='cancelled' then raise exception 'campaign_version_conflict' using errcode='40001'; end if;
  update public.email_campaigns set name=btrim(p_data->>'name'),template_key=t.template_key,subject=(localized->>'subject'),html_content=(localized->>'html_content'),text_content=coalesce((localized->>'text_content'),''),
   topic=campaign_topic,locale=lang,scheduled_at=at_date,status=case when at_date is null then 'draft' else 'blocked' end,
   blocked_reason=case when at_date is not null then 'cloudflare_transactional_only' end,segment_id=sid,review_state='draft',version=version+1,updated_at=now()
  where id=p_id returning * into c;
  update public.email_campaign_audiences set status='cancelled',completed_at=now() where campaign_id=p_id and status='building';
 end if;
 content:=jsonb_build_object('name',c.name,'template_key',t.template_key,'subject',(localized->>'subject'),'html_content',(localized->>'html_content'),'text_content',coalesce((localized->>'text_content'),''),
  'catalog_references',coalesce(p_data->'catalog_references','[]'::jsonb),'variables',t.variables,'resolved_locale',localized->>'resolved_locale','locale_fallback',localized->'fallback','translation_version',localized->'version','topic',campaign_topic,'locale',lang,'scheduled_at',at_date,'segment_id',sid,'segment_version',s.version,'audience_rule',rule);
 insert into public.email_campaign_versions(campaign_id,version,content,created_by) values(c.id,c.version,content,p_actor);
 insert into public.email_operator_events(object_type,object_id,version,action,actor_id) values('campaign',c.id,c.version,'save',p_actor);
 return jsonb_build_object('id',c.id,'version',c.version,'status',c.status,'review_state',c.review_state);
end $$;


-- Imports create pending rows only: uploaded/vendor consent assertions cannot
-- grant subscription status. No confirmation mail or delivery work is created.
create table public.email_import_batches (
 id uuid primary key default gen_random_uuid(), source_label text not null check(length(btrim(source_label)) between 1 and 100),
 reference text not null check(length(btrim(reference)) between 1 and 250),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 submitted integer not null, inserted integer not null default 0, skipped integer not null default 0
);
create index on public.email_import_batches(created_by);
create table public.email_import_members (
 batch_id uuid not null references public.email_import_batches(id) on delete cascade,
 subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
 primary key(batch_id,subscriber_id)
);
create index on public.email_import_members(subscriber_id);
create table public.email_management_tokens (
 token_hash text primary key check(token_hash~'^[a-f0-9]{64}$'),
 subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
 mailbox_hash text not null check(mailbox_hash~'^[a-f0-9]{64}$'),
 expires_at timestamptz not null,used_at timestamptz,created_at timestamptz not null default now()
);
create index on public.email_management_tokens(subscriber_id,created_at);
create index on public.email_management_tokens(expires_at);
do $$ declare t text; begin foreach t in array array['email_import_batches','email_import_members','email_management_tokens'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
create function public.email_contacts_import(p_source text,p_reference text,p_rows jsonb,p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare batch public.email_import_batches; row jsonb; address text; locale_key text; subscriber uuid; added integer:=0; skip_count integer:=0;
begin
 perform public.email_operator_barrier(p_actor);
 if p_source is null or length(btrim(p_source)) not between 1 and 100 or p_reference is null or length(btrim(p_reference)) not between 1 and 250
  or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>100000 then raise exception 'invalid_import' using errcode='22023'; end if;
 -- Validate the entire batch before creating anything. Caller-selected status,
 -- consent timestamps and account IDs are never accepted.
 for row in select value from jsonb_array_elements(p_rows) loop
  address:=lower(btrim(row->>'email'));locale_key:=coalesce(row->>'locale','en');
  if jsonb_typeof(row) is distinct from 'object' or exists(select 1 from jsonb_object_keys(row) k where k not in ('email','locale'))
   or jsonb_typeof(row->'email') is distinct from 'string' or length(address)>254 or address!~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
   or locale_key!~'^[a-z]{2}(-[A-Za-z]{2,8})?$' then raise exception 'invalid_import_row' using errcode='22023'; end if;
 end loop;
 insert into public.email_import_batches(source_label,reference,created_by,submitted) values(btrim(p_source),btrim(p_reference),p_actor,jsonb_array_length(p_rows)) returning * into batch;
 for row in select value from jsonb_array_elements(p_rows) order by lower(btrim(value->>'email')) loop
  address:=lower(btrim(row->>'email'));subscriber:=null;
  perform pg_advisory_xact_lock(hashtextextended(address,912));
  if not exists(select 1 from public.email_suppressions where email=address)
   and not exists(select 1 from public.email_erased_mailboxes where mailbox_hash=encode(sha256(convert_to(address,'UTF8')),'hex')) then
   insert into public.email_subscribers(email,locale,source,consent_version,status,topics)
   values(address,coalesce(row->>'locale','en'),'import:'||batch.id::text,'import_pending_no_consent','pending','{}') on conflict(email) do nothing returning id into subscriber;
  end if;
  if subscriber is null then skip_count:=skip_count+1; else
   added:=added+1;insert into public.email_import_members(batch_id,subscriber_id) values(batch.id,subscriber);
  end if;
 end loop;
 update public.email_import_batches set inserted=added,skipped=skip_count where id=batch.id;
 insert into public.email_operator_events(object_type,object_id,action,actor_id) values('import',batch.id,'import',p_actor);
 return jsonb_build_object('id',batch.id,'submitted',batch.submitted,'inserted_pending',added,'skipped',skip_count,'messages_queued',0,'consent_granted',false);
end $$;

create function public.email_contacts_page(p_after uuid default null,p_export boolean default false,p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform public.email_operator_barrier(p_actor);
 with page as (select id,email,status,topics,locale,source,confirmed_at,created_at from public.email_subscribers where p_after is null or id>p_after order by id limit 101),
 items as (select * from page order by id limit 100)
 select jsonb_build_object('contacts',coalesce((select jsonb_agg(to_jsonb(i) order by id) from items i),'[]'::jsonb),
  'next',case when (select count(*) from page)>100 then (select id from items order by id desc limit 1) else null end) into result;
 if p_export then insert into public.email_operator_events(object_type,object_id,action,actor_id) values('contacts',gen_random_uuid(),'export',p_actor); end if;
 return result;
end $$;

create function public.email_management_request(p_email text,p_hash text,p_payload jsonb,p_key text)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.email_subscribers; address text:=lower(btrim(p_email));
begin
 if p_hash is null or p_hash!~'^[a-f0-9]{64}$' then raise exception 'invalid_management_token' using errcode='22023'; end if;
 select * into s from public.email_subscribers where email=address and confirmed_at is not null;
 if not found then return; end if;
 if s.user_id is not null then perform pg_advisory_xact_lock(hashtextextended(s.user_id::text,914)); end if;
 perform pg_advisory_xact_lock(hashtextextended(address,912));
 select * into s from public.email_subscribers where id=s.id and email=address and confirmed_at is not null for update;
 if not found or exists(select 1 from public.email_disabled_accounts where user_id=s.user_id)
  or exists(select 1 from public.email_management_tokens where subscriber_id=s.id and created_at>now()-interval '1 hour')
  or exists(select 1 from public.email_suppressions where email=address)
  or exists(select 1 from public.email_erased_mailboxes where mailbox_hash=encode(sha256(convert_to(address,'UTF8')),'hex')) then return; end if;
 insert into public.email_management_tokens(token_hash,subscriber_id,mailbox_hash,expires_at)
 values(p_hash,s.id,encode(sha256(convert_to(address,'UTF8')),'hex'),now()+interval '1 hour');
 perform public.email_enqueue(p_key,address,p_payload,'manage_subscription',now()+interval '1 hour',s.user_id);
end $$;
create function public.email_management_read(p_hash text)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('status',s.status,'topics',s.topics,'locale',s.locale,'expires_at',t.expires_at)
 from public.email_management_tokens t join public.email_subscribers s on s.id=t.subscriber_id
 where t.token_hash=p_hash and t.used_at is null and t.expires_at>now() and s.confirmed_at is not null
 and t.mailbox_hash=encode(sha256(convert_to(s.email,'UTF8')),'hex')
 and not exists(select 1 from public.email_disabled_accounts where user_id=s.user_id);
$$;
create function public.email_management_save(p_hash text,p_topics text[],p_locale text,p_unsubscribe boolean default false)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.email_subscribers; token public.email_management_tokens;
begin
 if p_topics is null or not p_topics<@array['newsletter','product_updates','events']::text[] or cardinality(p_topics)>3
  or array_position(p_topics,null) is not null or cardinality(p_topics)<>(select count(distinct x) from unnest(p_topics) x)
  or p_locale is null or p_locale!~'^[a-z]{2}(-[A-Za-z]{2,8})?$' or p_unsubscribe is null then raise exception 'invalid_preferences' using errcode='22023'; end if;
 select b.* into s from public.email_management_tokens t join public.email_subscribers b on b.id=t.subscriber_id where t.token_hash=p_hash;
 if not found then return false; end if;
 if s.user_id is not null then perform pg_advisory_xact_lock(hashtextextended(s.user_id::text,914)); end if;
 perform pg_advisory_xact_lock(hashtextextended(s.email,912));
 select * into s from public.email_subscribers where id=s.id for update;
 select * into token from public.email_management_tokens where token_hash=p_hash for update;
 if not found or token.used_at is not null or token.expires_at<=now() or s.confirmed_at is null
  or token.mailbox_hash<>encode(sha256(convert_to(s.email,'UTF8')),'hex')
  or exists(select 1 from public.email_disabled_accounts where user_id=s.user_id) then return false; end if;
 -- A management link cannot re-subscribe an unsubscribed mailbox.
 if s.status<>'subscribed' and not p_unsubscribe then return false; end if;
 update public.email_subscribers set topics=case when p_unsubscribe then '{}' else p_topics end,locale=p_locale,
  status=case when p_unsubscribe then 'unsubscribed' else status end,updated_at=now() where id=s.id;
 insert into public.email_consent_events(subscriber_id,action,topics,consent_version,source)
 values(s.id,case when p_unsubscribe then 'unsubscribed' else 'preferences_changed' end,case when p_unsubscribe then '{}' else p_topics end,'2026-10-21','email_management');
 update public.email_management_tokens set used_at=now() where token_hash=p_hash;
 return true;
end $$;
create function email_private.erase_content_contacts()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 update public.email_template_localizations set updated_by=null where updated_by=new.user_id;
 update public.email_import_batches set created_by=null where created_by=new.user_id;
 return new;
end $$;
revoke all on function email_private.erase_content_contacts() from public,anon,authenticated;
create trigger email_content_contacts_erasure after insert on public.email_disabled_accounts for each row execute function email_private.erase_content_contacts();
alter function public.email_export_for_user(uuid) rename to email_export_before_content_contacts;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.email_export_before_content_contacts(p_user)||jsonb_build_object('contact_imports',coalesce((select jsonb_agg(jsonb_build_object('batch_id',m.batch_id,'source',b.source_label,'created_at',b.created_at)) from public.email_import_members m join public.email_import_batches b on b.id=m.batch_id join public.email_subscribers s on s.id=m.subscriber_id where s.user_id=p_user and s.confirmed_at is not null),'[]'::jsonb));
$$;
alter function public.email_retention_tick(integer) rename to email_retention_before_content_contacts;
create function public.email_retention_tick(p_limit integer default 500)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb; n int;
begin
 result:=public.email_retention_before_content_contacts(p_limit);
 with batch as (select token_hash from public.email_management_tokens where expires_at<now()-interval '7 days' order by expires_at for update skip locked limit greatest(1,least(coalesce(p_limit,500),1000)))
 delete from public.email_management_tokens t using batch b where t.token_hash=b.token_hash;
 get diagnostics n=row_count;
 return result||jsonb_build_object('expired_management_tokens_removed',n);
end $$;
-- Deterministic preparation only. No exposure or outcome is invented while the
-- sole provider prohibits marketing delivery. Live app outcomes are reported
-- separately from campaign experimentation.
create table public.email_experiments (
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null,version integer not null,
 audience_id uuid not null references public.email_campaign_audiences(id) on delete cascade,
 goal text not null check(goal in ('username_claimed','event_rsvp','group_joined','trip_accepted')),
 window_seconds integer not null check(window_seconds between 86400 and 2592000),
 variants jsonb not null check(jsonb_typeof(variants)='array' and octet_length(variants::text)<=2400000),
 status text not null default 'assigning' check(status in ('assigning','ready','cancelled')),
 cursor_id uuid,created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),
 unique(campaign_id,version),foreign key(campaign_id,version) references public.email_campaign_versions(campaign_id,version) on delete cascade
);
create index on public.email_experiments(created_by);
create index on public.email_experiments(created_at) where status='assigning';
create table public.email_experiment_assignments (
 experiment_id uuid not null references public.email_experiments(id) on delete cascade,
 subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade,
 variant_key text,reason text not null,
 assigned_at timestamptz not null default clock_timestamp(),
 primary key(experiment_id,subscriber_id)
);
create index on public.email_experiment_assignments(subscriber_id);
create index on public.email_experiment_assignments(user_id);
do $$ declare t text;begin foreach t in array array['email_experiments','email_experiment_assignments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end $$;
revoke update on public.email_experiments,public.email_experiment_assignments from service_role;
grant update(status,cursor_id,created_by) on public.email_experiments to service_role;
create function public.email_experiment_create(p_campaign uuid,p_version integer,p_goal text,p_window integer,p_variants jsonb,p_actor uuid default null)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.email_campaigns;a public.email_campaign_audiences;v jsonb;variants jsonb:='[]';content jsonb;result uuid;
begin
 perform public.email_operator_barrier(p_actor);
 if p_goal is null or p_goal not in ('username_claimed','event_rsvp','group_joined','trip_accepted') or p_window is null or p_window not between 86400 and 2592000
  or jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants) not between 2 and 5 or octet_length(p_variants::text)>10000 then raise exception 'invalid_experiment' using errcode='22023'; end if;
 for v in select value from jsonb_array_elements(p_variants) loop
  if jsonb_typeof(v) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v) k where k not in ('key','weight','template_key'))
   or jsonb_typeof(v->'key') is distinct from 'string' or v->>'key'!~'^[a-z][a-z0-9_]{0,39}$'
   or jsonb_typeof(v->'weight') is distinct from 'number' or v->>'weight'!~'^[0-9]+$' or (v->>'weight')::int not between 1 and 99
   or (v->>'key'<>'control' and jsonb_typeof(v->'template_key') is distinct from 'string')
   or (v->>'key'='control' and v?'template_key') then raise exception 'invalid_experiment_variant' using errcode='22023'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_variants) cfg where cfg->>'key'='control')<>1
  or (select count(distinct cfg->>'key') from jsonb_array_elements(p_variants) cfg)<>jsonb_array_length(p_variants)
  or (select sum((cfg->>'weight')::int) from jsonb_array_elements(p_variants) cfg)<>100 then raise exception 'experiment_needs_control_and_total_weight_100' using errcode='22023'; end if;
 select * into c from public.email_campaigns where id=p_campaign for update;
 if not found or c.version is distinct from p_version or c.status='cancelled' then raise exception 'campaign_version_conflict' using errcode='40001'; end if;
 select * into a from public.email_campaign_audiences where campaign_id=p_campaign and version=p_version and status='ready';
 if not found then raise exception 'ready_audience_required' using errcode='22023'; end if;
 for v in select value from jsonb_array_elements(p_variants) loop
  content:=null;
  if v->>'key'<>'control' then
   content:=public.email_template_resolve(v->>'template_key',c.locale);
   if content is null then raise exception 'active_variant_template_required' using errcode='22023'; end if;
  end if;
  variants:=variants||jsonb_build_array(v||jsonb_build_object('content',content));
 end loop;
 insert into public.email_experiments(campaign_id,version,audience_id,goal,window_seconds,variants,created_by)
 values(c.id,c.version,a.id,p_goal,p_window,variants,p_actor) on conflict(campaign_id,version) do nothing returning id into result;
 if result is null then raise exception 'experiment_already_defined' using errcode='40001'; end if;
 insert into public.email_operator_events(object_type,object_id,version,action,actor_id) values('experiment',result,p_version,'save',p_actor);
 return result;
end $$;
create function public.email_experiment_batch(p_id uuid,p_limit integer default 500)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare e public.email_experiments;s public.email_subscribers;member record;uid uuid;last_id uuid;n int:=0;bucket int;choice text;reason text;batch_size int:=greatest(1,least(coalesce(p_limit,500),1000));
begin
 if not pg_try_advisory_xact_lock(hashtextextended(p_id::text,919)) then return jsonb_build_object('held',true); end if;
 select * into e from public.email_experiments where id=p_id;
 if not found then raise exception 'experiment_missing' using errcode='P0002'; end if;
 if e.status<>'assigning' then return jsonb_build_object('status',e.status); end if;
 -- Acquire account privacy barriers in a consistent order BEFORE the experiment
 -- row. Erasure may clear its creator and delete these assignments atomically.
 for uid in select distinct x.user_id from (
  select b.user_id from (select m.subscriber_id from public.email_campaign_audience_members m where m.audience_id=e.audience_id and (e.cursor_id is null or m.subscriber_id>e.cursor_id) order by m.subscriber_id limit batch_size) page
   join public.email_subscribers b on b.id=page.subscriber_id
  union select e.created_by) x where x.user_id is not null order by x.user_id loop
  perform pg_advisory_xact_lock(hashtextextended(uid::text,914));
 end loop;
 select * into e from public.email_experiments where id=p_id for update;
 if not exists(select 1 from public.email_campaigns where id=e.campaign_id and version=e.version and status<>'cancelled') then
  update public.email_experiments set status='cancelled' where id=p_id;return jsonb_build_object('status','cancelled');
 end if;
 for member in select m.subscriber_id from public.email_campaign_audience_members m where m.audience_id=e.audience_id and (e.cursor_id is null or m.subscriber_id>e.cursor_id) order by m.subscriber_id limit batch_size loop
  n:=n+1;last_id:=member.subscriber_id;choice:=null;
  select * into s from public.email_subscribers where id=member.subscriber_id;
  if not found then continue; end if;
  if not public.email_segment_matches(s,(select rule from public.email_campaign_audiences where id=e.audience_id),statement_timestamp()) then
   reason:='no_longer_matches';
  else
   reason:=public.email_subscriber_eligibility(s,(select topic from public.email_campaign_audiences where id=e.audience_id));
  end if;
  if reason='eligible' then
   bucket:=(('x'||substr(md5(e.id::text||':'||s.id::text),1,8))::bit(32)::bigint%100)::int;
   select v->>'key' into choice from (
    select value v,sum((value->>'weight')::int) over(order by ordinality) ceiling from jsonb_array_elements(e.variants) with ordinality
   ) weights where ceiling>bucket order by ceiling limit 1;
  end if;
  insert into public.email_experiment_assignments(experiment_id,subscriber_id,user_id,variant_key,reason)
  values(e.id,s.id,case when s.confirmed_at is not null then s.user_id else null end,choice,reason) on conflict do nothing;
 end loop;
 update public.email_experiments set cursor_id=coalesce(last_id,cursor_id),status=case when n<batch_size then 'ready' else 'assigning' end where id=e.id returning * into e;
 return jsonb_build_object('status',e.status,'scanned',n);
end $$;
create function public.email_experiment_tick(p_limit integer default 5)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare r record;n int:=0;begin
 for r in select id from public.email_experiments where status='assigning' order by created_at limit greatest(1,least(coalesce(p_limit,5),5)) loop
  perform public.email_experiment_batch(r.id,500);n:=n+1;
 end loop;return n;
end $$;
create function public.email_experiment_report(p_campaign uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'version',e.version,'status',e.status,'goal',e.goal,'window_seconds',e.window_seconds,'created_at',e.created_at,
  'variants',(select jsonb_agg(jsonb_build_object('key',v->>'key','weight',v->'weight','template_key',v->>'template_key','subject',v->'content'->>'subject',
    'assigned',(select count(*) from public.email_experiment_assignments a where a.experiment_id=e.id and a.variant_key=v->>'key'),
    'linked_accounts',(select count(*) from public.email_experiment_assignments a where a.experiment_id=e.id and a.variant_key=v->>'key' and a.user_id is not null))) from jsonb_array_elements(e.variants) v),
  'excluded',(select count(*) from public.email_experiment_assignments a where a.experiment_id=e.id and a.reason<>'eligible'),
  'exposures',0,'outcomes',null,'winner',null,'causal_lift',null,'window_started',false,'reason','cloudflare_transactional_only') order by e.created_at desc),'[]'::jsonb)
 from (select * from public.email_experiments where campaign_id=p_campaign order by created_at desc limit 20) e;
$$;
create index email_journey_steps_completed on public.email_journey_steps(completed_at);
create index email_outbox_welcome_accepted on public.email_outbox(accepted_at,recipient_user_id) where template_key='welcome' and accepted_at is not null;
create function public.email_measurement_report()
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with cohorts as (select o.id,o.recipient_user_id,o.accepted_at,
   exists(select 1 from public.email_lifecycle_events l where l.user_id=o.recipient_user_id and l.event_type='profile.username.changed' and l.state='claimed' and l.occurred_at>=o.accepted_at and l.occurred_at<o.accepted_at+interval '7 days') activated
   from public.email_outbox o where o.template_key='welcome' and o.accepted_at>=now()-interval '30 days' and o.recipient_user_id is not null and o.erased_at is null),
 closed as (select * from cohorts where accepted_at<=now()-interval '7 days')
 select jsonb_build_object('as_of',now(),'window_days',30,'attribution','observed_after_provider_acceptance_not_causal',
  'welcome_activation',jsonb_build_object('outcome','verified_username_claim','observation_days',7,'accepted_accounts',(select count(distinct recipient_user_id) from cohorts),
   'closed_windows',(select count(distinct recipient_user_id) from closed),'outcome_accounts',(select count(distinct recipient_user_id) from closed where activated),
   'open_windows',(select count(distinct recipient_user_id) from cohorts where accepted_at>now()-interval '7 days')),
  'verified_app_events',coalesce((select jsonb_agg(to_jsonb(x)) from (select event_type,state,count(*) observations from public.email_lifecycle_events where occurred_at>=now()-interval '30 days' group by event_type,state order by event_type,state) x),'[]'::jsonb),
  'journey_states',coalesce((select jsonb_agg(to_jsonb(x)) from (select journey_id,version,status,count(*) runs from public.email_journey_runs where created_at>=now()-interval '30 days' group by journey_id,version,status order by journey_id,version,status limit 200) x),'[]'::jsonb),
  'journey_steps',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.journey_id,r.version,s.kind,s.outcome,count(*) steps from public.email_journey_steps s join public.email_journey_runs r on r.id=s.run_id where s.completed_at>=now()-interval '30 days' group by r.journey_id,r.version,s.kind,s.outcome order by r.journey_id,r.version,s.kind,s.outcome limit 500) x),'[]'::jsonb),
  'purchases',null,'causal_lift',null,'automatic_winner',null);
$$;
create or replace function email_private.erase_content_contacts()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 update public.email_template_localizations set updated_by=null where updated_by=new.user_id;
 update public.email_import_batches set created_by=null where created_by=new.user_id;
 delete from public.email_recipient_user_lookup where user_id=new.user_id;
 update public.email_experiments set created_by=null where created_by=new.user_id;
 delete from public.email_experiment_assignments where user_id=new.user_id;
 return new;
end $$;
alter function public.email_export_for_user(uuid) rename to email_export_before_experiments;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.email_export_before_experiments(p_user)||jsonb_build_object('experiment_assignments',coalesce((select jsonb_agg(jsonb_build_object('experiment_id',experiment_id,'variant_key',variant_key,'reason',reason,'assigned_at',assigned_at)) from public.email_experiment_assignments where user_id=p_user),'[]'::jsonb));
$$;

-- Entity associations are resolved from CURRENT canonical records. A directory
-- association is not ownership proof or marketing consent, and is never copied
-- into a permanent address book that could survive a contact change or erasure.
-- A derived, service-private hash lookup avoids an Auth table scan for every
-- contact. It never stores another plaintext address or creates an account link
-- on a subscriber; current Auth proof is checked again when resolving it.
create table public.email_recipient_user_lookup (
 user_id uuid primary key references auth.users(id) on delete cascade,
 mailbox_hash text not null check(mailbox_hash~'^[a-f0-9]{64}$')
);
create index email_recipient_user_lookup_mailbox on public.email_recipient_user_lookup(mailbox_hash);
alter table public.email_recipient_user_lookup enable row level security;
revoke all on public.email_recipient_user_lookup from public,anon,authenticated,service_role;
grant select on public.email_recipient_user_lookup to service_role;
create function email_private.capture_recipient_mailbox()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.id::text,914));
 if new.email is null or new.email_confirmed_at is null
  or exists(select 1 from public.email_disabled_accounts d where d.user_id=new.id) then
  delete from public.email_recipient_user_lookup where user_id=new.id;
 else
  insert into public.email_recipient_user_lookup(user_id,mailbox_hash)
  values(new.id,encode(sha256(convert_to(lower(btrim(new.email)),'UTF8')),'hex'))
  on conflict(user_id) do update set mailbox_hash=excluded.mailbox_hash;
 end if;
 return new;
end $$;
revoke all on function email_private.capture_recipient_mailbox() from public,anon,authenticated,service_role;
create trigger email_capture_recipient_mailbox after insert or update of email,email_confirmed_at on auth.users
 for each row execute function email_private.capture_recipient_mailbox();
insert into public.email_recipient_user_lookup(user_id,mailbox_hash)
 select u.id,encode(sha256(convert_to(lower(btrim(u.email)),'UTF8')),'hex') from auth.users u
 where u.email_confirmed_at is not null and u.email is not null
 and not exists(select 1 from public.email_disabled_accounts d where d.user_id=u.id);
analyze public.email_recipient_user_lookup;

create index email_organizations_mailbox on public.organizations(lower(btrim(email))) where email is not null;
create index email_marketplace_mailbox on public.marketplace_listings(lower(btrim(contact_email))) where contact_email is not null;
create index email_venues_mailbox on public.venues(lower(btrim(email))) where email is not null;
-- Supabase service_role cannot SELECT auth.users in production. Resolve only
-- this verified mailbox through a tightly scoped definer; keep the indexed
-- lookup outside the function so audience hash predicates still use its index.
create function email_private.resolve_recipient_account(p_user uuid,p_hash text)
returns table(email text) language sql stable security definer set search_path=pg_catalog as $$
 select lower(btrim(u.email)) from auth.users u
 where u.id=p_user and u.email is not null and u.email_confirmed_at is not null
 and encode(sha256(convert_to(lower(btrim(u.email)),'UTF8')),'hex')=p_hash
 and not exists(select 1 from public.email_disabled_accounts d where d.user_id=u.id)
$$;
revoke all on function email_private.resolve_recipient_account(uuid,text) from public,anon,authenticated,service_role;
grant execute on function email_private.resolve_recipient_account(uuid,text) to service_role;

create view public.email_recipient_sources with (security_invoker=true) as
 select 'organization'::text kind,o.id,o.name label,lower(btrim(o.email)) email,'published_contact'::text evidence,encode(sha256(convert_to(lower(btrim(o.email)),'UTF8')),'hex') mailbox_hash
 from public.organizations o where o.status='active' and o.duplicate_of_id is null and not o.safety_gated and not o.is_defunct and o.email is not null
 union all
 select 'venue',v.id,v.name,lower(btrim(v.email)),'published_contact',encode(sha256(convert_to(lower(btrim(v.email)),'UTF8')),'hex')
 from public.venues v where v.duplicate_of_id is null and v.closed_at is null and coalesce(v.review_status,'')<>'archived' and not v.safety_gated and v.email is not null
 union all
 select 'vendor',m.id,m.display_name,lower(btrim(o.email)),'linked_organization_contact',encode(sha256(convert_to(lower(btrim(o.email)),'UTF8')),'hex')
 from public.marketplace_merchants m join public.organizations o on o.id=m.organization_id
 where m.is_enabled and o.status='active' and o.duplicate_of_id is null and not o.safety_gated and not o.is_defunct and o.email is not null
 union all
 select 'vendor',l.id,l.business_name,lower(btrim(l.contact_email)),'published_listing_contact',encode(sha256(convert_to(lower(btrim(l.contact_email)),'UTF8')),'hex')
 from public.marketplace_listings l where l.status='active' and l.archived_at is null and l.deprecated_at is null and l.duplicate_of_id is null
 and coalesce(l.review_status,'')<>'archived' and l.contact_email is not null
 -- A listing cannot shadow a merchant by choosing the same UUID.
 and not exists(select 1 from public.marketplace_merchants m where m.id=l.id)
 union all
 select 'user',l.user_id,'Account '||l.user_id::text,u.email,'verified_account_mailbox',l.mailbox_hash
 from public.email_recipient_user_lookup l
 cross join lateral email_private.resolve_recipient_account(l.user_id,l.mailbox_hash) u;
revoke all on public.email_recipient_sources from public,anon,authenticated;
grant select on public.email_recipient_sources to service_role;

create function public.email_recipient_directory(p_kind text,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_kind is null or p_kind not in ('organization','venue','vendor','user') then raise exception 'invalid_recipient_kind' using errcode='22023'; end if;
 with page as materialized (select r.kind,r.id,r.label,r.email,r.evidence from public.email_recipient_sources r where r.kind=p_kind and (p_after is null or r.id>p_after)
   and length(r.email)<=254 and r.email~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
   and not exists(select 1 from public.email_erased_mailboxes e where e.mailbox_hash=encode(sha256(convert_to(r.email,'UTF8')),'hex')) order by r.id limit 101),
 items as (select p.*,s.id subscriber_id,s.status subscription_status,s.topics,s.confirmed_at,
   case when exists(select 1 from public.email_suppressions x where x.email=p.email) then 'recipient_suppressed'
     when s.id is null then 'no_subscription' else public.email_subscriber_eligibility(s,null) end eligibility
   from (select * from page order by id limit 100) p left join public.email_subscribers s on s.email=p.email)
 select jsonb_build_object('recipients',coalesce((select jsonb_agg(to_jsonb(i) order by id) from items i),'[]'::jsonb),
  'next',case when (select count(*) from page)>100 then (select id from items order by id desc limit 1) else null end,
  'dispatch_available',false,'reason','cloudflare_transactional_only') into result;
 return result;
end $$;

create function public.email_recipient_import(p_kind text,p_id uuid,p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare address text;
begin
 perform public.email_operator_barrier(p_actor);
 if p_kind is null or p_kind not in ('organization','venue','vendor','user') or p_id is null then raise exception 'invalid_recipient' using errcode='22023'; end if;
 select email into address from public.email_recipient_sources where kind=p_kind and id=p_id;
 if address is null then raise exception 'recipient_unavailable' using errcode='22023'; end if;
 -- Uses the same mailbox locks, erased/suppressed guards and immutable import
 -- provenance as CSV import. No caller-selected address, status or user ID.
 return public.email_contacts_import('Directory: '||p_kind,p_id::text,jsonb_build_array(jsonb_build_object('email',address)),p_actor);
end $$;

create or replace function public.email_segment_validate(p_rule jsonb,p_depth integer default 0)
returns void language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare n integer; key text; child jsonb; field text; op text; val jsonb; v text;
begin
 if p_depth is null or p_depth<0 or p_depth>6 or jsonb_typeof(p_rule) is distinct from 'object' or octet_length(p_rule::text)>8000 then
  raise exception 'invalid_segment_rule' using errcode='22023';
 end if;
 select count(*) into n from jsonb_object_keys(p_rule);
 if n=1 and (p_rule ? 'all' or p_rule ? 'any' or p_rule ? 'not') then
  if p_rule ? 'not' then perform public.email_segment_validate(p_rule->'not',p_depth+1); return; end if;
  key:=case when p_rule ? 'all' then 'all' else 'any' end;
  if jsonb_typeof(p_rule->key) is distinct from 'array' then raise exception 'invalid_segment_group' using errcode='22023'; end if;
  if jsonb_array_length(p_rule->key) not between 1 and 10 then raise exception 'invalid_segment_group' using errcode='22023'; end if;
  for child in select value from jsonb_array_elements(p_rule->key) loop
   perform public.email_segment_validate(child,p_depth+1);
  end loop;
  return;
 end if;
 if n=3 and p_rule ?& array['event','within_days','min_count'] then
  if coalesce(p_rule->>'event','') not in ('consent.confirmed','consent.preferences_changed','consent.unsubscribed','delivery.delivered','delivery.bounced','delivery.complained')
   or jsonb_typeof(p_rule->'event')<>'string'
   or jsonb_typeof(p_rule->'within_days')<>'number' or (p_rule->>'within_days') !~ '^[0-9]{1,4}$'
   or jsonb_typeof(p_rule->'min_count')<>'number' or (p_rule->>'min_count') !~ '^[0-9]{1,4}$' then
   raise exception 'invalid_segment_event' using errcode='22023';
  end if;
  if (p_rule->>'within_days')::int not between 1 and 3650 or (p_rule->>'min_count')::int not between 1 and 1000 then
   raise exception 'invalid_segment_event_window' using errcode='22023';
  end if;
  return;
 end if;
 if n<>3 or not p_rule ?& array['field','op','value'] then raise exception 'invalid_segment_leaf' using errcode='22023'; end if;
 field:=p_rule->>'field'; op:=p_rule->>'op'; val:=p_rule->'value';
 if jsonb_typeof(p_rule->'field') is distinct from 'string' or jsonb_typeof(p_rule->'op') is distinct from 'string' then raise exception 'invalid_segment_leaf' using errcode='22023'; end if;
 if field in ('created_at','confirmed_at') and op in ('within_days','older_than_days') then
  if jsonb_typeof(val)<>'number' or val::text !~ '^[0-9]{1,4}$' then raise exception 'invalid_segment_days' using errcode='22023'; end if;
  if val::text::int not between 1 and 3650 then raise exception 'invalid_segment_days' using errcode='22023'; end if;
  return;
 end if;
 if field='topic' and op='contains' and jsonb_typeof(val)='string' and (val#>>'{}') in ('newsletter','product_updates','events') then return; end if;
 if field not in ('locale','status','source','recipient_kind') or op not in ('eq','in') then raise exception 'unsupported_segment_field_or_operator' using errcode='22023'; end if;
 if op='eq' then val:=jsonb_build_array(val); end if;
 if jsonb_typeof(val) is distinct from 'array' then raise exception 'invalid_segment_values' using errcode='22023'; end if;
 if jsonb_array_length(val) not between 1 and 20 then raise exception 'invalid_segment_values' using errcode='22023'; end if;
 for child in select value from jsonb_array_elements(val) loop
  if jsonb_typeof(child) is distinct from 'string' then raise exception 'invalid_segment_value' using errcode='22023'; end if;
  v:=child#>>'{}';
  if (field='locale' and v !~ '^[a-z]{2}(-[A-Za-z]{2,8})?$')
   or (field='status' and v not in ('pending','subscribed','unsubscribed'))
   or (field='recipient_kind' and v not in ('organization','venue','vendor','user'))
   or (field='source' and (length(v) not between 1 and 100)) then raise exception 'invalid_segment_value' using errcode='22023'; end if;
 end loop;
end $$;
create or replace function public.email_segment_matches(p_sub public.email_subscribers,p_rule jsonb,p_at timestamptz)
returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare child jsonb; field text; op text; actual text; at_time timestamptz; n bigint;
begin
 if p_rule ? 'not' then return not public.email_segment_matches(p_sub,p_rule->'not',p_at); end if;
 if p_rule ? 'all' then
  for child in select value from jsonb_array_elements(p_rule->'all') loop
   if not public.email_segment_matches(p_sub,child,p_at) then return false; end if;
  end loop; return true;
 end if;
 if p_rule ? 'any' then
  for child in select value from jsonb_array_elements(p_rule->'any') loop
   if public.email_segment_matches(p_sub,child,p_at) then return true; end if;
  end loop; return false;
 end if;
 if p_rule ? 'event' then
  if p_rule->>'event' like 'consent.%' then
   select count(*) into n from public.email_consent_events e where e.subscriber_id=p_sub.id
    and e.action=split_part(p_rule->>'event','.',2) and e.created_at between p_at-make_interval(days=>(p_rule->>'within_days')::int) and p_at;
  else
   select count(*) into n from public.email_delivery_events e where e.recipient_email=p_sub.email
    and e.event_type=split_part(p_rule->>'event','.',2) and e.occurred_at between p_at-make_interval(days=>(p_rule->>'within_days')::int) and p_at;
  end if;
  return n>=(p_rule->>'min_count')::int;
 end if;
 field:=p_rule->>'field'; op:=p_rule->>'op';
 if field='recipient_kind' then
  return exists(select 1 from public.email_recipient_sources r where r.email=p_sub.email and r.mailbox_hash=encode(sha256(convert_to(p_sub.email,'UTF8')),'hex')
   and case when op='eq' then r.kind=p_rule->>'value' else p_rule->'value' ? r.kind end);
 end if;
 if field='topic' then return (p_rule->>'value')=any(p_sub.topics); end if;
 if field in ('created_at','confirmed_at') then
  at_time:=case field when 'created_at' then p_sub.created_at else p_sub.confirmed_at end;
  if at_time is null or at_time>p_at then return false; end if;
  if op='within_days' then return at_time>=p_at-make_interval(days=>(p_rule->>'value')::int); end if;
  return at_time<p_at-make_interval(days=>(p_rule->>'value')::int);
 end if;
 actual:=case field when 'locale' then p_sub.locale when 'status' then p_sub.status when 'source' then p_sub.source else null end;
 if op='eq' then return coalesce(actual=p_rule->>'value',false); end if;
 return coalesce(p_rule->'value' ? actual,false);
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace and
 (p.proname like 'email_recipient_%' or p.proname like 'email_segment_%' or p.proname like 'email_template_%' or p.proname like 'email_management_%' or p.proname like 'email_experiment_%' or p.proname in ('email_contacts_import','email_contacts_page','email_export_for_user','email_export_before_content_contacts','email_export_before_experiments','email_measurement_report','email_retention_tick','email_retention_before_content_contacts')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
