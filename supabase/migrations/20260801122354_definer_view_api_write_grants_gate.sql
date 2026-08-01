-- History-reconciliation file. NOT new work.
-- See 20260801122200 for why this exists: MCP apply_migration recorded the gate RPC
-- under this version, so the repo needs a file here or `db push` skips silently.
-- Same statements as the tail of 20260806180000; CREATE OR REPLACE is idempotent.

create or replace function public.definer_view_api_write_grants()
returns table(view_name text, grantee text, privileges text)
language sql
stable
security definer
set search_path = public
as $$
  select c.relname::text,
         a.grantee::regrole::text,
         string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where n.nspname = 'public'
    and c.relkind = 'v'
    and a.grantee::regrole::text in ('anon', 'authenticated')
    and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    -- security_invoker views are safe: writes run as the caller, so base-table RLS applies.
    and coalesce(
          (select option_value from pg_options_to_table(c.reloptions)
           where option_name = 'security_invoker'),
          'false') in ('false', 'off')
  group by 1, 2
$$;

comment on function public.definer_view_api_write_grants() is
  'CI gate: non-security_invoker views in public carrying anon/authenticated write grants. Must return zero rows.';

revoke execute on function public.definer_view_api_write_grants() from anon, authenticated;
grant execute on function public.definer_view_api_write_grants() to service_role;
