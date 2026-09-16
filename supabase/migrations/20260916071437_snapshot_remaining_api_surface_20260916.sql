-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260916071437 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.

create table if not exists security_audit.remaining_api_surface_20260916 (
  object_kind text not null,
  object_identity text not null,
  anon_access boolean not null,
  authenticated_access boolean not null,
  rls_enabled boolean,
  policy_count integer,
  access_class text not null,
  captured_at timestamptz not null default now(),
  primary key (object_kind, object_identity)
);
revoke all on security_audit.remaining_api_surface_20260916 from public, anon, authenticated;
grant select, insert, update, delete on security_audit.remaining_api_surface_20260916 to service_role;

insert into security_audit.remaining_api_surface_20260916
(object_kind, object_identity, anon_access, authenticated_access, rls_enabled, policy_count, access_class)
select
  case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'materialized_view' else c.relkind::text end,
  format('%I.%I',n.nspname,c.relname),
  has_table_privilege('anon',c.oid,'select'),
  has_table_privilege('authenticated',c.oid,'select'),
  case when c.relkind='r' then c.relrowsecurity else null end,
  case when c.relkind='r' then (select count(*)::integer from pg_policy pol where pol.polrelid=c.oid) else null end,
  case
    when has_table_privilege('anon',c.oid,'select') then 'public_api_object'
    when has_table_privilege('authenticated',c.oid,'select') then 'authenticated_api_object'
    else 'not_client_visible'
  end
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','v','m')
on conflict (object_kind,object_identity) do update set
  anon_access=excluded.anon_access,
  authenticated_access=excluded.authenticated_access,
  rls_enabled=excluded.rls_enabled,
  policy_count=excluded.policy_count,
  access_class=excluded.access_class,
  captured_at=now();

insert into security_audit.remaining_api_surface_20260916
(object_kind, object_identity, anon_access, authenticated_access, rls_enabled, policy_count, access_class)
select
  'security_definer_function',
  p.oid::regprocedure::text,
  has_function_privilege('anon',p.oid,'execute'),
  has_function_privilege('authenticated',p.oid,'execute'),
  null,
  null,
  case
    when has_function_privilege('anon',p.oid,'execute') and p.provolatile in ('i','s') then 'public_read_rpc'
    when has_function_privilege('anon',p.oid,'execute') and pg_get_functiondef(p.oid) ~* 'auth\.uid|auth\.jwt|has_role|is_admin|require_admin|admin_guard|check_admin' then 'public_guarded_rpc'
    when has_function_privilege('anon',p.oid,'execute') then 'public_mutating_or_volatile_rpc'
    when has_function_privilege('authenticated',p.oid,'execute') and pg_get_functiondef(p.oid) ~* 'auth\.uid|auth\.jwt|has_role|is_admin|require_admin|admin_guard|check_admin' then 'authenticated_guarded_rpc'
    when has_function_privilege('authenticated',p.oid,'execute') then 'authenticated_internal_contract'
    else 'not_client_callable'
  end
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
on conflict (object_kind,object_identity) do update set
  anon_access=excluded.anon_access,
  authenticated_access=excluded.authenticated_access,
  access_class=excluded.access_class,
  captured_at=now();
;
