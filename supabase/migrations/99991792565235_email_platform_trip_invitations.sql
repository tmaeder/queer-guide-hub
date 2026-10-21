begin;
alter table public.email_group_mentions add column email_cancelled boolean not null default false;
alter table public.email_outbox add column activity_cancelled_at timestamptz;
alter table public.email_delivery_preferences add column trip_invites_enabled boolean not null default false;
alter function public.email_delivery_preferences_save(uuid,boolean,text,boolean,integer,integer,integer,boolean) rename to email_delivery_preferences_before_trips;
create or replace function public.email_delivery_preferences_get(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select to_jsonb(p)-'user_id' from public.email_delivery_preferences p where user_id=p_user),
 '{"dm_digest_enabled":false,"group_mentions_enabled":false,"trip_invites_enabled":false,"timezone":"Etc/UTC","quiet_hours_enabled":false,"quiet_start":22,"quiet_end":8,"version":0}'::jsonb);
$$;
create function public.email_delivery_preferences_save(p_user uuid,p_enabled boolean,p_timezone text,p_quiet boolean,p_start integer,p_end integer,p_version integer,p_group_enabled boolean default null,p_trip_enabled boolean default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.email_delivery_preferences_before_trips(p_user,p_enabled,p_timezone,p_quiet,p_start,p_end,p_version,p_group_enabled);
 update public.email_delivery_preferences set trip_invites_enabled=coalesce(p_trip_enabled,trip_invites_enabled) where user_id=p_user;
 result:=public.email_delivery_preferences_get(p_user);
 update public.email_delivery_preference_events set preferences=result where user_id=p_user and version=p_version+1;
 if not (result->>'group_mentions_enabled')::boolean then
  update public.email_group_mentions set email_cancelled=true where user_id=p_user and not email_cancelled;
 end if;
 if not (result->>'trip_invites_enabled')::boolean then
  update public.trip_member_invitations set email_cancelled=true where user_id=p_user and not email_cancelled;
 end if;
 -- Preserve live leases for already submitted receipts, but permanently veto
 -- any new submission of this snapshot even if the member opts back in.
 update public.email_outbox set activity_cancelled_at=coalesce(activity_cancelled_at,clock_timestamp()),
  status=case when status='queued' or leased_until<now() then 'suppressed' else status end,
  last_error='activity_email_disabled',updated_at=now()
 where recipient_user_id=p_user and status in ('queued','processing') and (
  (template_key='dm_digest' and not (result->>'dm_digest_enabled')::boolean)
  or (template_key='group_mention' and not (result->>'group_mentions_enabled')::boolean)
  or (template_key='trip_invitation' and not (result->>'trip_invites_enabled')::boolean));
 return result;
end $$;

create table public.trip_member_invitations (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 membership_id uuid not null unique,
 user_id uuid not null references auth.users(id) on delete cascade,
 inviter_user_id uuid not null references auth.users(id) on delete cascade,
 inviter_membership_id uuid not null,
 invited_role text not null check(invited_role in ('editor','viewer')),
 status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')),
 email_requested boolean not null default false,
 email_cancelled boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '7 days',
 responded_at timestamptz
);
create index on public.trip_member_invitations(user_id,created_at);
create index on public.trip_member_invitations(inviter_user_id,created_at);
create index on public.trip_member_invitations(trip_id);
create index on public.trip_member_invitations(created_at,id) where status='pending' and email_requested;
alter table public.trip_member_invitations enable row level security;
revoke all on public.trip_member_invitations from public,anon,authenticated;
grant all on public.trip_member_invitations to service_role;

create table public.trip_invitation_rate_limits (
 user_id uuid not null references auth.users(id) on delete cascade,
 hour_bucket timestamptz not null,
 invitations integer not null check(invitations between 1 and 20),
 primary key(user_id,hour_bucket)
);
alter table public.trip_invitation_rate_limits enable row level security;
revoke all on public.trip_invitation_rate_limits from public,anon,authenticated;
grant all on public.trip_invitation_rate_limits to service_role;

create function public.trip_invitation_actor_allowed(p_trip uuid,p_actor uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.trips t join public.trip_members m on m.trip_id=t.id
 where t.id=p_trip and t.status in ('planning','active') and m.user_id=p_actor and m.accepted_at is not null
 and (m.role='editor' or (m.role='owner' and t.owner_id=p_actor))
 and not exists(select 1 from public.email_disabled_accounts d where d.user_id in(p_actor,t.owner_id)));
$$;

-- Pending members must not grant themselves a role or move their row before
-- accepting. An accepted_at write by another member is not recipient consent.
create function email_private.guard_trip_invitation_writes()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare actor uuid:=auth.uid(); owner_id uuid;
begin
 if actor is null then return new; end if; -- Trusted service/bootstrap writes still use product RLS boundaries.
 select t.owner_id into owner_id from public.trips t where t.id=new.trip_id;
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.trip_id is distinct from old.trip_id or new.user_id is distinct from old.user_id then
   raise exception 'trip_membership_identity_immutable' using errcode='42501'; end if;
  if old.user_id=actor and old.accepted_at is null and actor is distinct from owner_id
   and (to_jsonb(new)-'accepted_at') is distinct from (to_jsonb(old)-'accepted_at') then
   raise exception 'invitation_recipient_can_only_accept' using errcode='42501'; end if;
  if old.accepted_at is null and new.accepted_at is not null
   and exists(select 1 from public.trip_member_invitations where membership_id=old.id)
   and not exists(select 1 from public.trip_member_invitations where membership_id=old.id and public.trip_invitation_current(id)) then
   raise exception 'invitation_no_longer_actionable' using errcode='42501'; end if;
  if old.accepted_at is null and new.accepted_at is not null and actor<>old.user_id then
   raise exception 'invitation_requires_recipient_acceptance' using errcode='42501'; end if;
 elsif new.accepted_at is not null and not(new.user_id=owner_id and new.role='owner') then
  raise exception 'invitation_requires_recipient_acceptance' using errcode='42501';
 end if;
 if new.role='owner' and new.user_id is distinct from owner_id then raise exception 'trip_owner_role_reserved' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function email_private.guard_trip_invitation_writes() from public,anon,authenticated;
create trigger email_trip_membership_guard before insert or update on public.trip_members for each row execute function email_private.guard_trip_invitation_writes();

create function email_private.trip_invitation_membership_changed()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if tg_op='DELETE' then
  update public.trip_member_invitations set status='revoked',responded_at=clock_timestamp() where membership_id=old.id and status='pending';
  return old;
 end if;
 if new.trip_id is distinct from old.trip_id or new.user_id is distinct from old.user_id or new.role is distinct from old.role then
  update public.trip_member_invitations set status='revoked',responded_at=clock_timestamp() where membership_id=old.id and status='pending';
 elsif new.accepted_at is not null then
  update public.trip_member_invitations set status='accepted',responded_at=clock_timestamp() where membership_id=old.id and status='pending';
 end if;
 return new;
end $$;
revoke all on function email_private.trip_invitation_membership_changed() from public,anon,authenticated;
create trigger email_trip_invitation_changed after update of trip_id,user_id,role,accepted_at or delete on public.trip_members
 for each row execute function email_private.trip_invitation_membership_changed();

create function public.trip_invitation_current(p_id uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.trip_member_invitations i join public.trips t on t.id=i.trip_id and t.status in ('planning','active')
 join public.trip_members m on m.id=i.membership_id and m.trip_id=i.trip_id and m.user_id=i.user_id and m.role=i.invited_role and m.accepted_at is null
 join public.trip_members a on a.id=i.inviter_membership_id and a.trip_id=i.trip_id and a.user_id=i.inviter_user_id and a.accepted_at is not null
 where i.id=p_id and i.status='pending' and i.expires_at>now()
 and (a.role='editor' or (a.role='owner' and t.owner_id=a.user_id))
 and not public.is_blocked(i.user_id,i.inviter_user_id) and not public.is_blocked(i.user_id,t.owner_id)
 and not exists(select 1 from public.email_disabled_accounts d where d.user_id in(i.user_id,i.inviter_user_id,t.owner_id)));
$$;

create function public.trip_invitation_create(p_actor uuid,p_trip uuid,p_username text,p_role text default 'viewer')
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare target uuid; member public.trip_members; inviter_member uuid; invitation public.trip_member_invitations; budget integer; bucket timestamptz;
begin
 if p_actor is null or p_role is null or p_role not in ('editor','viewer') or p_username is null or length(btrim(p_username)) not between 2 and 40 then
  raise exception 'invitation_unavailable' using errcode='22023'; end if;
 if not public.trip_invitation_actor_allowed(p_trip,p_actor) then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 select p.user_id into target from public.profiles p join auth.users u on u.id=p.user_id where lower(p.username)=lower(btrim(p_username)) order by p.user_id limit 1;
 if target is null or target=p_actor or public.is_blocked(target,p_actor) or exists(select 1 from public.trips where id=p_trip and public.is_blocked(target,owner_id)) then raise exception 'invitation_unavailable' using errcode='22023'; end if;
 -- Ordered account locks serialize source creation with both parties' erasure
 -- and serialize the inviter's rate budget across different trips.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,914)) from unnest(array[p_actor,target]) uid order by uid;
 perform 1 from public.trips where id=p_trip for update;
 if not public.trip_invitation_actor_allowed(p_trip,p_actor) then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 if exists(select 1 from public.email_disabled_accounts where user_id=target) then raise exception 'invitation_unavailable' using errcode='22023'; end if;
 select * into member from public.trip_members where trip_id=p_trip and user_id=target order by id limit 1 for update;
 if found then
  if member.accepted_at is not null or member.role is distinct from p_role then raise exception 'invitation_unavailable' using errcode='22023'; end if;
  select * into invitation from public.trip_member_invitations where membership_id=member.id;
  if found then
   if public.trip_invitation_current(invitation.id) then return invitation.id; end if;
   update public.trip_member_invitations set status='revoked',responded_at=clock_timestamp() where id=invitation.id and status='pending';
   delete from public.trip_members where id=member.id;
   member:=null;
  end if;
 end if;
 bucket:=date_trunc('hour',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
 insert into public.trip_invitation_rate_limits(user_id,hour_bucket,invitations) values(p_actor,bucket,1)
 on conflict(user_id,hour_bucket) do update set invitations=trip_invitation_rate_limits.invitations+1
 where trip_invitation_rate_limits.invitations<20 returning invitations into budget;
 if budget is null then raise exception 'invitation_rate_limited' using errcode='22023'; end if;
 select id into inviter_member from public.trip_members where trip_id=p_trip and user_id=p_actor and accepted_at is not null
  and role in ('owner','editor') order by id limit 1;
 if member.id is null then
  insert into public.trip_members(trip_id,user_id,role) values(p_trip,target,p_role) returning * into member;
 end if;
 insert into public.trip_member_invitations(trip_id,membership_id,user_id,inviter_user_id,inviter_membership_id,invited_role,email_requested)
 values(p_trip,member.id,target,p_actor,inviter_member,p_role,exists(select 1 from public.email_delivery_preferences where user_id=target and trip_invites_enabled))
 returning * into invitation;
 return invitation.id;
end $$;

create function public.trip_invitation_list(p_user uuid,p_trip uuid default null)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with candidates as (
  select i.* from public.trip_member_invitations i where ((p_trip is null and i.user_id=p_user) or p_trip=i.trip_id)
  and i.status='pending' and i.expires_at>now() and (p_trip is not null or public.trip_invitation_current(i.id))
  order by i.created_at desc,i.id limit 100
 )
 select case when p_trip is not null and not public.trip_invitation_actor_allowed(p_trip,p_user) then
 jsonb_build_object('can_invite',false,'invitations','[]'::jsonb) else
 jsonb_build_object('can_invite',p_trip is not null,'invitations',coalesce((select jsonb_agg(jsonb_build_object(
  'id',i.id,'trip_id',i.trip_id,'trip_title',t.title,'inviter_name',coalesce(a.display_name,'A trip member'),
  'username',p.username,'role',i.invited_role,'status',i.status,'expires_at',i.expires_at,
  'actionable',public.trip_invitation_current(i.id),'can_revoke',p_trip is not null and (i.inviter_user_id=p_user or t.owner_id=p_user)) order by i.created_at desc,i.id)
 from candidates i join public.trips t on t.id=i.trip_id
 left join public.profiles a on a.user_id=i.inviter_user_id left join public.profiles p on p.user_id=i.user_id
 where ((p_trip is null and i.user_id=p_user) or (p_trip=i.trip_id))
 and i.status='pending' and i.expires_at>now() and (p_trip is not null or public.trip_invitation_current(i.id))),'[]'::jsonb)) end;
$$;

create function public.trip_invitation_respond(p_user uuid,p_id uuid,p_decision text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.trip_member_invitations;
begin
 if p_decision is null or p_decision not in ('accept','decline') then raise exception 'invalid_invitation_response' using errcode='22023'; end if;
 -- Take account barriers before row locks, so acceptance cannot deadlock
 -- account erasure when lifecycle capture also needs the recipient barrier.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,914))
 from unnest(array[p_user,(select inviter_user_id from public.trip_member_invitations where id=p_id and user_id=p_user)]) uid
 where uid is not null order by uid;
 -- Within those barriers, match the membership trigger's row-lock order.
 perform 1 from public.trip_members where id=(select membership_id from public.trip_member_invitations where id=p_id) for update;
 select * into i from public.trip_member_invitations where id=p_id for update;
 if not found or i.user_id is distinct from p_user then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 if (i.status='accepted' and p_decision='accept') or (i.status='declined' and p_decision='decline') then return jsonb_build_object('status',i.status,'trip_id',i.trip_id); end if;
 if not public.trip_invitation_current(p_id) then raise exception 'invitation_unavailable' using errcode='22023'; end if;
 if p_decision='accept' then
  update public.trip_members set accepted_at=clock_timestamp() where id=i.membership_id;
 else
  update public.trip_member_invitations set status='declined',responded_at=clock_timestamp() where id=p_id;
  delete from public.trip_members where id=i.membership_id;
 end if;
 return jsonb_build_object('status',case when p_decision='accept' then 'accepted' else 'declined' end,'trip_id',i.trip_id);
end $$;

create function public.trip_invitation_revoke(p_actor uuid,p_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.trip_member_invitations;
begin
 perform pg_advisory_xact_lock(hashtextextended(uid::text,914))
 from unnest(array[p_actor,(select user_id from public.trip_member_invitations where id=p_id)]) uid where uid is not null order by uid;
 perform 1 from public.trip_members where id=(select membership_id from public.trip_member_invitations where id=p_id) for update;
 select * into i from public.trip_member_invitations where id=p_id for update;
 if not found or not public.trip_invitation_actor_allowed(i.trip_id,p_actor) or not(
  p_actor=i.inviter_user_id or exists(select 1 from public.trips where id=i.trip_id and owner_id=p_actor)) then raise exception 'invitation_unavailable' using errcode='42501'; end if;
 if i.status='revoked' then
  delete from public.trip_members where id=i.membership_id and trip_id=i.trip_id and user_id=i.user_id and accepted_at is null;
  return true;
 end if;
 if i.status<>'pending' then return false; end if;
 update public.trip_member_invitations set status='revoked',responded_at=clock_timestamp() where id=p_id;
 delete from public.trip_members where id=i.membership_id and trip_id=i.trip_id and user_id=i.user_id and accepted_at is null;
 return true;
end $$;

alter function public.email_activity_message_reason(uuid) rename to email_activity_reason_before_trips;
create function public.email_activity_message_reason(p_id uuid)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select case when o.activity_cancelled_at is not null then 'activity_email_disabled'
  when o.template_key is distinct from 'trip_invitation' then public.email_activity_reason_before_trips(p_id)
  when not exists(select 1 from public.email_delivery_preferences p where p.user_id=o.recipient_user_id and p.trip_invites_enabled) then 'activity_email_disabled'
  when not exists(select 1 from auth.users u where u.id=o.recipient_user_id and lower(btrim(u.email))=o.recipient_email) then 'activity_recipient_changed'
  when not exists(select 1 from public.trip_member_invitations i where i.id=o.activity_source_id and i.user_id=o.recipient_user_id and i.email_requested and not i.email_cancelled)
   or not public.trip_invitation_current(o.activity_source_id) then 'activity_source_unavailable'
  when public.email_delivery_is_quiet(o.recipient_user_id) then 'activity_quiet_hours'
  when exists(select 1 from public.email_activity_reservations r where r.user_id=o.recipient_user_id
   and r.day_bucket=(now() at time zone 'UTC')::date and r.outbox_id<>o.id) then 'activity_daily_budget'
  else null end from public.email_outbox o where o.id=p_id;
$$;

create function public.email_trip_invitation_enqueue(p_source uuid,p_payload jsonb)
returns public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
declare i public.trip_member_invitations; o public.email_outbox; address text; identity text;
begin
 select * into i from public.trip_member_invitations where id=p_source;
 if not found then raise exception 'trip_source_unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(i.user_id::text,914));
 if not public.trip_invitation_current(p_source) or not i.email_requested or i.email_cancelled or i.created_at<=now()-interval '24 hours'
  or not exists(select 1 from public.email_delivery_preferences where user_id=i.user_id and trip_invites_enabled) then
  raise exception 'trip_source_unavailable' using errcode='22023'; end if;
 select lower(btrim(email)) into address from auth.users where id=i.user_id;
 identity:=encode(sha256(convert_to('trip-invitation:'||p_source::text,'UTF8')),'hex');
 select * into o from public.email_outbox where idempotency_key=identity;
 if not found then
  o:=public.email_enqueue(identity,address,p_payload,'trip_invitation',least(i.expires_at,i.created_at+interval '24 hours'),i.user_id);
  update public.email_outbox set activity_source_id=p_source where id=o.id returning * into o;
 elsif o.recipient_user_id is distinct from i.user_id or o.activity_source_id is distinct from p_source then
  raise exception 'trip_identity_conflict' using errcode='22023';
 end if;
 return o;
end $$;
create function public.email_trip_invitation_candidates(p_limit integer default 5,p_source uuid default null)
returns table(source_id uuid,recipient text)
language sql stable security invoker set search_path=public,pg_temp as $$
 select i.id,lower(btrim(u.email)) from public.trip_member_invitations i join auth.users u on u.id=i.user_id
 join public.email_delivery_preferences p on p.user_id=i.user_id and p.trip_invites_enabled
 where i.status='pending' and i.email_requested and not i.email_cancelled and i.created_at>now()-interval '24 hours'
 and (p_source is null or i.id=p_source) and u.email is not null and public.trip_invitation_current(i.id)
 and not exists(select 1 from public.email_outbox o where o.idempotency_key=encode(sha256(convert_to('trip-invitation:'||i.id::text,'UTF8')),'hex'))
 order by i.created_at,i.id limit greatest(1,least(coalesce(p_limit,5),25));
$$;
create or replace function public.email_dispatch_authorize(p_id uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.email_outbox;
begin
 select * into o from public.email_outbox where id=p_id;
 if not found then return false; end if;
 if o.recipient_user_id is not null then perform pg_advisory_xact_lock(hashtextextended(o.recipient_user_id::text,914)); end if;
 if not public.email_dispatch_before_activity(p_id,p_lease) or public.email_activity_message_reason(p_id) is not null then return false; end if;
 if o.template_key in ('dm_digest','group_mention','trip_invitation') then
  insert into public.email_activity_reservations(user_id,day_bucket,outbox_id)
   values(o.recipient_user_id,(now() at time zone 'UTC')::date,p_id) on conflict do nothing;
  return exists(select 1 from public.email_activity_reservations r where r.user_id=o.recipient_user_id
   and r.day_bucket=(now() at time zone 'UTC')::date and r.outbox_id=p_id);
 end if;
 return true;
end $$;

create or replace function public.email_claim(p_limit integer default 10,p_id uuid default null)
returns setof public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.email_outbox o set status='suppressed',last_error=public.email_activity_message_reason(o.id),lease_id=null,leased_until=null,updated_at=now()
 where (o.template_key in ('dm_digest','group_mention','trip_invitation') or (o.template_key is null and o.payload->>'from'='Community Groups <noreply@queer.guide>')) and (o.status='queued' or (o.status='processing' and o.leased_until<now()))
 and public.email_activity_message_reason(o.id) in ('activity_email_disabled','activity_recipient_changed','activity_no_longer_unread','activity_source_unavailable');
 return query select * from public.email_claim_before_activity(p_limit,p_id);
end $$;
create or replace function public.email_claim_before_privacy(p_limit integer default 10, p_id uuid default null)
returns setof public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.email_outbox set status='uncertain',last_error='activity_expired_after_claim',lease_id=null,leased_until=null,updated_at=now()
 where template_key in ('dm_digest','group_mention','trip_invitation') and status='processing' and expires_at<=now() and leased_until<now();
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




create function email_private.erase_trip_invitations()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 delete from public.trip_invitation_rate_limits where user_id=new.user_id;
 delete from public.trip_member_invitations where user_id=new.user_id or inviter_user_id=new.user_id;
 return new;
end $$;
revoke all on function email_private.erase_trip_invitations() from public,anon,authenticated;
create trigger email_trip_invitations_erasure after insert on public.email_disabled_accounts for each row execute function email_private.erase_trip_invitations();
alter function public.email_export_for_user(uuid) rename to email_export_before_trips;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.email_export_before_trips(p_user)||jsonb_build_object(
 'trip_invitation_limits',coalesce((select jsonb_agg(to_jsonb(b)-'user_id' order by hour_bucket) from public.trip_invitation_rate_limits b where user_id=p_user),'[]'::jsonb),
 'trip_invitations',coalesce((select jsonb_agg(to_jsonb(i)-'inviter_membership_id' order by i.created_at,i.id)
 from public.trip_member_invitations i where i.user_id=p_user or i.inviter_user_id=p_user),'[]'::jsonb));
$$;
create function public.run_email_trip_invitations()
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if to_regclass('public.admin_automations') is not null then
  if exists(select 1 from public.admin_automations where slug='email_trip_invitations' and not enabled) then return; end if;
 end if;
 perform net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/trip-invitations',
 headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
 body:='{"action":"tick"}'::jsonb,timeout_milliseconds:=30000);
end $$;
do $$ declare f record;
begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
 and (proname like 'trip_invitation_%' or proname like 'email_trip_invitation_%' or proname in ('email_delivery_preferences_save','email_delivery_preferences_before_trips',
 'email_activity_message_reason','email_activity_reason_before_trips','email_dispatch_authorize','email_claim','email_export_for_user','email_export_before_trips','run_email_trip_invitations')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
 if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('email_trip_invitations','* * * * *','select public.run_email_trip_invitations();'); end if;
 if to_regclass('public.admin_automations') is not null then
  insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
  values('email_trip_invitations','Trip invitation email','Queue verified opted-in trip invitations; shared activity policy applies.','system',true,
   '{"type":"schedule"}'::jsonb,'[]'::jsonb,'{"type":"rpc","fn":"run_email_trip_invitations"}'::jsonb,'* * * * *')
  on conflict(slug) do update set description=excluded.description,action=excluded.action,schedule=excluded.schedule;
 end if;
end $$;
create or replace function email_private.capture_group_mentions()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare target record; actor_membership uuid; notice uuid; target_users uuid[];
begin
 if jsonb_typeof(new.mentions) is distinct from 'array' or not public.email_group_available(new.group_id) then return new; end if;
 if tg_op='UPDATE' then
  if new.group_id is distinct from old.group_id or new.user_id is distinct from old.user_id or new.mentions is not distinct from old.mentions then return new; end if;
 end if;
 -- Lock both the sender and bounded recipient set in canonical order, so
 -- account erasure cannot race a new source into existence after its scrub.
 select array_agg(id order by id) into target_users from (
  select distinct u.id from jsonb_array_elements(new.mentions) j
  join auth.users u on u.id::text=j->>'user_id'
  join public.group_memberships m on m.user_id=u.id and m.group_id=new.group_id
  where u.id<>new.user_id and not public.is_blocked(new.user_id,u.id) order by u.id limit 50
 ) eligible;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,914))
 from (select distinct unnest(coalesce(target_users,'{}'::uuid[])||array[new.user_id]) uid) accounts order by uid;
 select id into actor_membership from public.group_memberships where group_id=new.group_id and user_id=new.user_id order by id limit 1;
 if actor_membership is null or exists(select 1 from public.email_disabled_accounts where user_id=new.user_id) then return new; end if;
 -- Bounded fan-out. Malformed IDs are compared as text; they cannot abort a post.
 for target in select distinct u.id user_id,m.id membership_id from jsonb_array_elements(new.mentions) j
  join auth.users u on u.id::text=j->>'user_id'
  join public.group_memberships m on m.user_id=u.id and m.group_id=new.group_id
  where u.id=any(target_users) and u.id<>new.user_id and not public.is_blocked(new.user_id,u.id)
  order by u.id,m.id limit 50 loop
  if tg_op='UPDATE' then
   if coalesce(old.mentions,'[]'::jsonb) @> jsonb_build_array(jsonb_build_object('user_id',target.user_id::text)) then continue; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target.user_id::text,914));
  if exists(select 1 from public.email_disabled_accounts where user_id=target.user_id) then continue; end if;
  select id into notice from public.group_notifications where user_id=target.user_id and related_post_id=new.id
   and related_comment_id is null and notification_type='mention' and group_id=new.group_id order by created_at,id limit 1;
  if notice is null then
   insert into public.group_notifications(user_id,group_id,notification_type,related_post_id,triggered_by_user_id,content)
    values(target.user_id,new.group_id,'mention',new.id,new.user_id,'You were mentioned in a group post. Open Queer Guide to read it.') returning id into notice;
  end if;
  -- Permission must exist when the mention happens: enabling it later is not retroactive consent.
  if exists(select 1 from public.email_delivery_preferences where user_id=target.user_id and group_mentions_enabled) then
   insert into public.email_group_mentions(notification_id,user_id,actor_user_id,group_id,post_id,membership_id,actor_membership_id)
    values(notice,target.user_id,new.user_id,new.group_id,new.id,target.membership_id,actor_membership) on conflict do nothing;
  end if;
 end loop;
 return new;
end $$;

create or replace function public.email_group_mention_current(p_source uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.email_group_mentions e
 join public.group_notifications n on n.id=e.notification_id and n.user_id=e.user_id and n.group_id=e.group_id
  and n.notification_type='mention' and n.related_post_id=e.post_id and n.related_comment_id is null
  and n.triggered_by_user_id=e.actor_user_id and n.read_at is null
 join public.group_posts p on p.id=e.post_id and p.group_id=e.group_id and p.user_id=e.actor_user_id
 join public.group_memberships m on m.id=e.membership_id and m.user_id=e.user_id and m.group_id=e.group_id
 join public.group_memberships a on a.id=e.actor_membership_id and a.user_id=e.actor_user_id and a.group_id=e.group_id
 where not e.email_cancelled and e.id=p_source and public.email_group_available(e.group_id) and e.created_at>now()-interval '24 hours'
 and p.mentions @> jsonb_build_array(jsonb_build_object('user_id',e.user_id::text))
 and not public.is_blocked(e.user_id,e.actor_user_id)
 and not exists(select 1 from public.email_disabled_accounts d where d.user_id in (e.user_id,e.actor_user_id)));
$$;


notify pgrst,'reload schema';
commit;
