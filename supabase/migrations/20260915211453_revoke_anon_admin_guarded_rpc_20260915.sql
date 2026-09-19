-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260915211453 with no repo file — the signature of
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

create table if not exists security_audit.phase5_20260915_anon_admin_guarded_rpc_snapshot (
  object_identity text primary key,
  revoked_anon_execute boolean not null,
  authenticated_execute_preserved boolean not null,
  service_role_execute_preserved boolean not null,
  original_proacl text,
  captured_at timestamptz not null default now()
);
revoke all on table security_audit.phase5_20260915_anon_admin_guarded_rpc_snapshot from public, anon, authenticated;

insert into security_audit.phase5_20260915_anon_admin_guarded_rpc_snapshot (
 object_identity,revoked_anon_execute,authenticated_execute_preserved,service_role_execute_preserved,original_proacl
)
select p.oid::regprocedure::text,
 has_function_privilege('anon',p.oid,'execute'),
 has_function_privilege('authenticated',p.oid,'execute'),
 has_function_privilege('service_role',p.oid,'execute'),
 p.proacl::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.oid::regprocedure::text in (
 'decide_venue_nonvenue(uuid,boolean,text,boolean)',
 'freigabe_personality(uuid,boolean)',
 'promote_submission_to_roadmap(uuid[])',
 'publish_personality_with_consent(uuid,boolean)',
 'unfreigabe_personality(uuid)'
)
on conflict (object_identity) do nothing;

do $migration$
declare target record;
begin
 for target in
   select object_identity from security_audit.phase5_20260915_anon_admin_guarded_rpc_snapshot
   where revoked_anon_execute
 loop
   execute format('revoke execute on function %s from anon',target.object_identity);
 end loop;
end
$migration$;
;
