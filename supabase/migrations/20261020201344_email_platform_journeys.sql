begin;
create table public.email_journeys (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 1 and 200),
 status text not null default 'draft' check (status in ('draft','active','paused','archived')),
 version integer not null default 1,
 active_since timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.email_journey_versions (
 journey_id uuid not null references public.email_journeys(id) on delete cascade,
 version integer not null,
 trigger_event text not null,
 trigger_state text not null,
 reentry text not null check (reentry in ('once_per_account','once_per_source','per_event')),
 definition jsonb not null,
 activated_at timestamptz,
 deactivated_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 primary key(journey_id,version)
);
create table public.email_journey_runs (
 id uuid primary key default gen_random_uuid(),
 journey_id uuid not null,
 version integer not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 event_id uuid not null references public.email_lifecycle_events(id) on delete cascade,
 source_id uuid not null,
 enrollment_key text not null,
 step_id text not null,
 status text not null default 'waiting' check (status in ('waiting','processing','completed','cancelled','failed')),
 due_at timestamptz not null default now(),
 lease_id uuid,
 leased_until timestamptz,
 attempts integer not null default 0,
 total_steps integer not null default 0,
 last_error text,
 cancelled_by uuid references auth.users(id) on delete set null,
 cancelled_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(journey_id,enrollment_key),
 foreign key(journey_id,version) references public.email_journey_versions(journey_id,version)
);
create index on public.email_journey_versions(created_by);
create index on public.email_journey_runs(journey_id,version);
create index on public.email_journey_runs(cancelled_by);
create index on public.email_journey_runs(user_id);
create index on public.email_journey_runs(event_id);
create index on public.email_journey_runs(due_at) where status in ('waiting','processing');
create table public.email_journey_steps (
 run_id uuid not null references public.email_journey_runs(id) on delete cascade,
 step_id text not null,
 kind text not null,
 outcome text not null,
 completed_at timestamptz not null default now(),
 primary key(run_id,step_id)
);
create table public.email_journey_messages (
 outbox_id uuid not null references public.email_outbox(id) on delete cascade,
 run_id uuid not null references public.email_journey_runs(id) on delete cascade,
 step_id text not null,
 primary key(outbox_id,run_id,step_id)
);
create index on public.email_journey_messages(run_id);
do $$ declare t text;
begin
 foreach t in array array['email_journeys','email_journey_versions','email_journey_runs','email_journey_steps','email_journey_messages'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.email_journey_validate(p_event text,p_state text,p_reentry text,p_definition jsonb)
returns void language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare item record; node jsonb; kind text; n integer; done text[]:='{}'; previous integer; edges text[]; edge text;
begin
 if p_event is null or p_state is null or p_reentry is null or p_reentry not in ('once_per_account','once_per_source','per_event') then raise exception 'invalid_journey_trigger' using errcode='22023'; end if;
 if not ((p_event='account.created' and p_state='created') or (p_event='profile.username.changed' and p_state in ('claimed','removed'))
  or (p_event='event.rsvp.changed' and p_state in ('going','interested'))
  or (p_event='group.membership.changed' and p_state='joined') or (p_event='trip.membership.changed' and p_state in ('invited','accepted'))) then
  raise exception 'unsupported_journey_trigger' using errcode='22023';
 end if;
 if jsonb_typeof(p_definition) is distinct from 'object' or octet_length(p_definition::text)>16000
  or jsonb_typeof(p_definition->'steps') is distinct from 'object' or jsonb_typeof(p_definition->'start') is distinct from 'string' then raise exception 'invalid_journey_graph' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(p_definition))<>2 then raise exception 'invalid_journey_graph' using errcode='22023'; end if;
 select count(*) into n from jsonb_object_keys(p_definition->'steps');
 if n not between 1 and 32 or not (p_definition->'steps') ? (p_definition->>'start') then raise exception 'invalid_journey_graph' using errcode='22023'; end if;
 for item in select * from jsonb_each(p_definition->'steps') loop
  node:=item.value; kind:=node->>'type';
  if item.key !~ '^[a-z][a-z0-9_]{0,39}$' or jsonb_typeof(node) is distinct from 'object' or kind is null then raise exception 'invalid_journey_step' using errcode='22023'; end if;
  select count(*) into n from jsonb_object_keys(node);
  if kind='end' and n=1 then done:=array_append(done,item.key);
  elsif kind='welcome' and n=2 and p_event='account.created' then
   if jsonb_typeof(node->'next') is distinct from 'string' then raise exception 'invalid_journey_edge' using errcode='22023'; end if;
  elsif kind='wait' and n=3 and jsonb_typeof(node->'seconds')='number' and (node->>'seconds') ~ '^[0-9]{1,7}$' then
   if (node->>'seconds')::int not between 1 and 2592000 then raise exception 'invalid_journey_wait' using errcode='22023'; end if;
   if jsonb_typeof(node->'next') is distinct from 'string' then raise exception 'invalid_journey_edge' using errcode='22023'; end if;
  elsif kind='branch' and n=4 and coalesce(node->>'condition','') in ('username_claimed','profile_exists') then
   if jsonb_typeof(node->'yes') is distinct from 'string' or jsonb_typeof(node->'no') is distinct from 'string' then raise exception 'invalid_journey_edge' using errcode='22023'; end if;
  else raise exception 'unsupported_journey_step' using errcode='22023'; end if;
  edges:=case when kind='branch' then array[node->>'yes',node->>'no'] when kind='end' then '{}'::text[] else array[node->>'next'] end;
  foreach edge in array edges loop
   if not (p_definition->'steps') ? edge then raise exception 'invalid_journey_edge' using errcode='22023'; end if;
  end loop;
 end loop;
 -- Bounded topological elimination avoids exponential path traversal.
 for iteration in 1..32 loop
  previous:=cardinality(done);
  for item in select * from jsonb_each(p_definition->'steps') loop
   if item.key=any(done) then continue; end if;
   node:=item.value;
   edges:=case when node->>'type'='branch' then array[node->>'yes',node->>'no'] else array[node->>'next'] end;
   if edges<@done then done:=array_append(done,item.key); end if;
  end loop;
  if cardinality(done)=previous then exit; end if;
 end loop;
 if cardinality(done)<>(select count(*) from jsonb_object_keys(p_definition->'steps')) then raise exception 'journey_cycle_or_missing_end' using errcode='22023'; end if;
end $$;

create function public.email_journey_save(p_name text,p_event text,p_state text,p_definition jsonb,p_reentry text default 'once_per_account',p_status text default 'draft',p_actor uuid default null,p_id uuid default null,p_expected_version integer default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.email_journeys; boundary timestamptz:=clock_timestamp();
begin
 perform public.email_journey_validate(p_event,p_state,p_reentry,p_definition);
 if p_name is null or length(btrim(p_name)) not between 1 and 200 or p_status is null or p_status not in ('draft','active','paused','archived') then raise exception 'invalid_journey' using errcode='22023'; end if;
 if p_id is null then
  insert into public.email_journeys(name,status,active_since) values(btrim(p_name),p_status,case when p_status='active' then boundary else null end) returning * into j;
 else
  select * into j from public.email_journeys where id=p_id for update;
  if not found then raise exception 'journey_not_found' using errcode='P0002'; end if;
  if p_expected_version is distinct from j.version then raise exception 'journey_version_conflict' using errcode='40001'; end if;
  update public.email_journeys set name=btrim(p_name),status=p_status,version=version+1,updated_at=now(),
   active_since=case when p_status='active' then boundary else active_since end where id=p_id returning * into j;
 end if;
 update public.email_journey_versions set deactivated_at=boundary where journey_id=j.id and activated_at is not null and deactivated_at is null;
 insert into public.email_journey_versions(journey_id,version,trigger_event,trigger_state,reentry,definition,activated_at,created_by)
 values(j.id,j.version,p_event,p_state,p_reentry,p_definition,case when p_status='active' then boundary else null end,p_actor);
 if p_status='archived' then update public.email_journey_runs set status='cancelled',lease_id=null,leased_until=null,last_error='journey_archived',updated_at=now() where journey_id=j.id and status in ('waiting','processing'); end if;
 return jsonb_build_object('id',j.id,'version',j.version,'status',j.status);
end $$;

create function public.email_journey_source_current(p_event uuid)
returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare e public.email_lifecycle_events;
begin
 select * into e from public.email_lifecycle_events where id=p_event;
 if not found or not exists(select 1 from auth.users where id=e.user_id) or exists(select 1 from public.email_disabled_accounts where user_id=e.user_id) then return false; end if;
 if e.event_type='account.created' then return e.source_id=e.user_id; end if;
 if e.event_type='profile.username.changed' then return exists(select 1 from public.profiles where user_id=e.user_id and (case when nullif(btrim(username),'') is null then 'removed' else 'claimed' end)=e.state); end if;
 if e.event_type='event.rsvp.changed' then return exists(select 1 from public.event_attendees where id=e.source_id and user_id=e.user_id and status=e.state and status in ('going','interested')); end if;
 if e.event_type='group.membership.changed' then return exists(select 1 from public.group_memberships where id=e.source_id and user_id=e.user_id); end if;
 if e.event_type='trip.membership.changed' then return exists(select 1 from public.trip_members where id=e.source_id and user_id=e.user_id
  and (case when accepted_at is not null or role='owner' then 'accepted' else 'invited' end)=e.state); end if;
 return false;
end $$;

create function public.email_journey_enroll(p_limit integer default 100)
returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare item record; inserted integer; total integer:=0; enrollment text;
begin
 -- No timestamp cursor: late commits remain eligible. Activation excludes
 -- historical users, and the unique key applies across definition versions.
 for item in select j.id journey_id,v.version,v.reentry,v.definition,e.* from public.email_journeys j
  join public.email_journey_versions v on v.journey_id=j.id and v.activated_at is not null
  join public.email_lifecycle_events e on e.event_type=v.trigger_event and e.state=v.trigger_state and e.occurred_at>=v.activated_at
   and (v.deactivated_at is null or e.occurred_at<v.deactivated_at)
  where j.status='active' and public.email_journey_source_current(e.id) and not exists(select 1 from public.email_journey_runs r where r.journey_id=j.id and r.enrollment_key=
   case v.reentry when 'once_per_account' then e.user_id::text when 'once_per_source' then e.user_id::text||':'||e.source_id::text else e.id::text end)
  order by e.occurred_at,e.id limit greatest(1,least(coalesce(p_limit,100),500))
 loop
  perform pg_advisory_xact_lock(hashtextextended(item.user_id::text,914));
  if not public.email_journey_source_current(item.id) or not exists(select 1 from public.email_journey_versions v join public.email_journeys j on j.id=v.journey_id
   where v.journey_id=item.journey_id and v.version=item.version and j.status='active' and v.activated_at<=item.occurred_at
   and (v.deactivated_at is null or item.occurred_at<v.deactivated_at)) then continue; end if;
  enrollment:=case item.reentry when 'once_per_account' then item.user_id::text when 'once_per_source' then item.user_id::text||':'||item.source_id::text else item.id::text end;
  insert into public.email_journey_runs(journey_id,version,user_id,event_id,source_id,enrollment_key,step_id)
  values(item.journey_id,item.version,item.user_id,item.id,item.source_id,enrollment,item.definition->>'start') on conflict do nothing;
  get diagnostics inserted=row_count; total:=total+inserted;
 end loop;
 return total;
end $$;

create function public.email_journey_claim(p_limit integer default 5)
returns table(run_id uuid,lease uuid,user_id uuid,step_id text,node jsonb) language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.email_journey_runs r set status='cancelled',lease_id=null,leased_until=null,last_error='source_no_longer_current',updated_at=now()
 where r.status in ('waiting','processing') and not public.email_journey_source_current(r.event_id);
 update public.email_journey_runs r set status='failed',lease_id=null,leased_until=null,last_error='attempt_limit',updated_at=now()
 where r.status in ('waiting','processing') and (r.attempts>=8 or r.total_steps>=64) and (r.leased_until is null or r.leased_until<now());
 return query with candidates as (
  select r.id from public.email_journey_runs r join public.email_journeys j on j.id=r.journey_id
  where j.status='active' and r.due_at<=now() and (r.status='waiting' or (r.status='processing' and r.leased_until<now()))
  order by r.due_at,r.id for update of r skip locked limit greatest(1,least(coalesce(p_limit,5),10))
 ), claimed as (
  update public.email_journey_runs r set status='processing',lease_id=gen_random_uuid(),leased_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now()
  from candidates c where r.id=c.id returning r.*
 ) select r.id,r.lease_id,r.user_id,r.step_id,v.definition->'steps'->r.step_id from claimed r
 join public.email_journey_versions v on v.journey_id=r.journey_id and v.version=r.version;
end $$;

create function public.email_journey_run_allowed(p_run uuid,p_lease uuid default null)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.email_journey_runs r join public.email_journeys j on j.id=r.journey_id where r.id=p_run
 and j.status='active' and r.status in ('waiting','processing') and r.due_at<=now()
 and (p_lease is null or (r.status='processing' and r.lease_id=p_lease and r.leased_until>now()))
 and public.email_journey_source_current(r.event_id));
$$;

create function public.email_journey_advance(p_run uuid,p_lease uuid,p_error text default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_journey_runs; node jsonb; next_id text; result text; present boolean; due timestamptz:=now(); pending_status text; pending_due timestamptz;
begin
 select * into r from public.email_journey_runs where id=p_run for update;
 if not found or not public.email_journey_run_allowed(p_run,p_lease) then return false; end if;
 if p_error is not null then
  select o.status,o.available_at into pending_status,pending_due from public.email_journey_messages m
   join public.email_outbox o on o.id=m.outbox_id join auth.users u on u.id=r.user_id
   where m.run_id=p_run and m.step_id=r.step_id and o.recipient_email=lower(btrim(u.email)) order by o.created_at desc limit 1;
  if pending_status in ('uncertain','failed','suppressed','bounced','complained') then
   update public.email_journey_runs set status='failed',last_error='message_'||pending_status,lease_id=null,leased_until=null,updated_at=now() where id=p_run;
   return true;
  end if;
  update public.email_journey_runs set status=case when attempts>=8 then 'failed' else 'waiting' end,
   due_at=greatest(now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::int),case when pending_status='queued' then pending_due else now() end),last_error=left(p_error,200),lease_id=null,leased_until=null,updated_at=now() where id=p_run;
  return true;
 end if;
 select definition->'steps'->r.step_id into node from public.email_journey_versions where journey_id=r.journey_id and version=r.version;
 if node->>'type'='welcome' then
  if not exists(select 1 from public.email_outbox o join auth.users u on u.id=r.user_id
   where o.idempotency_key=encode(sha256(convert_to('welcome:'||r.user_id::text||':'||lower(btrim(u.email)),'UTF8')),'hex')
   and o.status in ('accepted','delivered','deferred') and o.provider_id is not null and o.erased_at is null) then raise exception 'journey_receipt_required' using errcode='22023'; end if;
  next_id:=node->>'next'; result:='provider_accepted';
 elsif node->>'type'='wait' then next_id:=node->>'next'; due:=now()+make_interval(secs=>(node->>'seconds')::int); result:='wait_scheduled';
 elsif node->>'type'='branch' then
  if node->>'condition'='username_claimed' then select exists(select 1 from public.profiles where user_id=r.user_id and nullif(btrim(username),'') is not null) into present;
  else select exists(select 1 from public.profiles where user_id=r.user_id) into present; end if;
  next_id:=case when present then node->>'yes' else node->>'no' end; result:=case when present then 'yes' else 'no' end;
 elsif node->>'type'='end' then next_id:=null; result:='completed';
 else raise exception 'unsupported_journey_step'; end if;
 insert into public.email_journey_steps(run_id,step_id,kind,outcome) values(p_run,r.step_id,node->>'type',result);
 update public.email_journey_runs set step_id=coalesce(next_id,step_id),status=case when next_id is null then 'completed' else 'waiting' end,
  due_at=due,lease_id=null,leased_until=null,attempts=0,total_steps=total_steps+1,last_error=null,updated_at=now() where id=p_run;
 return true;
end $$;

create function public.email_journey_message_allowed(p_outbox uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select not exists(select 1 from public.email_journey_messages where outbox_id=p_outbox)
 or exists(select 1 from public.email_journey_messages m join public.email_journey_runs r on r.id=m.run_id
  join public.email_outbox o on o.id=m.outbox_id join auth.users u on u.id=r.user_id
  where m.outbox_id=p_outbox and o.recipient_email=lower(btrim(u.email)) and m.step_id=r.step_id and public.email_journey_run_allowed(r.id));
$$;

create function public.email_journey_enqueue(p_key text,p_recipient text,p_payload jsonb,p_template text,p_user uuid,p_run uuid,p_lease uuid,p_step text)
returns public.email_outbox language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_journey_runs; o public.email_outbox; kind text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,914));
 select * into r from public.email_journey_runs where id=p_run for update;
 if not found or r.user_id is distinct from p_user or r.step_id is distinct from p_step or not public.email_journey_run_allowed(p_run,p_lease) then raise exception 'journey_step_ineligible' using errcode='22023'; end if;
 select definition->'steps'->p_step->>'type' into kind from public.email_journey_versions where journey_id=r.journey_id and version=r.version;
 if kind is distinct from 'welcome' or p_template is distinct from 'welcome'
  or not exists(select 1 from auth.users where id=p_user and lower(btrim(email))=lower(btrim(p_recipient)))
  or p_key is distinct from encode(sha256(convert_to('welcome:'||p_user::text||':'||lower(btrim(p_recipient)),'UTF8')),'hex') then raise exception 'unsupported_journey_message' using errcode='22023'; end if;
 o:=public.email_enqueue(p_key,p_recipient,p_payload,p_template,null,p_user);
 insert into public.email_journey_messages(outbox_id,run_id,step_id) values(o.id,p_run,p_step) on conflict do nothing;
 return o;
end $$;

create function public.email_journey_cancel(p_run uuid,p_actor uuid default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.email_journey_runs;
begin
 select * into r from public.email_journey_runs where id=p_run for update;
 if not found then return false; end if;
 if r.status='cancelled' then return true; end if;
 if r.status not in ('waiting','processing') then return false; end if;
 update public.email_journey_runs set status='cancelled',cancelled_by=p_actor,cancelled_at=now(),
  lease_id=null,leased_until=null,last_error='operator_cancelled',updated_at=now() where id=p_run;
 return true;
end $$;

alter function public.email_dispatch_authorize(uuid,uuid) rename to email_dispatch_before_journeys;
create function public.email_dispatch_authorize(p_id uuid,p_lease uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select public.email_dispatch_before_journeys(p_id,p_lease) and public.email_journey_message_allowed(p_id);
$$;

create function email_private.erase_journey_runs()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin delete from public.email_journey_runs where user_id=new.user_id; return new; end $$;
revoke all on function email_private.erase_journey_runs() from public,anon,authenticated;
create trigger email_journey_erasure after insert on public.email_disabled_accounts for each row execute function email_private.erase_journey_runs();

alter function public.email_export_for_user(uuid) rename to email_export_before_journeys;
create function public.email_export_for_user(p_user uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select public.email_export_before_journeys(p_user)||jsonb_build_object(
  'journey_runs',coalesce((select jsonb_agg(to_jsonb(r)-'enrollment_key'-'lease_id'-'cancelled_by' order by r.created_at,r.id) from public.email_journey_runs r where user_id=p_user),'[]'::jsonb),
  'journey_steps',coalesce((select jsonb_agg(to_jsonb(s) order by s.completed_at,s.step_id) from public.email_journey_steps s
   join public.email_journey_runs r on r.id=s.run_id where r.user_id=p_user),'[]'::jsonb));
$$;
do $$ declare f record;
begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
 and (proname like 'email_journey_%' or proname in ('email_dispatch_authorize','email_export_for_user')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

create or replace function public.email_claim_before_privacy(p_limit integer default 10, p_id uuid default null)
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
   and public.email_journey_message_allowed(id)
   and (status='queued' or (status='processing' and leased_until<now()))
  order by available_at,id for update skip locked limit greatest(1,least(p_limit,25))
 )
 update public.email_outbox o set status='processing',attempts=o.attempts+1,
 lease_id=gen_random_uuid(),leased_until=now()+interval '2 minutes',updated_at=now()
 from candidates c where o.id=c.id returning o.*;
end $$;

create function public.run_email_journey_dispatch()
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if to_regclass('public.admin_automations') is not null then
  if exists(select 1 from public.admin_automations where slug='email_journey_dispatch' and not enabled) then return; end if;
 end if;
 perform net.http_post(url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/email-journeys',
  headers:=jsonb_build_object('Content-Type','application/json','X-Internal-Secret',
   (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
  body:='{"action":"tick"}'::jsonb,timeout_milliseconds:=30000);
end $$;
revoke all on function public.run_email_journey_dispatch() from public,anon,authenticated;
grant execute on function public.run_email_journey_dispatch() to service_role;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('email_journey_dispatch','* * * * *','select public.run_email_journey_dispatch()');
 end if;
 if to_regclass('public.admin_automations') is not null then
  insert into public.admin_automations(slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
  values('email_journey_dispatch','Email journeys','Leased transactional welcome journeys; no marketing sending.','system',true,
   '{"type":"schedule"}'::jsonb,'[]'::jsonb,'{"type":"rpc","fn":"run_email_journey_dispatch"}'::jsonb,'* * * * *')
  on conflict(slug) do update set description=excluded.description,action=excluded.action,schedule=excluded.schedule;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
