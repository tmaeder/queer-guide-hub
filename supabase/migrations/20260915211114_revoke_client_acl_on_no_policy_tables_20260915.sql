-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260915211114 with no repo file — the signature of
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

create table if not exists security_audit.phase3_20260915_no_policy_acl_snapshot (
  table_name text not null,
  role_name text not null,
  privileges text[] not null,
  captured_at timestamptz not null default now(),
  primary key (table_name, role_name)
);
revoke all on table security_audit.phase3_20260915_no_policy_acl_snapshot from public, anon, authenticated;

insert into security_audit.phase3_20260915_no_policy_acl_snapshot (
  table_name, role_name, privileges
)
select
  c.relname,
  role_target.role_name,
  coalesce(
    (
      select array_agg(distinct acl.privilege_type order by acl.privilege_type)
      from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      join pg_roles granted_role on granted_role.oid = acl.grantee
      where granted_role.rolname = role_target.role_name
    ),
    array[]::text[]
  )
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'::text), ('authenticated'::text)) role_target(role_name)
where n.nspname = 'public'
  and c.relkind in ('r','p')
  and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
on conflict (table_name, role_name) do nothing;

do $migration$
declare
  target record;
begin
  for target in
    select distinct table_name
    from security_audit.phase3_20260915_no_policy_acl_snapshot
  loop
    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      target.table_name
    );
  end loop;
end
$migration$;
;
