-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991790274483 with no repo file — the signature of
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
-- Close the remaining high-confidence safety vocabulary gaps found by the
-- post-v4.5 production audit. Keep generic clothing and jewelry terms out of
-- the explicit rules; only unambiguous anatomy/device phrases are promoted.

BEGIN;

SET lock_timeout='15s';

SET statement_timeout='120s';

DO $$
DECLARE v_def text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.marketplace_content_rating(text,text,text)'::regprocedure)
  INTO v_def;

  v_next:=replace(v_def,
    $needle$nipple.{0,32}(plier|torture|clamp|forcep|suction)$needle$,
    $needle$nipple.{0,32}(plier|torture|clamp|forcep|suction|suck|pull|crush)$needle$);
  v_next:=replace(v_next,
    $needle$|tit torture|nipsuck|$needle$,
    $needle$|tit (torture|suckers?|clamps?)|nips? pump|nipsuck|clit.{0,20}(sucker|clamp)|$needle$);
  v_next:=replace(v_next,
    $needle$WHEN slug IN('fetish_wear'$needle$,
    $needle$WHEN slug ~ '^pup_play_' THEN 3
        WHEN slug IN('fetish_wear'$needle$);
  v_next:=replace(v_next,
    $needle$(fetish|leather harness|pup hood|$needle$,
    $needle$(fetish|pup play|leather harness|pup hood|$needle$);

  IF v_next=v_def
     OR position($needle$suck|pull|crush$needle$ IN v_next)=0
     OR position($needle$tit (torture|suckers?|clamps?)$needle$ IN v_next)=0
     OR position($needle$slug ~ '^pup_play_'$needle$ IN v_next)=0
     OR position($needle$|pup play|$needle$ IN v_next)=0 THEN
    RAISE EXCEPTION 'content rating v4.5 anchors changed; refusing partial correction';
  END IF;
  EXECUTE v_next;
END;
$$;

-- Expand the governed snapshot beyond the original seven groups so future
-- regressions in clearly adult kink groups become visible immediately.
DO $$
DECLARE v_def text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.run_marketplace_quality_snapshot()'::regprocedure)
  INTO v_def;
  v_next:=replace(v_def,
    $needle$('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys')$needle$,
    $needle$('dildos','vibrators','anal_toys','cock_rings','chastity','masturbators','sex_toys',
          'pup_play','impact_play','gags','hoods_masks')$needle$);
  IF v_next=v_def OR position($needle$'pup_play','impact_play','gags','hoods_masks'$needle$ IN v_next)=0 THEN
    RAISE EXCEPTION 'quality snapshot safety anchor changed; refusing partial correction';
  END IF;
  EXECUTE v_next;
END;
$$;

SELECT set_config('app.marketplace_quality_safety_version','marketplace-content-rating-v4.6',true);

SELECT set_config('app.marketplace_quality_safety_confidence','1.0',true);

CREATE TEMP TABLE marketplace_v46_safety ON COMMIT DROP AS
SELECT id,content_rating old_rating,
  public.marketplace_content_rating(subcategory,title,description) new_rating
FROM public.marketplace_listings
WHERE status='active' AND content_rating IS DISTINCT FROM
  public.marketplace_content_rating(subcategory,title,description);

-- content_rating is stored-generated; touching a source column rematerializes
-- it and lets the version-aware audit trigger record exactly one event.
UPDATE public.marketplace_listings ml SET title=ml.title
FROM marketplace_v46_safety c WHERE ml.id=c.id;

DELETE FROM public.search_documents sd USING public.marketplace_listings ml
WHERE sd.entity_type='marketplace' AND sd.entity_id=ml.id
  AND ml.content_rating NOT IN('sfw','suggestive');

INSERT INTO public.search_reindex_queue(entity_type,entity_id)
SELECT 'marketplace',id FROM marketplace_v46_safety
ON CONFLICT DO NOTHING;

SELECT public.run_marketplace_quality_snapshot();

RESET statement_timeout;

COMMIT;
