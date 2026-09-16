-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260915210415 with no repo file — the signature of
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

create table if not exists security_audit.phase1_20260915_trigger_snapshot (
  object_identity text primary key,
  revoked_anon_execute boolean not null,
  revoked_authenticated_execute boolean not null,
  original_proacl text,
  captured_at timestamptz not null default now()
);
revoke all on table security_audit.phase1_20260915_trigger_snapshot from public, anon, authenticated;

insert into security_audit.phase1_20260915_trigger_snapshot (
  object_identity, revoked_anon_execute, revoked_authenticated_execute, original_proacl
)
select
  p.oid::regprocedure::text,
  has_function_privilege('anon', p.oid, 'execute'),
  has_function_privilege('authenticated', p.oid, 'execute'),
  p.proacl::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prorettype = 'trigger'::regtype
  and (
    has_function_privilege('anon', p.oid, 'execute')
    or has_function_privilege('authenticated', p.oid, 'execute')
  )
on conflict (object_identity) do nothing;

do $migration$
declare
  target record;
begin
  for target in
    select object_identity, revoked_anon_execute, revoked_authenticated_execute
    from security_audit.phase1_20260915_trigger_snapshot
  loop
    if target.revoked_anon_execute then
      execute format('revoke execute on function %s from anon', target.object_identity);
    end if;
    if target.revoked_authenticated_execute then
      execute format('revoke execute on function %s from authenticated', target.object_identity);
    end if;
  end loop;
end
$migration$;
;
