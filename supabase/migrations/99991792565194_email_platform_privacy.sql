begin;

alter table public.email_outbox add column recipient_user_id uuid references auth.users(id) on delete set null;
alter table public.email_outbox add column erased_at timestamptz;
create index on public.email_outbox(recipient_user_id) where recipient_user_id is not null;
alter table public.email_subscription_tokens add column confirmation_outbox_id uuid references public.email_outbox(id) on delete set null;
create table public.email_disabled_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
-- Minimal pseudonymous metadata retained to avoid recreating erased addresses
-- from asynchronous provider callbacks. These hashes are not anonymous data.
create table public.email_erased_mailboxes (
 mailbox_hash text primary key check (mailbox_hash ~ '^[a-f0-9]{64}$'),
 suppression_reason text check (suppression_reason in ('hard_bounce','complaint','provider_suppressed')),
 created_at timestamptz not null default now()
);
alter table public.email_disabled_accounts enable row level security;
alter table public.email_erased_mailboxes enable row level security;
revoke all on public.email_disabled_accounts,public.email_erased_mailboxes from public,anon,authenticated;
grant all on public.email_disabled_accounts,public.email_erased_mailboxes to service_role;

alter function public.email_enqueue(text,text,jsonb,text,timestamptz) rename to email_enqueue_before_privacy;
create function public.email_enqueue(p_key text,p_recipient text,p_payload jsonb,p_template text default null,p_expires timestamptz default null,p_user uuid default null)
returns public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_outbox;
begin
 if p_user is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,914));
  if exists(select 1 from public.email_disabled_accounts where user_id=p_user) then raise exception 'email_account_disabled'; end if;
  if not exists(select 1 from auth.users where id=p_user and lower(btrim(email))=lower(btrim(p_recipient)))
   and not exists(select 1 from public.email_subscribers where user_id=p_user and confirmed_at is not null and email=lower(btrim(p_recipient))) then
   raise exception 'email_account_recipient_mismatch';
  end if;
 end if;
 r:=public.email_enqueue_before_privacy(p_key,p_recipient,p_payload,p_template,p_expires);
 if r.erased_at is not null then raise exception 'email_identity_erased'; end if;
 if r.recipient_user_id is not null and r.recipient_user_id is distinct from p_user then raise exception 'email_owner_conflict'; end if;
 if p_user is not null and r.recipient_user_id is null then
  update public.email_outbox set recipient_user_id=p_user where id=r.id returning * into r;
 end if;
 return r;
end $$;

create function public.email_dispatch_authorize(p_id uuid,p_lease uuid)
returns boolean language sql security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.email_outbox o where o.id=p_id and o.lease_id=p_lease
  and o.status='processing' and o.erased_at is null and o.leased_until>now()
  and (o.expires_at is null or o.expires_at>now())
  and not exists(select 1 from public.email_suppressions b where b.email=o.recipient_email)
  and not exists(select 1 from public.email_erased_mailboxes b where b.suppression_reason is not null
    and b.mailbox_hash=encode(sha256(convert_to(o.recipient_email,'UTF8')),'hex'))
  and not exists(select 1 from public.email_disabled_accounts b where b.user_id=o.recipient_user_id));
$$;

alter function public.email_claim(integer,uuid) rename to email_claim_before_privacy;
create function public.email_claim(p_limit integer default 10,p_id uuid default null)
returns setof public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.email_outbox o set status='suppressed',last_error='recipient_suppressed',updated_at=now()
 where o.status in ('queued','processing') and exists(select 1 from public.email_erased_mailboxes b
  where b.suppression_reason is not null and b.mailbox_hash=encode(sha256(convert_to(o.recipient_email,'UTF8')),'hex'));
 return query select * from public.email_claim_before_privacy(p_limit,p_id);
end $$;

create or replace function public.email_audience_count(p_topic text,p_locale text default null)
returns bigint language sql security invoker set search_path=public,pg_temp as $$
 select count(*) from public.email_subscribers s where s.status='subscribed' and p_topic=any(s.topics)
 and (p_locale is null or s.locale=p_locale)
 and not exists(select 1 from public.email_suppressions b where b.email=s.email)
 and not exists(select 1 from public.email_erased_mailboxes b where b.suppression_reason is not null
  and b.mailbox_hash=encode(sha256(convert_to(s.email,'UTF8')),'hex'));
$$;

create function public.email_erase_account(p_user uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare mailboxes text[]; affected text[]; mids uuid[]; n integer; subscribers integer;
begin
 if p_user is null then raise exception 'account required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,914));
 insert into public.email_disabled_accounts(user_id) select id from auth.users where id=p_user on conflict do nothing;
 -- Only mailbox proof or explicit server ownership permits bulk mailbox erasure.
 -- An unproved request to attach someone else's address must not erase it.
 select coalesce(array_agg(email order by email),'{}'::text[]) into mailboxes from public.email_subscribers
 where user_id=p_user and confirmed_at is not null;
 perform pg_advisory_xact_lock(hashtextextended(m,912)) from unnest(mailboxes) m order by m;
 perform 1 from public.email_subscribers where user_id=p_user for update;
 select coalesce(array_agg(id),'{}'::uuid[]) into mids from public.email_outbox
 where recipient_user_id=p_user or recipient_email=any(mailboxes)
 or id in (select confirmation_outbox_id from public.email_subscription_tokens where requested_user_id=p_user);
 select coalesce(array_agg(distinct address order by address),'{}'::text[]) into affected from (
  select recipient_email address from public.email_outbox where id=any(mids) and erased_at is null
  union select unnest(mailboxes)) x;
 perform pg_advisory_xact_lock(hashtextextended(address,915)) from unnest(affected) address order by address;
 perform pg_advisory_xact_lock(hashtextextended(provider_id,913)) from public.email_outbox
  where id=any(mids) and provider_id is not null order by provider_id;
 insert into public.email_erased_mailboxes(mailbox_hash)
 select distinct encode(sha256(convert_to(recipient_email,'UTF8')),'hex') from public.email_outbox
 where id=any(mids) and erased_at is null and recipient_user_id=p_user
 on conflict do nothing;
 insert into public.email_erased_mailboxes(mailbox_hash)
 select encode(sha256(convert_to(m,'UTF8')),'hex') from unnest(mailboxes) m on conflict do nothing;
 -- Preserve deliverability exclusions using minimal hashed identifiers rather
 -- than retaining the erased address or silently re-enabling complaint mailboxes.
 update public.email_erased_mailboxes m set suppression_reason=s.reason from public.email_suppressions s
 where s.email=any(affected) and m.mailbox_hash=encode(sha256(convert_to(s.email,'UTF8')),'hex');
 delete from public.email_delivery_events where recipient_email=any(mailboxes)
 or provider_id in (select provider_id from public.email_outbox where id=any(mids));
 delete from public.email_suppressions where email=any(mailboxes)
 or email in (select recipient_email from public.email_outbox where id=any(mids) and recipient_user_id=p_user);
 -- Keep opaque identities so a crashed sender cannot obtain a fresh provider
 -- submission by replaying its old key. No body/address/account link survives.
 update public.email_outbox set recipient_email='erased:'||id::text,payload='{}'::jsonb,
  recipient_user_id=null,status='suppressed',last_error='account_erased',erased_at=now(),
  lease_id=null,leased_until=null,updated_at=now() where id=any(mids) and erased_at is null;
 get diagnostics n=row_count;
 delete from public.email_subscription_tokens where requested_user_id=p_user;
 delete from public.email_subscribers where user_id=p_user;
 get diagnostics subscribers=row_count;
 -- Requests not yet proved have no user link; remove only orphan pending rows.
 delete from public.email_subscribers s where s.status='pending' and not exists
  (select 1 from public.email_subscription_tokens t where t.subscriber_id=s.id)
  and s.email in (select email from auth.users where id=p_user);
 return jsonb_build_object('messages_erased',n,'subscribers_erased',subscribers);
end $$;

create function public.email_export_for_user(p_user uuid)
returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'delivery_disabled',exists(select 1 from public.email_disabled_accounts where user_id=p_user),
  'subscriptions',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.email_subscribers s where s.user_id=p_user),'[]'::jsonb),
  'consent_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.email_consent_events e
    join public.email_subscribers s on s.id=e.subscriber_id where s.user_id=p_user),'[]'::jsonb),
  'confirmation_requests',coalesce((select jsonb_agg(jsonb_build_object('purpose',t.purpose,'created_at',t.created_at,
    'expires_at',t.expires_at,'used_at',t.used_at) order by t.created_at) from public.email_subscription_tokens t
    where t.requested_user_id=p_user or exists(select 1 from public.email_subscribers s where s.id=t.subscriber_id and s.user_id=p_user)), '[]'::jsonb),
  'messages',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'template',o.template_key,'recipient',o.recipient_email,
    'status',o.status,'created_at',o.created_at,'accepted_at',o.accepted_at,'delivered_at',o.delivered_at,
    'content',case when o.template_key='subscription_confirm' then jsonb_build_object('subject',o.payload->'subject','redacted','confirmation_secret')
      else o.payload-'headers' end) order by o.created_at,o.id)
    from public.email_outbox o where o.erased_at is null and (o.recipient_user_id=p_user
      or exists(select 1 from public.email_subscribers s where s.user_id=p_user and s.confirmed_at is not null and s.email=o.recipient_email))), '[]'::jsonb),
  'suppressions',coalesce((select jsonb_agg(to_jsonb(b)) from public.email_suppressions b where exists(
    select 1 from public.email_subscribers s where s.user_id=p_user and s.confirmed_at is not null and s.email=b.email)), '[]'::jsonb),
  'delivery_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at,e.event_id) from public.email_delivery_events e
    where exists(select 1 from public.email_outbox o where o.provider_id=e.provider_id and o.erased_at is null
      and (o.recipient_user_id=p_user or exists(select 1 from public.email_subscribers s where s.user_id=p_user
        and s.confirmed_at is not null and s.email=o.recipient_email)))), '[]'::jsonb)
 );
$$;

-- Preserve existing guards and the current erasure body, rather than copying
-- its large list of product tables and risking a regression as it evolves.
alter function public._delete_user_data_core(uuid) rename to _delete_user_data_before_email;
create function public._delete_user_data_core(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare erased jsonb;
begin
 erased:=public.email_erase_account(p_user_id);
 return public._delete_user_data_before_email(p_user_id)||jsonb_build_object('email',erased);
end $$;
alter function public.admin_anonymize_user(uuid,text) rename to _admin_anonymize_before_email;
revoke all on function public._admin_anonymize_before_email(uuid,text) from public,anon,authenticated;
create function public.admin_anonymize_user(p_user_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare original jsonb;
begin
 -- The original function performs the existing current-actor role check.
 original:=public._admin_anonymize_before_email(p_user_id,p_reason);
 return original||jsonb_build_object('email',public.email_erase_account(p_user_id));
end $$;
revoke all on function public.admin_anonymize_user(uuid,text) from public,anon;
grant execute on function public.admin_anonymize_user(uuid,text) to authenticated,service_role;

create schema if not exists email_private;
revoke all on schema email_private from public,anon,authenticated;
create function email_private.erase_before_auth_delete()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 perform public.email_erase_account(old.id);
 return old;
end $$;
revoke all on function email_private.erase_before_auth_delete() from public,anon,authenticated;
create trigger email_erase_before_auth_delete before delete on auth.users for each row execute function email_private.erase_before_auth_delete();

-- Service-only RPCs and private implementation helpers.
do $$ declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace
 and (p.proname like 'email_%' or p.proname in ('_delete_user_data_core','_delete_user_data_before_email','_admin_anonymize_before_email')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

create or replace function public.email_subscription_request(p_email text,p_user uuid,p_locale text,p_topics text[],p_source text,p_version text,p_hash text,p_confirmation jsonb default null,p_confirmation_key text default null)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_subscribers; confirmation_id uuid;
begin
 if p_user is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,914));
  if not exists(select 1 from auth.users where id=p_user) or exists(select 1 from public.email_disabled_accounts where user_id=p_user) then raise exception 'email_account_disabled'; end if;
 end if;
 -- Serialize both initial signup and subsequent requests for the same mailbox.
 perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_email)),912));
 select * into r from public.email_subscribers where email=lower(btrim(p_email)) for update;
 if found and r.confirmation_sent_at>now()-interval '5 minutes' then return null; end if;
 if r.id is null then
  insert into public.email_subscribers(email,user_id,locale,topics,source,consent_version,confirmation_sent_at)
  values(lower(btrim(p_email)),null,p_locale,p_topics,p_source,p_version,now()) returning * into r;
 else
  -- An unconfirmed request must never change an active subscription's topics.
  if r.status='subscribed' and (p_user is null or r.user_id=p_user) then return null; end if;
  if r.status<>'subscribed' then
  update public.email_subscribers set locale=p_locale,topics=p_topics,
  source=p_source,consent_version=p_version,status='pending',confirmation_sent_at=now(),updated_at=now() where id=r.id;
  end if;
  update public.email_subscribers set confirmation_sent_at=now() where id=r.id;
 end if;
 update public.email_subscription_tokens set used_at=now() where subscriber_id=r.id and purpose='confirm' and used_at is null;
 insert into public.email_subscription_tokens(token_hash,subscriber_id,purpose,expires_at,requested_user_id,requested_topics,requested_locale,requested_consent_version) values(p_hash,r.id,'confirm',now()+interval '24 hours',p_user,p_topics,p_locale,p_version);
 if p_confirmation is not null then
  if p_confirmation_key is null then raise exception 'confirmation identity required'; end if;
  update public.email_outbox set status='suppressed',last_error='confirmation_superseded',updated_at=now()
  where recipient_email=lower(btrim(p_email)) and template_key='subscription_confirm' and status='queued';
  select id into confirmation_id from public.email_enqueue(p_confirmation_key,p_email,p_confirmation,'subscription_confirm',now()+interval '24 hours');
  update public.email_subscription_tokens set confirmation_outbox_id=confirmation_id where token_hash=p_hash;
 end if;
 insert into public.email_consent_events(subscriber_id,action,topics,consent_version,source) values(r.id,'requested',p_topics,p_version,p_source);
 return r.id;
end $$;

create or replace function public.email_record_event(p_event_id text,p_provider_id text,p_recipient text,p_type text,p_at timestamptz,p_hard_bounce boolean default false,p_suppression boolean default false)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare mid uuid; inserted integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_recipient)),915));
 perform pg_advisory_xact_lock(hashtextextended(p_provider_id,913));
 -- Keep only a suppression reason when a late event concerns an erased address.
 if p_type='complained' or (p_type='bounced' and p_hard_bounce) or p_suppression then
  update public.email_erased_mailboxes set suppression_reason=case when p_type='complained' then 'complaint'
   when suppression_reason='complaint' then 'complaint' when p_hard_bounce then 'hard_bounce' else 'provider_suppressed' end
  where mailbox_hash=encode(sha256(convert_to(lower(btrim(p_recipient)),'UTF8')),'hex');
 end if;
 -- Erased message identities are retained without recipient/content. Uncorrelated
 -- late callbacks for an erased mailbox must not recreate its personal data.
 if exists(select 1 from public.email_outbox where provider_id=p_provider_id and erased_at is not null) then return false; end if;
 if exists(select 1 from public.email_erased_mailboxes where mailbox_hash=encode(sha256(convert_to(lower(btrim(p_recipient)),'UTF8')),'hex'))
  and not exists(select 1 from public.email_outbox where provider_id=p_provider_id and erased_at is null and recipient_email=lower(btrim(p_recipient))) then return false; end if;
 insert into public.email_delivery_events(event_id,provider_id,recipient_email,event_type,occurred_at,hard_bounce,suppression)
 values(p_event_id,p_provider_id,lower(btrim(p_recipient)),p_type,p_at,p_hard_bounce,p_suppression) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return false; end if;
 if p_type='complained' or (p_type='bounced' and p_hard_bounce) or p_suppression then
  insert into public.email_suppressions(email,reason) values(lower(btrim(p_recipient)),case when p_type='complained' then 'complaint' when p_hard_bounce then 'hard_bounce' else 'provider_suppressed' end)
  on conflict(email) do update set reason=excluded.reason;
 end if;
 select id into mid from public.email_outbox where provider_id=p_provider_id;
 if mid is not null then perform public.email_apply_events(mid); end if;
 return true;
end $$;

notify pgrst,'reload schema';
commit;
