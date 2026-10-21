begin;

-- Email opt-in is independent of push permission. Never inherit dm_push_enabled.
create table public.email_delivery_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 dm_digest_enabled boolean not null default false,
 timezone text not null default 'Etc/UTC' check(length(timezone) between 1 and 100),
 quiet_hours_enabled boolean not null default false,
 quiet_start integer not null default 22 check(quiet_start between 0 and 23),
 quiet_end integer not null default 8 check(quiet_end between 0 and 23),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 check(not quiet_hours_enabled or quiet_start<>quiet_end)
);
create table public.email_delivery_preference_events (
 user_id uuid not null references auth.users(id) on delete cascade,
 version integer not null,
 preferences jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,version)
);
-- Reserve the UTC daily activity budget before crossing the provider boundary.
-- Keep reservations on timeout/uncertain delivery: a possible send uses the budget.
create table public.email_activity_reservations (
 user_id uuid not null references auth.users(id) on delete cascade,
 day_bucket date not null,
 outbox_id uuid not null references public.email_outbox(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,day_bucket)
);
create index on public.email_activity_reservations(outbox_id);
alter table public.email_activity_reservations enable row level security;
revoke all on public.email_activity_reservations from public,anon,authenticated;
grant all on public.email_activity_reservations to service_role;
alter table public.email_delivery_preferences enable row level security;
alter table public.email_delivery_preference_events enable row level security;
revoke all on public.email_delivery_preferences,public.email_delivery_preference_events from public,anon,authenticated;
grant all on public.email_delivery_preferences,public.email_delivery_preference_events to service_role;

create function public.email_delivery_preferences_get(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select to_jsonb(p)-'user_id' from public.email_delivery_preferences p where user_id=p_user),
  '{"dm_digest_enabled":false,"timezone":"Etc/UTC","quiet_hours_enabled":false,"quiet_start":22,"quiet_end":8,"version":0}'::jsonb);
$$;

create function public.email_delivery_preferences_save(p_user uuid,p_enabled boolean,p_timezone text,p_quiet boolean,p_start integer,p_end integer,p_version integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_version integer; result jsonb;
begin
 if p_user is null or p_enabled is null or p_quiet is null or p_version is null or p_version<0
  or p_timezone is null or length(p_timezone)>100 or not exists(select 1 from pg_timezone_names where name=p_timezone)
  or p_start is null or p_end is null or p_start not between 0 and 23 or p_end not between 0 and 23
  or (p_quiet and p_start=p_end) then raise exception 'invalid_delivery_preferences' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,914));
 if not exists(select 1 from auth.users where id=p_user) or exists(select 1 from public.email_disabled_accounts where user_id=p_user) then
  raise exception 'email_account_disabled' using errcode='22023'; end if;
 select coalesce((select version from public.email_delivery_preferences where user_id=p_user),0) into current_version;
 if current_version<>p_version then raise exception 'delivery_preferences_conflict' using errcode='40001'; end if;
 insert into public.email_delivery_preferences(user_id,dm_digest_enabled,timezone,quiet_hours_enabled,quiet_start,quiet_end,version)
 values(p_user,p_enabled,p_timezone,p_quiet,p_start,p_end,p_version+1)
 on conflict(user_id) do update set dm_digest_enabled=excluded.dm_digest_enabled,timezone=excluded.timezone,
  quiet_hours_enabled=excluded.quiet_hours_enabled,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,
  version=excluded.version,updated_at=now();
 result:=public.email_delivery_preferences_get(p_user);
 insert into public.email_delivery_preference_events(user_id,version,preferences) values(p_user,p_version+1,result);
 return result;
end $$;

-- Real local wall-clock conversion handles both repeated and skipped DST hours.
-- [start,end), including intervals that cross midnight. Essential mail ignores it.
create function public.email_delivery_is_quiet(p_user uuid,p_at timestamptz default now())
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select p.quiet_hours_enabled and case when p.quiet_start<p.quiet_end
  then extract(hour from p_at at time zone p.timezone)>=p.quiet_start and extract(hour from p_at at time zone p.timezone)<p.quiet_end
  else extract(hour from p_at at time zone p.timezone)>=p.quiet_start or extract(hour from p_at at time zone p.timezone)<p.quiet_end end
 from public.email_delivery_preferences p where p.user_id=p_user),false);
$$;

-- A stale notification alone is insufficient: membership and mute state are live.
-- Count conversations, never copy message text or sender names into email.
create function public.email_dm_unread_count(p_user uuid,p_min_hours integer default 2)
returns integer language sql stable security invoker set search_path=public,pg_temp as $$
 select count(*)::integer from public.notifications n
 where n.user_id=p_user and n.type='dm' and not n.read
 and n.created_at<now()-make_interval(hours=>greatest(2,least(coalesce(p_min_hours,2),168)))
 and exists(select 1 from public.conversation_participants cp join public.conversations c on c.id=cp.conversation_id
  where cp.user_id=p_user and cp.conversation_id=n.related_id and not coalesce(cp.is_muted,false)
   and (cp.last_read_at is null or cp.last_read_at<n.created_at));
$$;

-- Null means eligible. Permanent reasons cancel queued activity; quiet hours hold.
create function public.email_activity_message_reason(p_id uuid)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select case when o.template_key is distinct from 'dm_digest' then null
  when not exists(select 1 from public.email_delivery_preferences p where p.user_id=o.recipient_user_id and p.dm_digest_enabled) then 'activity_email_disabled'
  when not exists(select 1 from auth.users u where u.id=o.recipient_user_id and lower(btrim(u.email))=o.recipient_email) then 'activity_recipient_changed'
  when public.email_dm_unread_count(o.recipient_user_id)=0 then 'activity_no_longer_unread'
  when public.email_delivery_is_quiet(o.recipient_user_id) then 'activity_quiet_hours'
  when exists(select 1 from public.email_activity_reservations r where r.user_id=o.recipient_user_id
   and r.day_bucket=(now() at time zone 'UTC')::date and r.outbox_id<>o.id) then 'activity_daily_budget'
  else null end from public.email_outbox o where o.id=p_id;
$$;

-- All producer paths, including the service dispatcher, share the same gates.
create function email_private.activity_enqueue_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if new.template_key='dm_digest' then
  if new.recipient_user_id is null then raise exception 'activity_owner_required' using errcode='22023'; end if;
  new.expires_at:=least(coalesce(new.expires_at,now()+interval '24 hours'),now()+interval '24 hours');
 end if;
 return new;
end $$;
revoke all on function email_private.activity_enqueue_guard() from public,anon,authenticated;
-- Privacy wrapper attaches ownership after insertion, so validate on attachment too.
create trigger email_activity_expiry before insert or update of template_key,recipient_user_id on public.email_outbox
 for each row when (new.recipient_user_id is not null) execute function email_private.activity_enqueue_guard();
-- Unowned historical dm_digest entries fail eligibility and cannot be submitted.
update public.email_outbox set expires_at=least(coalesce(expires_at,created_at+interval '24 hours'),created_at+interval '24 hours')
 where template_key='dm_digest' and status in ('queued','processing');

alter function public.email_claim(integer,uuid) rename to email_claim_before_activity;
create function public.email_claim(p_limit integer default 10,p_id uuid default null)
returns setof public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.email_outbox o set status='suppressed',last_error=public.email_activity_message_reason(o.id),
  lease_id=null,leased_until=null,updated_at=now()
 where o.template_key='dm_digest' and (o.status='queued' or (o.status='processing' and o.leased_until<now()))
 and public.email_activity_message_reason(o.id) in ('activity_email_disabled','activity_recipient_changed','activity_no_longer_unread');
 return query select * from public.email_claim_before_activity(p_limit,p_id);
end $$;

alter function public.email_dispatch_authorize(uuid,uuid) rename to email_dispatch_before_activity;
create function public.email_dispatch_authorize(p_id uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.email_outbox;
begin
 select * into o from public.email_outbox where id=p_id;
 if not found then return false; end if;
 -- Serialize reservations with preference saves and the existing erasure barrier.
 if o.recipient_user_id is not null then
  perform pg_advisory_xact_lock(hashtextextended(o.recipient_user_id::text,914));
 end if;
 if not public.email_dispatch_before_activity(p_id,p_lease) or public.email_activity_message_reason(p_id) is not null then return false; end if;
 select * into o from public.email_outbox where id=p_id;
 if o.template_key='dm_digest' then
  insert into public.email_activity_reservations(user_id,day_bucket,outbox_id)
   values(o.recipient_user_id,(now() at time zone 'UTC')::date,p_id) on conflict do nothing;
  return exists(select 1 from public.email_activity_reservations r where r.user_id=o.recipient_user_id
   and r.day_bucket=(now() at time zone 'UTC')::date and r.outbox_id=p_id);
 end if;
 return true;
end $$;

create or replace function public.email_claim_before_privacy(p_limit integer default 10, p_id uuid default null)
returns setof public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.email_outbox set status='uncertain',last_error='activity_expired_after_claim',lease_id=null,leased_until=null,updated_at=now()
 where template_key='dm_digest' and status='processing' and expires_at<=now() and leased_until<now();
 update public.email_outbox set status='failed',last_error='message_expired',updated_at=now() where status='queued' and expires_at<=now();
 -- A local lease can expire after the Worker accepted the mail. The Worker
 -- remembers that identity and returns its receipt without sending twice.
 update public.email_outbox set status='uncertain',last_error='attempt_limit_after_expired_lease',updated_at=now() where status='processing' and attempts>=8 and leased_until<now();
 update public.email_outbox o set status='suppressed',last_error='recipient_suppressed',updated_at=now()
 where status in ('queued','processing') and exists(select 1 from public.email_suppressions s where s.email=o.recipient_email);
 return query
 with candidates as (
  select id from public.email_outbox where
   (p_id is null or id=p_id) and attempts<8 and available_at<=now()
   and public.email_journey_message_allowed(id)
   and public.email_activity_message_reason(id) is null
   and (status='queued' or (status='processing' and leased_until<now()))
  order by available_at,id for update skip locked limit greatest(1,least(p_limit,25))
 )
 update public.email_outbox o set status='processing',attempts=o.attempts+1,
 lease_id=gen_random_uuid(),leased_until=now()+interval '2 minutes',updated_at=now()
 from candidates c where o.id=c.id returning o.*;
end $$;


create or replace function public.dm_digest_candidates(p_min_age_hours integer default 2)
returns table(user_id uuid,email text,display_name text,unread_count integer,latest_title text,latest_preview text)
language sql stable security definer set search_path=public,pg_temp as $$
 select u.id,u.email::text,pr.display_name,public.email_dm_unread_count(u.id,p_min_age_hours),null::text,null::text
 from auth.users u join public.profiles pr on pr.user_id=u.id
 join public.email_delivery_preferences p on p.user_id=u.id and p.dm_digest_enabled
 where u.email is not null and not exists(select 1 from public.email_disabled_accounts d where d.user_id=u.id)
 and not public.email_delivery_is_quiet(u.id) and public.email_dm_unread_count(u.id,p_min_age_hours)>0
 and not exists(select 1 from public.push_sent s where s.user_id=u.id and s.kind='dm_digest' and s.day_bucket=(now() at time zone 'UTC')::date)
 and not exists(select 1 from public.email_suppressions s where s.email=lower(btrim(u.email)));
$$;

create function email_private.erase_delivery_preferences()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 delete from public.email_activity_reservations where user_id=new.user_id;
 delete from public.email_delivery_preference_events where user_id=new.user_id;
 delete from public.email_delivery_preferences where user_id=new.user_id;
 return new;
end $$;
revoke all on function email_private.erase_delivery_preferences() from public,anon,authenticated;
create trigger email_delivery_preferences_erasure after insert on public.email_disabled_accounts
 for each row execute function email_private.erase_delivery_preferences();
alter function public.email_export_for_user(uuid) rename to email_export_before_activity;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.email_export_before_activity(p_user)||jsonb_build_object(
 'delivery_preferences',public.email_delivery_preferences_get(p_user),
 'activity_reservations',coalesce((select jsonb_agg(to_jsonb(r)-'user_id' order by day_bucket)
 from public.email_activity_reservations r where user_id=p_user),'[]'::jsonb),
 'delivery_preference_events',coalesce((select jsonb_agg(to_jsonb(e)-'user_id' order by version)
 from public.email_delivery_preference_events e where user_id=p_user),'[]'::jsonb));
$$;

do $$ declare f record;
begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
 and (proname like 'email_delivery_%' or proname in ('email_dm_unread_count','email_activity_message_reason','email_claim','email_claim_before_activity',
  'email_dispatch_authorize','email_dispatch_before_activity','email_export_for_user','email_export_before_activity','dm_digest_candidates')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
