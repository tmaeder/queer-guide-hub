-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260915210212 with no repo file — the signature of
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

create schema if not exists api_guard authorization postgres;
revoke all on schema api_guard from public, anon, authenticated;

create or replace function api_guard.glossary_link_terms_public_rows()
returns table(surface_form text, match_mode text, slug text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select t.surface_form, t.match_mode, u.slug
  from public.glossary_link_terms t
  join public.unified_tags u on u.id = t.tag_id
  where t.status = 'active'
    and u.status = 'active'
    and u.merged_into_id is null
    and coalesce(u.seo_indexable, false)
    and not coalesce(u.is_adult, false)
    and not public.tag_is_anon_gated(u.is_sensitive, u.verification_status)
    and (
      nullif(btrim(coalesce(u.description, '')), '') is not null
      or nullif(btrim(coalesce(u.short_description, '')), '') is not null
      or nullif(btrim(coalesce(u.long_description, '')), '') is not null
    );
$function$;

revoke all on function api_guard.glossary_link_terms_public_rows() from public;
grant usage on schema api_guard to anon, authenticated;
grant execute on function api_guard.glossary_link_terms_public_rows() to anon, authenticated;

create or replace view public.glossary_link_terms_public
with (security_invoker = true)
as
select surface_form, match_mode, slug
from api_guard.glossary_link_terms_public_rows();
;
