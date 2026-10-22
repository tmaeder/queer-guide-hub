begin;
-- Each purpose is independently requested. Existing activity permissions remain
-- separate; old clients preserve these topics when saving other preferences.
alter table public.email_delivery_preferences add column operational_topics text[] not null default '{}'
 check(operational_topics<@array['event_updates','trip_updates','group_requests','contributions','payments']::text[]);
alter function public.email_delivery_preferences_save(uuid,boolean,text,boolean,integer,integer,integer,boolean,boolean) rename to email_delivery_preferences_before_notices;
create function public.email_delivery_preferences_save(p_user uuid,p_enabled boolean,p_timezone text,p_quiet boolean,p_start integer,p_end integer,p_version integer,p_group_enabled boolean default null,p_trip_enabled boolean default null,p_operational_topics text[] default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_operational_topics is not null and (not p_operational_topics<@array['event_updates','trip_updates','group_requests','contributions','payments']::text[]
  or cardinality(p_operational_topics)>5 or array_position(p_operational_topics,null) is not null
  or cardinality(p_operational_topics)<>(select count(distinct x) from unnest(p_operational_topics) x)) then raise exception 'invalid_operational_topics' using errcode='22023'; end if;
 result:=public.email_delivery_preferences_before_notices(p_user,p_enabled,p_timezone,p_quiet,p_start,p_end,p_version,p_group_enabled,p_trip_enabled);
 update public.email_delivery_preferences set operational_topics=coalesce(p_operational_topics,operational_topics) where user_id=p_user;
 result:=public.email_delivery_preferences_get(p_user);
 update public.email_delivery_preference_events set preferences=result where user_id=p_user and version=p_version+1;
 update public.email_operational_notices set cancelled=true where user_id=p_user and not topic=any(coalesce(p_operational_topics,(select operational_topics from public.email_delivery_preferences where user_id=p_user)));
 update public.email_outbox o set activity_cancelled_at=coalesce(activity_cancelled_at,clock_timestamp()),
  status=case when o.status='queued' or o.leased_until<now() then 'suppressed' else o.status end,
  last_error='activity_email_disabled',updated_at=now()
 where o.template_key='operational_notice' and o.recipient_user_id=p_user and o.status in ('queued','processing')
 and exists(select 1 from public.email_operational_notices n where n.id=o.activity_source_id and n.cancelled);
 return result;
end $$;
create table public.email_operational_notices (
 id uuid primary key default gen_random_uuid(),
 event_key text not null unique check(length(event_key) between 1 and 250),
 user_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid not null, membership_id uuid,
 kind text not null check(kind in ('event_change','event_reminder','trip_change','trip_reminder','group_request','contribution','payment')),
 topic text not null check(topic in ('event_updates','trip_updates','group_requests','contributions','payments')),
 source_version text not null check(length(source_version) between 1 and 250),
 cancelled boolean not null default false,
 created_at timestamptz not null default clock_timestamp()
);
create index on public.email_operational_notices(user_id);
create index on public.email_operational_notices(kind,source_id);
create index on public.email_operational_notices(created_at,id) where not cancelled;
alter table public.email_operational_notices enable row level security;
revoke all on public.email_operational_notices from public,anon,authenticated;
grant all on public.email_operational_notices to service_role;

create function public.email_notice_current(p_id uuid)
returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare n public.email_operational_notices;
begin
 select * into n from public.email_operational_notices where id=p_id;
 if not found or n.cancelled or n.created_at<=now()-interval '24 hours'
  or exists(select 1 from public.email_disabled_accounts where user_id=n.user_id)
  or not exists(select 1 from public.email_delivery_preferences p where p.user_id=n.user_id and n.topic=any(p.operational_topics)) then return false; end if;
 case n.kind
 when 'event_change','event_reminder' then
  return exists(select 1 from public.events e join public.event_attendees a on a.event_id=e.id and a.user_id=n.user_id and a.status in ('going','interested') and a.id=n.membership_id
   where e.id=n.source_id and e.duplicate_of_id is null and e.status in ('active','cancelled')
   and md5(jsonb_build_array(extract(epoch from e.start_date),extract(epoch from e.end_date),e.status)::text)=n.source_version
   and (n.kind='event_change' or (e.status='active' and e.start_date>now() and e.start_date<=now()+interval '24 hours')));
 when 'trip_change','trip_reminder' then
  return exists(select 1 from public.trips t join public.trip_members m on m.trip_id=t.id and m.user_id=n.user_id and (m.accepted_at is not null or m.role='owner') and m.id=n.membership_id
   where t.id=n.source_id and t.status in ('planning','active','archived')
   and not public.is_blocked(n.user_id,t.owner_id)
   and md5(jsonb_build_array(t.start_date,t.end_date,t.status)::text)=n.source_version
   and (n.kind='trip_change' or (t.status in ('planning','active') and t.start_date=(now() at time zone 'UTC')::date+1)));
 when 'group_request' then
  return exists(select 1 from public.group_join_requests r join public.community_groups g on g.id=r.group_id
   where r.id=n.source_id and r.user_id=n.user_id and r.status=n.source_version and r.status in ('approved','rejected')
   and g.archived_at is null and g.duplicate_of_id is null
   and (r.decided_by is null or not public.is_blocked(n.user_id,r.decided_by)));
 when 'contribution' then
  return exists(select 1 from public.community_submissions s where s.id=n.source_id and s.submitted_by=n.user_id
   and s.status=n.source_version and s.status in ('approved','rejected') and not coalesce(s.is_spam,false));
 when 'payment' then
  return exists(select 1 from public.donations d where d.id=n.source_id and d.user_id=n.user_id and d.status='completed'
   and d.stripe_session_id is not null and d.status=n.source_version and exists(select 1 from public.email_verified_payments v where v.donation_id=d.id));
 else return false;
 end case;
end $$;

create function email_private.capture_operational_notice()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare topic_name text; notice_kind text; revision text; recipients uuid[]; uid uuid; event_identity text:=gen_random_uuid()::text;
begin
 if tg_table_name='events' then
  if (new.start_date,new.end_date,new.status) is not distinct from (old.start_date,old.end_date,old.status) then return new; end if;
  topic_name:='event_updates';notice_kind:='event_change'; revision:=md5(jsonb_build_array(extract(epoch from new.start_date),extract(epoch from new.end_date),new.status)::text);
  select array_agg(distinct a.user_id order by a.user_id) into recipients from public.event_attendees a where a.event_id=new.id and a.status in ('going','interested');
 elsif tg_table_name='trips' then
  if (new.start_date,new.end_date,new.status) is not distinct from (old.start_date,old.end_date,old.status) then return new; end if;
  topic_name:='trip_updates';notice_kind:='trip_change';revision:=md5(jsonb_build_array(new.start_date,new.end_date,new.status)::text);
  select array_agg(distinct m.user_id order by m.user_id) into recipients from public.trip_members m where m.trip_id=new.id and (m.accepted_at is not null or m.role='owner');
 elsif tg_table_name='group_join_requests' then
  if new.status not in ('approved','rejected') or new.status is not distinct from old.status then return new; end if;
  topic_name:='group_requests';notice_kind:='group_request';revision:=new.status;recipients:=array[new.user_id];
 elsif tg_table_name='community_submissions' then
  if new.status not in ('approved','rejected') or new.status is not distinct from old.status then return new; end if;
  topic_name:='contributions';notice_kind:='contribution';revision:=new.status;recipients:=array[new.submitted_by];
 else return new;
 end if;
 foreach uid in array coalesce(recipients,'{}'::uuid[]) loop
  if uid is null then continue; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,914));
  if not exists(select 1 from public.email_disabled_accounts where user_id=uid)
   and exists(select 1 from public.email_delivery_preferences p where p.user_id=uid and topic_name=any(p.operational_topics)) then
   insert into public.email_operational_notices(event_key,user_id,source_id,kind,topic,source_version,membership_id)
    values(notice_kind||':'||new.id::text||':'||event_identity||':'||uid::text,uid,new.id,notice_kind,topic_name,revision,case when notice_kind='event_change' then (select a.id from public.event_attendees a where a.event_id=new.id and a.user_id=uid limit 1) when notice_kind='trip_change' then (select m.id from public.trip_members m where m.trip_id=new.id and m.user_id=uid limit 1) else null end) on conflict do nothing;
  end if;
 end loop;
 return new;
end $$;
revoke all on function email_private.capture_operational_notice() from public,anon,authenticated;
create trigger email_notice_event after update of start_date,end_date,status on public.events for each row execute function email_private.capture_operational_notice();
create trigger email_notice_trip after update of start_date,end_date,status on public.trips for each row execute function email_private.capture_operational_notice();
create trigger email_notice_group_request after update of status on public.group_join_requests for each row execute function email_private.capture_operational_notice();
create trigger email_notice_contribution after update of status on public.community_submissions for each row execute function email_private.capture_operational_notice();
-- A donation row is not payment proof. Only the signature-verified Stripe
-- webhook may record this minimal provenance through the service-only RPC.
create table public.email_verified_payments (
 donation_id uuid primary key references public.donations(id) on delete cascade,
 provider_event text not null check(length(provider_event) between 1 and 250),
 verified_at timestamptz not null default now()
);
alter table public.email_verified_payments enable row level security;
revoke all on public.email_verified_payments from public,anon,authenticated;
grant all on public.email_verified_payments to service_role;
create function public.email_notice_verified_payment(p_donation uuid,p_event text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.donations;
begin
 if p_event is null or length(p_event) not between 1 and 250 then raise exception 'invalid_payment_event' using errcode='22023'; end if;
 select * into d from public.donations where id=p_donation and status='completed' and stripe_session_id is not null;
 if not found or d.user_id is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(d.user_id::text,914));
 if exists(select 1 from public.email_disabled_accounts where user_id=d.user_id) then return false; end if;
 insert into public.email_verified_payments(donation_id,provider_event) values(d.id,p_event) on conflict do nothing;
 if exists(select 1 from public.email_delivery_preferences where user_id=d.user_id and 'payments'=any(operational_topics)) then
  insert into public.email_operational_notices(event_key,user_id,source_id,kind,topic,source_version)
   values('verified-payment:'||d.id::text,d.user_id,d.id,'payment','payments','completed') on conflict do nothing;
 end if;
 return true;
end $$;

create function public.email_notice_reminders(p_limit integer default 50)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare r record; n integer:=0;
begin
 for r in select * from (
  select a.user_id,e.id source_id,'event_reminder' kind,'event_updates' topic,
   md5(jsonb_build_array(extract(epoch from e.start_date),extract(epoch from e.end_date),e.status)::text) revision,a.id membership_id
  from public.events e join public.event_attendees a on a.event_id=e.id and a.status='going'
  join public.email_delivery_preferences p on p.user_id=a.user_id and 'event_updates'=any(p.operational_topics)
  where e.status='active' and e.duplicate_of_id is null and e.start_date>now() and e.start_date<=now()+interval '24 hours'
  union all
  select m.user_id,t.id,'trip_reminder','trip_updates',md5(jsonb_build_array(t.start_date,t.end_date,t.status)::text),m.id
  from public.trips t join public.trip_members m on m.trip_id=t.id and (m.accepted_at is not null or m.role='owner')
  join public.email_delivery_preferences p on p.user_id=m.user_id and 'trip_updates'=any(p.operational_topics)
  where t.status in ('planning','active') and t.start_date=(now() at time zone 'UTC')::date+1
 ) x where not exists(select 1 from public.email_operational_notices n where n.event_key=x.kind||':'||x.source_id::text||':'||x.revision||':'||x.membership_id::text)
 order by user_id,source_id limit greatest(1,least(coalesce(p_limit,50),100)) loop
  perform pg_advisory_xact_lock(hashtextextended(r.user_id::text,914));
  if not exists(select 1 from public.email_disabled_accounts where user_id=r.user_id) then
   insert into public.email_operational_notices(event_key,user_id,source_id,kind,topic,source_version,membership_id)
   values(r.kind||':'||r.source_id::text||':'||r.revision||':'||r.membership_id::text,r.user_id,r.source_id,r.kind,r.topic,r.revision,r.membership_id)
   on conflict do nothing;
   if found then n:=n+1; end if;
  end if;
 end loop;
 return n;
end $$;

create function public.email_notice_candidates(p_limit integer default 5)
returns table(source_id uuid,recipient text,kind text)
language sql stable security invoker set search_path=public,pg_temp as $$
 select n.id,lower(btrim(u.email)),n.kind from public.email_operational_notices n join auth.users u on u.id=n.user_id
 where not n.cancelled and n.created_at>now()-interval '24 hours' and public.email_notice_current(n.id)
 and u.email is not null and not exists(select 1 from public.email_outbox o where o.idempotency_key=encode(sha256(convert_to('operational-notice:'||n.id::text,'UTF8')),'hex'))
 order by n.created_at,n.id limit greatest(1,least(coalesce(p_limit,5),25));
$$;
create function public.email_notice_enqueue(p_source uuid,p_payload jsonb)
returns public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
declare n public.email_operational_notices; o public.email_outbox; address text; identity text;
begin
 select * into n from public.email_operational_notices where id=p_source;
 if not found then raise exception 'notice_unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(n.user_id::text,914));
 if not public.email_notice_current(p_source) then raise exception 'notice_unavailable' using errcode='22023'; end if;
 select lower(btrim(email)) into address from auth.users where id=n.user_id;
 identity:=encode(sha256(convert_to('operational-notice:'||p_source::text,'UTF8')),'hex');
 select * into o from public.email_outbox where idempotency_key=identity;
 if not found then
  o:=public.email_enqueue(identity,address,p_payload,'operational_notice',n.created_at+interval '24 hours',n.user_id);
  update public.email_outbox set activity_source_id=p_source where id=o.id returning * into o;
 elsif o.recipient_user_id is distinct from n.user_id or o.activity_source_id is distinct from p_source then raise exception 'notice_identity_conflict' using errcode='22023'; end if;
 return o;
end $$;
alter function public.email_activity_message_reason(uuid) rename to email_activity_reason_before_notices;
create function public.email_activity_message_reason(p_id uuid)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select case when o.template_key is distinct from 'operational_notice' then public.email_activity_reason_before_notices(p_id)
  when o.activity_cancelled_at is not null then 'activity_email_disabled'
  when not exists(select 1 from auth.users u where u.id=o.recipient_user_id and lower(btrim(u.email))=o.recipient_email) then 'activity_recipient_changed'
  when not public.email_notice_current(o.activity_source_id) then 'activity_source_unavailable'
  when public.email_delivery_is_quiet(o.recipient_user_id) then 'activity_quiet_hours'
  when exists(select 1 from public.email_activity_reservations r where r.user_id=o.recipient_user_id and r.day_bucket=(now() at time zone 'UTC')::date and r.outbox_id<>o.id) then 'activity_daily_budget'
  else null end from public.email_outbox o where o.id=p_id;
$$;
alter function public.email_dispatch_authorize(uuid,uuid) rename to email_dispatch_before_notices;
create function public.email_dispatch_authorize(p_id uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.email_outbox;
begin
 select * into o from public.email_outbox where id=p_id;
 if not found then return false; end if;
 if o.recipient_user_id is not null then perform pg_advisory_xact_lock(hashtextextended(o.recipient_user_id::text,914)); end if;
 if not public.email_dispatch_before_notices(p_id,p_lease) or public.email_activity_message_reason(p_id) is not null then return false; end if;
 if o.template_key='operational_notice' then
  insert into public.email_activity_reservations(user_id,day_bucket,outbox_id) values(o.recipient_user_id,(now() at time zone 'UTC')::date,p_id) on conflict do nothing;
  return exists(select 1 from public.email_activity_reservations r where r.user_id=o.recipient_user_id and r.day_bucket=(now() at time zone 'UTC')::date and r.outbox_id=p_id);
 end if;
 return true;
end $$;
create function email_private.erase_notices()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin delete from public.email_operational_notices where user_id=new.user_id; delete from public.email_verified_payments where donation_id in(select id from public.donations where user_id=new.user_id); return new; end $$;
revoke all on function email_private.erase_notices() from public,anon,authenticated;
create trigger email_notice_erasure after insert on public.email_disabled_accounts for each row execute function email_private.erase_notices();
alter function public.email_export_for_user(uuid) rename to email_export_before_notices;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.email_export_before_notices(p_user)||jsonb_build_object('operational_notices',coalesce((select jsonb_agg(to_jsonb(n)-'event_key' order by created_at) from public.email_operational_notices n where user_id=p_user),'[]'::jsonb));
$$;
do $$ declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace
  and (p.proname like 'email_notice_%' or p.proname in ('email_delivery_preferences_save','email_delivery_preferences_before_notices',
   'email_activity_message_reason','email_activity_reason_before_notices','email_dispatch_authorize','email_dispatch_before_notices','email_export_for_user','email_export_before_notices')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
