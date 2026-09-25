-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260925042411 with no repo file — the signature of
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
begin;

create or replace function public.country_meets_publishability(p_country public.countries)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $function$
  select coalesce(
    p_country.duplicate_of_id is null
    and nullif(btrim(p_country.name), '') is not null
    and p_country.code ~ '^[A-Z]{2,3}$'
    and nullif(btrim(p_country.slug), '') is not null
    and p_country.continent_id is not null
    and p_country.latitude between -90 and 90
    and p_country.longitude between -180 and 180
    and public.country_rights_accounted(p_country)
    and (
      p_country.shell_status = 'real'
      or coalesce(p_country.enrichment_status->'seo'->>'override' = 'approved', false)
    ),
    false
  )
$function$;

commit;
