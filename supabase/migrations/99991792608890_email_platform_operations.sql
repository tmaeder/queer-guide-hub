-- Versioned campaign preparation and bounded audience collection. This migration
-- deliberately provides no campaign dispatch path: Cloudflare is transactional-only.
begin;
alter table public.email_campaigns add column version integer not null default 1 check(version>0);
alter table public.email_campaigns add column segment_id uuid references public.email_segments(id) on delete set null;
alter table public.email_campaigns add column review_state text not null default 'draft'
 check(review_state in ('draft','submitted','approved','changes_requested'));
create index on public.email_campaigns(segment_id);

create table public.email_campaign_versions (
 campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
 version integer not null check(version>0),
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=650000),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 primary key(campaign_id,version)
);
create index on public.email_campaign_versions(created_by);
create table public.email_campaign_reviews (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null,
 version integer not null, action text not null check(action in ('submit','approve','request_changes')),
 actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key(campaign_id,version) references public.email_campaign_versions(campaign_id,version) on delete cascade
);
create index on public.email_campaign_reviews(campaign_id,version);
create index on public.email_campaign_reviews(actor_id);
create table public.email_operator_events (
 id uuid primary key default gen_random_uuid(),
 object_type text not null check(object_type in ('campaign','journey','message','import','retention')),
 object_id uuid not null, version integer,
 action text not null check(action in ('save','submit','approve','request_changes','cancel','snapshot','reconcile','import','purge')),
 actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index on public.email_operator_events(object_type,object_id,created_at desc);
create index on public.email_operator_events(actor_id);
create table public.email_campaign_audiences (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null, version integer not null,
 rule jsonb not null, topic text not null, locale text,
 status text not null default 'building' check(status in ('building','ready','cancelled')),
 cursor_id uuid, scanned bigint not null default 0 check(scanned>=0),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), completed_at timestamptz,
 unique(campaign_id,version),
 foreign key(campaign_id,version) references public.email_campaign_versions(campaign_id,version) on delete cascade
);
create index on public.email_campaign_audiences(created_by);
create index on public.email_campaign_audiences(created_at) where status='building';
create table public.email_campaign_audience_members (
 audience_id uuid not null references public.email_campaign_audiences(id) on delete cascade,
 subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
 reason text not null,
 evaluated_at timestamptz not null default now(),
 primary key(audience_id,subscriber_id)
);
create index on public.email_campaign_audience_members(subscriber_id);
create index on public.email_campaign_audience_members(audience_id,reason);
do $$ declare t text;
begin
 foreach t in array array['email_campaign_versions','email_campaign_reviews','email_operator_events','email_campaign_audiences','email_campaign_audience_members'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
grant select,insert on public.email_campaign_versions,public.email_campaign_reviews,public.email_operator_events to service_role;
grant update(created_by) on public.email_campaign_versions to service_role;
grant update(actor_id) on public.email_campaign_reviews,public.email_operator_events to service_role;
grant select,insert,update,delete on public.email_campaign_audiences,public.email_campaign_audience_members to service_role;
-- Existing drafts acquire a content version without claiming prior review or consent.
insert into public.email_campaign_versions(campaign_id,version,created_by,created_at,content)
select id,version,created_by,created_at,jsonb_build_object('name',name,'template_key',template_key,
 'subject',subject,'html_content',html_content,'text_content',text_content,'topic',topic,'locale',locale,
 'scheduled_at',scheduled_at,'segment_id',null,'segment_version',null,
 'audience_rule',case when locale is null then jsonb_build_object('field','status','op','eq','value','subscribed')
  else jsonb_build_object('all',jsonb_build_array(jsonb_build_object('field','status','op','eq','value','subscribed'),
    jsonb_build_object('field','locale','op','eq','value',locale))) end)
from public.email_campaigns;

create function public.email_operator_barrier(p_actor uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_actor is null then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,914));
 if not exists(select 1 from auth.users where id=p_actor)
  or exists(select 1 from public.email_disabled_accounts where user_id=p_actor) then
  raise exception 'operator_account_disabled' using errcode='42501';
 end if;
end $$;

create function public.email_campaign_save(p_data jsonb,p_actor uuid default null,p_id uuid default null,p_expected_version integer default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.email_campaigns; t public.email_templates; s public.email_segments;
 rule jsonb:='{"field":"status","op":"eq","value":"subscribed"}'; at_date timestamptz; campaign_topic text; lang text; sid uuid; content jsonb;
begin
 perform public.email_operator_barrier(p_actor);
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('name','template_key','topic','locale','scheduled_at','segment_id'))
  or jsonb_typeof(p_data->'name') is distinct from 'string' or length(btrim(p_data->>'name')) not between 1 and 200
  or jsonb_typeof(p_data->'template_key') is distinct from 'string' then raise exception 'invalid_campaign' using errcode='22023'; end if;
 campaign_topic:=p_data->>'topic'; lang:=nullif(p_data->>'locale','');
 if campaign_topic is null or campaign_topic not in ('newsletter','product_updates','events') or (lang is not null and lang !~ '^[a-z]{2}(-[A-Za-z]{2,8})?$') then raise exception 'invalid_campaign_audience' using errcode='22023'; end if;
 if nullif(p_data->>'scheduled_at','') is not null then
  at_date:=(p_data->>'scheduled_at')::timestamptz;
  if not isfinite(at_date) then raise exception 'invalid_campaign_schedule' using errcode='22023'; end if;
 end if;
 select * into t from public.email_templates where template_key=p_data->>'template_key' and is_active;
 if not found then raise exception 'active_template_required' using errcode='22023'; end if;
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
  values(btrim(p_data->>'name'),t.template_key,t.subject,t.html_content,coalesce(t.text_content,''),campaign_topic,lang,at_date,
   case when at_date is null then 'draft' else 'blocked' end,case when at_date is not null then 'cloudflare_transactional_only' end,p_actor,sid) returning * into c;
 else
  select * into c from public.email_campaigns where id=p_id for update;
  if not found then raise exception 'campaign_not_found' using errcode='P0002'; end if;
  if c.version is distinct from p_expected_version or c.status='cancelled' then raise exception 'campaign_version_conflict' using errcode='40001'; end if;
  update public.email_campaigns set name=btrim(p_data->>'name'),template_key=t.template_key,subject=t.subject,html_content=t.html_content,text_content=coalesce(t.text_content,''),
   topic=campaign_topic,locale=lang,scheduled_at=at_date,status=case when at_date is null then 'draft' else 'blocked' end,
   blocked_reason=case when at_date is not null then 'cloudflare_transactional_only' end,segment_id=sid,review_state='draft',version=version+1,updated_at=now()
  where id=p_id returning * into c;
  update public.email_campaign_audiences set status='cancelled',completed_at=now() where campaign_id=p_id and status='building';
 end if;
 content:=jsonb_build_object('name',c.name,'template_key',t.template_key,'subject',t.subject,'html_content',t.html_content,'text_content',coalesce(t.text_content,''),
  'variables',t.variables,'topic',campaign_topic,'locale',lang,'scheduled_at',at_date,'segment_id',sid,'segment_version',s.version,'audience_rule',rule);
 insert into public.email_campaign_versions(campaign_id,version,content,created_by) values(c.id,c.version,content,p_actor);
 insert into public.email_operator_events(object_type,object_id,version,action,actor_id) values('campaign',c.id,c.version,'save',p_actor);
 return jsonb_build_object('id',c.id,'version',c.version,'status',c.status,'review_state',c.review_state);
end $$;

create function public.email_campaign_review(p_id uuid,p_version integer,p_action text,p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.email_campaigns; state text;
begin
 perform public.email_operator_barrier(p_actor);
 select * into c from public.email_campaigns where id=p_id for update;
 if not found then raise exception 'campaign_not_found' using errcode='P0002'; end if;
 if c.version is distinct from p_version or c.status='cancelled' then raise exception 'campaign_version_conflict' using errcode='40001'; end if;
 if p_action='submit' and c.review_state in ('draft','changes_requested') then state:='submitted';
 elsif p_action='approve' and c.review_state='submitted' then state:='approved';
 elsif p_action='request_changes' and c.review_state='submitted' then state:='changes_requested';
 else raise exception 'invalid_review_transition' using errcode='22023'; end if;
 update public.email_campaigns set review_state=state,updated_at=now() where id=p_id;
 insert into public.email_campaign_reviews(campaign_id,version,action,actor_id) values(p_id,p_version,p_action,p_actor);
 insert into public.email_operator_events(object_type,object_id,version,action,actor_id) values('campaign',p_id,p_version,p_action,p_actor);
 return jsonb_build_object('id',p_id,'version',p_version,'review_state',state,'dispatch_available',false,'reason','cloudflare_transactional_only');
end $$;

create function public.email_campaign_cancel(p_id uuid,p_version integer,p_actor uuid default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.email_campaigns;
begin
 perform public.email_operator_barrier(p_actor);
 select * into c from public.email_campaigns where id=p_id for update;
 if not found then raise exception 'campaign_not_found' using errcode='P0002'; end if;
 if c.version is distinct from p_version then raise exception 'campaign_version_conflict' using errcode='40001'; end if;
 if c.status='cancelled' then return true; end if;
 update public.email_campaigns set status='cancelled',updated_at=now() where id=p_id;
 update public.email_campaign_audiences set status='cancelled',completed_at=now() where campaign_id=p_id and status='building';
 insert into public.email_operator_events(object_type,object_id,version,action,actor_id) values('campaign',p_id,p_version,'cancel',p_actor);
 return true;
end $$;

create function public.email_campaign_snapshot_begin(p_id uuid,p_version integer,p_actor uuid default null)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.email_campaigns; v public.email_campaign_versions; result uuid;
begin
 perform public.email_operator_barrier(p_actor);
 select * into c from public.email_campaigns where id=p_id for update;
 if not found then raise exception 'campaign_not_found' using errcode='P0002'; end if;
 if c.version is distinct from p_version or c.status='cancelled' then raise exception 'campaign_version_conflict' using errcode='40001'; end if;
 select * into strict v from public.email_campaign_versions where campaign_id=p_id and version=p_version;
 insert into public.email_campaign_audiences(campaign_id,version,rule,topic,locale,created_by)
 values(p_id,p_version,v.content->'audience_rule',v.content->>'topic',v.content->>'locale',p_actor)
 on conflict(campaign_id,version) do nothing returning id into result;
 if result is null then select id into result from public.email_campaign_audiences where campaign_id=p_id and version=p_version;
 else insert into public.email_operator_events(object_type,object_id,version,action,actor_id) values('campaign',p_id,p_version,'snapshot',p_actor); end if;
 return result;
end $$;

create function public.email_campaign_snapshot_batch(p_id uuid,p_limit integer default 500)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.email_campaign_audiences; s public.email_subscribers; last_id uuid; n integer:=0; at_time timestamptz:=clock_timestamp();
begin
 select * into a from public.email_campaign_audiences where id=p_id for update skip locked;
 if not found then return jsonb_build_object('held',true); end if;
 if a.status<>'building' then return jsonb_build_object('status',a.status,'scanned',a.scanned); end if;
 if not exists(select 1 from public.email_campaigns where id=a.campaign_id and version=a.version and status<>'cancelled') then
  update public.email_campaign_audiences set status='cancelled',completed_at=now() where id=a.id;
  return jsonb_build_object('status','cancelled');
 end if;
 for s in select * from public.email_subscribers where created_at<=a.created_at and (a.cursor_id is null or id>a.cursor_id)
  order by id limit greatest(1,least(coalesce(p_limit,500),1000)) loop
  n:=n+1; last_id:=s.id;
  if public.email_segment_matches(s,a.rule,at_time) then
   insert into public.email_campaign_audience_members(audience_id,subscriber_id,reason,evaluated_at)
   values(a.id,s.id,public.email_subscriber_eligibility(s,a.topic),at_time) on conflict do nothing;
  end if;
 end loop;
 update public.email_campaign_audiences set cursor_id=coalesce(last_id,cursor_id),scanned=scanned+n,
  status=case when n<greatest(1,least(coalesce(p_limit,500),1000)) then 'ready' else 'building' end,
  completed_at=case when n<greatest(1,least(coalesce(p_limit,500),1000)) then clock_timestamp() end where id=a.id returning * into a;
 return jsonb_build_object('id',a.id,'status',a.status,'scanned',a.scanned);
end $$;

create function public.email_campaign_snapshot_tick(p_limit integer default 5)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare item record; n integer:=0;
begin
 for item in select id from public.email_campaign_audiences where status='building' order by created_at for update skip locked limit greatest(1,least(coalesce(p_limit,5),5)) loop
  perform public.email_campaign_snapshot_batch(item.id,500); n:=n+1;
 end loop;
 return n;
end $$;

-- New account-owned references join the existing proof-scoped export/erasure.
create function public.email_campaign_audience_report(p_campaign uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'version',a.version,'status',a.status,'scanned',a.scanned,
  'started_at',a.created_at,'completed_at',a.completed_at,
  'matched',(select count(*) from public.email_campaign_audience_members m where m.audience_id=a.id),
  'eligible_at_capture',(select count(*) from public.email_campaign_audience_members m where m.audience_id=a.id and m.reason='eligible'),
  'excluded',coalesce((select jsonb_object_agg(x.reason,x.n) from (select m.reason,count(*) n from public.email_campaign_audience_members m where m.audience_id=a.id and m.reason<>'eligible' group by m.reason) x),'{}'::jsonb),
  'sample',coalesce((select jsonb_agg(to_jsonb(x)) from (select s.id,s.email,m.reason as captured_reason,m.evaluated_at,
    case when not public.email_segment_matches(s,a.rule,statement_timestamp()) then 'no_longer_matches' else public.email_subscriber_eligibility(s,a.topic) end as current_reason
   from public.email_campaign_audience_members m join public.email_subscribers s on s.id=m.subscriber_id where m.audience_id=a.id order by m.subscriber_id limit 25) x),'[]'::jsonb)
 ) order by a.created_at desc),'[]'::jsonb)
 from (select * from public.email_campaign_audiences where campaign_id=p_campaign order by created_at desc limit 10) a;
$$;
create function email_private.erase_operations()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 update public.email_campaigns set created_by=null where created_by=new.user_id;
 update public.email_campaign_versions set created_by=null where created_by=new.user_id;
 update public.email_campaign_reviews set actor_id=null where actor_id=new.user_id;
 update public.email_operator_events set actor_id=null where actor_id=new.user_id;
 update public.email_campaign_audiences set created_by=null where created_by=new.user_id;
 return new;
end $$;
revoke all on function email_private.erase_operations() from public,anon,authenticated;
create trigger email_operations_erasure after insert on public.email_disabled_accounts
 for each row execute function email_private.erase_operations();
alter function public.email_export_for_user(uuid) rename to email_export_before_operations;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.email_export_before_operations(p_user)||jsonb_build_object(
  'operator_actions',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'object_type',e.object_type,'object_id',e.object_id,'version',e.version,'action',e.action,'created_at',e.created_at) order by e.created_at)
   from public.email_operator_events e where e.actor_id=p_user),'[]'::jsonb),
  'campaign_audiences',coalesce((select jsonb_agg(jsonb_build_object('audience_id',m.audience_id,'reason',m.reason,'evaluated_at',m.evaluated_at))
   from public.email_campaign_audience_members m join public.email_subscribers s on s.id=m.subscriber_id where s.user_id=p_user and s.confirmed_at is not null),'[]'::jsonb));
$$;
alter function public.email_journey_save(text,text,text,jsonb,text,text,uuid,uuid,integer) rename to email_journey_save_before_operations;
create function public.email_journey_save(p_name text,p_event text,p_state text,p_definition jsonb,p_reentry text default 'once_per_account',p_status text default 'draft',p_actor uuid default null,p_id uuid default null,p_expected_version integer default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform public.email_operator_barrier(p_actor);
 result:=public.email_journey_save_before_operations(p_name,p_event,p_state,p_definition,p_reentry,p_status,p_actor,p_id,p_expected_version);
 insert into public.email_operator_events(object_type,object_id,version,action,actor_id)
 values('journey',(result->>'id')::uuid,(result->>'version')::integer,'save',p_actor);
 return result;
end $$;
alter function public.email_journey_cancel(uuid,uuid) rename to email_journey_cancel_before_operations;
create function public.email_journey_cancel(p_run uuid,p_actor uuid default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare run public.email_journey_runs; result boolean;
begin
 perform public.email_operator_barrier(p_actor);
 select * into run from public.email_journey_runs where id=p_run for update;
 result:=public.email_journey_cancel_before_operations(p_run,p_actor);
 if result and run.status in ('waiting','processing') then
  insert into public.email_operator_events(object_type,object_id,version,action,actor_id) values('journey',p_run,run.version,'cancel',p_actor);
 end if;
 return result;
end $$;
do $$ declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace
  and (p.proname like 'email_campaign_%' or p.proname in ('email_operator_barrier','email_export_for_user','email_export_before_operations',
   'email_journey_save','email_journey_save_before_operations','email_journey_cancel','email_journey_cancel_before_operations')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
-- Opaque identities survive retention so a retry cannot become a new send.
alter table public.email_outbox add column payload_retained_at timestamptz;
create index email_outbox_retention on public.email_outbox(updated_at,id)
 where payload_retained_at is null and status in ('delivered','failed','bounced','complained','suppressed');
create table public.email_retention_policy (
 singleton boolean primary key default true check(singleton),
 payload_days integer not null default 90 check(payload_days between 30 and 365),
 version integer not null default 1, updated_at timestamptz not null default now()
);
insert into public.email_retention_policy(singleton) values(true);
alter table public.email_retention_policy enable row level security;
revoke all on public.email_retention_policy from public,anon,authenticated;
grant select,update on public.email_retention_policy to service_role;

create function public.email_receipt_reconcile(p_id uuid,p_receipt jsonb,p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.email_outbox; provider text; receipt_status text;
begin
 perform public.email_operator_barrier(p_actor);
 receipt_status:=p_receipt->>'status'; provider:=nullif(p_receipt->>'id','');
 if jsonb_typeof(p_receipt) is distinct from 'object' or octet_length(p_receipt::text)>4000
  or receipt_status is null or receipt_status not in ('accepted','retry','failed','uncertain','suppressed')
  or (receipt_status='accepted' and (provider is null or length(provider)>250)) then
  raise exception 'invalid_receipt' using errcode='22023'; end if;
 -- Keep the provider callback lock order: provider -> outbox. Erasure uses the
 -- account/mailbox barriers before this lock, so do not acquire them afterwards.
 if provider is not null then perform pg_advisory_xact_lock(hashtextextended(provider,913)); end if;
 select * into o from public.email_outbox where id=p_id for update;
 if not found then raise exception 'message_missing' using errcode='P0002'; end if;
 if o.erased_at is not null or o.payload_retained_at is not null
  or o.status in ('delivered','failed','bounced','complained','suppressed')
  or (o.status='processing' and o.leased_until>now()) then
  return jsonb_build_object('status',o.status,'changed',false,'sent',false);
 end if;
 if receipt_status='accepted' then
  if o.provider_id is not null and o.provider_id<>provider then raise exception 'receipt_identity_conflict' using errcode='40001'; end if;
  update public.email_outbox set provider_id=provider,status='accepted',accepted_at=coalesce(accepted_at,now()),
   lease_id=null,leased_until=null,last_error=null,updated_at=now() where id=p_id;
  perform public.email_apply_events(p_id);
 elsif receipt_status in ('failed','suppressed') and o.status in ('uncertain','processing','queued') then
  update public.email_outbox set status=receipt_status,lease_id=null,leased_until=null,last_error='gateway_'||receipt_status,updated_at=now() where id=p_id;
 else
  -- Missing/uncertain/definite-quota receipts never authorize manual resend.
  return jsonb_build_object('status',o.status,'changed',false,'sent',false);
 end if;
 insert into public.email_operator_events(object_type,object_id,action,actor_id) values('message',p_id,'reconcile',p_actor);
 return jsonb_build_object('status',(select b.status from public.email_outbox b where id=p_id),'changed',true,'sent',false);
end $$;

create function public.email_retention_tick(p_limit integer default 500)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare policy public.email_retention_policy; n integer; t integer;
begin
 select * into policy from public.email_retention_policy where singleton;
 -- Body retention never deletes consent/suppression or idempotency evidence.
 with batch as (select id from public.email_outbox where payload_retained_at is null
  and status in ('delivered','failed','bounced','complained','suppressed')
  and updated_at<now()-make_interval(days=>policy.payload_days)
  order by updated_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,500),1000)))
 update public.email_outbox o set payload='{}',payload_retained_at=now() from batch b where o.id=b.id;
 get diagnostics n=row_count;
 with batch as (select token_hash from public.email_subscription_tokens where expires_at<now()-interval '7 days'
  order by expires_at for update skip locked limit greatest(1,least(coalesce(p_limit,500),1000)))
 delete from public.email_subscription_tokens t using batch b where t.token_hash=b.token_hash;
 get diagnostics t=row_count;
 return jsonb_build_object('payloads_redacted',n,'expired_tokens_removed',t);
end $$;

create function public.email_operations_health()
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('as_of',now(),'window_days',30,
  'states',coalesce((select jsonb_object_agg(status,n) from (select status,count(*) n from public.email_outbox where created_at>now()-interval '30 days' group by status) x),'{}'::jsonb),
  'queue_oldest_seconds',(select greatest(0,extract(epoch from now()-min(available_at))) from public.email_outbox where status='queued'),
  'expired_leases',(select count(*) from public.email_outbox where status='processing' and leased_until<now()),
  'acceptance_p50_seconds',(select percentile_cont(0.5) within group(order by extract(epoch from accepted_at-created_at)) from public.email_outbox where accepted_at is not null and created_at>now()-interval '30 days'),
  'acceptance_p95_seconds',(select percentile_cont(0.95) within group(order by extract(epoch from accepted_at-created_at)) from public.email_outbox where accepted_at is not null and created_at>now()-interval '30 days'),
  'delivery_p95_seconds',(select percentile_cont(0.95) within group(order by greatest(0,extract(epoch from delivered_at-accepted_at))) from public.email_outbox where delivered_at is not null and accepted_at is not null and created_at>now()-interval '30 days'),
  'unmatched_provider_events',(select count(*) from public.email_delivery_events e where created_at>now()-interval '30 days' and not exists(select 1 from public.email_outbox o where o.provider_id=e.provider_id)),
  'retention',(select to_jsonb(p)-'singleton' from public.email_retention_policy p where singleton),
  'dlq_visibility','Use the Cloudflare queue dashboard; this database cannot infer DLQ depth.');
$$;
revoke all on function public.email_receipt_reconcile(uuid,jsonb,uuid),public.email_retention_tick(integer),public.email_operations_health() from public,anon,authenticated;
grant execute on function public.email_receipt_reconcile(uuid,jsonb,uuid),public.email_retention_tick(integer),public.email_operations_health() to service_role;

create function public.run_email_operations()
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if to_regclass('public.admin_automations') is not null then
  if exists(select 1 from public.admin_automations where slug='email_operations' and not enabled) then return; end if;
 end if;
 perform net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/email-operations',
  headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',
   (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
  body:='{"action":"tick"}'::jsonb,timeout_milliseconds:=30000);
end $$;
revoke all on function public.run_email_operations() from public,anon,authenticated;
grant execute on function public.run_email_operations() to service_role;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('email_operations','* * * * *','select public.run_email_operations()');
 end if;
 if to_regclass('public.admin_automations') is not null then
  insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
  values('email_operations','Email planning and maintenance','Collects bounded campaign audience snapshots without sending promotional mail.',
   'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,'{"type":"rpc","fn":"run_email_operations"}'::jsonb,'* * * * *')
  on conflict(slug) do update set description=excluded.description,action=excluded.action,schedule=excluded.schedule;
 end if;
end $$;
notify pgrst,'reload schema';
commit;

