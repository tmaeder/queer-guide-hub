-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260916070928 with no repo file — the signature of
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

create table if not exists security_audit.phase8_20260916_internal_auth_rpc_snapshot (
  object_identity text primary key,
  revoked_anon_execute boolean not null,
  revoked_authenticated_execute boolean not null,
  service_role_execute_preserved boolean not null,
  original_proacl text,
  captured_at timestamptz not null default now()
);
revoke all on table security_audit.phase8_20260916_internal_auth_rpc_snapshot from public, anon, authenticated;

insert into security_audit.phase8_20260916_internal_auth_rpc_snapshot (
 object_identity,revoked_anon_execute,revoked_authenticated_execute,service_role_execute_preserved,original_proacl
)
select p.oid::regprocedure::text,
 has_function_privilege('anon',p.oid,'execute'),
 has_function_privilege('authenticated',p.oid,'execute'),
 has_function_privilege('service_role',p.oid,'execute'),
 p.proacl::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.oid::regprocedure::text in (
 'circuit_breaker_record_success(text)',
 'increment_template_use_count(uuid)',
 'ingest_firecrawl_batch(text,jsonb)',
 'org_adopt_pass(text,integer)',
 'pgmq_metrics_all()',
 'prune_admin_lifecycle_snapshots(integer)',
 'register_circuit_breaker_if_absent(text)',
 'run_city_completeness_recompute(boolean)',
 'run_city_trust_recompute(boolean)',
 'run_dedup_close_distinct(integer,boolean)',
 'run_news_podcast_artwork_fill(integer)',
 'run_news_source_episode_count()',
 'story_member_divergence(uuid)'
)
on conflict (object_identity) do nothing;

do $migration$
declare target record;
begin
 for target in select * from security_audit.phase8_20260916_internal_auth_rpc_snapshot
 loop
  if target.revoked_anon_execute then
   execute format('revoke execute on function %s from anon',target.object_identity);
  end if;
  if target.revoked_authenticated_execute then
   execute format('revoke execute on function %s from authenticated',target.object_identity);
  end if;
 end loop;
end
$migration$;
;
