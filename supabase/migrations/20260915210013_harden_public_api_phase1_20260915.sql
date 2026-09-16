-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260915210013 with no repo file — the signature of
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

create schema if not exists security_audit authorization postgres;
revoke all on schema security_audit from public, anon, authenticated;

create table if not exists security_audit.phase1_20260915_snapshot (
  object_identity text primary key,
  changed_search_path boolean not null default false,
  revoked_public_execute boolean not null default false,
  original_proconfig text[],
  original_proacl text,
  captured_at timestamptz not null default now()
);
revoke all on table security_audit.phase1_20260915_snapshot from public, anon, authenticated;

insert into security_audit.phase1_20260915_snapshot (
  object_identity, changed_search_path, revoked_public_execute,
  original_proconfig, original_proacl
)
select
  p.oid::regprocedure::text,
  (
    owner_role.rolname = 'postgres'
    and not exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) setting
      where setting like 'search_path=%'
    )
  ),
  (
    owner_role.rolname = 'postgres'
    and p.prosecdef
    and has_function_privilege('public', p.oid, 'execute')
  ),
  p.proconfig,
  p.proacl::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles owner_role on owner_role.oid = p.proowner
where n.nspname = 'public'
  and owner_role.rolname = 'postgres'
  and (
    not exists (
      select 1
      from unnest(coalesce(p.proconfig, array[]::text[])) setting
      where setting like 'search_path=%'
    )
    or (p.prosecdef and has_function_privilege('public', p.oid, 'execute'))
  )
on conflict (object_identity) do nothing;

alter view public.glossary_link_terms_public
  set (security_invoker = true);

do $migration$
declare
  target record;
begin
  for target in
    select object_identity
    from security_audit.phase1_20260915_snapshot
    where changed_search_path
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, extensions, auth, storage',
      target.object_identity
    );
  end loop;

  for target in
    select object_identity
    from security_audit.phase1_20260915_snapshot
    where revoked_public_execute
  loop
    execute format(
      'revoke execute on function %s from public',
      target.object_identity
    );
  end loop;
end
$migration$;
;
