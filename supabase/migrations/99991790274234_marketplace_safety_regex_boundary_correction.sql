-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991790274234 with no repo file — the signature of
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
-- Correct the v4.4 e-stim boundary typo caught by the production audit, narrow
-- body-jewelry handling, and make the event trigger accept a run-scoped safety
-- classifier version so corrective changes are recorded once and precisely.

BEGIN;

SET lock_timeout='15s';

SET statement_timeout='120s';

DO $$
DECLARE v_def text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.marketplace_content_rating(text,text,text)'::regprocedure)
  INTO v_def;
  v_next:=replace(v_def,$needle$\me[- ]?stim|$needle$,$needle$\me[- ]?stim\M|$needle$);
  v_next:=replace(v_next,
    $needle$nipple.{0,32}(plier|torture|clamp|forcep|ring|suction)$needle$,
    $needle$nipple.{0,32}(plier|torture|clamp|forcep|suction)$needle$);
  v_next:=replace(v_next,
    $needle$reizwäsche|orgasm|big d[''’]?ck energy$needle$,
    $needle$reizwäsche|orgasm|nipple covers?|nipple rings?|\m(semen|libido)\M|big d[''’]?ck energy$needle$);
  IF v_next=v_def
     OR position($needle$\me[- ]?stim\M|$needle$ IN v_next)=0
     OR position($needle$(plier|torture|clamp|forcep|suction)$needle$ IN v_next)=0
     OR position($needle$nipple covers?$needle$ IN v_next)=0 THEN
    RAISE EXCEPTION 'content rating v4.4 anchors changed; refusing partial correction';
  END IF;
  EXECUTE v_next;
END;
$$;

DO $$
DECLARE v_def text; v_next text;
BEGIN
  SELECT pg_get_functiondef('public.marketplace_subcategory_group(text,text)'::regprocedure)
  INTO v_def;
  IF position($needle$thumb cuffs?$needle$ IN v_def)>0 THEN RETURN; END IF;
  v_next:=replace(v_def,
    $anchor$    WHEN lower(coalesce(p_title,'')) ~ '\m(cuff ring|ring cuff)\M' THEN 'jewelry'$anchor$,
    $replacement$    WHEN lower(coalesce(p_title,'')) ~ '\mthumb cuffs?\M' THEN 'bondage'
    WHEN lower(coalesce(p_title,'')) ~ '\m(cuff ring|ring cuff)\M' THEN 'jewelry'$replacement$);
  IF v_next=v_def OR position($needle$thumb cuffs?$needle$ IN v_next)=0 THEN
    RAISE EXCEPTION 'subcategory v4.4 anchor changed; refusing partial correction';
  END IF;
  EXECUTE v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketplace_record_quality_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rollback_of bigint:=nullif(current_setting('app.marketplace_quality_rollback_of',true),'')::bigint;
  v_safety_version text:=coalesce(nullif(current_setting('app.marketplace_quality_safety_version',true),''),
    'marketplace-content-rating-2026-09-21');
  v_safety_confidence numeric:=coalesce(nullif(current_setting('app.marketplace_quality_safety_confidence',true),'')::numeric,0.90);
BEGIN
  IF ROW(OLD.department,OLD.subcategory_group,OLD.subcategory_fine)
       IS DISTINCT FROM ROW(NEW.department,NEW.subcategory_group,NEW.subcategory_fine) THEN
    INSERT INTO public.marketplace_quality_events
      (listing_id,dimension,previous_value,new_value,classifier_version,confidence,rollback_of)
    VALUES(NEW.id,'taxonomy',
      jsonb_build_object('department',OLD.department,'group',OLD.subcategory_group,'fine',OLD.subcategory_fine),
      jsonb_build_object('department',NEW.department,'group',NEW.subcategory_group,'fine',NEW.subcategory_fine),
      coalesce(NEW.taxonomy_classifier_version,'marketplace-taxonomy-v4'),
      CASE WHEN NEW.taxonomy_classifier_version LIKE '%model%' THEN NEW.taxonomy_confidence ELSE 0.95 END,
      v_rollback_of);
  END IF;
  IF OLD.content_rating IS DISTINCT FROM NEW.content_rating THEN
    INSERT INTO public.marketplace_quality_events
      (listing_id,dimension,previous_value,new_value,classifier_version,confidence,rollback_of)
    VALUES(NEW.id,'safety',to_jsonb(OLD.content_rating),to_jsonb(NEW.content_rating),
      v_safety_version,v_safety_confidence,v_rollback_of);
  END IF;
  RETURN NEW;
END;
$$;

SELECT set_config('app.marketplace_quality_safety_version','marketplace-content-rating-v4.5',true);

SELECT set_config('app.marketplace_quality_safety_confidence','1.0',true);

CREATE TEMP TABLE marketplace_v45_safety ON COMMIT DROP AS
SELECT id,content_rating old_rating,
  public.marketplace_content_rating(subcategory,title,description) new_rating
FROM public.marketplace_listings
WHERE status='active' AND content_rating IS DISTINCT FROM
  public.marketplace_content_rating(subcategory,title,description);

UPDATE public.marketplace_listings ml SET title=ml.title
FROM marketplace_v45_safety c WHERE ml.id=c.id;

CREATE TEMP TABLE marketplace_v45_taxonomy ON COMMIT DROP AS
SELECT id,department,subcategory_group,subcategory_fine
FROM public.marketplace_listings
WHERE status='active' AND subcategory_group='accessories'
  AND lower(title) ~ '\mthumb cuffs?\M';

UPDATE public.marketplace_listings ml SET department='bdsm_fetish',subcategory_group='bondage',
  subcategory_fine=NULL,taxonomy_confidence=1.0,
  taxonomy_classifier_version='marketplace-taxonomy-v4.5'
FROM marketplace_v45_taxonomy c WHERE ml.id=c.id;

-- Mark only the superseded v4.4 events as rolled back; the v4.5 trigger rows
-- remain the current audit truth.
UPDATE public.marketplace_quality_events e SET rolled_back_at=now()
FROM marketplace_v45_safety c
WHERE e.listing_id=c.id AND e.dimension='safety'
  AND e.classifier_version='marketplace-content-rating-v4.4'
  AND e.rollback_of IS NULL AND e.rolled_back_at IS NULL
  AND e.previous_value=to_jsonb(c.new_rating);

UPDATE public.marketplace_quality_events e SET rolled_back_at=now()
FROM marketplace_v45_taxonomy c
WHERE e.listing_id=c.id AND e.dimension='taxonomy'
  AND e.classifier_version='marketplace-taxonomy-v4.4'
  AND e.rollback_of IS NULL AND e.rolled_back_at IS NULL
  AND e.previous_value->>'group'='bondage';

DELETE FROM public.search_documents sd USING public.marketplace_listings ml
WHERE sd.entity_type='marketplace' AND sd.entity_id=ml.id
  AND ml.content_rating NOT IN('sfw','suggestive');

INSERT INTO public.search_reindex_queue(entity_type,entity_id)
SELECT 'marketplace',id FROM marketplace_v45_safety
UNION
SELECT 'marketplace',id FROM marketplace_v45_taxonomy
ON CONFLICT DO NOTHING;

SELECT public.run_marketplace_quality_snapshot();

RESET statement_timeout;

COMMIT;
