begin;
-- Operational communication events only. No arbitrary traits, message bodies,
-- group names, destinations, purchases or browser behavior enter this ledger.
create table public.email_lifecycle_events (
 id uuid primary key default gen_random_uuid(),
 event_key text not null unique check (length(event_key) between 1 and 250),
 schema_version integer not null default 1 check (schema_version=1),
 user_id uuid not null references auth.users(id) on delete cascade,
 source_id uuid not null,
 event_type text not null,
 state text not null,
 occurred_at timestamptz not null default clock_timestamp(),
 check (
  (event_type='account.created' and state='created') or
  (event_type='profile.username.changed' and state in ('claimed','removed')) or
  (event_type='event.rsvp.changed' and state in ('going','interested','not_going','removed')) or
  (event_type='group.membership.changed' and state in ('joined','left')) or
  (event_type='trip.membership.changed' and state in ('invited','accepted','left'))
 )
);
alter table public.email_lifecycle_events enable row level security;
revoke all on public.email_lifecycle_events from public,anon,authenticated;
grant all on public.email_lifecycle_events to service_role;
create index on public.email_lifecycle_events(user_id,occurred_at,id);
create index on public.email_lifecycle_events(event_type,occurred_at);

create function public.email_emit_lifecycle_event(p_key text,p_user uuid,p_type text,p_source uuid,p_state text)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_lifecycle_events;
begin
 if p_user is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,914));
 if not exists(select 1 from auth.users where id=p_user)
  or exists(select 1 from public.email_disabled_accounts where user_id=p_user) then return null; end if;
 insert into public.email_lifecycle_events(event_key,user_id,event_type,source_id,state)
 values(p_key,p_user,p_type,p_source,p_state) on conflict(event_key) do nothing returning * into r;
 if r.id is null then
  select * into r from public.email_lifecycle_events where event_key=p_key;
  if r.user_id is distinct from p_user or r.event_type is distinct from p_type or r.source_id is distinct from p_source or r.state is distinct from p_state then
   raise exception 'email_lifecycle_identity_conflict' using errcode='22023';
  end if;
 end if;
 return r.id;
end $$;
revoke all on function public.email_emit_lifecycle_event(text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.email_emit_lifecycle_event(text,uuid,text,uuid,text) to service_role;

create function email_private.capture_lifecycle_event()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare uid uuid; sid uuid; kind text; state_value text;
begin
 if tg_table_schema='auth' and tg_table_name='users' and tg_op='INSERT' then
  uid:=new.id; sid:=new.id; kind:='account.created'; state_value:='created';
 elsif tg_table_schema='public' and tg_table_name='profiles' then
  if tg_op='UPDATE' and new.username is not distinct from old.username then return new; end if;
  if tg_op='INSERT' and nullif(btrim(new.username),'') is null then return new; end if;
  uid:=new.user_id; sid:=new.user_id; kind:='profile.username.changed';
  state_value:=case when nullif(btrim(new.username),'') is null then 'removed' else 'claimed' end;
 elsif tg_table_schema='public' and tg_table_name='event_attendees' then
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  if tg_op='DELETE' then uid:=old.user_id; sid:=old.id; state_value:='removed';
  else uid:=new.user_id; sid:=new.id; state_value:=new.status; end if;
  if state_value is null then return new; end if;
  kind:='event.rsvp.changed';
 elsif tg_table_schema='public' and tg_table_name='group_memberships' then
  kind:='group.membership.changed';
  if tg_op='DELETE' then uid:=old.user_id; sid:=old.id; state_value:='left';
  else uid:=new.user_id; sid:=new.id; state_value:='joined'; end if;
 elsif tg_table_schema='public' and tg_table_name='trip_members' then
  if tg_op='UPDATE' and (new.accepted_at is null)=(old.accepted_at is null) then return new; end if;
  if tg_op='DELETE' then uid:=old.user_id; sid:=old.id; state_value:='left';
  else uid:=new.user_id; sid:=new.id;
   state_value:=case when new.accepted_at is not null or new.role='owner' then 'accepted' else 'invited' end;
  end if;
  kind:='trip.membership.changed';
 else raise exception 'unsupported lifecycle source';
 end if;
 perform public.email_emit_lifecycle_event(tg_table_schema||'.'||tg_table_name||':'||sid::text||':'||gen_random_uuid()::text,uid,kind,sid,state_value);
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function email_private.capture_lifecycle_event() from public,anon,authenticated;
create trigger email_lifecycle_account after insert on auth.users for each row execute function email_private.capture_lifecycle_event();
create trigger email_lifecycle_username after insert or update of username on public.profiles for each row execute function email_private.capture_lifecycle_event();
create trigger email_lifecycle_rsvp after insert or update of status or delete on public.event_attendees for each row execute function email_private.capture_lifecycle_event();
create trigger email_lifecycle_group after insert or delete on public.group_memberships for each row execute function email_private.capture_lifecycle_event();
create trigger email_lifecycle_trip after insert or update of accepted_at or delete on public.trip_members for each row execute function email_private.capture_lifecycle_event();

-- The existing erasure core inserts this account barrier in its transaction.
-- Auth deletes also cascade; disabled accounts cannot emit later stale events.
create function email_private.erase_lifecycle_events()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 delete from public.email_lifecycle_events where user_id=new.user_id;
 return new;
end $$;
revoke all on function email_private.erase_lifecycle_events() from public,anon,authenticated;
create trigger email_lifecycle_erasure after insert on public.email_disabled_accounts for each row execute function email_private.erase_lifecycle_events();

alter function public.email_export_for_user(uuid) rename to email_export_before_lifecycle;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.email_export_before_lifecycle(p_user)||jsonb_build_object('lifecycle_events',
  coalesce((select jsonb_agg(to_jsonb(e)-'event_key' order by e.occurred_at,e.id)
  from public.email_lifecycle_events e where e.user_id=p_user),'[]'::jsonb));
$$;
alter function public.email_contact_timeline(uuid,integer) rename to email_contact_timeline_before_lifecycle;
create function public.email_contact_timeline(p_subscriber uuid,p_limit integer default 50)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(t.event order by (t.event->>'occurred_at')::timestamptz desc,t.event->>'id'),'[]'::jsonb) from (
  select event from (
   select value event from jsonb_array_elements(public.email_contact_timeline_before_lifecycle(p_subscriber,p_limit))
   union all
   select jsonb_build_object('id',e.id,'kind',e.event_type,'occurred_at',e.occurred_at,
     'details',jsonb_build_object('source_id',e.source_id,'state',e.state,'schema_version',e.schema_version))
   from public.email_lifecycle_events e join public.email_subscribers s on s.user_id=e.user_id
   where s.id=p_subscriber and s.confirmed_at is not null
  ) all_events order by (event->>'occurred_at')::timestamptz desc,event->>'id' limit greatest(1,least(coalesce(p_limit,50),100))
 ) t;
$$;
revoke all on function public.email_export_for_user(uuid),public.email_contact_timeline(uuid,integer) from public,anon,authenticated;
grant execute on function public.email_export_for_user(uuid),public.email_contact_timeline(uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
