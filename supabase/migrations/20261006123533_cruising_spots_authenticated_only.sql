-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261006123533 with no repo file — the signature of
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
drop policy if exists venues_cruising_authenticated_only on public.venues;
create policy venues_cruising_authenticated_only on public.venues
  as restrictive
  for select
  to anon
  using (category is distinct from 'cruising');

comment on policy venues_cruising_authenticated_only on public.venues is
  'Cruising spots are available only to signed-in users through the authenticated cruising guide.';;
