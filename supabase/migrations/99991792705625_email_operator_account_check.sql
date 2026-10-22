-- 99991792705625_email_operator_account_check
--
-- TODO: why this migration exists.

-- Production service_role has no direct SELECT on auth.users. Expose only the
-- existing account-existence/disabled barrier, never account rows or addresses.
create or replace function public.email_operator_barrier(p_actor uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_actor is null then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,914));
 if not exists(select 1 from auth.users where id=p_actor)
  or exists(select 1 from public.email_disabled_accounts where user_id=p_actor) then
  raise exception 'operator_account_disabled' using errcode='42501';
 end if;
end $$;
revoke all on function public.email_operator_barrier(uuid) from public,anon,authenticated;
grant execute on function public.email_operator_barrier(uuid) to service_role;

do $$ begin
 assert not has_function_privilege('anon','public.email_operator_barrier(uuid)','EXECUTE');
 assert not has_function_privilege('authenticated','public.email_operator_barrier(uuid)','EXECUTE');
 assert (select prosecdef and proconfig @> array['search_path=pg_catalog'] from pg_proc where oid='public.email_operator_barrier(uuid)'::regprocedure);
end $$;

-- Existing service-only transactional RPCs also resolve current Auth identities.
-- Keep their purpose, consent, source and erasure checks, and expose no Auth
-- table grant. Every signature is explicit; unrelated functions are untouched.
do $$ declare signature text; fn regprocedure;
begin
 foreach signature in array array[
  'public.email_subscription_request(text,uuid,text,text[],text,text,text,jsonb,text)',
  'public.email_enqueue(text,text,jsonb,text,timestamptz,uuid)',
  'public.email_erase_account(uuid)',
  'public.email_emit_lifecycle_event(text,uuid,text,uuid,text)',
  'public.email_journey_source_current(uuid)',
  'public.email_journey_advance(uuid,uuid,text)',
  'public.email_journey_message_allowed(uuid)',
  'public.email_journey_enqueue(text,text,jsonb,text,uuid,uuid,uuid,text)',
  'public.email_delivery_preferences_before_groups(uuid,boolean,text,boolean,integer,integer,integer)',
  'public.email_activity_reason_before_groups(uuid)',
  'public.email_activity_reason_before_trips(uuid)',
  'public.email_group_mention_enqueue(uuid,jsonb)',
  'public.email_group_mention_candidates(integer,uuid)',
  'public.trip_invitation_create(uuid,uuid,text,text)',
  'public.email_activity_reason_before_notices(uuid)',
  'public.email_trip_invitation_enqueue(uuid,jsonb)',
  'public.email_trip_invitation_candidates(integer,uuid)',
  'public.email_notice_candidates(integer)',
  'public.email_notice_enqueue(uuid,jsonb)',
  'public.email_activity_message_reason(uuid)'
 ] loop
  fn:=signature::regprocedure;
  assert not has_function_privilege('anon',fn,'EXECUTE') and not has_function_privilege('authenticated',fn,'EXECUTE'), 'transactional RPC unexpectedly public';
  execute format('alter function %s security definer',fn);
  execute format('alter function %s set search_path=pg_catalog,public,pg_temp',fn);
 end loop;
 assert not has_schema_privilege('anon','public','CREATE') and not has_schema_privilege('authenticated','public','CREATE'),'public schema must be trusted';
end $$;
