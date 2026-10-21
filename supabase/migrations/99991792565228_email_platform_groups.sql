begin;
alter table public.email_delivery_preferences add column group_mentions_enabled boolean not null default false;
alter function public.email_delivery_preferences_save(uuid,boolean,text,boolean,integer,integer,integer) rename to email_delivery_preferences_before_groups;
create or replace function public.email_delivery_preferences_get(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce((select to_jsonb(p)-'user_id' from public.email_delivery_preferences p where user_id=p_user),
  '{"dm_digest_enabled":false,"group_mentions_enabled":false,"timezone":"Etc/UTC","quiet_hours_enabled":false,"quiet_start":22,"quiet_end":8,"version":0}'::jsonb);
$$;
create function public.email_delivery_preferences_save(p_user uuid,p_enabled boolean,p_timezone text,p_quiet boolean,p_start integer,p_end integer,p_version integer,p_group_enabled boolean default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.email_delivery_preferences_before_groups(p_user,p_enabled,p_timezone,p_quiet,p_start,p_end,p_version);
 update public.email_delivery_preferences set group_mentions_enabled=coalesce(p_group_enabled,group_mentions_enabled) where user_id=p_user;
 result:=public.email_delivery_preferences_get(p_user);
 update public.email_delivery_preference_events set preferences=result where user_id=p_user and version=p_version+1;
 return result;
end $$;

-- Only opaque source/owner identities. Names, post text and mention usernames stay in the product.
create table public.email_group_mentions (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null unique references public.group_notifications(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 actor_user_id uuid not null references auth.users(id) on delete cascade,
 group_id uuid not null references public.community_groups(id) on delete cascade,
 post_id uuid not null references public.group_posts(id) on delete cascade,
 membership_id uuid not null,
 actor_membership_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(post_id,user_id)
);
create index on public.email_group_mentions(user_id,created_at);
create index on public.email_group_mentions(actor_user_id);
create index on public.email_group_mentions(group_id);
create index on public.email_group_mentions(created_at,id);
alter table public.email_group_mentions enable row level security;
revoke all on public.email_group_mentions from public,anon,authenticated;
grant all on public.email_group_mentions to service_role;
grant execute on function public.is_blocked(uuid,uuid) to service_role;
alter table public.email_outbox add column activity_source_id uuid;

-- archived_at arrives in a later application migration. Read it through the row
-- JSON so both migration ordering and the current archive state are respected.
create function public.email_group_available(p_group uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.community_groups g where g.id=p_group and g.duplicate_of_id is null
  and to_jsonb(g)->>'archived_at' is null);
$$;

create function email_private.capture_group_mentions()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare target record; actor_membership uuid; notice uuid;
begin
 if jsonb_typeof(new.mentions) is distinct from 'array' or not public.email_group_available(new.group_id) then return new; end if;
 if tg_op='UPDATE' then
  if new.group_id is distinct from old.group_id or new.user_id is distinct from old.user_id or new.mentions is not distinct from old.mentions then return new; end if;
 end if;
 select id into actor_membership from public.group_memberships where group_id=new.group_id and user_id=new.user_id order by id limit 1;
 if actor_membership is null or exists(select 1 from public.email_disabled_accounts where user_id=new.user_id) then return new; end if;
 -- Bounded fan-out. Malformed IDs are compared as text; they cannot abort a post.
 for target in select distinct u.id user_id,m.id membership_id from jsonb_array_elements(new.mentions) j
  join auth.users u on u.id::text=j->>'user_id'
  join public.group_memberships m on m.user_id=u.id and m.group_id=new.group_id
  where u.id<>new.user_id and not public.is_blocked(new.user_id,u.id)
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
revoke all on function email_private.capture_group_mentions() from public,anon,authenticated;
create trigger email_capture_group_mentions after insert or update of mentions on public.group_posts
 for each row execute function email_private.capture_group_mentions();

create function public.email_group_mention_current(p_source uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.email_group_mentions e
 join public.group_notifications n on n.id=e.notification_id and n.user_id=e.user_id and n.group_id=e.group_id
  and n.notification_type='mention' and n.related_post_id=e.post_id and n.related_comment_id is null
  and n.triggered_by_user_id=e.actor_user_id and n.read_at is null
 join public.group_posts p on p.id=e.post_id and p.group_id=e.group_id and p.user_id=e.actor_user_id
 join public.group_memberships m on m.id=e.membership_id and m.user_id=e.user_id and m.group_id=e.group_id
 join public.group_memberships a on a.id=e.actor_membership_id and a.user_id=e.actor_user_id and a.group_id=e.group_id
 where e.id=p_source and public.email_group_available(e.group_id) and e.created_at>now()-interval '24 hours'
 and p.mentions @> jsonb_build_array(jsonb_build_object('user_id',e.user_id::text))
 and not public.is_blocked(e.user_id,e.actor_user_id)
 and not exists(select 1 from public.email_disabled_accounts d where d.user_id in (e.user_id,e.actor_user_id)));
$$;

alter function public.email_activity_message_reason(uuid) rename to email_activity_reason_before_groups;
create function public.email_activity_message_reason(p_id uuid)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select case when o.template_key is null and o.payload->>'from'='Community Groups <noreply@queer.guide>' then 'activity_source_unavailable'
  when o.template_key is distinct from 'group_mention' then public.email_activity_reason_before_groups(p_id)
  when not exists(select 1 from public.email_delivery_preferences p where p.user_id=o.recipient_user_id and p.group_mentions_enabled) then 'activity_email_disabled'
  when not exists(select 1 from auth.users u where u.id=o.recipient_user_id and lower(btrim(u.email))=o.recipient_email) then 'activity_recipient_changed'
  when not exists(select 1 from public.email_group_mentions e where e.id=o.activity_source_id and e.user_id=o.recipient_user_id)
   or not public.email_group_mention_current(o.activity_source_id) then 'activity_source_unavailable'
  when public.email_delivery_is_quiet(o.recipient_user_id) then 'activity_quiet_hours'
  when exists(select 1 from public.email_activity_reservations r where r.user_id=o.recipient_user_id
   and r.day_bucket=(now() at time zone 'UTC')::date and r.outbox_id<>o.id) then 'activity_daily_budget'
  else null end from public.email_outbox o where o.id=p_id;
$$;

create function public.email_group_mention_enqueue(p_source uuid,p_payload jsonb)
returns public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
declare e public.email_group_mentions; o public.email_outbox; address text; identity text;
begin
 select * into e from public.email_group_mentions where id=p_source;
 if not found then raise exception 'group_source_unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(e.user_id::text,914));
 if not public.email_group_mention_current(p_source)
  or not exists(select 1 from public.email_delivery_preferences where user_id=e.user_id and group_mentions_enabled) then
  raise exception 'group_source_unavailable' using errcode='22023'; end if;
 select lower(btrim(email)) into address from auth.users where id=e.user_id;
 identity:=encode(sha256(convert_to('group-mention:'||p_source::text,'UTF8')),'hex');
 -- Identity is independent of the mailbox: changing an address cannot resend an old mention.
 select * into o from public.email_outbox where idempotency_key=identity;
 if not found then
  o:=public.email_enqueue(identity,address,p_payload,'group_mention',e.created_at+interval '24 hours',e.user_id);
  update public.email_outbox set activity_source_id=p_source where id=o.id returning * into o;
 elsif o.recipient_user_id is distinct from e.user_id or o.activity_source_id is distinct from p_source then
  raise exception 'group_identity_conflict' using errcode='22023';
 end if;
 return o;
end $$;

create function public.email_group_mention_candidates(p_limit integer default 5,p_source uuid default null)
returns table(source_id uuid,recipient text)
language sql stable security invoker set search_path=public,pg_temp as $$
 select e.id,lower(btrim(u.email)) from public.email_group_mentions e join auth.users u on u.id=e.user_id
 join public.email_delivery_preferences p on p.user_id=e.user_id and p.group_mentions_enabled
 where e.created_at>now()-interval '24 hours' and (p_source is null or e.id=p_source) and u.email is not null and public.email_group_mention_current(e.id)
 and not exists(select 1 from public.email_outbox o where o.idempotency_key=encode(sha256(convert_to('group-mention:'||e.id::text,'UTF8')),'hex'))
 order by e.created_at,e.id limit greatest(1,least(coalesce(p_limit,5),25));
$$;

create or replace function public.email_dispatch_authorize(p_id uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.email_outbox;
begin
 select * into o from public.email_outbox where id=p_id;
 if not found then return false; end if;
 if o.recipient_user_id is not null then perform pg_advisory_xact_lock(hashtextextended(o.recipient_user_id::text,914)); end if;
 if not public.email_dispatch_before_activity(p_id,p_lease) or public.email_activity_message_reason(p_id) is not null then return false; end if;
 if o.template_key in ('dm_digest','group_mention') then
  insert into public.email_activity_reservations(user_id,day_bucket,outbox_id)
   values(o.recipient_user_id,(now() at time zone 'UTC')::date,p_id) on conflict do nothing;
  return exists(select 1 from public.email_activity_reservations r where r.user_id=o.recipient_user_id
   and r.day_bucket=(now() at time zone 'UTC')::date and r.outbox_id=p_id);
 end if;
 return true;
end $$;

-- Hold old sender snapshots that never carried an authoritative source.
update public.email_outbox set status='suppressed',last_error='legacy_group_source_unverified',updated_at=now()
 where template_key is null and payload->>'from'='Community Groups <noreply@queer.guide>'
 and (status='queued' or (status='processing' and leased_until<now()));

-- No active lease is cancelled: an in-flight provider receipt must remain writable.
create or replace function public.email_claim(p_limit integer default 10,p_id uuid default null)
returns setof public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.email_outbox o set status='suppressed',last_error=public.email_activity_message_reason(o.id),lease_id=null,leased_until=null,updated_at=now()
 where (o.template_key in ('dm_digest','group_mention') or (o.template_key is null and o.payload->>'from'='Community Groups <noreply@queer.guide>')) and (o.status='queued' or (o.status='processing' and o.leased_until<now()))
 and public.email_activity_message_reason(o.id) in ('activity_email_disabled','activity_recipient_changed','activity_no_longer_unread','activity_source_unavailable');
 return query select * from public.email_claim_before_activity(p_limit,p_id);
end $$;
create or replace function public.email_claim_before_privacy(p_limit integer default 10, p_id uuid default null)
returns setof public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.email_outbox set status='uncertain',last_error='activity_expired_after_claim',lease_id=null,leased_until=null,updated_at=now()
 where template_key in ('dm_digest','group_mention') and status='processing' and expires_at<=now() and leased_until<now();
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



create function email_private.erase_group_mentions()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 update public.email_outbox set activity_source_id=null where recipient_user_id=new.user_id;
 delete from public.email_group_mentions where user_id=new.user_id or actor_user_id=new.user_id;
 return new;
end $$;
revoke all on function email_private.erase_group_mentions() from public,anon,authenticated;
create trigger email_group_mentions_erasure after insert on public.email_disabled_accounts for each row execute function email_private.erase_group_mentions();
alter function public.email_export_for_user(uuid) rename to email_export_before_groups;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.email_export_before_groups(p_user)||jsonb_build_object('group_mention_events',coalesce((select jsonb_agg(
 jsonb_build_object('id',id,'post_id',post_id,'notification_id',notification_id,'created_at',created_at) order by created_at,id)
 from public.email_group_mentions where user_id=p_user),'[]'::jsonb));
$$;

create function public.run_email_group_mentions()
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if to_regclass('public.admin_automations') is not null then
  if exists(select 1 from public.admin_automations where slug='email_group_mentions' and not enabled) then return; end if;
 end if;
 perform net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/send-group-notifications',
 headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
 body:='{"action":"tick"}'::jsonb,timeout_milliseconds:=30000);
end $$;
do $$ declare f record;
begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
 and (proname like 'email_group_%' or proname in ('email_delivery_preferences_save','email_delivery_preferences_before_groups','email_activity_reason_before_groups',
 'email_activity_message_reason','email_dispatch_authorize','email_claim','email_export_for_user','email_export_before_groups','run_email_group_mentions')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('email_group_mentions','* * * * *','select public.run_email_group_mentions();');
 end if;
end $$;
do $$ begin
 if to_regclass('public.workflow_definitions') is not null then
  update public.workflow_definitions set display_name='Queue group mentions',
   description='Queue verified opted-in group post mentions through the Cloudflare email outbox.',default_payload='{"action":"tick"}'::jsonb
  where name='send-group-notifications' and edge_function='send-group-notifications';
 end if;
 if to_regclass('public.admin_automations') is not null then
  insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
  values('email_group_mentions','Group mention email','Queue verified opted-in group mentions; shared activity policy applies.','system',true,
   '{"type":"schedule"}'::jsonb,'[]'::jsonb,'{"type":"rpc","fn":"run_email_group_mentions"}'::jsonb,'* * * * *')
  on conflict(slug) do update set description=excluded.description,action=excluded.action,schedule=excluded.schedule;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
