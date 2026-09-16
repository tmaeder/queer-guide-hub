-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260916053454 with no repo file — the signature of
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

create table if not exists security_audit.phase6_20260916_rpc_acl_snapshot (
  object_identity text primary key,
  revoke_anon boolean not null,
  revoke_authenticated boolean not null,
  reason text not null,
  original_proacl text,
  captured_at timestamptz not null default now()
);
revoke all on table security_audit.phase6_20260916_rpc_acl_snapshot from public, anon, authenticated;

with candidates as (
  select p.oid, 'admin_guarded'::text reason, true revoke_anon, false revoke_authenticated
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and has_function_privilege('anon',p.oid,'execute')
    and (
      lower(p.prosrc) like '%assert_admin_or_internal%'
      or lower(p.prosrc) ~ 'has_any_role_jwt[(].*admin'
      or lower(p.prosrc) ~ 'has_role_jwt[(].*admin'
      or lower(p.prosrc) ~ 'has_role[(].*admin'
    )
  union
  select p.oid, 'authenticated_user_only', true, false
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.oid::regprocedure::text in (
    'assign_days_to_destination(uuid,date,date)',
    'get_venue_safety_questions(uuid)',
    'save_news_search(text,text,jsonb,boolean,text)',
    'set_conversation_availability(uuid,integer)',
    'set_travel_inbox_item_status(uuid,text)',
    'toggle_news_search_alert(uuid,boolean)'
  )
  union
  select p.oid, 'internal_or_unguarded_write', true, true
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.oid::regprocedure::text in (
    '_fb_auto_cap(text,integer)',
    '_fb_auto_enabled(text)',
    '_review_risk_blocked(text,text,uuid)',
    'ensure_conversation_between(uuid,uuid,text)',
    'upsert_api_error(text,jsonb,text)'
  )
)
insert into security_audit.phase6_20260916_rpc_acl_snapshot (
  object_identity,revoke_anon,revoke_authenticated,reason,original_proacl
)
select p.oid::regprocedure::text,c.revoke_anon,c.revoke_authenticated,c.reason,p.proacl::text
from candidates c join pg_proc p on p.oid=c.oid
on conflict (object_identity) do nothing;

do $migration$
declare target record;
begin
  for target in select * from security_audit.phase6_20260916_rpc_acl_snapshot
  loop
    if target.revoke_anon then
      execute format('revoke execute on function %s from anon',target.object_identity);
    end if;
    if target.revoke_authenticated then
      execute format('revoke execute on function %s from authenticated',target.object_identity);
    end if;
  end loop;
end
$migration$;
;
