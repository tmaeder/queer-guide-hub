-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991790274669 with no repo file — the signature of
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
-- Replace the deliberately broad v4.6 group monitor with structured-source
-- predicates. The audit proved that hoods_masks, gags and impact_play contain
-- ordinary apparel and paddle-sport false positives, so group membership alone
-- must not force an adult rating.

BEGIN;

SET lock_timeout='15s';

SET statement_timeout='120s';

DO $$
DECLARE v_def text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.marketplace_content_rating(text,text,text)'::regprocedure)
  INTO v_def;
  v_next:=replace(v_def,
    $needle$WHEN slug ~ '^pup_play_' THEN 3$needle$,
    $needle$WHEN slug ~ '^pup_play_' THEN 3
        WHEN slug ~ '(^|_)(pup_(hoods?|masks?)|pain_(&|and)_punishment)($|_)' THEN 3$needle$);
  IF v_next=v_def OR position($needle$pain_(&|and)_punishment$needle$ IN v_next)=0 THEN
    RAISE EXCEPTION 'content rating v4.6 anchor changed; refusing partial correction';
  END IF;
  EXECUTE v_next;
END;
$$;

DO $$
DECLARE v_def text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.run_marketplace_quality_snapshot()'::regprocedure)
  INTO v_def;
  v_next:=replace(v_def,
    $needle$count(*) FILTER(WHERE content_rating='sfw' AND subcategory_group IN
        ('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys',
          'pup_play','impact_play','gags','hoods_masks')) safety_conflicts$needle$,
    $needle$count(*) FILTER(WHERE content_rating='sfw' AND (
        subcategory_group IN ('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys')
        OR (subcategory_group='pup_play' AND lower(coalesce(subcategory,'')) ~ 'pup[ _-](hoods?|masks?)')
        OR (subcategory_group='impact_play' AND lower(coalesce(subcategory,'')) ~ 'pain[ _&-]+punishment')
      )) safety_conflicts$needle$);
  IF v_next=v_def OR position($needle$pain[ _&-]+punishment$needle$ IN v_next)=0 THEN
    RAISE EXCEPTION 'quality snapshot v4.6 anchor changed; refusing partial correction';
  END IF;
  EXECUTE v_next;
END;
$$;

SELECT set_config('app.marketplace_quality_safety_version','marketplace-content-rating-v4.7',true);

SELECT set_config('app.marketplace_quality_safety_confidence','1.0',true);

CREATE TEMP TABLE marketplace_v47_safety ON COMMIT DROP AS
SELECT id,content_rating old_rating,
  public.marketplace_content_rating(subcategory,title,description) new_rating
FROM public.marketplace_listings
WHERE status='active' AND content_rating IS DISTINCT FROM
  public.marketplace_content_rating(subcategory,title,description);

UPDATE public.marketplace_listings ml SET title=ml.title
FROM marketplace_v47_safety c WHERE ml.id=c.id;

DELETE FROM public.search_documents sd USING public.marketplace_listings ml
WHERE sd.entity_type='marketplace' AND sd.entity_id=ml.id
  AND ml.content_rating NOT IN('sfw','suggestive');

INSERT INTO public.search_reindex_queue(entity_type,entity_id)
SELECT 'marketplace',id FROM marketplace_v47_safety
ON CONFLICT DO NOTHING;

SELECT public.run_marketplace_quality_snapshot();

RESET statement_timeout;

COMMIT;
