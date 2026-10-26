-- Typed, independently requested transactional activity; no historical backfill.
begin;
alter table public.email_delivery_preferences drop constraint email_delivery_preferences_operational_topics_check;
alter table public.email_delivery_preferences add constraint email_delivery_preferences_operational_topics_check
 check(operational_topics<@array['event_updates','trip_updates','group_requests','contributions','payments','group_invitations','group_comments','community_comments','business_updates']::text[]);
alter table public.email_operational_notices drop constraint email_operational_notices_kind_check;
alter table public.email_operational_notices add constraint email_operational_notices_kind_check
 check(kind in ('event_change','event_reminder','trip_change','trip_reminder','group_request','contribution','payment','group_invitation','group_comment','community_comment','business_claim','business_status'));
alter table public.email_operational_notices drop constraint email_operational_notices_topic_check;
alter table public.email_operational_notices add constraint email_operational_notices_topic_check
 check(topic in ('event_updates','trip_updates','group_requests','contributions','payments','group_invitations','group_comments','community_comments','business_updates'));
create or replace function public.email_delivery_preferences_save(p_user uuid,p_enabled boolean,p_timezone text,p_quiet boolean,p_start integer,p_end integer,p_version integer,p_group_enabled boolean default null,p_trip_enabled boolean default null,p_operational_topics text[] default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_operational_topics is not null and (not p_operational_topics<@array['event_updates','trip_updates','group_requests','contributions','payments','group_invitations','group_comments','community_comments','business_updates']::text[]
  or cardinality(p_operational_topics)>9 or array_position(p_operational_topics,null) is not null
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

-- Preserve every currently accepted notification type while adding direct replies.
do $$ declare predicate text;
begin
 select pg_get_expr(conbin,conrelid) into predicate from pg_constraint
 where conrelid='public.group_notifications'::regclass and conname='group_notifications_notification_type_check';
 if predicate is not null then
  alter table public.group_notifications drop constraint group_notifications_notification_type_check;
  execute 'alter table public.group_notifications add constraint group_notifications_notification_type_check check (('||predicate||') or notification_type=''comment_reply'')';
 end if;
end $$;

create table public.email_comment_sources (
 notice_id uuid primary key references public.email_operational_notices(id) on delete cascade,
 scope text not null check(scope in ('group','community')),
 group_comment_id uuid references public.group_post_comments(id) on delete cascade,
 community_comment_id uuid references public.post_comments(id) on delete cascade,
 post_id uuid not null,
 post_author_id uuid not null references auth.users(id) on delete cascade,
 actor_user_id uuid not null references auth.users(id) on delete cascade,
 parent_comment_id uuid,
 reason text not null check(reason in ('mention','reply','post_reply')),
 group_id uuid references public.community_groups(id) on delete cascade,
 recipient_membership_id uuid,
 actor_membership_id uuid,
 group_notification_id uuid unique references public.group_notifications(id) on delete cascade,
 community_notification_id uuid unique references public.notifications(id) on delete cascade,
 check((scope='group' and group_comment_id is not null and community_comment_id is null and group_id is not null
   and recipient_membership_id is not null and actor_membership_id is not null and group_notification_id is not null and community_notification_id is null)
  or (scope='community' and community_comment_id is not null and group_comment_id is null and group_id is null
   and recipient_membership_id is null and actor_membership_id is null and group_notification_id is null and community_notification_id is not null))
);
create index email_comment_sources_post on public.email_comment_sources(post_id);
create index email_comment_sources_parent on public.email_comment_sources(parent_comment_id) where parent_comment_id is not null;
create index email_comment_sources_recipient_membership on public.email_comment_sources(recipient_membership_id) where recipient_membership_id is not null;
create index email_comment_sources_actor_membership on public.email_comment_sources(actor_membership_id) where actor_membership_id is not null;
create index email_comment_sources_actor on public.email_comment_sources(actor_user_id);
create index email_comment_sources_post_author on public.email_comment_sources(post_author_id);
create index email_comment_sources_group_comment on public.email_comment_sources(group_comment_id) where group_comment_id is not null;
create index email_comment_sources_community_comment on public.email_comment_sources(community_comment_id) where community_comment_id is not null;
create index email_comment_sources_group on public.email_comment_sources(group_id) where group_id is not null;
alter table public.email_comment_sources enable row level security;
revoke all on public.email_comment_sources from public,anon,authenticated,service_role;
grant select on public.email_comment_sources to service_role;

-- Visibility mirrors the product post policy; service_role bypassing RLS is not
-- permission to expose a private post to a mention target.
create function email_private.comment_post_visible(p_scope text,p_post uuid,p_user uuid)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
 select case when p_scope='group' then exists(
  select 1 from public.group_posts p join public.group_memberships m on m.group_id=p.group_id and m.user_id=p_user
  where p.id=p_post and public.email_group_available(p.group_id) and not public.is_blocked(p.user_id,p_user)
   and not exists(select 1 from public.email_disabled_accounts where user_id in (p.user_id,p_user)))
 when p_scope='community' then exists(
  select 1 from public.community_posts p where p.id=p_post and not public.is_blocked(p.user_id,p_user)
   and not exists(select 1 from public.email_disabled_accounts where user_id in (p.user_id,p_user))
   and (p.user_id=p_user or p.visibility='public' or (p.visibility='followers'
    and exists(select 1 from public.user_follows f where f.follower_id=p_user and f.following_id=p.user_id))))
 else false end;
$$;
revoke all on function email_private.comment_post_visible(text,uuid,uuid) from public,anon,authenticated;
grant execute on function email_private.comment_post_visible(text,uuid,uuid) to service_role;

create function email_private.capture_comment_notice()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare scope_name text; topic_name text; post_author uuid; group_key uuid; parent_author uuid;
 actor_membership uuid; target_membership uuid; target record; notice uuid; marker uuid;
 reason_name text; old_mentions jsonb:='[]'; targets jsonb;
begin
 scope_name:=case when tg_table_name='group_post_comments' then 'group' else 'community' end;
 topic_name:=case when scope_name='group' then 'group_comments' else 'community_comments' end;
 if tg_op='UPDATE' then
  if (new.post_id,new.user_id,new.parent_comment_id) is distinct from (old.post_id,old.user_id,old.parent_comment_id)
   or new.mentions is not distinct from old.mentions then return new; end if;
  old_mentions:=case when jsonb_typeof(old.mentions)='array' then old.mentions else '[]' end;
 end if;
 if scope_name='group' then
  select user_id,group_id into post_author,group_key from public.group_posts where id=new.post_id;
  select id into actor_membership from public.group_memberships where group_id=group_key and user_id=new.user_id order by id limit 1;
  if actor_membership is null then return new; end if;
  if new.parent_comment_id is not null then
   select user_id into parent_author from public.group_post_comments where id=new.parent_comment_id and post_id=new.post_id;
  end if;
 else
  select user_id into post_author from public.community_posts where id=new.post_id;
  if new.parent_comment_id is not null then
   select user_id into parent_author from public.post_comments where id=new.parent_comment_id and post_id=new.post_id;
  end if;
 end if;
 if post_author is null or (new.parent_comment_id is not null and parent_author is null)
  or not email_private.comment_post_visible(scope_name,new.post_id,new.user_id) then return new; end if;
 targets:=case when jsonb_typeof(new.mentions)='array' then new.mentions else '[]' end;
 -- Bounded fan-out, sorted recipient locks; malformed UUID strings never cast.
 for target in
  with candidates as (
   select u.id,1 priority from jsonb_array_elements(targets) j join auth.users u on u.id=case when j->>'user_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (j->>'user_id')::uuid end
    where not old_mentions @> jsonb_build_array(jsonb_build_object('user_id',u.id::text))
   union all select parent_author,2 where tg_op='INSERT' and parent_author is not null
   union all select post_author,3 where tg_op='INSERT'
  ) select c.id,min(c.priority) priority from candidates c join auth.users u on u.id=c.id
   where c.id<>new.user_id and u.email_confirmed_at is not null and u.email is not null
    and not public.is_blocked(c.id,new.user_id) and email_private.comment_post_visible(scope_name,new.post_id,c.id)
   group by c.id order by c.id limit 50
 loop
  perform pg_advisory_xact_lock(hashtextextended(target.id::text,914));
  if exists(select 1 from public.email_disabled_accounts where user_id in(target.id,new.user_id)) then continue; end if;
  reason_name:=case target.priority when 1 then 'mention' when 2 then 'reply' else 'post_reply' end;
  target_membership:=null;
  if scope_name='group' then
   select id into target_membership from public.group_memberships where group_id=group_key and user_id=target.id order by id limit 1;
   if target_membership is null then continue; end if;
  end if;
  if exists(select 1 from public.email_operational_notices where event_key='comment:'||scope_name||':'||new.id::text||':'||target.id::text) then continue; end if;
  -- New mentions/replies are visible in the normal unread notification feed.
  -- Never trust a caller-supplied notification as source proof.
  if scope_name='group' then
   insert into public.group_notifications(group_id,user_id,notification_type,related_post_id,related_comment_id,triggered_by_user_id,content)
   values(group_key,target.id,case when reason_name='mention' then 'mention' else 'comment_reply' end,new.post_id,new.id,new.user_id,'You have a comment activity update. Open Queer Guide to read it.') returning id into marker;
  else
   insert into public.notifications(user_id,type,title,content,related_id,action_url)
   values(target.id,'system','Comment activity','Open Queer Guide to review a mention or reply.',new.id,'/community/feed') returning id into marker;
  end if;
  if not exists(select 1 from public.email_delivery_preferences where user_id=target.id and topic_name=any(operational_topics)) then continue; end if;
  insert into public.email_operational_notices(event_key,user_id,source_id,kind,topic,source_version)
   values('comment:'||scope_name||':'||new.id::text||':'||target.id::text,target.id,new.id,scope_name||'_comment',topic_name,'1')
   on conflict do nothing returning id into notice;
  if notice is null then continue; end if;
  insert into public.email_comment_sources(notice_id,scope,group_comment_id,community_comment_id,post_id,post_author_id,actor_user_id,parent_comment_id,reason,group_id,recipient_membership_id,actor_membership_id,group_notification_id,community_notification_id)
   values(notice,scope_name,case when scope_name='group' then new.id end,case when scope_name='community' then new.id end,new.post_id,post_author,new.user_id,new.parent_comment_id,reason_name,group_key,target_membership,actor_membership,case when scope_name='group' then marker end,case when scope_name='community' then marker end);
 end loop;
 return new;
end $$;
revoke all on function email_private.capture_comment_notice() from public,anon,authenticated,service_role;
create trigger email_capture_group_comment after insert or update of mentions on public.group_post_comments
 for each row execute function email_private.capture_comment_notice();
create trigger email_capture_community_comment after insert or update of mentions on public.post_comments
 for each row execute function email_private.capture_comment_notice();

-- A transition generation prevents a revoked and later restored business claim
-- from reviving an old queued snapshot, even if all visible fields match again.
create table public.email_business_notice_state (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 revision uuid not null
);
create table public.email_business_sources (
 notice_id uuid primary key references public.email_operational_notices(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 claimant_user_id uuid not null references auth.users(id) on delete cascade,
 revision uuid not null,
 source_version text not null,
 entity_kind text not null default 'organization' check(entity_kind in ('organization','venue','merchant')),
 entity_id uuid,
 entity_version text,
 check((entity_kind='organization' and entity_id is null and entity_version is null)
  or (entity_kind<>'organization' and entity_id is not null and entity_version is not null))
);
create index email_business_sources_entity on public.email_business_sources(entity_kind,entity_id) where entity_id is not null;
create index email_business_sources_organization on public.email_business_sources(organization_id);
create index email_business_sources_claimant on public.email_business_sources(claimant_user_id);
alter table public.email_business_notice_state enable row level security;
alter table public.email_business_sources enable row level security;
revoke all on public.email_business_notice_state,public.email_business_sources from public,anon,authenticated,service_role;
grant select on public.email_business_notice_state,public.email_business_sources to service_role;
create function email_private.capture_business_notice()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare target uuid; revision_key uuid:=gen_random_uuid(); notice uuid; notice_kind text; fingerprint text;
begin
 if tg_op='INSERT' and new.claimed_by is null then return new; end if;
 if (new.claimed_by,new.claim_status,new.status,new.duplicate_of_id,new.is_defunct) is not distinct from
  (old.claimed_by,old.claim_status,old.status,old.duplicate_of_id,old.is_defunct) then return new; end if;
 insert into public.email_business_notice_state values(new.id,revision_key)
 on conflict(organization_id) do update set revision=excluded.revision;
 -- Only the admin-managed claimant relation establishes the business party.
 -- A removed claimant may receive its own revocation, never another owner's mail.
 target:=coalesce(new.claimed_by,old.claimed_by);
 if target is null or new.duplicate_of_id is not null then return new; end if;
 if (new.claimed_by,new.claim_status) is distinct from (old.claimed_by,old.claim_status) then notice_kind:='business_claim';
 elsif new.claim_status='claimed' and new.claimed_by is not null then notice_kind:='business_status';
 else return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text,914));
 if exists(select 1 from public.email_disabled_accounts where user_id=target)
  or not exists(select 1 from auth.users where id=target and email_confirmed_at is not null and email is not null)
  or not exists(select 1 from public.email_delivery_preferences where user_id=target and 'business_updates'=any(operational_topics)) then return new; end if;
 fingerprint:=md5(jsonb_build_array(new.claimed_by,new.claim_status,new.status,new.duplicate_of_id,new.is_defunct)::text);
 insert into public.email_operational_notices(event_key,user_id,source_id,kind,topic,source_version)
  values('business:'||new.id::text||':'||revision_key::text,target,new.id,notice_kind,'business_updates',fingerprint) returning id into notice;
 insert into public.email_business_sources(notice_id,organization_id,claimant_user_id,revision,source_version) values(notice,new.id,target,revision_key,fingerprint);
 return new;
end $$;
revoke all on function email_private.capture_business_notice() from public,anon,authenticated,service_role;
create trigger email_capture_business_notice after insert or update of claimed_by,claim_status,status,duplicate_of_id,is_defunct on public.organizations
 for each row execute function email_private.capture_business_notice();


-- Linked venue/merchant transactions use the same verified organization owner.
-- Standalone published listing contacts still do not establish a service party.
create function email_private.capture_business_entity_notice()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare entity_kind_name text; org public.organizations; generation uuid; notice uuid;
 fingerprint text; entity_fingerprint text; transition uuid:=gen_random_uuid(); uid uuid;
begin
 entity_kind_name:=case when tg_table_name='venues' then 'venue' else 'merchant' end;
 if tg_op='UPDATE' then
  if tg_table_name='venues' then
   if (new.organization_id,new.closed_at,new.review_status,new.duplicate_of_id) is not distinct from
    (old.organization_id,old.closed_at,old.review_status,old.duplicate_of_id) then return new; end if;
   entity_fingerprint:=md5(jsonb_build_array(new.organization_id,extract(epoch from new.closed_at),new.review_status,new.duplicate_of_id)::text);
  else
   if (new.organization_id,new.is_enabled) is not distinct from (old.organization_id,old.is_enabled) then return new; end if;
   entity_fingerprint:=md5(jsonb_build_array(new.organization_id,new.is_enabled)::text);
  end if;
 end if;
 -- Invalidate prior entity generations, including after deletion or reassignment.
 for uid in select distinct n.user_id from public.email_operational_notices n join public.email_business_sources b on b.notice_id=n.id
  where b.entity_kind=entity_kind_name and b.entity_id=old.id and not n.cancelled order by n.user_id loop
  perform pg_advisory_xact_lock(hashtextextended(uid::text,914));
 end loop;
 update public.email_operational_notices n set cancelled=true from public.email_business_sources b
  where b.notice_id=n.id and b.entity_kind=entity_kind_name and b.entity_id=old.id;
 if tg_op='DELETE' then return old; end if;
 select * into org from public.organizations where id=new.organization_id and claimed_by is not null and claim_status='claimed' and duplicate_of_id is null;
 if not found then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(org.claimed_by::text,914));
 if exists(select 1 from public.email_disabled_accounts where user_id=org.claimed_by)
  or not exists(select 1 from auth.users where id=org.claimed_by and email_confirmed_at is not null and email is not null)
  or not exists(select 1 from public.email_delivery_preferences where user_id=org.claimed_by and 'business_updates'=any(operational_topics)) then return new; end if;
 insert into public.email_business_notice_state values(org.id,gen_random_uuid()) on conflict do nothing;
 select revision into generation from public.email_business_notice_state where organization_id=org.id;
 fingerprint:=md5(jsonb_build_array(org.claimed_by,org.claim_status,org.status,org.duplicate_of_id,org.is_defunct)::text);
 insert into public.email_operational_notices(event_key,user_id,source_id,kind,topic,source_version)
  values('business:'||entity_kind_name||':'||new.id::text||':'||transition::text,org.claimed_by,new.id,'business_status','business_updates',fingerprint) returning id into notice;
 insert into public.email_business_sources(notice_id,organization_id,claimant_user_id,revision,source_version,entity_kind,entity_id,entity_version)
  values(notice,org.id,org.claimed_by,generation,fingerprint,entity_kind_name,new.id,entity_fingerprint);
 return new;
end $$;
revoke all on function email_private.capture_business_entity_notice() from public,anon,authenticated,service_role;
create trigger email_capture_venue_service_notice after update of organization_id,closed_at,review_status,duplicate_of_id or delete on public.venues
 for each row execute function email_private.capture_business_entity_notice();
create trigger email_capture_merchant_service_notice after update of organization_id,is_enabled or delete on public.marketplace_merchants
 for each row execute function email_private.capture_business_entity_notice();

alter function public.email_notice_current(uuid) rename to email_notice_current_before_domain_integrations;
create function public.email_notice_current(p_id uuid)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog as $$
declare n public.email_operational_notices; s public.email_comment_sources;
 comment_actor uuid; comment_post uuid; comment_parent uuid; mentions jsonb; post_author uuid; current_group uuid;
begin
 select * into n from public.email_operational_notices where id=p_id;
 if not found then return false; end if;
 if n.kind not in ('group_comment','community_comment','business_claim','business_status') then return public.email_notice_current_before_domain_integrations(p_id); end if;
 if n.cancelled or n.created_at<=now()-interval '24 hours'
  or exists(select 1 from public.email_disabled_accounts where user_id=n.user_id)
  or not exists(select 1 from public.email_recipient_user_lookup where user_id=n.user_id)
  or not exists(select 1 from public.email_delivery_preferences where user_id=n.user_id and n.topic=any(operational_topics)) then return false; end if;
 if n.kind in ('business_claim','business_status') then
  return n.topic='business_updates' and exists(select 1 from public.email_business_sources b
   join public.email_business_notice_state v on v.organization_id=b.organization_id and v.revision=b.revision
   join public.organizations o on o.id=b.organization_id and coalesce(b.entity_id,o.id)=n.source_id and o.duplicate_of_id is null
   where b.notice_id=n.id and b.claimant_user_id=n.user_id and b.source_version=n.source_version
    and md5(jsonb_build_array(o.claimed_by,o.claim_status,o.status,o.duplicate_of_id,o.is_defunct)::text)=b.source_version
    and (b.entity_kind='organization'
     or (b.claimant_user_id=o.claimed_by and o.claim_status='claimed' and (
      (b.entity_kind='venue' and exists(select 1 from public.venues v where v.id=b.entity_id and v.organization_id=o.id
       and md5(jsonb_build_array(v.organization_id,extract(epoch from v.closed_at),v.review_status,v.duplicate_of_id)::text)=b.entity_version))
      or (b.entity_kind='merchant' and exists(select 1 from public.marketplace_merchants m where m.id=b.entity_id and m.organization_id=o.id
       and md5(jsonb_build_array(m.organization_id,m.is_enabled)::text)=b.entity_version))))));
 end if;
 select * into s from public.email_comment_sources where notice_id=n.id;
 if not found or n.kind<>s.scope||'_comment' or n.topic<>s.scope||'_comments'
  or n.source_id<>coalesce(s.group_comment_id,s.community_comment_id) then return false; end if;
 if exists(select 1 from public.email_disabled_accounts where user_id in (s.actor_user_id,s.post_author_id))
  or public.is_blocked(n.user_id,s.actor_user_id)
  or not email_private.comment_post_visible(s.scope,s.post_id,n.user_id)
  or not email_private.comment_post_visible(s.scope,s.post_id,s.actor_user_id) then return false; end if;
 if s.scope='group' then
  select user_id,post_id,parent_comment_id,c.mentions into comment_actor,comment_post,comment_parent,mentions from public.group_post_comments c where id=s.group_comment_id;
  select user_id,group_id into post_author,current_group from public.group_posts where id=s.post_id;
  if current_group is distinct from s.group_id or not exists(select 1 from public.group_memberships where id=s.recipient_membership_id and group_id=s.group_id and user_id=n.user_id)
   or not exists(select 1 from public.group_memberships where id=s.actor_membership_id and group_id=s.group_id and user_id=s.actor_user_id)
   or not exists(select 1 from public.group_notifications gn where gn.id=s.group_notification_id and gn.user_id=n.user_id
    and gn.group_id=s.group_id and gn.related_comment_id=s.group_comment_id and gn.related_post_id=s.post_id
    and gn.triggered_by_user_id=s.actor_user_id and gn.notification_type=case when s.reason='mention' then 'mention' else 'comment_reply' end and gn.read_at is null) then return false; end if;
 else
  select user_id,post_id,parent_comment_id,c.mentions into comment_actor,comment_post,comment_parent,mentions from public.post_comments c where id=s.community_comment_id;
  select user_id into post_author from public.community_posts where id=s.post_id;
  if not exists(select 1 from public.notifications x where x.id=s.community_notification_id and x.user_id=n.user_id
   and x.type='system' and x.related_id=s.community_comment_id and not x.read
   and x.action_url='/community/feed') then return false; end if;
 end if;
 if comment_actor is distinct from s.actor_user_id or comment_post is distinct from s.post_id
  or comment_parent is distinct from s.parent_comment_id or post_author is distinct from s.post_author_id then return false; end if;
 if s.reason='mention' then return coalesce(mentions @> jsonb_build_array(jsonb_build_object('user_id',n.user_id::text)),false); end if;
 if s.reason='post_reply' then return s.post_author_id=n.user_id; end if;
 if s.scope='group' then return exists(select 1 from public.group_post_comments where id=s.parent_comment_id and post_id=s.post_id and user_id=n.user_id);
 else return exists(select 1 from public.post_comments where id=s.parent_comment_id and post_id=s.post_id and user_id=n.user_id); end if;
end $$;
revoke all on function public.email_notice_current(uuid),public.email_notice_current_before_domain_integrations(uuid) from public,anon,authenticated;
grant execute on function public.email_notice_current(uuid),public.email_notice_current_before_domain_integrations(uuid) to service_role;

-- Actor/post-author erasure invalidates and removes their opaque source proofs.
create function email_private.erase_domain_notice_sources()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 delete from public.email_operational_notices n using public.email_comment_sources s
  where n.id=s.notice_id and new.user_id in (s.actor_user_id,s.post_author_id,n.user_id);
 delete from public.email_operational_notices n using public.email_business_sources s
  where n.id=s.notice_id and new.user_id=s.claimant_user_id;
 return new;
end $$;
revoke all on function email_private.erase_domain_notice_sources() from public,anon,authenticated,service_role;
create trigger email_erase_domain_notice_sources after insert on public.email_disabled_accounts
 for each row execute function email_private.erase_domain_notice_sources();
-- Existing export includes owned notice kind/source/time; no additional actor,
-- membership, notification or business-claimant identities need to be exported.

-- Invalidation is permanent. Reading then marking unread, removing then adding
-- a mention, leaving then rejoining, or restoring visibility cannot resurrect
-- a snapshot captured before that transition.
create function email_private.cancel_changed_comment_notices()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare affected record; row_key uuid; row_data jsonb; predicate text;
begin
 row_data:=case when tg_op='DELETE' or (tg_table_name='user_follows' and tg_op='UPDATE') then to_jsonb(old) else to_jsonb(new) end;
 row_key:=(row_data->>'id')::uuid;
 -- Each trigger selects through its own source index; unrelated inbox reads
 -- and likes must not scan every active comment proof.
 case tg_table_name
 when 'group_notifications' then predicate:='s.group_notification_id=$1';
 when 'notifications' then predicate:='s.community_notification_id=$1';
 when 'group_post_comments' then predicate:='s.scope=''group'' and (s.group_comment_id=$1 or s.parent_comment_id=$1)';
 when 'post_comments' then predicate:='s.scope=''community'' and (s.community_comment_id=$1 or s.parent_comment_id=$1)';
 when 'group_posts' then predicate:='s.scope=''group'' and s.post_id=$1';
 when 'community_posts' then predicate:='s.scope=''community'' and s.post_id=$1';
 when 'group_memberships' then predicate:='s.recipient_membership_id=$1 or s.actor_membership_id=$1';
 when 'community_groups' then predicate:='s.group_id=$1';
 when 'user_follows' then predicate:='s.scope=''community'' and s.post_author_id=($2->>''following_id'')::uuid and n.user_id=($2->>''follower_id'')::uuid';
 when 'user_relationships' then
  if row_data->>'relationship_type'<>'block' then return new; end if;
  predicate:='(n.user_id=($2->>''user_id'')::uuid and (s.actor_user_id=($2->>''target_user_id'')::uuid or s.post_author_id=($2->>''target_user_id'')::uuid)) or (n.user_id=($2->>''target_user_id'')::uuid and (s.actor_user_id=($2->>''user_id'')::uuid or s.post_author_id=($2->>''user_id'')::uuid))';
 else return case when tg_op='DELETE' then old else new end;
 end case;
 -- Predicate text is exclusively from the fixed cases above. Source values
 -- remain bound parameters, never interpolated SQL or caller-supplied names.
 for affected in execute 'select n.id,n.user_id from public.email_comment_sources s join public.email_operational_notices n on n.id=s.notice_id where not n.cancelled and ('||predicate||') order by n.user_id,n.id'
  using row_key,row_data
 loop
  perform pg_advisory_xact_lock(hashtextextended(affected.user_id::text,914));
  if not public.email_notice_current(affected.id) then
   update public.email_operational_notices set cancelled=true where id=affected.id;
  end if;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function email_private.cancel_changed_comment_notices() from public,anon,authenticated,service_role;
create trigger email_cancel_group_comment after update of post_id,user_id,parent_comment_id,mentions on public.group_post_comments for each row execute function email_private.cancel_changed_comment_notices();
create trigger email_cancel_community_comment after update of post_id,user_id,parent_comment_id,mentions on public.post_comments for each row execute function email_private.cancel_changed_comment_notices();
create trigger email_cancel_group_comment_read after update of read_at,user_id,group_id,notification_type,related_post_id,related_comment_id,triggered_by_user_id on public.group_notifications for each row execute function email_private.cancel_changed_comment_notices();
create trigger email_cancel_community_comment_read after update of read,user_id,type,related_id,action_url on public.notifications for each row execute function email_private.cancel_changed_comment_notices();
create trigger email_cancel_group_comment_post after update of user_id,group_id on public.group_posts for each row execute function email_private.cancel_changed_comment_notices();
create trigger email_cancel_community_comment_post after update of user_id,visibility on public.community_posts for each row execute function email_private.cancel_changed_comment_notices();
create trigger email_cancel_comment_membership after update of user_id,group_id or delete on public.group_memberships for each row execute function email_private.cancel_changed_comment_notices();
create trigger email_cancel_comment_group after update of archived_at,duplicate_of_id on public.community_groups for each row execute function email_private.cancel_changed_comment_notices();
create trigger email_cancel_comment_follow after update of follower_id,following_id or delete on public.user_follows for each row execute function email_private.cancel_changed_comment_notices();
create trigger email_cancel_comment_block after insert or update on public.user_relationships for each row execute function email_private.cancel_changed_comment_notices();
create function email_private.cancel_removed_domain_source()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 update public.email_operational_notices set cancelled=true where id=old.notice_id;
 return old;
end $$;
revoke all on function email_private.cancel_removed_domain_source() from public,anon,authenticated,service_role;
create trigger email_cancel_removed_comment_source after delete on public.email_comment_sources for each row execute function email_private.cancel_removed_domain_source();
create trigger email_cancel_removed_business_source after delete on public.email_business_sources for each row execute function email_private.cancel_removed_domain_source();

notify pgrst,'reload schema';
commit;
