begin;

create table public.email_subscribers (
 id uuid primary key default gen_random_uuid(),
 user_id uuid unique references auth.users(id) on delete set null,
 email text not null unique check (email = lower(btrim(email)) and email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
 status text not null default 'pending' check (status in ('pending','subscribed','unsubscribed')),
 locale text not null default 'en' check (length(locale) between 2 and 16),
 topics text[] not null default '{}' check (topics <@ array['newsletter','product_updates','events']::text[]),
 source text not null check (length(source) between 1 and 100),
 consent_version text not null check (length(consent_version) between 1 and 100),
 confirmed_at timestamptz,
 confirmation_sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.email_consent_events (
 id uuid primary key default gen_random_uuid(),
 subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
 action text not null check (action in ('requested','confirmed','preferences_changed','unsubscribed')),
 topics text[] not null,
 consent_version text not null,
 source text not null,
 created_at timestamptz not null default now()
);
create index on public.email_consent_events(subscriber_id, created_at desc);
create table public.email_subscription_tokens (
 token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
 subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
 purpose text not null check (purpose in ('confirm','unsubscribe')),
 requested_user_id uuid references auth.users(id) on delete set null,
 requested_topics text[],
 requested_locale text,
 requested_consent_version text,
 expires_at timestamptz not null,
 used_at timestamptz,
 created_at timestamptz not null default now()
);
create index on public.email_subscription_tokens(subscriber_id);
create table public.email_suppressions (
 email text primary key check (email=lower(btrim(email))),
 reason text not null check (reason in ('hard_bounce','complaint','provider_suppressed')),
 created_at timestamptz not null default now()
);
create table public.email_campaigns (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 1 and 200),
 template_key text not null references public.email_templates(template_key),
 subject text not null check (length(subject) between 1 and 998 and subject !~ '[\r\n]'),
 html_content text not null check (octet_length(html_content) <= 500000),
 text_content text not null,
 topic text not null check (topic in ('newsletter','product_updates','events')),
 locale text check (length(locale) between 2 and 16),
 scheduled_at timestamptz,
 status text not null default 'draft' check (status in ('draft','blocked','cancelled')),
 blocked_reason text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (status <> 'blocked' or blocked_reason='cloudflare_transactional_only')
);
create index on public.email_campaigns(created_at desc);
create table public.email_outbox (
 id uuid primary key default gen_random_uuid(),
 idempotency_key text not null unique check (length(idempotency_key) between 1 and 250),
 category text not null default 'transactional' check (category='transactional'),
 template_key text,
 recipient_email text not null check (recipient_email=lower(btrim(recipient_email))),
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text) <= 600000),
 status text not null default 'queued' check (status in ('queued','processing','accepted','delivered','deferred','failed','bounced','complained','suppressed','uncertain')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 expires_at timestamptz,
 lease_id uuid,
 leased_until timestamptz,
 provider_id text unique,
 last_error text,
 accepted_at timestamptz,
 delivered_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index on public.email_outbox(available_at) where status in ('queued','processing');
create index on public.email_outbox(created_at desc);
create table public.email_delivery_events (
 event_id text primary key,
 provider_id text not null,
 recipient_email text not null,
 event_type text not null check (event_type in ('delivered','deferred','bounced','failed','rejected','complained')),
 occurred_at timestamptz not null,
 hard_bounce boolean not null default false,
 suppression boolean not null default false,
 created_at timestamptz not null default now()
);
create index on public.email_delivery_events(provider_id, occurred_at);

-- The backend owns mutations. Admins can inspect operational data; tokens and
-- full message payloads are service-only and are never exposed by admin lists.
do $$
declare t text;
begin
 foreach t in array array['email_subscribers','email_consent_events','email_subscription_tokens','email_suppressions','email_campaigns','email_outbox','email_delivery_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.email_enqueue(p_key text, p_recipient text, p_payload jsonb, p_template text default null,p_expires timestamptz default null)
returns public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_outbox;
begin
 if coalesce(p_payload->>'category','') <> 'transactional' then raise exception 'cloudflare_transactional_only'; end if;
 if p_payload->>'to' is distinct from lower(btrim(p_recipient)) then raise exception 'recipient mismatch'; end if;
 insert into public.email_outbox(idempotency_key,recipient_email,payload,template_key,expires_at)
 values(p_key,lower(btrim(p_recipient)),p_payload,p_template,p_expires)
 on conflict(idempotency_key) do nothing returning * into r;
 if r.id is null then
  select * into r from public.email_outbox where idempotency_key=p_key;
  if r.recipient_email is distinct from lower(btrim(p_recipient)) or r.payload is distinct from p_payload then
   raise exception 'email_idempotency_conflict';
  end if;
 end if;
 return r;
end $$;

create function public.email_claim(p_limit integer default 10, p_id uuid default null)
returns setof public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
begin
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
   and (status='queued' or (status='processing' and leased_until<now()))
  order by available_at,id for update skip locked limit greatest(1,least(p_limit,25))
 )
 update public.email_outbox o set status='processing',attempts=o.attempts+1,
 lease_id=gen_random_uuid(),leased_until=now()+interval '2 minutes',updated_at=now()
 from candidates c where o.id=c.id returning o.*;
end $$;

create function public.email_append_feedback_reply(p_submission uuid,p_reply jsonb,p_actor uuid,p_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if jsonb_typeof(p_reply)<>'object' or nullif(p_reply->>'id','') is null then raise exception 'invalid feedback reply'; end if;
 -- Append against the current row: lifecycle callbacks must not be overwritten
 -- by a sender's stale copy of data while network delivery was in progress.
 update public.community_submissions c set data=jsonb_set(coalesce(c.data,'{}'::jsonb),'{replies}',
  (case when jsonb_typeof(c.data->'replies')='array' then c.data->'replies' else '[]'::jsonb end)||jsonb_build_array(p_reply)),
  reviewed_by=p_actor,reviewed_at=p_at
 where c.id=p_submission and c.content_type='feedback'
 and not coalesce(c.data->'replies','[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id',p_reply->>'id'));
 return found;
end $$;

create function public.email_sync_feedback(p_provider text)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_outbox; stamps jsonb;
begin
 if to_regclass('public.community_submissions') is null then return; end if;
 select * into r from public.email_outbox where provider_id=p_provider;
 if not found then return; end if;
 stamps:=case r.status
  when 'delivered' then jsonb_build_object('delivered_at',r.delivered_at)
  when 'bounced' then jsonb_build_object('bounced_at',r.updated_at,'bounce_reason','provider_bounce')
  when 'complained' then jsonb_build_object('complained_at',r.updated_at)
  else '{}'::jsonb end;
 if stamps='{}'::jsonb then return; end if;
 update public.community_submissions c set data=jsonb_set(c.data,'{replies}',
  (select jsonb_agg(case when reply->>'email_id'=p_provider then reply||stamps else reply end order by ord)
   from jsonb_array_elements(c.data->'replies') with ordinality as x(reply,ord)))
 where c.data->'replies' @> jsonb_build_array(jsonb_build_object('email_id',p_provider));
end $$;

create function public.email_apply_events(p_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare e record; r public.email_outbox;
begin
 select * into r from public.email_outbox where id=p_id for update;
 if not found or r.provider_id is null then return; end if;
 for e in select * from public.email_delivery_events where provider_id=r.provider_id and recipient_email=r.recipient_email order by occurred_at,event_id loop
  if e.event_type='complained' then r.status='complained';
  elsif r.status <> 'complained' and e.event_type='bounced' then r.status='bounced';
  elsif r.status not in ('complained','bounced') and e.event_type in ('failed','rejected') then r.status='failed';
  elsif r.status not in ('complained','bounced','failed') and e.event_type='delivered' then r.status='delivered'; r.delivered_at=e.occurred_at;
  elsif r.status not in ('complained','bounced','failed','delivered') and e.event_type='deferred' then r.status='deferred';
  end if;
 end loop;
 update public.email_outbox set status=r.status, delivered_at=r.delivered_at,updated_at=now() where id=p_id;
 perform public.email_sync_feedback(r.provider_id);
end $$;

create function public.email_finish(p_id uuid,p_lease uuid,p_status text,p_provider_id text default null,p_error text default null,p_retry_after integer default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_outbox;
begin
 if p_provider_id is not null then perform pg_advisory_xact_lock(hashtextextended(p_provider_id,913)); end if;
 if p_status not in ('accepted','queued','failed','uncertain','suppressed') then raise exception 'invalid outcome'; end if;
 if p_status='accepted' and nullif(p_provider_id,'') is null then raise exception 'receipt required'; end if;
 select * into r from public.email_outbox where id=p_id and lease_id=p_lease and status='processing' for update;
 if not found then return false; end if;
 update public.email_outbox set status=case when p_status='queued' and attempts>=8 then 'failed' else p_status end,
 provider_id=p_provider_id,last_error=left(p_error,500),
 accepted_at=case when p_status='accepted' then now() else accepted_at end,
 available_at=now()+make_interval(secs=>case when p_retry_after is not null then greatest(0,least(p_retry_after,86400)) else least(3600,30*power(2,least(attempts,7)))::int end),
 lease_id=null,leased_until=null,updated_at=now() where id=p_id;
 perform public.email_apply_events(p_id);
 return true;
end $$;

create function public.email_record_event(p_event_id text,p_provider_id text,p_recipient text,p_type text,p_at timestamptz,p_hard_bounce boolean default false,p_suppression boolean default false)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare mid uuid; inserted integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_provider_id,913));
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

create function public.email_subscription_request(p_email text,p_user uuid,p_locale text,p_topics text[],p_source text,p_version text,p_hash text,p_confirmation jsonb default null,p_confirmation_key text default null)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_subscribers;
begin
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
  perform public.email_enqueue(p_confirmation_key,p_email,p_confirmation,'subscription_confirm',now()+interval '24 hours');
 end if;
 insert into public.email_consent_events(subscriber_id,action,topics,consent_version,source) values(r.id,'requested',p_topics,p_version,p_source);
 return r.id;
end $$;

create function public.email_subscription_consume(p_hash text,p_purpose text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare t public.email_subscription_tokens; r public.email_subscribers; requested_actor uuid;
begin
 select requested_user_id into requested_actor from public.email_subscription_tokens where token_hash=p_hash;
 if requested_actor is not null then perform pg_advisory_xact_lock(hashtextextended(requested_actor::text,914)); end if;
 -- Same subscriber lock order as request/preferences to avoid lost opt-outs.
 select s.* into r from public.email_subscribers s join public.email_subscription_tokens k on k.subscriber_id=s.id
 where k.token_hash=p_hash and k.purpose=p_purpose for update of s;
 if not found then return false; end if;
 select * into t from public.email_subscription_tokens where token_hash=p_hash and purpose=p_purpose for update;
 if t.used_at is not null then return p_purpose='unsubscribe'; end if;
 if t.expires_at<=now() then return false; end if;
 update public.email_subscription_tokens set used_at=now() where token_hash=p_hash;
 if p_purpose='confirm' and t.requested_user_id is not null then
  update public.email_subscribers set user_id=null where user_id=t.requested_user_id and id<>r.id;
 end if;
 update public.email_subscribers set status=case when p_purpose='confirm' then 'subscribed' else 'unsubscribed' end,
 confirmed_at=case when p_purpose='confirm' then now() else confirmed_at end,
 user_id=case when p_purpose='confirm' then coalesce(t.requested_user_id,user_id) else user_id end,
 topics=case when p_purpose='confirm' then coalesce(t.requested_topics,topics) else topics end,
 consent_version=case when p_purpose='confirm' then coalesce(t.requested_consent_version,consent_version) else consent_version end,
 locale=case when p_purpose='confirm' then coalesce(t.requested_locale,locale) else locale end,updated_at=now() where id=r.id;
 -- Revoking consent invalidates outstanding confirmation links too.
 if p_purpose='unsubscribe' then update public.email_subscription_tokens set used_at=now() where subscriber_id=r.id and purpose='confirm' and used_at is null; end if;
 insert into public.email_consent_events(subscriber_id,action,topics,consent_version,source)
 values(r.id,case when p_purpose='confirm' then 'confirmed' else 'unsubscribed' end,case when p_purpose='confirm' then coalesce(t.requested_topics,r.topics) else r.topics end,case when p_purpose='confirm' then coalesce(t.requested_consent_version,r.consent_version) else r.consent_version end,'email_link');
 return true;
end $$;

create function public.email_subscription_preferences(p_user uuid,p_topics text[],p_locale text,p_unsubscribe boolean default false)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_subscribers;
begin
 select * into r from public.email_subscribers where user_id=p_user for update;
 if not found then raise exception 'subscription not found'; end if;
 update public.email_subscribers set topics=p_topics,locale=p_locale,
 status=case when p_unsubscribe then 'unsubscribed' else status end,updated_at=now() where id=r.id;
 if p_unsubscribe then update public.email_subscription_tokens set used_at=now() where subscriber_id=r.id and purpose='confirm' and used_at is null; end if;
 insert into public.email_consent_events(subscriber_id,action,topics,consent_version,source)
 values(r.id,case when p_unsubscribe then 'unsubscribed' else 'preferences_changed' end,p_topics,r.consent_version,'account_settings');
end $$;

create function public.email_audience_count(p_topic text,p_locale text default null)
returns bigint language sql security invoker set search_path=public,pg_temp as $$
 select count(*) from public.email_subscribers s where s.status='subscribed' and p_topic=any(s.topics)
 and (p_locale is null or s.locale=p_locale) and not exists(select 1 from public.email_suppressions b where b.email=s.email);
$$;

-- Postgres grants function EXECUTE to PUBLIC by default. All mutation RPCs
-- are service-only; endpoints perform current-session authorization explicitly.
do $$
declare f record;
begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('email_enqueue','email_claim','email_finish','email_apply_events','email_record_event','email_subscription_request','email_subscription_consume','email_subscription_preferences','email_audience_count','email_sync_feedback','email_append_feedback_reply') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

create function public.run_email_outbox_dispatch()
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if to_regclass('public.admin_automations') is not null then
  if exists(select 1 from public.admin_automations where slug='email_outbox_dispatch' and not enabled) then return; end if;
 end if;
 perform net.http_post(
  url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/email-dispatch',
  headers := jsonb_build_object('Content-Type','application/json','X-Internal-Secret',
   (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 30000);
end $$;
revoke all on function public.run_email_outbox_dispatch() from public,anon,authenticated;
grant execute on function public.run_email_outbox_dispatch() to service_role;
do $$
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('email_outbox_dispatch','* * * * *','select public.run_email_outbox_dispatch()');
 end if;
 if to_regclass('public.admin_automations') is not null then
  insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
  values('email_outbox_dispatch','Email delivery outbox','Cloudflare transactional email: retries leased deliveries and records provider receipts. Marketing dispatch is unavailable.',
   'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,'{"type":"rpc","fn":"run_email_outbox_dispatch"}'::jsonb,'* * * * *')
  on conflict(slug) do update set description=excluded.description,action=excluded.action,schedule=excluded.schedule;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
