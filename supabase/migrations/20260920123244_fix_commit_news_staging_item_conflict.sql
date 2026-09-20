-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260920123244 with no repo file — the signature of
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
-- commit_news_staging_item RETURNS a column named article_id. In PL/pgSQL that
-- output parameter is also a variable, so the two ON CONFLICT column lists in
-- the function are ambiguous whenever an approved article has geographic
-- links. The batch committer does not expose article_id and therefore did not
-- hit the same runtime failure.
DO $repair$
DECLARE
  v_oid oid;
  v_before text;
  v_after text;
BEGIN
  SELECT p.oid
    INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'commit_news_staging_item'
     AND pg_get_function_identity_arguments(p.oid) = 'p_staging_id uuid, p_actor text';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'commit_news_staging_item(uuid,text) not found';
  END IF;

  v_before := pg_get_functiondef(v_oid);
  v_after := replace(
    replace(
      v_before,
      'ON CONFLICT (article_id, country_id) DO NOTHING',
      'ON CONFLICT ON CONSTRAINT news_article_countries_article_id_country_id_key DO NOTHING'
    ),
    'ON CONFLICT (article_id, city_id) DO NOTHING',
    'ON CONFLICT ON CONSTRAINT news_article_cities_article_id_city_id_key DO NOTHING'
  );

  IF v_after = v_before THEN
    RAISE EXCEPTION 'commit_news_staging_item conflict clauses were not found';
  END IF;

  EXECUTE v_after;
END
$repair$;

COMMENT ON FUNCTION public.commit_news_staging_item(uuid, text) IS
  'Human-approved single news staging commit. Geographic junction upserts use named constraints so the RETURNS TABLE article_id output variable cannot collide with junction column names.';;
