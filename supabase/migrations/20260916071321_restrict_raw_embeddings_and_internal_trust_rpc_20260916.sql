-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260916071321 with no repo file — the signature of
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

create table if not exists security_audit.phase10_20260916_exposure_snapshot (
  object_kind text not null,
  object_identity text not null,
  definition text,
  anon_privileged boolean not null default false,
  authenticated_privileged boolean not null default false,
  service_privileged boolean not null default false,
  captured_at timestamptz not null default now(),
  primary key (object_kind, object_identity)
);
revoke all on security_audit.phase10_20260916_exposure_snapshot from public, anon, authenticated;
grant select, insert, update, delete on security_audit.phase10_20260916_exposure_snapshot to service_role;

insert into security_audit.phase10_20260916_exposure_snapshot
  (object_kind, object_identity, definition, anon_privileged, authenticated_privileged, service_privileged)
select 'policy',
       'public.content_embeddings:' || pol.polname,
       format('create policy %I on public.content_embeddings as %s for %s to %s%s%s',
         pol.polname,
         case when pol.polpermissive then 'permissive' else 'restrictive' end,
         case pol.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end,
         coalesce((select string_agg(quote_ident(r.rolname), ', ' order by r.rolname) from pg_roles r where r.oid=any(pol.polroles)), 'public'),
         case when pol.polqual is not null then ' using ('||pg_get_expr(pol.polqual,pol.polrelid)||')' else '' end,
         case when pol.polwithcheck is not null then ' with check ('||pg_get_expr(pol.polwithcheck,pol.polrelid)||')' else '' end
       ),
       has_table_privilege('anon','public.content_embeddings','select'),
       has_table_privilege('authenticated','public.content_embeddings','select'),
       has_table_privilege('service_role','public.content_embeddings','select')
from pg_policy pol
where pol.polrelid='public.content_embeddings'::regclass
on conflict (object_kind,object_identity) do nothing;

insert into security_audit.phase10_20260916_exposure_snapshot
  (object_kind, object_identity, definition, anon_privileged, authenticated_privileged, service_privileged)
select 'function', p.oid::regprocedure::text, pg_get_functiondef(p.oid),
       has_function_privilege('anon',p.oid,'execute'),
       has_function_privilege('authenticated',p.oid,'execute'),
       has_function_privilege('service_role',p.oid,'execute')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('evaluate_achievements','record_safety_validation')
on conflict (object_kind,object_identity) do nothing;

drop policy if exists "Public read access for content_embeddings" on public.content_embeddings;
revoke all privileges on table public.content_embeddings from anon, authenticated;
create policy content_embeddings_client_deny
on public.content_embeddings
as restrictive for all
to anon, authenticated
using (false)
with check (false);

revoke execute on function public.evaluate_achievements(uuid) from anon, authenticated;
revoke execute on function public.record_safety_validation(uuid,uuid) from anon, authenticated;
grant execute on function public.evaluate_achievements(uuid) to service_role;
grant execute on function public.record_safety_validation(uuid,uuid) to service_role;
;
