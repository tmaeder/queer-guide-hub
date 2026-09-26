-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991790011900 with no repo file — the signature of
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
-- PostgreSQL ARE does not interpret \b as a word boundary. Keep the
-- wrong-subject guard explicit so event/article/hotel copy cannot qualify a
-- venue for guide-ready publication.
create or replace function public.venue_description_issue(p_description text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $description$
  select case
    when nullif(btrim(regexp_replace(coalesce(p_description, ''), '<[^>]*>', ' ', 'g')), '') is null
      then 'missing'
    when lower(btrim(regexp_replace(p_description, '<[^>]*>', ' ', 'g'))) ~
      '^(tbd|todo|n/?a|unknown|coming soon|description unavailable|no description( available)?)\.?$'
      then 'placeholder'
    when lower(p_description) ~
      '(^|[[:space:]])(lorem ipsum|insert description|sample text|test venue)([[:space:]]|$)'
      then 'placeholder'
    when lower(p_description) ~
      '^(this|the) (event|article|news story|hotel|product|personality)([[:space:]]|$)'
      then 'wrong_subject'
    when length(btrim(regexp_replace(p_description, '<[^>]*>', ' ', 'g'))) < 40
      then 'too_short'
    else null
  end
$description$;

comment on function public.venue_description_issue(text) is
  'Rejects missing, placeholder, wrong-subject and very short venue descriptions before guide-ready scoring.';
