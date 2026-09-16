-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260915210825 with no repo file — the signature of
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

create table if not exists security_audit.phase2_20260915_rpc_snapshot (
  object_identity text primary key,
  revoked_authenticated_execute boolean not null,
  service_role_execute_preserved boolean not null,
  original_proacl text,
  captured_at timestamptz not null default now()
);
revoke all on table security_audit.phase2_20260915_rpc_snapshot from public, anon, authenticated;

insert into security_audit.phase2_20260915_rpc_snapshot (
  object_identity,
  revoked_authenticated_execute,
  service_role_execute_preserved,
  original_proacl
)
select
  p.oid::regprocedure::text,
  has_function_privilege('authenticated', p.oid, 'execute'),
  has_function_privilege('service_role', p.oid, 'execute'),
  p.proacl::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid::regprocedure::text in (
    'admin_automation_tracking_gaps()',
    'merge_duplicate_images(uuid,uuid[])',
    'city_resolve_or_create(text,uuid,text,text,numeric,numeric,text,text,text,boolean,text,text,uuid,text)'
  )
on conflict (object_identity) do nothing;

revoke execute on function public.admin_automation_tracking_gaps() from authenticated;
revoke execute on function public.merge_duplicate_images(uuid, uuid[]) from authenticated;
revoke execute on function public.city_resolve_or_create(
  text, uuid, text, text, numeric, numeric, text, text, text, boolean, text, text, uuid, text
) from authenticated;
;
