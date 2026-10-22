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
