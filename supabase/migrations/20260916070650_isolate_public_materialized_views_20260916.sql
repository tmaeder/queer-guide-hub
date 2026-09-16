-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260916070650 with no repo file — the signature of
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

create schema if not exists api_cache authorization postgres;
revoke all on schema api_cache from public, anon, authenticated;
grant usage on schema api_cache to service_role;

alter materialized view public.personality_profession_facets set schema api_cache;
alter materialized view public.tag_usage_summary set schema api_cache;

revoke all on api_cache.personality_profession_facets from public, anon, authenticated;
revoke all on api_cache.tag_usage_summary from public, anon, authenticated;

grant usage on schema api_guard to service_role;

create or replace function api_guard.personality_profession_facets_rows()
returns table(profession text, cnt bigint)
language sql
stable
security definer
set search_path = pg_catalog, api_cache
as $function$
  select f.profession, f.cnt
  from api_cache.personality_profession_facets f;
$function$;

create or replace function api_guard.tag_usage_summary_rows()
returns table(
  id uuid,
  name text,
  slug text,
  category text,
  usage_count integer,
  event_count bigint,
  venue_count bigint,
  marketplace_count bigint,
  content_count bigint,
  news_count bigint,
  post_count bigint,
  group_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, api_cache
as $function$
  select s.id, s.name, s.slug, s.category, s.usage_count,
         s.event_count, s.venue_count, s.marketplace_count,
         s.content_count, s.news_count, s.post_count, s.group_count
  from api_cache.tag_usage_summary s;
$function$;

revoke all on function api_guard.personality_profession_facets_rows() from public;
revoke all on function api_guard.tag_usage_summary_rows() from public;
grant execute on function api_guard.personality_profession_facets_rows() to anon, authenticated, service_role;
grant execute on function api_guard.tag_usage_summary_rows() to anon, authenticated, service_role;

create view public.personality_profession_facets
with (security_invoker = true)
as select * from api_guard.personality_profession_facets_rows();

create view public.tag_usage_summary
with (security_invoker = true)
as select * from api_guard.tag_usage_summary_rows();

grant select on public.personality_profession_facets, public.tag_usage_summary
to anon, authenticated, service_role,
   algolia_supabase_connector_postgres_1755536843,
   algolia_supabase_connector_postgres_1755537334,
   algolia_supabase_connector_postgres_1755537511;

select cron.alter_job(
  2285,
  command := 'REFRESH MATERIALIZED VIEW CONCURRENTLY api_cache.personality_profession_facets;'
);
select cron.alter_job(
  2284,
  command := 'REFRESH MATERIALIZED VIEW CONCURRENTLY api_cache.tag_usage_summary;'
);
;
