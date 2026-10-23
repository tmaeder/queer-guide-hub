-- Independently opted-in, source-backed group invitation email. No backfill.
begin;
alter table public.email_delivery_preferences drop constraint email_delivery_preferences_operational_topics_check;
alter table public.email_delivery_preferences add constraint email_delivery_preferences_operational_topics_check
 check(operational_topics<@array['event_updates','trip_updates','group_requests','contributions','payments','group_invitations']::text[]);
alter table public.email_operational_notices drop constraint email_operational_notices_kind_check;
alter table public.email_operational_notices add constraint email_operational_notices_kind_check
 check(kind in ('event_change','event_reminder','trip_change','trip_reminder','group_request','contribution','payment','group_invitation'));
alter table public.email_operational_notices drop constraint email_operational_notices_topic_check;
alter table public.email_operational_notices add constraint email_operational_notices_topic_check
 check(topic in ('event_updates','trip_updates','group_requests','contributions','payments','group_invitations'));
create or replace function public.email_delivery_preferences_save(p_user uuid,p_enabled boolean,p_timezone text,p_quiet boolean,p_start integer,p_end integer,p_version integer,p_group_enabled boolean default null,p_trip_enabled boolean default null,p_operational_topics text[] default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_operational_topics is not null and (not p_operational_topics<@array['event_updates','trip_updates','group_requests','contributions','payments','group_invitations']::text[]
  or cardinality(p_operational_topics)>6 or array_position(p_operational_topics,null) is not null
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

-- Source proof is written only by private triggers, not by transport callers.
create table public.email_group_invitation_sources (
 notice_id uuid primary key references public.email_operational_notices(id) on delete cascade,
 invitation_id uuid not null unique references public.group_invites(id) on delete cascade,
 group_id uuid not null references public.community_groups(id) on delete cascade,
 actor_user_id uuid not null references auth.users(id) on delete cascade,
 actor_membership_id uuid not null,
 notification_id uuid unique references public.group_notifications(id) on delete cascade
);
create index on public.email_group_invitation_sources(actor_user_id);
create index on public.email_group_invitation_sources(group_id);
alter table public.email_group_invitation_sources enable row level security;
revoke all on public.email_group_invitation_sources from public,anon,authenticated,service_role;
grant select on public.email_group_invitation_sources to service_role;

create function email_private.capture_group_invitation_email()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare actor_membership uuid; notice uuid; account_id uuid;
begin
 if new.invited_user_id is null or new.invited_user_id=new.invited_by
  or new.status<>'pending' or new.expires_at<=now() then return new; end if;
 -- Same ordered account barrier used by source capture/erasure elsewhere.
 for account_id in select distinct u from unnest(array[new.invited_user_id,new.invited_by]) u order by u loop
  perform pg_advisory_xact_lock(hashtextextended(account_id::text,914));
 end loop;
 if exists(select 1 from public.email_disabled_accounts where user_id in (new.invited_user_id,new.invited_by))
  or not public.email_group_available(new.group_id)
  or public.is_blocked(new.invited_user_id,new.invited_by)
  or exists(select 1 from public.group_memberships where group_id=new.group_id and user_id=new.invited_user_id)
  or not exists(select 1 from public.email_delivery_preferences where user_id=new.invited_user_id and 'group_invitations'=any(operational_topics)) then return new; end if;
 select id into actor_membership from public.group_memberships where group_id=new.group_id and user_id=new.invited_by limit 1;
 if actor_membership is null then return new; end if;
 insert into public.email_operational_notices(event_key,user_id,source_id,kind,topic,source_version)
 values('group-invitation:'||new.id::text||':'||new.invited_user_id::text,new.invited_user_id,new.id,'group_invitation','group_invitations',
  md5(jsonb_build_array(new.group_id,new.invited_user_id,new.invited_by,actor_membership)::text))
 returning id into notice;
 insert into public.email_group_invitation_sources(notice_id,invitation_id,group_id,actor_user_id,actor_membership_id)
 values(notice,new.id,new.group_id,new.invited_by,actor_membership);
 return new;
end $$;
revoke all on function email_private.capture_group_invitation_email() from public,anon,authenticated,service_role;
create trigger email_capture_group_invitation after insert on public.group_invites
 for each row execute function email_private.capture_group_invitation_email();

-- create_group_invite inserts the notification after the invite, in one
-- transaction. Only that matching new source may acquire an unread marker.
create function email_private.link_group_invitation_notification()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.notification_type='group_invite' and new.related_post_id is null and new.related_comment_id is null and new.read_at is null then
  update public.email_group_invitation_sources s set notification_id=new.id
  from public.group_invites i join public.email_operational_notices n on n.source_id=i.id and n.kind='group_invitation'
  where s.invitation_id=i.id and s.notice_id=n.id and s.notification_id is null
   and i.group_id=new.group_id and i.invited_user_id=new.user_id and i.invited_by=new.triggered_by_user_id
   and i.status='pending' and i.expires_at>now() and n.user_id=new.user_id
   and new.created_at>=i.created_at and new.created_at<=i.created_at+interval '2 minutes';
 end if;
 return new;
end $$;
revoke all on function email_private.link_group_invitation_notification() from public,anon,authenticated,service_role;
create trigger email_link_group_invitation_notification after insert on public.group_notifications
 for each row execute function email_private.link_group_invitation_notification();

alter function public.email_notice_current(uuid) rename to email_notice_current_before_group_invitations;
create function public.email_notice_current(p_id uuid)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare n public.email_operational_notices;
begin
 select * into n from public.email_operational_notices where id=p_id;
 if not found then return false; end if;
 if n.kind<>'group_invitation' then return public.email_notice_current_before_group_invitations(p_id); end if;
 if n.cancelled or n.created_at<=now()-interval '24 hours' or n.topic<>'group_invitations'
  or not exists(select 1 from public.email_delivery_preferences where user_id=n.user_id and 'group_invitations'=any(operational_topics)) then return false; end if;
 return exists(select 1 from public.email_group_invitation_sources s
  join public.group_invites i on i.id=s.invitation_id and i.id=n.source_id and i.invited_user_id=n.user_id
   and i.group_id=s.group_id and i.invited_by=s.actor_user_id and i.status='pending' and i.expires_at>now() and i.accepted_at is null and i.accepted_by is null
  join public.group_memberships m on m.id=s.actor_membership_id and m.group_id=s.group_id and m.user_id=s.actor_user_id
  join public.group_notifications gn on gn.id=s.notification_id and gn.user_id=n.user_id and gn.group_id=s.group_id
   and gn.notification_type='group_invite' and gn.triggered_by_user_id=s.actor_user_id
   and gn.related_post_id is null and gn.related_comment_id is null and gn.read_at is null
  where s.notice_id=n.id and public.email_group_available(s.group_id)
   and n.source_version=md5(jsonb_build_array(i.group_id,i.invited_user_id,i.invited_by,m.id)::text)
   and not exists(select 1 from public.group_memberships where group_id=s.group_id and user_id=n.user_id)
   and not exists(select 1 from public.email_disabled_accounts where user_id in (n.user_id,s.actor_user_id))
   and not public.is_blocked(n.user_id,s.actor_user_id));
end $$;
revoke all on function public.email_notice_current(uuid) from public,anon,authenticated;
grant execute on function public.email_notice_current(uuid) to service_role;

create function email_private.erase_group_invitation_sources()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 delete from public.email_operational_notices n using public.email_group_invitation_sources s
 where n.id=s.notice_id and (n.user_id=new.user_id or s.actor_user_id=new.user_id);
 return new;
end $$;
revoke all on function email_private.erase_group_invitation_sources() from public,anon,authenticated,service_role;
create trigger email_erase_group_invitation_sources after insert on public.email_disabled_accounts
 for each row execute function email_private.erase_group_invitation_sources();
alter function public.email_export_for_user(uuid) rename to email_export_before_group_invitations;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
 select public.email_export_before_group_invitations(p_user)||jsonb_build_object('group_invitation_sources',
 coalesce((select jsonb_agg(jsonb_build_object('notice_id',s.notice_id,'invitation_id',s.invitation_id,'group_id',s.group_id,'inviter_user_id',s.actor_user_id) order by s.notice_id)
 from public.email_group_invitation_sources s join public.email_operational_notices n on n.id=s.notice_id where n.user_id=p_user),'[]'::jsonb));
$$;
revoke all on function public.email_export_for_user(uuid) from public,anon,authenticated;
grant execute on function public.email_export_for_user(uuid) to service_role;
-- Bounded review list; the Edge endpoint supplies the authenticated owner.
create function public.email_group_invitation_review(p_user uuid,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare result jsonb;
begin
 perform public.email_operator_barrier(p_user);
 with page as (
  select i.id,i.token,g.name from public.group_invites i join public.community_groups g on g.id=i.group_id
  where i.invited_user_id=p_user and i.status='pending' and i.expires_at>now() and i.accepted_at is null and i.accepted_by is null
   and (p_after is null or i.id>p_after) and public.email_group_available(i.group_id)
   and exists(select 1 from public.group_memberships where group_id=i.group_id and user_id=i.invited_by)
   and not exists(select 1 from public.group_memberships where group_id=i.group_id and user_id=p_user)
   and not exists(select 1 from public.email_disabled_accounts where user_id in (p_user,i.invited_by))
   and not public.is_blocked(p_user,i.invited_by)
  order by i.id limit 21
 ), items as (select * from page order by id limit 20)
 select jsonb_build_object('invitations',coalesce((select jsonb_agg(jsonb_build_object('inviteId',id,'token',token,'group',jsonb_build_object('name',name)) order by id) from items),'[]'::jsonb),
 'next',case when (select count(*) from page)>20 then (select id from items order by id desc limit 1) else null end) into result;
 return result;
end $$;
revoke all on function public.email_group_invitation_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.email_group_invitation_review(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
