-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991790274870 with no repo file — the signature of
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
-- Production source values use "Pain & Punishment"; the v4.7 slug keeps the
-- ampersand, so accept both the symbolic and word forms.
BEGIN;

SET lock_timeout='15s';

SET statement_timeout='120s';

DO $$
DECLARE v_def text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.marketplace_content_rating(text,text,text)'::regprocedure)
  INTO v_def;
  v_next:=replace(v_def,'pain_and_punishment','pain_(&|and)_punishment');
  IF v_next=v_def OR position('pain_(&|and)_punishment' IN v_next)=0 THEN
    RAISE EXCEPTION 'content rating v4.7 anchor changed; refusing partial correction';
  END IF;
  EXECUTE v_next;
END;
$$;

SELECT set_config('app.marketplace_quality_safety_version','marketplace-content-rating-v4.8',true);

SELECT set_config('app.marketplace_quality_safety_confidence','1.0',true);

CREATE TEMP TABLE marketplace_v48_safety ON COMMIT DROP AS
SELECT id FROM public.marketplace_listings
WHERE status='active' AND content_rating IS DISTINCT FROM
  public.marketplace_content_rating(subcategory,title,description);

UPDATE public.marketplace_listings ml SET title=ml.title
FROM marketplace_v48_safety c WHERE ml.id=c.id;

DELETE FROM public.search_documents sd USING public.marketplace_listings ml
WHERE sd.entity_type='marketplace' AND sd.entity_id=ml.id
  AND ml.content_rating NOT IN('sfw','suggestive');

INSERT INTO public.search_reindex_queue(entity_type,entity_id)
SELECT 'marketplace',id FROM marketplace_v48_safety ON CONFLICT DO NOTHING;

SELECT public.run_marketplace_quality_snapshot();

RESET statement_timeout;

COMMIT;
