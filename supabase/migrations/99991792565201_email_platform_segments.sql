begin;
create table public.email_segments (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 1 and 200),
 rule jsonb not null check (jsonb_typeof(rule)='object' and octet_length(rule::text)<=8000),
 version integer not null default 1 check (version>0),
 status text not null default 'active' check (status in ('active','archived')),
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.email_segment_versions (
 segment_id uuid not null references public.email_segments(id) on delete cascade,
 version integer not null,
 rule jsonb not null,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 primary key(segment_id,version)
);
alter table public.email_segments enable row level security;
alter table public.email_segment_versions enable row level security;
revoke all on public.email_segments,public.email_segment_versions from public,anon,authenticated;
grant all on public.email_segments,public.email_segment_versions to service_role;
create index on public.email_subscribers(status,locale);
create index on public.email_subscribers using gin(topics);
create index on public.email_delivery_events(recipient_email,event_type,occurred_at);

create function public.email_segment_validate(p_rule jsonb,p_depth integer default 0)
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
 if field not in ('locale','status','source') or op not in ('eq','in') then raise exception 'unsupported_segment_field_or_operator' using errcode='22023'; end if;
 if op='eq' then val:=jsonb_build_array(val); end if;
 if jsonb_typeof(val) is distinct from 'array' then raise exception 'invalid_segment_values' using errcode='22023'; end if;
 if jsonb_array_length(val) not between 1 and 20 then raise exception 'invalid_segment_values' using errcode='22023'; end if;
 for child in select value from jsonb_array_elements(val) loop
  if jsonb_typeof(child) is distinct from 'string' then raise exception 'invalid_segment_value' using errcode='22023'; end if;
  v:=child#>>'{}';
  if (field='locale' and v !~ '^[a-z]{2}(-[A-Za-z]{2,8})?$')
   or (field='status' and v not in ('pending','subscribed','unsubscribed'))
   or (field='source' and (length(v) not between 1 and 100)) then raise exception 'invalid_segment_value' using errcode='22023'; end if;
 end loop;
end $$;

create function public.email_subscriber_eligibility(p_sub public.email_subscribers,p_topic text default null)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select case
  when p_sub.status='pending' then 'pending_confirmation'
  when p_sub.status<>'subscribed' then 'unsubscribed'
  when p_topic is not null and not p_topic=any(p_sub.topics) then 'topic_not_subscribed'
  when exists(select 1 from public.email_disabled_accounts where user_id=p_sub.user_id) then 'account_disabled'
  when exists(select 1 from public.email_suppressions where email=p_sub.email)
   or exists(select 1 from public.email_erased_mailboxes where suppression_reason is not null
     and mailbox_hash=encode(sha256(convert_to(p_sub.email,'UTF8')),'hex')) then 'recipient_suppressed'
  else 'eligible' end;
$$;

create function public.email_segment_matches(p_sub public.email_subscribers,p_rule jsonb,p_at timestamptz)
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

create function public.email_segment_preview(p_rule jsonb,p_topic text default null,p_limit integer default 50,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb; at_time timestamptz:=statement_timestamp();
begin
 perform public.email_segment_validate(p_rule);
 if p_topic is not null and p_topic not in ('newsletter','product_updates','events') then raise exception 'invalid_segment_topic' using errcode='22023'; end if;
 with matches as materialized (
  select s.id,s.email,s.locale,s.status,public.email_subscriber_eligibility(s,p_topic) reason
  from public.email_subscribers s where public.email_segment_matches(s,p_rule,at_time)
 ), sample as (
  select * from matches where p_after is null or id>p_after order by id limit greatest(1,least(coalesce(p_limit,50),100))
 ), exclusions as (select reason,count(*) n from matches where reason<>'eligible' group by reason)
 select jsonb_build_object('evaluated_at',at_time,'matched',(select count(*) from matches),
  'eligible',(select count(*) from matches where reason='eligible'),
  'excluded',coalesce((select jsonb_object_agg(reason,n) from exclusions),'{}'::jsonb),
  'sample',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from sample s),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.email_segment_save(p_name text,p_rule jsonb,p_actor uuid default null,p_id uuid default null,p_expected_version integer default null,p_status text default 'active')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_segments;
begin
 perform public.email_segment_validate(p_rule);
 if p_name is null or length(btrim(p_name)) not between 1 and 200 or p_status is null or p_status not in ('active','archived') then raise exception 'invalid_segment' using errcode='22023'; end if;
 if p_id is null then
  insert into public.email_segments(name,rule,created_by,updated_by,status) values(btrim(p_name),p_rule,p_actor,p_actor,p_status) returning * into r;
 else
  select * into r from public.email_segments where id=p_id for update;
  if not found then raise exception 'segment_not_found' using errcode='P0002'; end if;
  if p_expected_version is distinct from r.version then raise exception 'segment_version_conflict' using errcode='40001'; end if;
  update public.email_segments set name=btrim(p_name),rule=p_rule,status=p_status,updated_by=p_actor,
   version=version+1,updated_at=now() where id=p_id returning * into r;
 end if;
 insert into public.email_segment_versions(segment_id,version,rule,created_by) values(r.id,r.version,r.rule,p_actor);
 return jsonb_build_object('id',r.id,'version',r.version,'status',r.status);
end $$;

-- A derived timeline uses the authoritative consent and delivery tables. It
-- introduces no separate copy of contact PII or private product event payloads.
create function public.email_contact_timeline(p_subscriber uuid,p_limit integer default 50)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at desc,t.id),'[]'::jsonb) from (
  select * from (
   select e.id::text id,'consent.'||e.action kind,e.created_at occurred_at,
    jsonb_build_object('topics',e.topics,'consent_version',e.consent_version,'source',e.source) details
   from public.email_consent_events e where e.subscriber_id=p_subscriber
   union all
   select e.event_id,'delivery.'||e.event_type,e.occurred_at,jsonb_build_object('hard_bounce',e.hard_bounce,'suppression',e.suppression)
   from public.email_delivery_events e join public.email_subscribers s on s.email=e.recipient_email
   where s.id=p_subscriber and s.confirmed_at is not null
  ) events order by occurred_at desc,id limit greatest(1,least(coalesce(p_limit,50),100))
 ) t;
$$;

create or replace function public.email_audience_count(p_topic text,p_locale text default null)
returns bigint language sql stable security invoker set search_path=public,pg_temp as $$
 select count(*) from public.email_subscribers s where (p_locale is null or s.locale=p_locale)
 and public.email_subscriber_eligibility(s,p_topic)='eligible';
$$;

do $$ declare f record;
begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
 and proname in ('email_segment_validate','email_subscriber_eligibility','email_segment_matches','email_segment_preview','email_segment_save','email_contact_timeline') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
